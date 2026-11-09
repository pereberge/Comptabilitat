import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createPortfolioService} from '../src/services/portfolio.js';
import {readReconciliationMatches} from '../src/services/reconciliation-matches.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {createContextService} from '../src/services/context.js';
const error=code=>cause=>cause.code===code;

test('MySQL invoice date correction from reconciliation keeps the existing entry, receipts and company scope',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),ids=[];let server;
 try{
  const companies=createCompanyService(pool);
  const company=await companies.createCompany({name:'Invoice dates '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);
  const foreign=await companies.createCompany({name:'Foreign dates '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(foreign.id);
  const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);
  const service=createInvoiceService(pool,company.id),accounting=createAccountingService(pool,company.id),portfolio=createPortfolioService(pool,company.id);
  const invoice=await service.create({exercise_id:year.id,direction:'received',reference:'DATES-'+randomUUID(),invoice_date:'2026-11-06',posting_date:'2026-11-06',party:{name:'Date test supplier'},request_id:randomUUID(),payment_method:'transfer',lines:[{description:'Phone',base:'14.00',tax_rate:'0'}],receipts:[{due_date:'2026-11-06',amount:'14.00'}]});
  const bank=await accounting.createAccount({code:'5720.0001',description:'Test bank'});
  // Reproduce the user's prior change to the journal without changing the invoice date.
  await pool.execute('UPDATE journal_entries SET entry_date=? WHERE company_id=? AND id=?',['2026-11-01',company.id,invoice.entry_id]);
  const [linesBefore]=await pool.execute('SELECT * FROM journal_lines WHERE company_id=? AND entry_id=? ORDER BY id',[company.id,invoice.entry_id]);
  const [receiptsBefore]=await pool.execute('SELECT * FROM portfolio_receipts WHERE company_id=? AND invoice_id=? ORDER BY id',[company.id,invoice.id]);
  const movement={id:1,date:'2026-11-02',amount:'-14.00',concept:'Phone'};
  const initial=await readReconciliationMatches(pool,company.id,movement);
  assert.equal(initial.receipts[0].invoice_date,'2026-11-06');assert.equal(initial.receipts[0].posting_date,'2026-11-01');
  const dates=await service.dates(invoice.id);assert.equal(dates.editable,true);assert.equal(dates.entry_date,'2026-11-01');
  await assert.rejects(createInvoiceService(pool,foreign.id).dates(invoice.id),error('INVOICE_NOT_FOUND'));
  const body={revision:dates.revision,invoice_date:'2026-11-01',posting_date:'2026-11-01'};
  await assert.rejects(service.updateDates(invoice.id,{...body,invoice_date:'2026-11-03'}),error('INVALID_INVOICE_DATE'));
  await assert.rejects(service.updateDates(invoice.id,{...body,posting_date:'2027-01-01'}),error('DATE_OUTSIDE_EXERCISE'));
  await assert.rejects(service.updateDates(invoice.id,{...body,revision:'0'.repeat(64)}),error('INVOICE_DATES_CHANGED'));
  server=createApp(createContextService(pool,company.id),{},companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/api/invoices/'+invoice.id+'/dates';
  assert.equal((await fetch(url,{headers:{'X-Company-Id':String(foreign.id)}})).status,404);
  const response=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json','X-Company-Id':String(company.id)},body:JSON.stringify(body)});
  assert.equal(response.status,200);const corrected=await response.json();
  assert.equal(corrected.invoice_date,'2026-11-01');assert.equal(corrected.posting_date,'2026-11-01');assert.equal(corrected.entry_date,'2026-11-01');assert.equal(corrected.entry_id,invoice.entry_id);
  const [linesAfter]=await pool.execute('SELECT * FROM journal_lines WHERE company_id=? AND entry_id=? ORDER BY id',[company.id,invoice.entry_id]);assert.deepEqual(linesAfter,linesBefore);
  const [receiptsAfter]=await pool.execute('SELECT * FROM portfolio_receipts WHERE company_id=? AND invoice_id=? ORDER BY id',[company.id,invoice.id]);assert.deepEqual(receiptsAfter,receiptsBefore);
  await assert.rejects(service.updateDates(invoice.id,body),error('INVOICE_DATES_CHANGED'));
  await assert.rejects(service.updateDates(invoice.id,{revision:corrected.revision,invoice_date:'2026-11-07',posting_date:'2026-11-07'}),error('INVOICE_DATES_RECEIPT_CONFLICT'));
  const matches=await readReconciliationMatches(pool,company.id,movement);assert.ok(matches.receipts[0].invoice_date<=movement.date);
  await portfolio.settle(invoice.receipts[0].id,{request_id:randomUUID(),exercise_id:year.id,payment_date:movement.date,amount:'14.00',bank_account_id:bank.id,payment_method:'transfer'});
  const paidDates=await service.dates(invoice.id);
  await assert.rejects(service.updateDates(invoice.id,{revision:paidDates.revision,invoice_date:'2026-11-03',posting_date:'2026-11-03'}),error('INVOICE_DATES_RECEIPT_CONFLICT'));
  await pool.execute("UPDATE accounting_exercises SET status='closed',is_default=0 WHERE company_id=? AND id=?",[company.id,year.id]);
  const closed=await service.dates(invoice.id);assert.equal(closed.editable,false);
  await assert.rejects(service.updateDates(invoice.id,{...body,revision:closed.revision}),error('EXERCISE_CLOSED'));
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){
   for(const table of ['portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);
   for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});
