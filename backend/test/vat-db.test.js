import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createVatService} from '../src/services/vat.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup} from '../src/services/backup-format.js';
import {createApp} from '../src/app.js';
import {createContextService} from '../src/services/context.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';

test('MySQL: VAT periods, source isolation, saved reviews, backups and HTTP access',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),db=await pool.getConnection();let server;
 await db.beginTransaction();
 // All fixture writes, including draft saves, stay in this rollback-only transaction.
 const execute=db.execute.bind(db),scopedPool={execute,getConnection:async()=>({execute,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}})};
 try{
  const [company]=await execute('INSERT INTO companies(name) VALUES (?)',['VAT integration fixture']);const companyId=company.insertId;
  await execute('INSERT INTO company_details(company_id,tax_id) VALUES (?,?)',[companyId,'B12345674']);
  const [other]=await execute('INSERT INTO companies(name) VALUES (?)',['Other VAT fixture']);const otherId=other.insertId;
  const [exercise]=await execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'VAT 2026','2026-01-01','2026-12-31')",[companyId]);
  const accounting=createAccountingService(scopedPool,companyId),invoices=createInvoiceService(scopedPool,companyId),vat=createVatService(scopedPool,companyId);
  const sale=await invoices.create({exercise_id:exercise.insertId,direction:'issued',reference:'V-1',invoice_date:'2026-01-15',posting_date:'2026-02-01',party:{name:'Customer'},lines:[{description:'Sale',base:'100.00',tax_rate:'21.00'}],receipts:[{due_date:'2026-02-01',amount:'121.00'}],request_id:randomUUID()});
  const expense=await accounting.createAccount({code:'6000.0002',description:'Purchases'}),tax=await accounting.createAccount({code:'4720.0002',description:'VAT'}),supplier=await accounting.createAccount({code:'4000.0002',description:'Supplier'});
  const entry=await accounting.createEntry({exercise_id:exercise.insertId,entry_date:'2026-02-10',description:'Imported-style purchase',request_id:randomUUID(),lines:[{account_id:expense.id,description:'Purchase',debit:'50.00',credit:'0.00'},{account_id:tax.id,description:'Purchase VAT',debit:'10.50',credit:'0.00'},{account_id:supplier.id,description:'Supplier',debit:'0.00',credit:'60.50'}]});
  const pdf=Buffer.from('%PDF-1.4\n%%EOF'),sourceHash=createHash('sha256').update(pdf).digest('hex');
  const [imported]=await execute('INSERT INTO journal_imports(company_id,exercise_id,source_name,source_company,source_hash,content_hash,source_pdf,pages,entry_count,line_count,account_count,debit_total,credit_total) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[companyId,exercise.insertId,'diario.pdf','VAT integration fixture',sourceHash,sourceHash,pdf,1,1,3,3,'60.50','60.50']);
  await execute('UPDATE journal_entries SET import_id=? WHERE company_id=? AND id=?',[imported.insertId,companyId,entry.id]);
  const payable=await accounting.createAccount({code:'4750.0001',description:'HP acreedora IVA'}),receivable=await accounting.createAccount({code:'4700.0001',description:'HP deudora IVA'}),openingBank=await accounting.createAccount({code:'5720.0009',description:'Opening bank'});
  const carry=await accounting.createEntry({exercise_id:exercise.insertId,entry_date:'2026-01-01',description:'VAT credit brought forward',request_id:randomUUID(),lines:[{account_id:receivable.id,description:'Previous VAT credit',debit:'100.00',credit:'0.00'},{account_id:openingBank.id,description:'Opening offset',debit:'0.00',credit:'100.00'}]});
  await execute("UPDATE journal_entries SET entry_type='opening' WHERE company_id=? AND id=?",[companyId,carry.id]);
  const query={year:'2026',frequency:'quarterly',period:'1'};
  await t.test('invoice journal is counted once and month uses the source fiscal date',async()=>{
   const data=await vat.get(query);assert.equal(data.records.length,2);assert.equal(data.records.filter(row=>row.invoice_id===sale.id).length,1);assert.equal(data.total_output,'21.00');assert.equal(data.total_deductible,'10.50');assert.equal(data.result,'10.50');
   const january=await vat.get({...query,frequency:'monthly',period:'1'});assert.equal(january.records.length,1);assert.equal(january.records[0].invoice_id,sale.id);
   const february=await vat.get({...query,frequency:'monthly',period:'2'});assert.equal(february.records.length,1);assert.equal(february.records[0].entry_id,entry.id);
  });
  await t.test('original journal PDF is scoped to its company and linked entry',async()=>{
   const source=await vat.source(entry.id);assert.equal(source.source_name,'diario.pdf');assert.deepEqual(source.source_pdf,pdf);
   assert.equal((await vat.get(query)).records.find(row=>row.entry_id===entry.id).source_available,true);
   await assert.rejects(createVatService(scopedPool,otherId).source(entry.id),{code:'VAT_SOURCE_NOT_FOUND'});
   await assert.rejects(vat.source(sale.entry_id),{code:'VAT_SOURCE_NOT_FOUND'});
  });
  let saved;
  await t.test('reviews and compensation save per company and exact period with optimistic versions',async()=>{
   const data=await vat.get(query),journal=data.records.find(row=>row.kind==='journal');
   const input={confirmed_general:true,compensation_pending:'5.00',apply_compensation:true,overrides:[{key:journal.key,fingerprint:journal.fingerprint,category:journal.category,base:journal.base,rate:journal.rate,deductible_percent:'100.00'}]};
   saved=await vat.save(query,{version:0,input});assert.equal(saved.draft.version,1);assert.equal(saved.provisional,false);assert.equal(saved.result,'5.50');
   const restored=await vat.get(query);assert.deepEqual(restored.input,saved.input);assert.equal(restored.result,'5.50');
   assert.equal((await vat.get({...query,frequency:'monthly',period:'1'})).draft.version,0);
   const foreign=await createVatService(scopedPool,otherId).get(query);assert.equal(foreign.records.length,0);assert.equal(foreign.draft.version,0);
   await assert.rejects(vat.save(query,{version:0,input}),{code:'VAT_DRAFT_CONFLICT'});
  });
  await t.test('drafts are included and validated in a portable company backup',async()=>{
   const backup=await createDataBackupService(scopedPool,companyId).export('all'),decoded=readBackup(backup.file);
   assert.equal(decoded.tables.vat_drafts.length,1);assert.deepEqual(decoded.tables.vat_drafts[0].payload,saved.input);
  });
  await t.test('filing uses the reviewed current model without changing the saved draft',async()=>{
   const current=await vat.get(query),filing={type:'I',confirmed:true,redeme:false,voluntary_sii:false,annual_exempt:false,no_activity:false,iban:''};
   assert.equal(current.filing.ready,true);
   const exported=await vat.filing(query,{input:current.input,model_hash:current.model_hash,filing});
   assert.equal(exported.filename,'B12345674_2026_1T.303');assert.equal(exported.file.length,3767);
   const after=await vat.get(query);assert.equal(after.draft.version,1);assert.deepEqual(after.input,saved.input);
   await assert.rejects(vat.filing({...query,frequency:'monthly',period:'2'},{input:current.input,model_hash:current.model_hash,filing}),{code:'VAT_SOURCE_CHANGED'});
   const changedHash=(current.model_hash[0]==='0'?'1':'0')+current.model_hash.slice(1);
   await assert.rejects(vat.filing(query,{input:current.input,model_hash:changedHash,filing}),{code:'VAT_SOURCE_CHANGED'});
  });
  await t.test('settlement retains the real VAT subaccounts and compensation balance without writing journals',async()=>{
   const current=await vat.get(query),[[before]]=await execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=?',[companyId]);
   assert.equal(current.settlement_proposal.ready,true);assert.equal(current.settlement_proposal.result,'5.50');
   assert.ok(current.records.find(row=>row.invoice_id===sale.id).vat_accounts[0].code.startsWith('477'));
   assert.equal(current.records.find(row=>row.entry_id===entry.id).vat_accounts[0].code,tax.code);
   assert.ok(current.settlement_proposal.lines.some(line=>line.account_id===payable.id&&line.credit==='5.50'));
   assert.ok(current.settlement_proposal.lines.some(line=>line.account_id===receivable.id&&line.credit==='5.00'));
   const preview=await vat.settlementPreview(query,{input:current.input,model_hash:current.model_hash,accounts:{payable_account_id:payable.id}});assert.equal(preview.selected_accounts['4750'],payable.id);
   const foreign=await createAccountingService(scopedPool,otherId).createAccount({code:'4750.0001',description:'Other company VAT'});
   await assert.rejects(vat.settlementPreview(query,{input:current.input,model_hash:current.model_hash,accounts:{payable_account_id:foreign.id}}),{code:'INVALID_VAT_SETTLEMENT_ACCOUNT'});
   const [[after]]=await execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=?',[companyId]);assert.equal(after.count,before.count);
   const january=await vat.get({...query,frequency:'monthly',period:'1'});assert.equal(january.settlement_proposal.comparison.output_difference,'-21.00');assert.equal(january.settlement_proposal.lines.length,0);
  });
  await t.test('changed evidence invalidates the saved review instead of applying stale tax data',async()=>{
   await execute('UPDATE journal_lines SET description=? WHERE company_id=? AND entry_id=?',['Changed purchase',companyId,entry.id]);
   const data=await vat.get(query);assert.equal(data.stale_keys.length,1);assert.equal(data.provisional,true);
   await assert.rejects(vat.save(query,{version:1,input:saved.input}),{code:'VAT_SOURCE_CHANGED'});
  });
  await t.test('HTTP reads require assigned company access and saving requires write permission',async()=>{
   const user={key:'vat-test',role:'user',company_ids:[companyId],permissions:{accounting_write:false}};
   const access=accessControl({current:async()=>user});
   server=createApp(createContextService(scopedPool,companyId),accounting,companyScope(scopedPool,companyId),access).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const origin='http://127.0.0.1:'+server.address().port,path='/api/tax/vat?'+new URLSearchParams(query),headers={'Content-Type':'application/json','X-Company-Id':String(companyId)};
   assert.equal((await fetch(origin+path,{headers})).status,200);
   assert.equal((await fetch(origin+path,{headers:{...headers,'X-Company-Id':String(otherId)}})).status,403);
   const readonlyModel=await vat.get(query);
   const readOnlyInput={...readonlyModel.input,overrides:readonlyModel.records.map(row=>({key:row.key,fingerprint:row.fingerprint,category:row.category,base:row.base,rate:row.rate,deductible_percent:'100.00'}))};
   const readonlyPreview=await vat.preview(query,readOnlyInput);
   const readOnlyBody={input:readonlyPreview.input,model_hash:readonlyPreview.model_hash,accounts:{payable_account_id:payable.id}};
   assert.equal((await fetch(origin+'/api/tax/vat/settlement-preview?'+new URLSearchParams(query),{method:'POST',headers,body:JSON.stringify(readOnlyBody)})).status,200);
   assert.equal((await fetch(origin+'/api/tax/vat/draft?'+new URLSearchParams(query),{method:'PUT',headers,body:JSON.stringify({version:1,input:saved.input})})).status,403);
   assert.equal((await fetch(origin+'/api/tax/vat/filing?'+new URLSearchParams(query),{method:'POST',headers,body:'{}'})).status,403);
   user.permissions.accounting_write=true;
   const current=await vat.get(query),input={...current.input,overrides:current.records.map(row=>({key:row.key,fingerprint:row.fingerprint,category:row.category,base:row.base,rate:row.rate,deductible_percent:'100.00'}))};
   const preview=await vat.preview(query,input),body={input:preview.input,model_hash:preview.model_hash,filing:{type:'I',confirmed:true,redeme:false,voluntary_sii:false,annual_exempt:false,no_activity:false,iban:''}};
   const response=await fetch(origin+'/api/tax/vat/filing?'+new URLSearchParams(query),{method:'POST',headers,body:JSON.stringify(body)});
   assert.equal(response.status,200);assert.match(response.headers.get('Content-Disposition'),/B12345674_2026_1T\.303/);assert.equal((await response.arrayBuffer()).byteLength,3767);
   body.model_hash='0'.repeat(64);assert.equal((await fetch(origin+'/api/tax/vat/filing?'+new URLSearchParams(query),{method:'POST',headers,body:JSON.stringify(body)})).status,409);
   assert.equal((await fetch(origin+'/api/tax/vat?year=2026&frequency=monthly&period=99',{headers})).status,400);
  });
  await t.test('an existing liquidation is reported and excluded from the period VAT totals',async()=>{
   const current=await vat.get(query),input={...current.input,overrides:current.records.map(row=>({key:row.key,fingerprint:row.fingerprint,category:row.category,base:row.base,rate:row.rate,deductible_percent:'100.00'}))};
   const model=await vat.preview(query,input),proposal=model.settlement_proposal;assert.equal(proposal.ready,true);
   const liquidation=await accounting.createEntry({exercise_id:exercise.insertId,entry_date:proposal.date,description:proposal.description,request_id:randomUUID(),lines:proposal.lines.map(line=>({account_id:line.account_id,description:line.description,debit:line.debit,credit:line.credit}))});
   const after=await vat.preview(query,input);assert.equal(after.total_output,model.total_output);assert.equal(after.total_deductible,model.total_deductible);assert.equal(after.records.length,model.records.length);
   assert.equal(after.settlement_proposal.comparison.matched,true);assert.equal(after.settlement_proposal.ready,false);assert.ok(after.settlement_proposal.existing_settlements.some(entry=>entry.entry_id===liquidation.id));assert.ok(after.settlement_proposal.issues.some(issue=>issue.code==='VAT_SETTLEMENT_EXISTS'));
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.rollback();db.release();await pool.end();}
});
