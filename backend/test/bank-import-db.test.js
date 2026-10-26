import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createBankReconciliationService } from '../src/services/bank-reconciliations.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';

test('MySQL bank upload API: detect, preview without writes, create bank, remember IBAN, replay, isolation, rollback and stale preview', {skip:process.env.TEST_MYSQL!=='1'}, async()=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
 try{
  const period={name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'};
  const company=await context.createCompany({name:'Bank upload '+randomUUID(),exercise:period});ids.push(company.id);
  const foreign=await context.createCompany({name:'Foreign upload '+randomUUID(),exercise:period});ids.push(foreign.id);
  const exercise=(await context.getContext(company.id)).exercises[0],foreignExercise=(await context.getContext(foreign.id)).exercises[0];
  const accounting=createAccountingService(pool,company.id);
  await accounting.createAccount({code:'6260.0001',description:'Bank fees'});
  const capital=await accounting.createAccount({code:'1000.0001',description:'Capital'});
  const foreignBank=await createAccountingService(pool,foreign.id).createAccount({code:'5720.0001',description:'Foreign bank'});
  server=createApp(context,{},companyScope(pool,config.companyId)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const request=(path,body,companyId=company.id,type='application/json')=>fetch(base+path,{method:'POST',headers:{'Content-Type':type,'X-Company-Id':String(companyId),'X-File-Name':encodeURIComponent('extracto.csv')},body:Buffer.isBuffer(body)?body:JSON.stringify(body)});
  const document=Buffer.from('CaixaBank;ES9121000418450200051332\nFecha;Concepto;Importe;Saldo\n31/12/2025;Anterior;100,00;100,00\n03/01/2026;MANTENIMENT;-10,00;90,00\n04/01/2026;MANTENIMENT;5,00;95,00');
  const upload=async(buffer=document,companyId=company.id,exerciseId=exercise.id)=>{
   const response=await request('/bank-import/preview?exercise_id='+exerciseId,buffer,companyId,'text/csv');assert.equal(response.status,200);return response.json();
  };
  const preview=await upload();assert.equal(preview.bank.name,'CaixaBank');assert.equal(preview.rows,3);assert.equal(preview.selected_rows,2);
  assert.equal(preview.detected_account_id,null);
  assert.equal((await request('/bank-import/preview?exercise_id='+exercise.id,document,foreign.id,'text/csv')).status,404);
  assert.equal((await request('/bank-import/analyze',{token:preview.token,create_account:true},foreign.id)).status,409);
  assert.equal((await request('/bank-import/analyze',{token:preview.token,account_id:foreignBank.id})).status,400);
  const analysisResponse=await request('/bank-import/analyze',{token:preview.token,create_account:true});assert.equal(analysisResponse.status,200);
  const analysis=await analysisResponse.json();assert.equal(analysis.new_account,true);assert.equal(analysis.account.code,'57200001');
  assert.equal(analysis.snapshot.scope.last_matching_date,null);assert.equal(analysis.snapshot.scope.period_opening_balance,'100.00');
  assert.equal(analysis.snapshot.proposals.length,2);assert.equal(analysis.snapshot.unresolved_difference_book_minus_bank,'-100.00');
  const [[before]]=await pool.execute("SELECT COUNT(*) AS total FROM accounts WHERE company_id=? AND kind='subaccount' AND code LIKE '572%'",[company.id]);assert.equal(before.total,0);
  assert.equal((await request('/bank-import/commit',{token:preview.token},foreign.id)).status,409);
  const saveResponse=await request('/bank-import/commit',{token:preview.token});assert.equal(saveResponse.status,200);const saved=await saveResponse.json();
  const replay=await(await request('/bank-import/commit',{token:preview.token})).json();assert.deepEqual(replay,{id:saved.id,replayed:true});
  const service=createBankReconciliationService(pool,company.id),stored=await service.get(saved.id);
  assert.equal(stored.current.ledger_changed,false);assert.equal(stored.current.book_balance,'0.00');assert.equal(stored.snapshot.posted,false);
  assert.ok(stored.snapshot.proposals.every(proposal=>proposal.lines.every(line=>Number.isSafeInteger(line.account_id))));
  const [[counts]]=await pool.execute('SELECT (SELECT COUNT(*) FROM journal_entries WHERE company_id=?) AS entries,(SELECT COUNT(*) FROM bank_connections WHERE company_id=?) AS bindings',[company.id,company.id]);
  assert.deepEqual(counts,{entries:0,bindings:1});
  const source=await fetch(base+'/bank-reconciliations/'+saved.id+'/source',{headers:{'X-Company-Id':String(company.id)}});
  assert.equal(source.headers.get('content-type'),'text/csv; charset=utf-8');assert.match(source.headers.get('content-disposition'),/^attachment/);
  assert.equal(createHash('sha256').update(Buffer.from(await source.arrayBuffer())).digest('hex'),createHash('sha256').update(document).digest('hex'));
  const duplicate=await upload();assert.equal(duplicate.already_imported,true);assert.equal(duplicate.detected_account_id,stored.account_id);
  assert.equal((await request('/bank-import/analyze',{token:duplicate.token,create_account:true})).status,409);
  await request('/bank-import/analyze',{token:duplicate.token,account_id:stored.account_id});
  const duplicateSave=await(await request('/bank-import/commit',{token:duplicate.token})).json();assert.deepEqual(duplicateSave,{id:saved.id,replayed:true});
  const modified=Buffer.from(document.toString().replace('5,00;95,00','6,00;96,00'));
  const next=await upload(modified);assert.equal(next.account_reason,'saved_iban');assert.equal(next.detected_account_id,stored.account_id);
  await request('/bank-import/analyze',{token:next.token,create_account:true});
  const conflict=await request('/bank-import/commit',{token:next.token});assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'BANK_ACCOUNT_MISMATCH');
  const [[bankCount]]=await pool.execute("SELECT COUNT(*) AS total FROM accounts WHERE company_id=? AND kind='subaccount' AND code LIKE '572%'",[company.id]);assert.equal(bankCount.total,1,'failed binding must roll back the proposed bank account');
  await request('/bank-import/analyze',{token:next.token,account_id:stored.account_id});
  await accounting.createEntry({exercise_id:exercise.id,entry_date:'2026-01-03',description:'Changed books',request_id:randomUUID(),lines:[
   {account_id:stored.account_id,description:'Changed books',debit:'50.00',credit:'0.00'},
   {account_id:capital.id,description:'Changed books',debit:'0.00',credit:'50.00'},
  ]});
  const stale=await request('/bank-import/commit',{token:next.token});assert.equal(stale.status,409);assert.equal((await stale.json()).error.code,'RECONCILIATION_LEDGER_CHANGED');
  await request('/bank-import/analyze',{token:next.token,account_id:stored.account_id});
  const updated=await request('/bank-import/commit',{token:next.token});assert.equal(updated.status,200);
  assert.equal((await service.get(saved.id)).current.ledger_changed,true);
  assert.deepEqual(await createBankReconciliationService(pool,foreign.id).list({exercise_id:foreignExercise.id}),[]);
  const discarded=await upload(document,foreign.id,foreignExercise.id);
  assert.equal((await request('/bank-import/discard',{token:discarded.token})).status,409,'another company cannot discard the preview');
  assert.equal((await request('/bank-import/discard',{token:discarded.token},foreign.id)).status,200);
  const expired=await request('/bank-import/analyze',{token:discarded.token,create_account:true},foreign.id);assert.equal(expired.status,409);assert.equal((await expired.json()).error.code,'BANK_PREVIEW_EXPIRED');
  const bban='99990000110000000000',unknownIban='ES'+String(98n-BigInt(bban+'142800')%97n).padStart(2,'0')+bban;
  const unknownDocument=Buffer.from('IBAN;'+unknownIban+'\nFecha;Concepto;Importe;Saldo\n01/02/2026;Transferencia;1,00;1,00');
  const unknown=await upload(unknownDocument);assert.equal(unknown.bank.detected,false);
  const missingName=await request('/bank-import/analyze',{token:unknown.token,create_account:true});assert.equal(missingName.status,400);assert.equal((await missingName.json()).error.code,'BANK_NAME_REQUIRED');
  const named=await request('/bank-import/analyze',{token:unknown.token,create_account:true,bank_name:'Banco de prueba'});assert.equal(named.status,200);
  const namedSave=await request('/bank-import/commit',{token:unknown.token});assert.equal(namedSave.status,200);
  const remembered=await upload(Buffer.from(unknownDocument.toString().replace('1,00;1,00','2,00;2,00')));
  assert.equal(remembered.account_reason,'saved_iban');assert.equal(remembered.bank.detected,true);assert.match(remembered.bank.name,/Banco de prueba/);
  await request('/bank-import/discard',{token:remembered.token});
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){
   for(const table of ['bank_reconciliations','bank_connections','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }await pool.end();
 }
});


test('MySQL bank upload limits unmatched entries to the statement and resumes after the latest matching date', {skip:process.env.TEST_MYSQL!=='1'}, async()=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId);let company,server;
 try{
  company=await context.createCompany({name:'Bank statement period '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});
  const exercise=(await context.getContext(company.id)).exercises[0],accounting=createAccountingService(pool,company.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'Statement period bank'});
  const capital=await accounting.createAccount({code:'1000.0001',description:'Capital'});
  const fee=await accounting.createAccount({code:'6260.0001',description:'Bank fees'});
  const post=(date,value,description)=>accounting.createEntry({exercise_id:exercise.id,entry_date:date,description,request_id:randomUUID(),lines:[
   {account_id:bank.id,description,debit:value>0?value.toFixed(2):'0.00',credit:value<0?(-value).toFixed(2):'0.00'},
   {account_id:capital.id,description,debit:value<0?(-value).toFixed(2):'0.00',credit:value>0?value.toFixed(2):'0.00'},
  ]});
  await post('2026-01-01',100,'Earlier normal deposit');
  const extra=await post('2026-10-11',-3,'Extra entry within statement dates');
  const matched=await post('2026-10-12',20,'Transfer client');
  await post('2026-10-13',5,'After statement');
  server=createApp(context,{},companyScope(pool,config.companyId)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const request=async(path,body,type='application/json')=>{
   const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':type,'X-Company-Id':String(company.id),'X-File-Name':'period.csv'},body:Buffer.isBuffer(body)?body:JSON.stringify(body)});
   assert.equal(response.status,200,path);return response.json();
  };
  const csv='Fecha;Concepto;Importe;Saldo\n10/10/2026;MANTENIMENT;-10,00;90,00\n12/10/2026;Transfer client;20,00;110,00';
  const prepare=async(document)=>{
   const preview=await request('/bank-import/preview?exercise_id='+exercise.id,Buffer.from(document),'text/csv');
   return request('/bank-import/analyze',{token:preview.token,account_id:bank.id});
  };
  const analysis=await prepare(csv),snapshot=analysis.snapshot;
  assert.equal(snapshot.scope.last_matching_date,null);
  assert.equal(snapshot.scope.book_opening_balance,'100.00');assert.equal(snapshot.current_book_balance,'117.00');
  assert.deepEqual(snapshot.book_unmatched.map(row=>row.entry_id),[extra.id]);
  assert.deepEqual(snapshot.scope.matched_movements.map(row=>row.entry_id),[matched.id]);
  assert.deepEqual(snapshot.proposals.map(row=>row.lines[0].account_id),[fee.id]);
  const saved=await request('/bank-import/commit',{token:analysis.token}),service=createBankReconciliationService(pool,company.id);
  assert.deepEqual((await service.get(saved.id)).snapshot,snapshot);
  await post('2026-10-10',-10,'Settled fee');
  const anchored=await prepare(csv.replace('Fecha;Concepto;Importe;Saldo\n','Fecha;Concepto;Importe;Saldo\n09/10/2026;Prior transfer;1,00;100,00\n'));
  assert.equal(anchored.snapshot.scope.last_matching_date,'2026-10-10');
  assert.equal(anchored.snapshot.scope.analysis_start_date,'2026-10-11');
  assert.deepEqual(anchored.snapshot.book_unmatched.map(row=>row.entry_id),[extra.id]);
  assert.deepEqual(anchored.snapshot.scope.matched_movements.map(row=>row.entry_id),[matched.id]);
  assert.deepEqual(anchored.snapshot.proposals,[]);assert.deepEqual(anchored.snapshot.scope.bank_pending,[]);
  const anchoredSaved=await request('/bank-import/commit',{token:anchored.token});
  assert.deepEqual((await service.get(anchoredSaved.id)).snapshot,anchored.snapshot);
  const old=await service.get(saved.id);assert.equal(old.current.ledger_changed,true);assert.deepEqual(old.snapshot,snapshot);
  const [[count]]=await pool.execute('SELECT COUNT(*) AS entries FROM journal_entries WHERE company_id=?',[company.id]);
  assert.equal(count.entries,5,'preparing and saving reconciliation must not post entries');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(company){
   for(const table of ['bank_reconciliations','bank_connections','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[company.id]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[company.id]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[company.id,account.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[company.id]);
  }await pool.end();
 }
});


test('MySQL bank balance dates: accept ten days after the extract, reject eleven and protect the extended ledger window', {skip:process.env.TEST_MYSQL!=='1'}, async()=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId);let company,server;
 try{
  company=await context.createCompany({name:'Bank balance window '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});
  const exercise=(await context.getContext(company.id)).exercises[0],accounting=createAccountingService(pool,company.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'Balance window bank'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'});
  const post=(date,value)=>accounting.createEntry({exercise_id:exercise.id,entry_date:date,description:'Bank window test',request_id:randomUUID(),lines:[
   {account_id:bank.id,description:'Bank',debit:value,credit:'0.00'},
   {account_id:capital.id,description:'Capital',debit:'0.00',credit:value},
  ]});
  const entry=await post('2026-10-20','100.00');
  server=createApp(context,{},companyScope(pool,config.companyId)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api',headers={'X-Company-Id':String(company.id)};
  const request=(url,body,type='application/json')=>fetch(base+url,{method:'POST',headers:{...headers,'Content-Type':type,'X-File-Name':'window.csv'},body:Buffer.isBuffer(body)?body:JSON.stringify(body)});
  const prepare=async(document)=>{
   let response=await request('/bank-import/preview?exercise_id='+exercise.id,Buffer.from(document),'text/csv');assert.equal(response.status,200);const preview=await response.json();
   response=await request('/bank-import/analyze',{token:preview.token,account_id:bank.id});assert.equal(response.status,200);return response.json();
  };
  const csv='Fecha;Concepto;Importe;Saldo\n10/10/2026;Transferencia;100,00;100,00',analysis=await prepare(csv);
  assert.equal(analysis.snapshot.scope.last_matching_date,'2026-10-10');assert.equal(analysis.snapshot.scope.last_matching_book_date,'2026-10-20');
  assert.equal(analysis.snapshot.scope.book_balance_date,'2026-10-20');assert.equal(analysis.snapshot.reconciliation_status,'matched');assert.deepEqual(analysis.snapshot.proposals,[]);
  const response=await request('/bank-import/commit',{token:analysis.token});assert.equal(response.status,200);const saved=await response.json();
  const detailResponse=await fetch(base+'/bank-reconciliations/'+saved.id,{headers});assert.equal(detailResponse.status,200);const detail=await detailResponse.json();
  assert.equal(detail.last_matching_entry_id,entry.id);assert.equal(detail.current.as_of,'2026-10-20');assert.equal(detail.current.book_balance,'100.00');
  assert.equal(detail.current.cutoff_balance,'100.00');assert.equal(detail.current.difference_book_minus_bank,'0.00');assert.equal(detail.current.ledger_changed,false);
  assert.deepEqual(detail.snapshot,analysis.snapshot);
  const elevenDays=await prepare(csv.replace('10/10/2026','09/10/2026'));assert.equal(elevenDays.snapshot.scope.last_matching_date,null);assert.equal(elevenDays.snapshot.current_book_balance,'0.00');
  await request('/bank-import/discard',{token:elevenDays.token});
  await post('2026-10-21','1.00');
  const service=createBankReconciliationService(pool,company.id);assert.equal((await service.get(saved.id)).current.ledger_changed,false,'activity outside the search window is excluded');
  const next=await prepare(csv+'\n');await post('2026-10-18','1.00');
  const stale=await request('/bank-import/commit',{token:next.token});assert.equal(stale.status,409);assert.equal((await stale.json()).error.code,'RECONCILIATION_LEDGER_CHANGED');
  await request('/bank-import/discard',{token:next.token});
  const changed=await service.get(saved.id);assert.equal(changed.current.ledger_changed,true);assert.equal(changed.current.book_balance,'101.00');assert.deepEqual(changed.snapshot,detail.snapshot);
  const [[count]]=await pool.execute('SELECT COUNT(*) AS entries FROM journal_entries WHERE company_id=?',[company.id]);assert.equal(count.entries,3,'reconciliation does not post entries');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(company){for(const table of ['bank_reconciliations','bank_connections','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[company.id]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[company.id]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[company.id,account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[company.id]);}
  await pool.end();
 }
});
