import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createReportService} from '../src/services/reports.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';

test('MySQL entry edits: atomic balanced changes, protected sources, concurrency and home ledger',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool({...config.database,connectionLimit:6}),ids=[];let server;
 try{
  const context=createContextService(pool,config.companyId),company=await context.createCompany({name:'Fictitious editable ledger '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);
  const foreign=await context.createCompany({name:'Fictitious foreign ledger '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(foreign.id);
  const exercise=(await context.getContext(company.id)).exercises[0],service=createAccountingService(pool,company.id),reports=createReportService(pool,company.id),foreignService=createAccountingService(pool,foreign.id);
  const bank=await service.createAccount({code:'5720.0001',description:'Fictitious bank'}),expense=await service.createAccount({code:'6290.0001',description:'Fictitious expense'}),other=await service.createAccount({code:'5720.0002',description:'Fictitious other bank'}),foreignAccount=await foreignService.createAccount({code:'5720.0001',description:'Foreign bank'});
  const body=(concept='Fictitious entry',day='2026-01-02',amount='10.00')=>({exercise_id:exercise.id,entry_date:day,description:concept,request_id:randomUUID(),lines:[{account_id:expense.id,description:'Fictitious cost',debit:amount,credit:'0.00'},{account_id:bank.id,description:'Fictitious payment',debit:'0.00',credit:amount}]});
  const original=body(),created=await service.createEntry(original);
  const patch=entry=>({exercise_id:entry.exercise_id,revision:entry.revision,entry_date:entry.entry_date,description:entry.description,lines:entry.lines.map(({id,account_id,description,debit,credit})=>({id,account_id,description,debit,credit}))});
  await t.test('entry edits retain identity, original request idempotency, cents and source provenance',async()=>{
   let entry=await service.getEntry(created.id);assert.equal(entry.editable,true);assert.match(entry.revision,/^[a-f0-9]{64}$/);
   await pool.execute('UPDATE journal_lines SET source_page=3,source_account_name=? WHERE company_id=? AND id=?',['Imported bank alias',company.id,entry.lines[1].id]);entry=await service.getEntry(created.id);
   const update=patch(entry);update.entry_date='2026-01-03';update.description='Updated fictitious payment';update.lines[0].debit='12.34';update.lines[1].credit='12.34';
   const saved=await service.updateEntry(created.id,update);assert.equal(saved.id,entry.id);assert.equal(saved.number,entry.number);assert.equal(saved.request_hash,entry.request_hash);assert.equal(saved.request_id,entry.request_id);assert.notEqual(saved.revision,entry.revision);assert.equal(saved.lines[1].id,entry.lines[1].id);assert.equal(saved.lines[1].source_page,3);assert.equal(saved.lines[1].source_account_name,'Imported bank alias');
   assert.equal((await service.updateEntry(created.id,update)).replayed,true);assert.equal((await service.createEntry(original)).id,created.id);assert.equal((await service.getEntry(created.id)).lines[1].credit,'12.34');
   const ledger=await reports.ledger({exercise_id:exercise.id,account_id:bank.id});assert.equal(ledger.rows[0].description,'Fictitious payment');assert.equal(ledger.totals.closing,'-12.34');
   const next=patch(saved);next.lines[1].account_id=other.id;const moved=await service.updateEntry(created.id,next);assert.equal(moved.lines[1].source_account_name,null);assert.equal(moved.lines[1].source_page,3);
  });
  await t.test('invalid, out-of-year, foreign and unbalanced edits leave the original intact',async()=>{
   const before=await service.getEntry(created.id),valid=patch(before);
   for(const [data,code] of [[{...valid,number:55},'IMMUTABLE_ENTRY'],[{...valid,revision:''},'INVALID_ENTRY_REVISION'],[{...valid,exercise_id:(await context.getContext(foreign.id)).exercises[0].id},'IMMUTABLE_ENTRY'],[{...valid,entry_date:'2027-01-01'},'DATE_OUTSIDE_EXERCISE'],[{...valid,lines:valid.lines.map((line,i)=>i?{...line,credit:'999.00'}:line)},'UNBALANCED_ENTRY'],[{...valid,lines:valid.lines.map((line,i)=>i?{...line,account_id:foreignAccount.id}:line)},'ACCOUNT_NOT_FOUND'],[{...valid,lines:valid.lines.map((line,i)=>i?{...line,account_id:bank.parent_id}:line)},'SUBACCOUNT_REQUIRED'],[{...valid,lines:valid.lines.map(line=>({...line,id:valid.lines[0].id}))},'INVALID_LINES']])await assert.rejects(service.updateEntry(created.id,data),error=>error.code===code);
   await assert.rejects(foreignService.updateEntry(created.id,valid),error=>error.code==='ENTRY_NOT_FOUND');assert.equal((await service.getEntry(created.id)).revision,before.revision);
  });
  await t.test('line insertion and deletion remain balanced and concurrent stale edits are rejected',async()=>{
   let entry=await service.getEntry(created.id),data=patch(entry);data.lines[0].debit='6.17';data.lines.push({account_id:expense.id,description:'Second part',debit:'6.17',credit:'0.00'});entry=await service.updateEntry(created.id,data);assert.equal(entry.lines.length,3);assert.ok(entry.lines[2].id);
   const staleLines=patch(entry);data=patch(entry);data.lines=data.lines.slice(0,2);data.lines[0].debit='12.34';entry=await service.updateEntry(created.id,data);assert.equal(entry.lines.length,2);await assert.rejects(service.updateEntry(created.id,{...staleLines,description:'Stale removed line edit'}),error=>error.code==='ENTRY_CHANGED');
   const one={...patch(entry),description:'Concurrent one'},two={...patch(entry),description:'Concurrent two'},results=await Promise.allSettled([service.updateEntry(created.id,one),service.updateEntry(created.id,two)]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.find(result=>result.status==='rejected').reason.code,'ENTRY_CHANGED');
  });
  await t.test('write failures roll back header and every journal line',async()=>{
   const before=await service.getEntry(created.id),data={...patch(before),description:'Must roll back'};
   const failing={execute:pool.execute.bind(pool),async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('INSERT INTO journal_lines'))throw Error('Injected edit failure');return db.execute(sql,args);},query:db.query.bind(db),beginTransaction:db.beginTransaction.bind(db),commit:db.commit.bind(db),rollback:db.rollback.bind(db),release:db.release.bind(db)};}};
   await assert.rejects(createAccountingService(failing,company.id).updateEntry(created.id,data),/Injected edit failure/);assert.equal((await service.getEntry(created.id)).revision,before.revision);
  });
  await t.test('closed, annual and cancelled journals cannot be edited',async()=>{
   let entry=await service.getEntry(created.id);
   await pool.execute("UPDATE accounting_exercises SET is_default=0,status='closed' WHERE company_id=? AND id=?",[company.id,exercise.id]);assert.equal((await service.getEntry(created.id)).editable,false);await assert.rejects(service.updateEntry(created.id,{...patch(entry),description:'Closed edit'}),error=>error.code==='EXERCISE_CLOSED');
   await pool.execute("UPDATE accounting_exercises SET status='open' WHERE company_id=? AND id=?",[company.id,exercise.id]);
   for(const [status,type] of [['posted','opening'],['posted','regularization'],['posted','closing'],['cancelled','normal'],['draft','normal']]){await pool.execute('UPDATE journal_entries SET status=?,entry_type=? WHERE company_id=? AND id=?',[status,type,company.id,created.id]);entry=await service.getEntry(created.id);assert.equal(entry.editable,false);await assert.rejects(service.updateEntry(created.id,{...patch(entry),description:'Protected edit'}),error=>error.code==='ENTRY_NOT_EDITABLE');}
   await pool.execute("UPDATE journal_entries SET status='posted',entry_type='normal' WHERE company_id=? AND id=?",[company.id,created.id]);
  });
  await t.test('invoice journals are protected even though their entry type is normal',async()=>{
   const invoice=await createInvoiceService(pool,company.id).create({exercise_id:exercise.id,direction:'issued',reference:'FICT-1',invoice_date:'2026-01-04',party:{name:'Fictitious customer'},request_id:randomUUID(),lines:[{description:'Fictitious service',base:'20.00',tax_rate:'21'}],receipts:[{due_date:'2026-01-04',amount:'24.20'}]});
   const entry=await service.getEntry(invoice.entry_id);assert.equal(entry.entry_type,'normal');assert.equal(entry.editable,false);assert.equal(entry.edit_blocked_reason,'ENTRY_LINKED_DOCUMENT');await assert.rejects(service.updateEntry(entry.id,{...patch(entry),description:'Blocked invoice edit'}),error=>error.code==='ENTRY_LINKED_DOCUMENT');
  });
  await t.test('home ledger chooses the account in the final posted line, honours exclusions and handles empty years',async()=>{
   const last=await service.createEntry(body('Latest fictitious entry','2026-12-20','7.89'));let ledger=await reports.ledger({exercise_id:exercise.id,latest:true,exclude_closing:true});assert.equal(ledger.account.id,bank.id);assert.equal(ledger.rows.at(-1).entry_id,last.id);assert.equal(ledger.rows.at(-1).entry_type,'normal');
   const cancelled=await service.createEntry(body('Cancelled newest','2026-12-21'));await pool.execute("UPDATE journal_entries SET status='cancelled' WHERE company_id=? AND id=?",[company.id,cancelled.id]);ledger=await reports.ledger({exercise_id:exercise.id,latest:'true'});assert.equal(ledger.rows.at(-1).entry_id,last.id);
   const annual=await service.createEntry(body('Closing newest','2026-12-31'));await pool.execute("UPDATE journal_entries SET entry_type='closing' WHERE company_id=? AND id=?",[company.id,annual.id]);ledger=await reports.ledger({exercise_id:exercise.id,latest:'true',exclude_closing:true});assert.equal(ledger.rows.at(-1).entry_id,last.id);
   const [empty]=await pool.execute('INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,?,?,?)',[company.id,'2027','2027-01-01','2027-12-31']);ledger=await reports.ledger({exercise_id:empty.insertId,latest:true});assert.equal(ledger.account,null);assert.deepEqual(ledger.rows,[]);assert.equal(ledger.totals.closing,'0.00');await assert.rejects(reports.ledger({exercise_id:exercise.id,latest:'yes'}));
  });
  await t.test('HTTP editing enforces write permission and company isolation',async()=>{
   let writable=false;const access=accessControl({current:async()=>({permissions:{accounting_write:writable}})});
   server=createApp(context,service,companyScope(pool,company.id),access).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port,entry=await service.getEntry(created.id),data={...patch(entry),description:'HTTP fictitious update'};
   const request=(companyId=company.id)=>fetch(base+'/api/entries/'+created.id,{method:'PATCH',headers:{'Content-Type':'application/json','X-Company-Id':String(companyId)},body:JSON.stringify(data)});
   assert.equal((await request()).status,403);writable=true;const response=await request();assert.equal(response.status,200);assert.equal((await response.json()).description,data.description);assert.equal((await request(foreign.id)).status,404);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){for(const table of ['portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM company_details WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}await pool.end();
 }
});
