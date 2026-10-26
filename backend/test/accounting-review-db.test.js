import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createInvoiceService } from '../src/services/invoices.js';
import { createExerciseService } from '../src/services/exercises.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';

test('MySQL review: real invoices, faults, company/year isolation, consistent read-only data and empty years',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
 try{
  const period={name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'};
  const company=await context.createCompany({name:'Review test '+randomUUID(),tax_id:'B12345674',address:'Address',exercise:period});ids.push(company.id);
  const foreign=await context.createCompany({name:'Foreign review '+randomUUID(),exercise:period});ids.push(foreign.id);
  const year=(await context.getContext(company.id)).exercises[0],foreignYear=(await context.getContext(foreign.id)).exercises[0];
  const empty=await createExerciseService(pool,company.id).create({name:'2027',start_date:'2027-01-01',end_date:'2027-12-31'});
  const accounting=createAccountingService(pool,company.id),bank=await accounting.createAccount({code:'5720.0001',description:'Bank review'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'});
  const posted=await accounting.createEntry({exercise_id:year.id,entry_date:'2026-01-01',description:'Review entry',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'100.00',credit:'0.00'},{account_id:capital.id,description:'Capital',debit:'0.00',credit:'100.00'}]});
  const invoice=await createInvoiceService(pool,company.id).create({exercise_id:year.id,direction:'issued',reference:'F-REVIEW',invoice_date:'2026-01-01',posting_date:'2026-01-02',party:{name:'Customer review'},payment_method:'transfer',request_id:randomUUID(),lines:[{description:'Service',base:'100',tax_rate:'0'}],receipts:[{due_date:'2026-01-10',amount:'100'}]});
  server=createApp(context,{},companyScope(pool,config.companyId)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/accounting/review';
  const request=(exerciseId,companyId=company.id)=>fetch(base+'?exercise_id='+exerciseId,{headers:{'X-Company-Id':String(companyId)}});
  const report=await(await request(year.id)).json();assert.equal(report.read_only,true);assert.equal(report.summary.errors,0);assert.equal(report.summary.posted_entries,2);
  assert.equal(report.findings.find(row=>row.code==='OVERDUE_RECEIPTS').amount,'100.00');
  await pool.execute('UPDATE journal_lines SET credit=? WHERE company_id=? AND entry_id=? AND account_id=?',['99.00',company.id,posted.id,capital.id]);
  await pool.execute('UPDATE portfolio_receipts SET amount=? WHERE company_id=? AND invoice_id=?',['90.00',company.id,invoice.id]);
  async function snapshot(){const result={};for(const table of ['accounts','journal_entries','journal_lines','trade_invoices','portfolio_receipts']){const[rows]=await pool.execute('SELECT * FROM '+table+' WHERE company_id=? ORDER BY id',[company.id]);result[table]=rows;}return result;}
  const before=await snapshot(),responses=await Promise.all([request(year.id),request(foreignYear.id,foreign.id)]);
  const [own,other]=await Promise.all(responses.map(response=>response.json()));
  assert.equal(own.company.id,company.id);assert.equal(own.findings.find(row=>row.code==='ENTRY_UNBALANCED').amount,'1.00');assert.equal(own.findings.find(row=>row.code==='INVOICE_RECEIPT_TOTAL').amount,'10.00');
  assert.equal(other.company.id,foreign.id);assert.equal(other.summary.posted_entries,0);assert.deepEqual(other.findings,[]);
  assert.deepEqual(await snapshot(),before,'review must not correct or otherwise write financial data');
  assert.equal((await request(year.id,foreign.id)).status,404);assert.equal((await request(foreignYear.id)).status,404);assert.equal((await request('0')).status,400);
  const emptyReport=await(await request(empty.id)).json();assert.equal(emptyReport.summary.posted_entries,0);assert.equal(emptyReport.summary.errors,0);assert.equal(emptyReport.exercise.id,empty.id);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){
   for(const table of ['portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
   const[accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }await pool.end();
 }
});
