import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createReportService} from '../src/services/reports.js';

test('MySQL manual negative amounts persist, replay, edit and appear in the ledger with the original sign',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database);let company;
 try{
  company=await createCompanyService(pool).createCompany({name:'Signed journal '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});
  const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);
  const service=createAccountingService(pool,company.id),reports=createReportService(pool,company.id);
  const expense=await service.createAccount({code:'6220.0001',description:'Expense'}),vat=await service.createAccount({code:'4720.0001',description:'VAT'}),party=await service.createAccount({code:'4100.0001',description:'Supplier'});
  const body={exercise_id:year.id,entry_date:'2026-10-22',description:'Signed credit note',request_id:randomUUID(),lines:[
   {account_id:expense.id,description:'Expense reversal',debit:'-27,79',credit:'0'},
   {account_id:vat.id,description:'VAT reversal',debit:'-5.84',credit:'0'},
   {account_id:party.id,description:'Credit note',debit:'0',credit:'-33.63'},
  ]};
  const created=await service.createEntry(body),entry=await service.getEntry(created.id);
  assert.equal(entry.lines[0].debit,'-27.79');assert.equal(entry.lines[2].credit,'-33.63');assert.equal(entry.lines[0].source_page,null);
  assert.equal((await service.createEntry(body)).id,created.id);
  const ledger=await reports.ledger({exercise_id:year.id,account_id:expense.id});assert.equal(ledger.totals.closing,'-27.79');
  const patch={exercise_id:year.id,revision:entry.revision,entry_date:entry.entry_date,description:'Edited credit note',lines:entry.lines.map(({id,account_id,description,debit,credit})=>({id,account_id,description,debit,credit}))};
  patch.lines[0].debit='-28.00';patch.lines[2].credit='-33.84';
  const edited=await service.updateEntry(created.id,patch);assert.equal(edited.lines[0].debit,'-28.00');assert.equal(edited.lines[2].credit,'-33.84');
  const bad={...body,request_id:randomUUID(),lines:body.lines.map(line=>({...line}))};bad.lines[2].debit='-33.63';
  await assert.rejects(service.createEntry(bad),cause=>cause.code==='INVALID_LINE_AMOUNTS');
 }finally{
  if(company){
   for(const table of ['journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[company.id]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[company.id]);
   for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[company.id,account.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[company.id]);
  }
  await pool.end();
 }
});
