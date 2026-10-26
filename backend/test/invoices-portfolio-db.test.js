import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createExerciseService } from '../src/services/exercises.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createInvoiceService } from '../src/services/invoices.js';
import { createPortfolioService } from '../src/services/portfolio.js';
import { createReportService } from '../src/services/reports.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';

async function cleanup(pool,ids){for(const companyId of ids){
 for(const table of ['portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
 const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE id=? AND company_id=?',[row.id,companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
}}
function failurePool(pool,match){return {execute:pool.execute.bind(pool),async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(match(sql,args))throw new Error('Injected trade failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};}

test('MySQL invoices and portfolio: automatic receipts, exact journals, partial settlements, reversals and isolation',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
 const period={name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'};
 try{
  const company=await context.createCompany({name:'Trade test '+randomUUID(),tax_id:'B12345674',address:'Original address',iban:'ES9121000418450200051332',exercise:period});ids.push(company.id);
  const foreign=await context.createCompany({name:'Foreign trade '+randomUUID(),exercise:period});ids.push(foreign.id);
  const empty=await context.createCompany({name:'Atomic trade '+randomUUID(),exercise:period});ids.push(empty.id);
  const exercise=(await context.getContext(company.id)).exercises[0],next=await createExerciseService(pool,company.id).create({name:'2027',start_date:'2027-01-01',end_date:'2027-12-31'});
  const accounting=createAccountingService(pool,company.id),invoices=createInvoiceService(pool,company.id),portfolio=createPortfolioService(pool,company.id),bank=await accounting.createAccount({code:'5720.0001',description:'Test bank'});
  const body={exercise_id:exercise.id,direction:'issued',reference:'F-2026-1',invoice_date:'2026-10-01',posting_date:'2026-10-02',party:{name:'Customer',tax_id:'A11111111',address:'Customer address'},withholding_rate:'10',payment_method:'transfer',request_id:randomUUID(),lines:[{description:'Service A',base:'1000',tax_rate:'21'},{description:'Service B',base:'500',tax_rate:'10'}],receipts:[{due_date:'2026-10-15',amount:'500'},{due_date:'2026-11-15',amount:'500'},{due_date:'2026-12-15',amount:'610'}]};
  const created=await invoices.create(body);
  await t.test('invoice and all installments are created once with their balanced journal',async()=>{
   assert.equal(created.total_amount,'1610.00');assert.equal(created.receipts.length,3);assert.equal(created.lines.length,2);assert.equal(created.issuer_snapshot.tax_id,'B12345674');
   const journal=await accounting.getEntry(created.entry_id);assert.equal(journal.lines.length,4);assert.equal(journal.lines.reduce((sum,row)=>sum+BigInt(row.debit.replace('.','')),0n),176000n);
   const concurrent=await Promise.all([invoices.create(body),invoices.create(body)]);assert.ok(concurrent.every(row=>row.id===created.id&&row.replayed));
   await assert.rejects(invoices.create({...body,reference:'Changed'}),error=>error.code==='REQUEST_CONFLICT');
   await assert.rejects(invoices.create({...body,request_id:randomUUID(),party:{name:'Other customer'}}),error=>error.code==='INVOICE_REFERENCE_EXISTS');
   const list=await invoices.list({exercise_id:exercise.id});assert.equal(list.length,1);assert.equal(list[0].remaining_amount,'1610.00');
   await context.updateCompany(company.id,{name:company.name,address:'New address'});assert.equal((await invoices.get(created.id)).issuer_snapshot.address,'Original address');
   const overdue=await portfolio.list({status:'overdue',as_of:'2026-10-20'});assert.equal(overdue.rows.length,1);assert.equal(overdue.totals.overdue_receivable,'500.00');
  });
  const receipt=created.receipts[0],payment=(amount='150')=>({exercise_id:exercise.id,payment_date:'2026-10-20',amount,bank_account_id:bank.id,payment_method:'transfer',reference:'Bank operation',request_id:randomUUID()});
  let firstPayment,secondPayment;
  await t.test('partial payments, retries and overpayment protection update the remaining amount exactly',async()=>{
   const request=payment(),result=await Promise.all([portfolio.settle(receipt.id,request),portfolio.settle(receipt.id,request)]);assert.equal(result[0].settlement_id,result[1].settlement_id);firstPayment=result[0].settlement_id;
   assert.equal(result[0].remaining_amount,'350.00');assert.equal(result[0].status,'partial');assert.equal(result[0].settlements.length,1);
   await assert.rejects(portfolio.settle(receipt.id,payment('400')),error=>error.code==='SETTLEMENT_EXCEEDS_REMAINING');
   secondPayment=(await portfolio.settle(receipt.id,payment('350'))).settlement_id;assert.equal((await portfolio.get(receipt.id)).status,'settled');
   await assert.rejects(portfolio.update(receipt.id,{due_date:'2026-12-01',payment_method:'transfer'}),error=>error.code==='RECEIPT_NOT_PENDING');
   const competitors=await Promise.allSettled([portfolio.settle(created.receipts[1].id,payment('300')),portfolio.settle(created.receipts[1].id,payment('300'))]);assert.equal(competitors.filter(row=>row.status==='fulfilled').length,1);assert.equal((await portfolio.get(created.receipts[1].id)).remaining_amount,'200.00');
   const totals=await portfolio.list({status:'open'});assert.equal(totals.totals.receivable,'810.00');
  });
  await t.test('reversal retains history, creates the opposite journal and restores pending amounts',async()=>{
   const request={request_id:randomUUID(),exercise_id:exercise.id,date:'2026-10-21',reason:'Wrong bank operation'};
   const reversed=await portfolio.reverse(secondPayment,request);assert.equal(reversed.remaining_amount,'350.00');assert.equal(reversed.status,'partial');
   assert.ok(reversed.settlements.find(row=>row.id===secondPayment).reversal_entry_id);assert.equal((await portfolio.reverse(secondPayment,request)).replayed,true);
   const entry=await accounting.getEntry(reversed.settlements.find(row=>row.id===secondPayment).reversal_entry_id);assert.equal(entry.lines.find(row=>row.account_id===bank.id).credit,'350.00');
   const edited=await portfolio.update(receipt.id,{due_date:'2026-11-01',payment_method:'direct_debit',notes:'Replanned'});assert.equal(edited.original_due_date,'2026-10-15');assert.equal(edited.due_date,'2026-11-01');assert.equal(edited.amount,'500.00');
   await assert.rejects(invoices.void(created.id,{request_id:randomUUID(),exercise_id:exercise.id,date:'2026-10-22',reason:'Cancel'}),error=>error.code==='INVOICE_HAS_SETTLEMENTS');
   await assert.rejects(portfolio.update(receipt.id,{due_date:'2026-09-30',payment_method:'transfer'}),error=>error.code==='INVALID_DUE_DATE');
   assert.ok(firstPayment);
  });
  await t.test('received invoices create payables and bank credits, with supplier-specific references',async()=>{
   const received={exercise_id:exercise.id,direction:'received',reference:'SUP-1',invoice_date:'2026-10-01',party:{name:'Supplier one',tax_id:'B11111111'},request_id:randomUUID(),lines:[{description:'Purchase',base:'200',tax_rate:'21'}],receipts:[{due_date:'2026-11-01',amount:'242'}]};
   const invoice=await invoices.create(received),paid=await portfolio.settle(invoice.receipts[0].id,payment('75'));
   assert.equal(paid.remaining_amount,'167.00');const entry=await accounting.getEntry(paid.settlements[0].entry_id);assert.equal(entry.lines.find(row=>row.account_id===bank.id).credit,'75.00');
   const other=await invoices.create({...received,request_id:randomUUID(),party:{name:'Supplier two',tax_id:'B22222222'}});assert.notEqual(invoice.party_account_id,other.party_account_id);
   await assert.rejects(invoices.create({...received,request_id:randomUUID()}),error=>error.code==='INVOICE_REFERENCE_EXISTS');
   assert.equal((await portfolio.list({direction:'received'})).totals.payable,'409.00');
  });
  await t.test('unpaid invoices can be voided by a journal reversal without reusing their number',async()=>{
   const simple=await invoices.create({...body,reference:'VOID-1',request_id:randomUUID(),withholding_rate:'0',lines:[{description:'Exempt',base:'100',tax_rate:'0'}],receipts:[{due_date:'2026-11-01',amount:'100'}]});
   const request={request_id:randomUUID(),exercise_id:exercise.id,date:'2026-10-21',reason:'Incorrect invoice'},voided=await invoices.void(simple.id,request);
   assert.equal(voided.status,'void');assert.equal(voided.receipts[0].status,'void');assert.equal(voided.receipts[0].remaining_amount,'0.00');assert.ok(voided.void_entry_id);assert.equal((await invoices.void(simple.id,request)).replayed,true);
   await assert.rejects(portfolio.settle(simple.receipts[0].id,payment('1')),error=>error.code==='INVOICE_VOIDED');
   await assert.rejects(invoices.create({...body,reference:'VOID-1',request_id:randomUUID()}),error=>error.code==='INVOICE_REFERENCE_EXISTS');
  });
  await t.test('failed receipt or settlement insertion rolls back every related row and journal',async()=>{
   const emptyExercise=(await context.getContext(empty.id)).exercises[0],failing=createInvoiceService(failurePool(pool,(sql,args)=>sql.startsWith('INSERT INTO portfolio_receipts')&&args[2]===2),empty.id);
   await assert.rejects(failing.create({...body,exercise_id:emptyExercise.id,request_id:randomUUID()}),/Injected trade failure/);
   for(const table of ['accounts','journal_entries','journal_lines','trade_invoices','trade_invoice_lines','portfolio_receipts']){const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM '+table+' WHERE company_id=?',[empty.id]);assert.equal(count.total,0,table);}
   const before=(await accounting.listEntries({exercise_id:exercise.id})).length,remaining=(await portfolio.get(created.receipts[2].id)).remaining_amount;
   const failingPayment=createPortfolioService(failurePool(pool,sql=>sql.startsWith('INSERT INTO portfolio_settlements')),company.id);
   await assert.rejects(failingPayment.settle(created.receipts[2].id,payment('100')),/Injected trade failure/);assert.equal((await accounting.listEntries({exercise_id:exercise.id})).length,before);assert.equal((await portfolio.get(created.receipts[2].id)).remaining_amount,remaining);
  });
  await t.test('company scope protects invoices, receipts and account selections through the API',async()=>{
   await assert.rejects(createInvoiceService(pool,foreign.id).get(created.id),error=>error.code==='INVOICE_NOT_FOUND');
   await assert.rejects(createPortfolioService(pool,foreign.id).get(receipt.id),error=>error.code==='RECEIPT_NOT_FOUND');
   await assert.rejects(createPortfolioService(pool,foreign.id).settle(receipt.id,payment('1')),error=>error.code==='RECEIPT_NOT_FOUND');
   server=createApp(context,accounting,companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port+'/api';
   const get=(path,companyId=company.id)=>fetch(base+path,{headers:{'X-Company-Id':String(companyId)}});
   assert.equal((await get('/invoices/'+created.id,foreign.id)).status,404);assert.equal((await get('/portfolio/receipts/'+receipt.id,foreign.id)).status,404);
   assert.equal((await get('/invoices?exercise_id='+exercise.id)).status,200);assert.equal((await get('/portfolio?status=open')).status,200);assert.equal((await get('/portfolio?status=bad')).status,400);
   const parties=await(await get('/invoices/parties')).json();assert.ok(parties.some(row=>row.tax_id==='A11111111'));
   const response=await fetch(base+'/invoices',{method:'POST',headers:{'Content-Type':'application/json','X-Company-Id':String(company.id)},body:JSON.stringify({...body,reference:'HTTP-1',request_id:randomUUID()})});assert.equal(response.status,201);assert.equal((await response.json()).receipts.length,3);
  });
  await t.test('a receipt from a closed invoice year can be collected in the next open exercise',async()=>{
   await pool.execute("UPDATE accounting_exercises SET is_default=0,status='closed' WHERE company_id=? AND id=?",[company.id,exercise.id]);
   await assert.rejects(invoices.create({...body,reference:'CLOSED',request_id:randomUUID()}),error=>error.code==='EXERCISE_CLOSED');
   const collected=await portfolio.settle(created.receipts[2].id,{...payment('610'),exercise_id:next.id,payment_date:'2027-01-10'});assert.equal(collected.status,'settled');assert.equal(collected.settlements.at(-1).exercise_id,next.id);
   const report=await createReportService(pool,company.id).trialBalance({exercise_id:next.id});assert.equal(report.checks.balanced,true);assert.equal(report.totals.debit,'610.00');
   const all=await portfolio.list({status:'open'});assert.ok(all.rows.some(row=>row.exercise_id===exercise.id));
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});
