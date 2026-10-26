import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createExerciseService } from '../src/services/exercises.js';
import { createExerciseClearService } from '../src/services/exercise-clear.js';
import { createExerciseOperationService } from '../src/services/exercise-operations.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createInvoiceService } from '../src/services/invoices.js';
import { createInvoiceDocumentService } from '../src/services/invoice-documents.js';
import { createPortfolioService } from '../src/services/portfolio.js';
import { createJournalImportService } from '../src/services/journal-import.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';
import { invoicePdf } from '../test-support/invoice-fixture.js';
import { journalPdf } from '../test-support/journal-fixture.js';
const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
const error=code=>cause=>cause.code===code;
function failingPool(pool,match){return {async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(match(sql,args))throw new Error('Injected clear failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};}
async function cleanup(pool,ids){for(const companyId of ids){
 await pool.execute('DELETE FROM exercise_clear_rows WHERE company_id=?',[companyId]);
 for(const table of ['exercise_clears','invoice_documents','bank_reconciliations','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','exercise_operations','journal_imports','bank_connections','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
 const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
}}
test('MySQL period clear requires 96, archives everything atomically and preserves other periods',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
 try{
  const company=await context.createCompany({name:'Clear test '+randomUUID(),exercise:period(2026)});ids.push(company.id);
  const foreign=await context.createCompany({name:'Foreign clear '+randomUUID(),exercise:period(2026)});ids.push(foreign.id);
  const year=(await context.getContext(company.id)).exercises[0],foreignYear=(await context.getContext(foreign.id)).exercises[0],years=createExerciseService(pool,company.id),prior=await years.create(period(2025)),next=await years.create(period(2027));
  const service=createExerciseClearService(pool,company.id),accounting=createAccountingService(pool,company.id),invoices=createInvoiceService(pool,company.id),portfolio=createPortfolioService(pool,company.id),documents=createInvoiceDocumentService(pool,company.id),operations=createExerciseOperationService(pool,company.id);
  const accounts={};for(const [name,code]of [['Bank','5720.0001'],['Capital','1000.0001'],['Cost','6280.0001'],['VAT','4720.0021'],['Sales','7000.0001']])accounts[name]=await accounting.createAccount({code,description:name==='Cost'?'Electricidad':name==='VAT'?'IVA 21%':name});
  const entry=(exerciseId,date)=>accounting.createEntry({exercise_id:exerciseId,entry_date:date,description:'Capital contribution',request_id:randomUUID(),lines:[{account_id:accounts.Bank.id,description:'Bank',debit:'100.00',credit:'0.00'},{account_id:accounts.Capital.id,description:'Capital',debit:'0.00',credit:'100.00'}]});
  await entry(prior.id,'2025-01-01');await entry(next.id,'2027-01-01');
  const foreignAccounting=createAccountingService(pool,foreign.id),foreignBank=await foreignAccounting.createAccount({code:'5720.0001',description:'Other bank'}),foreignCapital=await foreignAccounting.createAccount({code:'1000.0001',description:'Other capital'});
  await foreignAccounting.createEntry({exercise_id:foreignYear.id,entry_date:'2026-01-01',description:'Other company',request_id:randomUUID(),lines:[{account_id:foreignBank.id,description:'Bank',debit:'20',credit:'0'},{account_id:foreignCapital.id,description:'Capital',debit:'0',credit:'20'}]});
  const body=(exerciseId,reference,date='2026-10-15')=>({exercise_id:exerciseId,direction:'received',reference,invoice_date:date,posting_date:date,party:{name:'Electric Supplies SL',tax_id:'B11111111'},party_parent:'4100',offset_account_id:accounts.Cost.id,vat_account_id:accounts.VAT.id,withholding_rate:'0',payment_method:'direct_debit',request_id:randomUUID(),lines:[{description:'Electricity',base:'16.33',tax_rate:'21'}],receipts:[{due_date:date,amount:'19.76'}]});
  const invoice=await invoices.create(body(year.id,'SUP-2026-1'));
  const payment=(exerciseId,date,amount)=>({exercise_id:exerciseId,payment_date:date,amount,bank_account_id:accounts.Bank.id,payment_method:'transfer',request_id:randomUUID()});
  const settled=await portfolio.settle(invoice.receipts[0].id,payment(year.id,'2026-10-22','5.00'));await portfolio.reverse(settled.settlement_id,{exercise_id:year.id,date:'2026-10-23',reason:'Correction',request_id:randomUUID()});
  const issued=await invoices.create({...body(year.id,'ISSUED'),direction:'issued',party_parent:'4300',party:{name:'Customer'},offset_account_id:accounts.Sales.id,vat_account_id:undefined});await invoices.void(issued.id,{exercise_id:year.id,date:'2026-10-24',reason:'Wrong invoice',request_id:randomUUID()});
  const pdf=invoicePdf(company.name,'SUP-2026-1'),preview=await documents.preview(pdf,year.id,'original.pdf'),doc=await documents.archive({token:preview.token});const saved=await documents.get(doc.id);await documents.post(doc.id,{version:saved.version,confirm:true,action:'attach'});
  await documents.archive({token:(await documents.preview(invoicePdf(company.name,'DRAFT'),year.id,'draft.pdf')).token});
  await pool.execute(`INSERT INTO bank_reconciliations(company_id,exercise_id,account_id,source_name,source_sha256,source_pdf,snapshot,ledger_hash) VALUES (?,?,?,'bank.pdf',?,?,?,?)`,[company.id,year.id,accounts.Bank.id,createHash('sha256').update(pdf).digest('hex'),pdf,'{}','a'.repeat(64)]);
  const [imported]=await pool.execute(`INSERT INTO journal_imports(company_id,exercise_id,source_name,source_company,source_hash,content_hash,source_pdf,pages,entry_count,line_count,account_count,debit_total,credit_total) VALUES (?,?,'journal.pdf',?,?,?,?,1,1,2,2,'100.00','100.00')`,[company.id,year.id,company.name,'a'.repeat(64),'b'.repeat(64),pdf]);
  await pool.execute('UPDATE journal_entries SET import_id=? WHERE company_id=? AND id=?',[imported.insertId,company.id,invoice.entry_id]);
  const [annual]=await pool.execute(`INSERT INTO exercise_operations(company_id,exercise_id,kind,request_id,request_hash,snapshot,result) VALUES (?,?,'closing',?,?,'{}','{}')`,[company.id,year.id,randomUUID(),'a'.repeat(64)]);
  const extra=await entry(year.id,'2026-11-01');await pool.execute("UPDATE journal_entries SET status='cancelled',exercise_operation_id=? WHERE company_id=? AND id=?",[annual.insertId,company.id,extra.id]);
  await pool.execute("UPDATE accounting_exercises SET status='closed' WHERE company_id=? AND id=?",[company.id,year.id]);
  const count=async(table,exerciseId=year.id)=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?'+(['journal_entries','trade_invoices','invoice_documents','bank_reconciliations','journal_imports','exercise_operations','exercise_clears'].includes(table)?' AND exercise_id=?':''),['journal_entries','trade_invoices','invoice_documents','bank_reconciliations','journal_imports','exercise_operations','exercise_clears'].includes(table)?[company.id,exerciseId]:[company.id]))[0][0].n;
  const request=plan=>({confirmation:'96',preview_hash:plan.preview_hash,request_id:randomUUID()});
  async function targetSnapshot(){const result={};for(const table of ['invoice_documents','bank_reconciliations','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','exercise_operations','journal_imports','accounting_exercises']){const [rows]=await pool.execute('SELECT * FROM '+table+' WHERE company_id=? ORDER BY id',[company.id]);result[table]=rows;}return JSON.stringify(result);}
  const protectedRows={};for(const table of ['accounts','companies','company_details','journal_entries','journal_lines']){let rows;if(table==='companies')[rows]=await pool.execute('SELECT * FROM companies WHERE id IN (?,?) ORDER BY id',[company.id,foreign.id]);else if(table==='journal_entries')[rows]=await pool.execute('SELECT * FROM journal_entries WHERE company_id=? OR (company_id=? AND exercise_id<>?) ORDER BY id',[foreign.id,company.id,year.id]);else if(table==='journal_lines')[rows]=await pool.execute('SELECT l.* FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id WHERE e.company_id=? OR (e.company_id=? AND e.exercise_id<>?) ORDER BY l.id',[foreign.id,company.id,year.id]);else[rows]=await pool.execute('SELECT * FROM '+table+' WHERE company_id IN (?,?) ORDER BY company_id',[company.id,foreign.id]);protectedRows[table]=JSON.stringify(rows);}
  let current,cleared,clearRequest;
  await t.test('preview counts all related rows without changing accounting and rejects another company',async()=>{
   const before=await targetSnapshot();current=await service.preview(year.id);assert.equal(await targetSnapshot(),before);assert.equal(current.company.id,company.id);assert.equal(current.ready,true);assert.equal(current.counts.entries,6);assert.equal(current.counts.documents,2);assert.equal(current.counts.invoices,2);assert.equal(current.counts.receipts,2);assert.equal(current.counts.settlements,1);assert.equal(current.counts.bank_reports,1);assert.equal(current.counts.imports,1);assert.equal(current.counts.annual_operations,1);
   await assert.rejects(createExerciseClearService(pool,foreign.id).preview(year.id),error('EXERCISE_NOT_FOUND'));
  });
  await t.test('only the exact code 96 plus a current preview and valid request are accepted',async()=>{
   const before=await targetSnapshot();for(const confirmation of [undefined,'','95',96,'96 ','096'])await assert.rejects(service.clear(year.id,{...request(current),confirmation}),error('EXERCISE_CLEAR_CODE'));
   await assert.rejects(service.clear(year.id,{confirmation:'96',request_id:randomUUID()}),error('EXERCISE_CLEAR_PREVIEW_REQUIRED'));
   await assert.rejects(service.clear(year.id,{...request(current),request_id:'invalid'}),error('INVALID_REQUEST'));
   await assert.rejects(createExerciseClearService(pool,foreign.id).clear(year.id,request(current)),error('EXERCISE_NOT_FOUND'));assert.equal(await targetSnapshot(),before);assert.equal(await count('exercise_clears'),0);
  });
  await t.test('a changed preview cannot erase new transactions',async()=>{
   await pool.execute("UPDATE journal_entries SET description='Changed after preview' WHERE company_id=? AND id=?",[company.id,extra.id]);const before=await targetSnapshot();await assert.rejects(service.clear(year.id,request(current)),error('EXERCISE_CLEAR_STALE'));assert.equal(await targetSnapshot(),before);current=await service.preview(year.id);
  });
  await t.test('backup failure and a failure halfway through deletion roll back everything',async()=>{
   const before=await targetSnapshot();for(const match of [sql=>sql.startsWith('INSERT INTO exercise_clear_rows'),sql=>sql.startsWith('DELETE FROM journal_entries')]){await assert.rejects(createExerciseClearService(failingPool(pool,match),company.id).clear(year.id,request(current)),/Injected clear failure/);assert.equal(await targetSnapshot(),before);assert.equal(await count('exercise_clears'),0);assert.equal(await count('exercise_clear_rows'),0);}
  });
  await t.test('API also enforces the code, company scope and preview',async()=>{
   server=createApp(context,accounting,companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';
   const post=async(confirmation,companyId=company.id)=>fetch(base+'/exercises/'+year.id+'/clear',{method:'POST',headers:{'X-Company-Id':String(companyId),'Content-Type':'application/json'},body:JSON.stringify({...request(current),confirmation})});assert.equal((await post('95')).status,400);assert.equal((await post('96',foreign.id)).status,404);assert.equal((await fetch(base+'/exercises/'+year.id+'/clear/preview',{headers:{'X-Company-Id':String(company.id)}})).status,200);
  });
  await t.test('concurrent confirmations clear once, archive original PDFs and leave the period open',async()=>{
   clearRequest=request(current);const results=await Promise.all([service.clear(year.id,clearRequest),service.clear(year.id,clearRequest)]);cleared=results[0];assert.equal(results[1].clear_id,cleared.clear_id);assert.ok(results.some(row=>row.replayed));
   for(const table of ['journal_entries','trade_invoices','invoice_documents','bank_reconciliations','journal_imports','exercise_operations'])assert.equal(await count(table),0,table);
   for(const table of ['portfolio_settlements','portfolio_receipts','trade_invoice_lines'])assert.equal(await count(table),0,table);
   const yearAfter=(await years.list()).find(row=>row.id===year.id);assert.equal(yearAfter.status,'open');assert.equal(yearAfter.entries_count,0);assert.equal(yearAfter.import,null);assert.equal(yearAfter.last_clear.id,cleared.clear_id);assert.equal(await count('exercise_clears'),1);
   const backup=await service.backup(cleared.clear_id),rows=[];for await(const row of backup.rows())rows.push(row);assert.equal(rows.filter(row=>row.table==='journal_entries').length,6);const document=rows.find(row=>row.table==='invoice_documents'&&row.id===doc.id);assert.deepEqual(Buffer.from(document.data.source_pdf.$binary_base64,'base64'),pdf);assert.equal(document.action,'delete');assert.equal(rows.find(row=>row.table==='accounting_exercises').data.status,'closed');
   await assert.rejects(createExerciseClearService(pool,foreign.id).backup(cleared.clear_id),error('EXERCISE_CLEAR_NOT_FOUND'));
   const base='http://127.0.0.1:'+server.address().port+'/api';const response=await fetch(base+'/exercise-clears/'+cleared.clear_id+'/backup',{headers:{'X-Company-Id':String(company.id)}});assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);const file=await response.json();assert.equal(file.format,'contabilitat-exercise-clear');assert.equal(file.rows.length,rows.length);assert.equal((await fetch(base+'/exercise-clears/'+cleared.clear_id+'/backup',{headers:{'X-Company-Id':String(foreign.id)}})).status,404);
  });
  await t.test('company data, chart of accounts and every other period keep their original values',async()=>{
   for(const table of Object.keys(protectedRows)){let rows;if(table==='companies')[rows]=await pool.execute('SELECT * FROM companies WHERE id IN (?,?) ORDER BY id',[company.id,foreign.id]);else if(table==='journal_entries')[rows]=await pool.execute('SELECT * FROM journal_entries WHERE company_id=? OR (company_id=? AND exercise_id<>?) ORDER BY id',[foreign.id,company.id,year.id]);else if(table==='journal_lines')[rows]=await pool.execute('SELECT l.* FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id WHERE e.company_id=? OR (e.company_id=? AND e.exercise_id<>?) ORDER BY l.id',[foreign.id,company.id,year.id]);else[rows]=await pool.execute('SELECT * FROM '+table+' WHERE company_id IN (?,?) ORDER BY company_id',[company.id,foreign.id]);assert.equal(JSON.stringify(rows),protectedRows[table],table);}
   assert.equal((await service.preview(year.id)).ready,false);await assert.rejects(service.clear(year.id,request(await service.preview(year.id))),error('EXERCISE_CLEAR_EMPTY'));
  });
  await t.test('replaying an old confirmation cannot erase movements added after the clear',async()=>{
   const created=await entry(year.id,'2026-10-01');assert.equal(created.number,1);assert.equal((await service.clear(year.id,clearRequest)).replayed,true);assert.equal(await count('journal_entries'),1);await assert.rejects(service.clear(year.id,{...clearRequest,request_id:randomUUID()}),error('EXERCISE_CLEAR_STALE'));
  });
  await t.test('deleting a payment in this year restores the outstanding amount of a prior-year invoice',async()=>{
   const old=await invoices.create(body(prior.id,'OLD','2025-10-01'));await portfolio.settle(old.receipts[0].id,payment(year.id,'2026-10-10','5.00'));assert.equal((await portfolio.get(old.receipts[0].id)).remaining_amount,'14.76');const before=await accounting.getEntry(old.entry_id);await service.clear(year.id,request(await service.preview(year.id)));assert.deepEqual(await accounting.getEntry(old.entry_id),before);assert.equal((await portfolio.get(old.receipts[0].id)).remaining_amount,'19.76');
   await invoices.void(old.id,{exercise_id:year.id,date:'2026-10-12',reason:'Cancel old invoice',request_id:randomUUID()});const plan=await service.preview(year.id);assert.equal(plan.counts.restored_invoices,1);await service.clear(year.id,request(plan));assert.equal((await invoices.get(old.id)).status,'posted');assert.equal((await portfolio.get(old.receipts[0].id)).remaining_amount,'19.76');
  });
  await t.test('cross-year payment reversals are restored coherently and block deleting the source year first',async()=>{
   const old=(await invoices.list({exercise_id:prior.id}))[0],detail=await invoices.get(old.id),paid=await portfolio.settle(detail.receipts[0].id,payment(prior.id,'2025-10-02','5.00'));await portfolio.reverse(paid.settlement_id,{exercise_id:year.id,date:'2026-10-02',reason:'Cross-year correction',request_id:randomUUID()});
   const blocked=await service.preview(prior.id);assert.ok(blocked.blockers.some(row=>row.code==='external_reversals'));await assert.rejects(service.clear(prior.id,request(blocked)),error('EXERCISE_CLEAR_DEPENDENCIES'));
   const plan=await service.preview(year.id);assert.equal(plan.counts.restored_settlements,1);await service.clear(year.id,request(plan));const receipt=await portfolio.get(detail.receipts[0].id);assert.equal(receipt.remaining_amount,'14.76');assert.equal(receipt.settlements.find(row=>row.id===paid.settlement_id).reversal_entry_id,null);
  });
  await t.test('source invoices with payments in another year are protected until that payment year is cleared',async()=>{
   const old=await invoices.get((await invoices.list({exercise_id:prior.id}))[0].id);await portfolio.settle(old.receipts[0].id,payment(next.id,'2027-01-10','2.00'));const blocked=await service.preview(prior.id);assert.ok(blocked.blockers.some(row=>row.code==='external_payments'&&row.exercise_id===next.id));await assert.rejects(service.clear(prior.id,request(blocked)),error('EXERCISE_CLEAR_DEPENDENCIES'));await service.clear(next.id,request(await service.preview(next.id)));
  });
  await t.test('dependent openings block source clearing; cancelled foreign opening history stays coherent',async()=>{
   const close=await operations.preview(prior.id,'closing');await operations.execute(prior.id,'closing',{request_id:randomUUID(),preview_hash:close.preview_hash});const opening=await operations.preview(year.id,'opening'),opened=await operations.execute(year.id,'opening',{request_id:randomUUID(),preview_hash:opening.preview_hash});
   const blocked=await service.preview(prior.id);assert.ok(blocked.blockers.some(row=>row.code==='dependent_opening'));await assert.rejects(service.clear(prior.id,request(blocked)),error('EXERCISE_CLEAR_DEPENDENCIES'));
   const cancel=await operations.preview(prior.id,'cancel_closing');await operations.execute(prior.id,'cancel_closing',{request_id:randomUUID(),preview_hash:cancel.preview_hash,reason:'Prepare source correction'});const before=await accounting.getEntry(opened.entries[0].id),plan=await service.preview(prior.id);assert.equal(plan.counts.detached_cancellations,1);assert.equal(plan.ready,true);await service.clear(prior.id,request(plan));const after=await accounting.getEntry(opened.entries[0].id);assert.equal(after.status,'cancelled');assert.deepEqual(after.lines,before.lines);assert.equal(after.cancelled_by_operation_id,null);
  });
  await t.test('a cleared period can import the journal PDF again, including original signed and zero entries',async()=>{
   const importer=createJournalImportService(pool,company.id),preview=await importer.preview(journalPdf(company.name),prior.id,'replacement.pdf'),result=await importer.commit(preview.token);assert.equal(result.entries,4);assert.equal((await years.list()).find(row=>row.id===prior.id).status,'closed');assert.equal((await accounting.listEntries({exercise_id:prior.id})).length,4);assert.equal((await years.list()).find(row=>row.id===prior.id).last_clear.exercise_id,prior.id);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});
