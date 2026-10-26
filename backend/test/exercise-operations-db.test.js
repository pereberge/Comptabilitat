import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createExerciseService } from '../src/services/exercises.js';
import { createExerciseOperationService } from '../src/services/exercise-operations.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createReportService } from '../src/services/reports.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';
const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
const error=code=>e=>e.code===code;
function failingPool(pool,match){return {async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(match(sql,args))throw new Error('Injected annual failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};}
async function cleanup(pool,ids){for(const companyId of ids){
 for(const table of ['journal_lines','journal_entries','exercise_operations','journal_imports','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
 const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
}}
test('MySQL annual operations: preview, close, open, cancel, regenerate and preserve audit',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
 try{
  const company=await context.createCompany({name:'Annual test '+randomUUID(),exercise:period(2025)});ids.push(company.id);
  const foreign=await context.createCompany({name:'Foreign annual '+randomUUID(),exercise:period(2025)});ids.push(foreign.id);
  const year=(await context.getContext(company.id)).exercises[0],years=createExerciseService(pool,company.id),ops=createExerciseOperationService(pool,company.id),accounting=createAccountingService(pool,company.id),reports=createReportService(pool,company.id),accounts={};
  for(const [code,name]of [['5720.0001','Bank'],['1000.0001','Capital'],['4300.0001','Customer'],['7000.0001','Sales'],['6000.0001','Purchases']])accounts[name]=await accounting.createAccount({code,description:name});
  const post=(exerciseId,date,lines)=>accounting.createEntry({exercise_id:exerciseId,entry_date:date,description:'Annual ordinary movement',request_id:randomUUID(),lines:lines.map(([name,debit,credit])=>({account_id:accounts[name].id,debit,credit,description:name}))});
  const initial=await post(year.id,'2025-01-01',[['Bank','1000','0'],['Capital','0','1000']]);
  await post(year.id,'2025-06-01',[['Customer','100','0'],['Sales','0','100']]);await post(year.id,'2025-06-02',[['Purchases','40','0'],['Bank','0','40']]);
  const body=plan=>({request_id:randomUUID(),preview_hash:plan.preview_hash,...(plan.kind.startsWith('cancel_')?{reason:'Test annual correction'}:{})});
  const run=async(id,kind)=>{const preview=await ops.preview(id,kind);return ops.execute(id,kind,body(preview));};
  let closing,opening,next;
  await t.test('stale preview and a failed write do not close the year or retain partial annual rows',async()=>{
   const preview=await ops.preview(year.id,'closing');
   await post(year.id,'2025-07-01',[['Bank','1','0'],['Capital','0','1']]);
   await assert.rejects(ops.execute(year.id,'closing',body(preview)),error('ANNUAL_PREVIEW_STALE'));
   const refreshed=await ops.preview(year.id,'closing'),failing=createExerciseOperationService(failingPool(pool,sql=>sql.startsWith('INSERT INTO journal_lines')),company.id);
   await assert.rejects(failing.execute(year.id,'closing',body(refreshed)),/Injected annual failure/);
   assert.equal((await years.list())[0].status,'open');assert.equal((await accounting.listAccounts({kind:'subaccount'})).filter(row=>row.code.startsWith('129')).length,0);
   const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM exercise_operations WHERE company_id=?',[company.id]);assert.equal(count.total,0);
  });
  await t.test('concurrent repeated requests create one regularization and one closing, with exact result',async()=>{
   const preview=await ops.preview(year.id,'closing');assert.equal(preview.result_transfer,'60.00');const request=body(preview),responses=await Promise.all([ops.execute(year.id,'closing',request),ops.execute(year.id,'closing',request)]);
   closing=responses[0];assert.equal(closing.entries.length,2);assert.equal(responses[1].operation_id,closing.operation_id);assert.ok(responses.some(row=>row.replayed));
   assert.equal((await years.list())[0].status,'closed');
   const [balances]=await pool.execute("SELECT l.account_id,SUM(l.debit-l.credit) AS balance FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' GROUP BY l.account_id HAVING balance<>0",[company.id,year.id]);assert.deepEqual(balances,[]);
   await assert.rejects(ops.preview(year.id,'closing'),error('ANNUAL_CLOSING_EXISTS'));
   await assert.rejects(ops.execute(year.id,'closing',{...request,result_account_id:accounts.Bank.id}),error('REQUEST_CONFLICT'));
   await assert.rejects(post(year.id,'2025-08-01',[['Bank','1','0'],['Capital','0','1']]),error('EXERCISE_CLOSED'));
  });
  await t.test('new year and opening are atomic and idempotent, including rollback after opening insertion',async()=>{
   const carry=await ops.carry(year.id);assert.equal(carry.totals.debit,'1061.00');
   const request={...period(2026),opening_from_exercise_id:year.id,opening_preview_hash:carry.preview_hash,request_id:randomUUID()};
   const failing=createExerciseService(failingPool(pool,(sql,args)=>sql.startsWith('INSERT INTO exercise_operations')&&args[3]==='create_exercise'),company.id);
   await assert.rejects(failing.create(request),/Injected annual failure/);assert.equal((await years.list()).length,1);
   const wrongHash={...request,opening_preview_hash:'0'.repeat(64)};await assert.rejects(years.create(wrongHash),error('ANNUAL_PREVIEW_STALE'));assert.equal((await years.list()).length,1);
   next=await years.create(request);opening=next.opening.entries[0];assert.equal(opening.entry_date,'2026-01-01');assert.equal(opening.debit,'1061.00');assert.equal((await years.create(request)).id,next.id);
   assert.equal((await years.list()).length,2);
   await assert.rejects(ops.preview(next.id,'opening'),error('ANNUAL_OPENING_EXISTS'));
  });
  await t.test('existing typed imported annual entries are recognized and only the annual rows are annulled',async()=>{
   const [batch]=await pool.execute(`INSERT INTO journal_imports(company_id,exercise_id,source_name,source_company,source_hash,content_hash,source_pdf,pages,entry_count,line_count,account_count,debit_total,credit_total) VALUES (?,?,'fixture.pdf',?,?,?, ?,1,3,8,4,'0.00','0.00')`,[company.id,year.id,company.name,'a'.repeat(64),'b'.repeat(64),Buffer.from('%PDF-annual-fixture')]);
   await pool.execute("UPDATE journal_entries SET entry_type='opening',number=0,import_id=? WHERE company_id=? AND id=?",[batch.insertId,company.id,initial.id]);
   await pool.execute('UPDATE journal_entries SET exercise_operation_id=NULL,import_id=? WHERE company_id=? AND id IN (?,?)',[batch.insertId,company.id,closing.entries[0].id,closing.entries[1].id]);
   const [[importBefore]]=await pool.execute('SELECT * FROM journal_imports WHERE company_id=? AND id=?',[company.id,batch.insertId]);
   const [beforeLines]=await pool.execute('SELECT * FROM journal_lines WHERE company_id=? ORDER BY id',[company.id]);
   await post(next.id,'2026-02-01',[['Customer','10','0'],['Sales','0','10']]);
   const preview=await ops.preview(year.id,'cancel_closing');assert.equal(preview.cancel_entries.length,3);assert.equal(preview.affected_exercises.length,2);
   const cancelled=await ops.execute(year.id,'cancel_closing',body(preview));assert.equal(cancelled.cancelled_entries.length,3);
   const [afterLines]=await pool.execute('SELECT * FROM journal_lines WHERE company_id=? AND id<=? ORDER BY id',[company.id,beforeLines.at(-1).id]);assert.deepEqual(afterLines,beforeLines);
   assert.equal((await accounting.getEntry(opening.id)).status,'cancelled');assert.equal((await accounting.getEntry(initial.id)).status,'posted');
   const [[importAfter]]=await pool.execute('SELECT * FROM journal_imports WHERE company_id=? AND id=?',[company.id,batch.insertId]);assert.deepEqual(importAfter,importBefore);assert.equal((await accounting.getEntry(initial.id)).number,0);
   assert.equal((await years.list()).find(row=>row.id===year.id).status,'open');
   const ledger=await reports.ledger({exercise_id:year.id,account_id:accounts.Bank.id});assert.equal(ledger.totals.closing,'961.00');
   const journal=await accounting.listEntries({exercise_id:next.id,view:'lines'});assert.ok(journal.some(row=>row.entry_id===opening.id&&row.status==='cancelled'));
   assert.ok((await years.history(next.id)).some(row=>row.kind==='cancel_closing'));
  });
  await t.test('closing and opening can be regenerated with fresh numbers, then the opening annulled independently',async()=>{
   const regenerated=await run(year.id,'closing');assert.ok(regenerated.entries[0].number>closing.entries[1].number);
   const preview=await ops.preview(next.id,'opening'),first=body(preview),second=body(preview),competitors=await Promise.allSettled([ops.execute(next.id,'opening',first),ops.execute(next.id,'opening',second)]);
   assert.equal(competitors.filter(row=>row.status==='fulfilled').length,1);assert.ok(competitors.some(row=>row.status==='rejected'&&row.reason.code==='ANNUAL_OPENING_EXISTS'));
   opening=competitors.find(row=>row.status==='fulfilled').value.entries[0];assert.ok(opening.number>2);
   const cancelled=await run(next.id,'cancel_opening');assert.equal(cancelled.cancelled_entries.length,1);
   assert.equal((await years.list()).find(row=>row.id===year.id).status,'closed');
   await assert.rejects(ops.preview(next.id,'closing'),error('ANNUAL_OPENING_REQUIRED'));
   const regeneratedOpening=await run(next.id,'opening');assert.ok(regeneratedOpening.entries[0].number>opening.number);opening=regeneratedOpening.entries[0];
  });
  await t.test('a closed following year must be reopened before its dependent opening can be cancelled',async()=>{
   await run(next.id,'closing');await assert.rejects(ops.preview(year.id,'cancel_closing'),error('ANNUAL_DEPENDENT_EXERCISE_CLOSED'));
   await assert.rejects(ops.preview(next.id,'cancel_opening'),error('ANNUAL_TARGET_CLOSED'));
   await run(next.id,'cancel_closing');await run(year.id,'cancel_closing');
  });
  await t.test('source year, account and operation endpoints are company scoped and validate adjacency',async()=>{
   await assert.rejects(createExerciseOperationService(pool,foreign.id).preview(year.id,'closing'),error('EXERCISE_NOT_FOUND'));
   await assert.rejects(createExerciseService(pool,foreign.id).history(year.id),error('EXERCISE_NOT_FOUND'));
   await assert.rejects(ops.preview(next.id,'opening'),error('ANNUAL_SOURCE_NOT_CLOSED'));
   await run(year.id,'closing');const gap=await years.create(period(2028));await assert.rejects(ops.preview(gap.id,'opening',{source_exercise_id:year.id}),error('ANNUAL_INVALID_SOURCE'));
   await assert.rejects(ops.preview(next.id,'opening',{source_exercise_id:(await context.getContext(foreign.id)).exercises[0].id}),error('EXERCISE_NOT_FOUND'));
   server=createApp(context,accounting,companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';
   const good=await fetch(base+'/exercises/'+next.id+'/operations/opening/preview',{headers:{'X-Company-Id':String(company.id)}});assert.equal(good.status,200);assert.equal((await good.json()).entries[0].entry_type,'opening');
   const denied=await fetch(base+'/exercises/'+next.id+'/operations/opening/preview',{headers:{'X-Company-Id':String(foreign.id)}});assert.equal(denied.status,404);
   assert.equal((await fetch(base+'/exercises/'+year.id+'/operations',{headers:{'X-Company-Id':String(company.id)}})).status,200);
   const preview=await ops.preview(next.id,'opening');
   const committed=await fetch(base+'/exercises/'+next.id+'/operations/opening',{method:'POST',headers:{'X-Company-Id':String(company.id),'Content-Type':'application/json'},body:JSON.stringify(body(preview))});assert.equal(committed.status,200);assert.equal((await committed.json()).entries[0].entry_type,'opening');
  });
  await t.test('annual writer supports more than 100 lines while manual entry limits stay intact',async()=>{
   const large=await context.createCompany({name:'Annual many accounts '+randomUUID(),exercise:period(2030)});ids.push(large.id);const largeYear=(await context.getContext(large.id)).exercises[0],largeAccounting=createAccountingService(pool,large.id),largeOps=createExerciseOperationService(pool,large.id);
   const capital=await largeAccounting.createAccount({code:'1000.0001',description:'Capital'}),assets=[];
   for(let i=1;i<=101;i++)assets.push(await largeAccounting.createAccount({code:'5720.'+String(i).padStart(4,'0'),description:'Bank '+i}));
   for(const slice of [assets.slice(0,50),assets.slice(50)])await largeAccounting.createEntry({exercise_id:largeYear.id,entry_date:'2030-01-01',description:'Many accounts',request_id:randomUUID(),lines:[...slice.map(account=>({account_id:account.id,description:'Asset',debit:'0.01',credit:'0.00'})),{account_id:capital.id,description:'Capital',debit:'0.00',credit:(slice.length/100).toFixed(2)}]});
   const preview=await largeOps.preview(largeYear.id,'closing');assert.equal(preview.entries[0].lines.length,102);assert.equal(preview.entries[0].totals.debit,'1.01');
   const closed=await largeOps.execute(largeYear.id,'closing',body(preview));assert.equal((await largeAccounting.getEntry(closed.entries[0].id)).lines.length,102);assert.equal((await largeOps.carry(largeYear.id)).lines.length,102);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});

