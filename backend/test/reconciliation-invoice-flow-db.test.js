import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createDocumentationService} from '../src/services/documentation.js';
import {createInvoiceDocumentService} from '../src/services/invoice-documents.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createPortfolioService} from '../src/services/portfolio.js';
import {createBankImportService} from '../src/services/bank-import.js';
import {createBankReconciliationService} from '../src/services/bank-reconciliations.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup} from '../src/services/backup-format.js';
import {reconciliationPostingState} from '../../shared/reconciliation-postings.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
const error=code=>cause=>cause.code===code;

test('MySQL invoice from reconciliation: resume drafts, post once, settle installments together and restore the links',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],companies=createCompanyService(pool),name='Invoice reconciliation '+randomUUID();
 const create=async(companyName=name)=>{const company=await companies.createCompany({name:companyName,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);return {...company,year:year.id};};
 const count=async(table,companyId)=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[companyId]))[0][0].n;
 try{
  const company=await create(),target=await create(),foreign=await create('Foreign '+name),year=await createExerciseService(pool,company.id).create({name:'2027',start_date:'2027-01-01',end_date:'2027-12-31'});
  const accounting=createAccountingService(pool,company.id),docs=createDocumentationService(pool,company.id),documents=createInvoiceDocumentService(pool,company.id),invoices=createInvoiceService(pool,company.id),portfolio=createPortfolioService(pool,company.id),service=createBankReconciliationService(pool,company.id),imports=createBankImportService(pool,company.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'Bank'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'}),expense=await accounting.createAccount({code:'6290.0001',description:'Expenses'}),vat=await accounting.createAccount({code:'4720.0021',description:'IVA 21%'});
  await accounting.createEntry({exercise_id:year.id,entry_date:'2027-01-01',description:'Opening',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'1000.00',credit:'0.00'},{account_id:capital.id,description:'Capital',debit:'0.00',credit:'1000.00'}]});
  const pdf=invoicePdf(company.name,'FLOW-2026'),source=await docs.upload(pdf,{title:'Pending invoice',description:'',folder:'pending_invoices',source_name:'invoice.pdf',source_mime:'application/pdf',request_id:randomUUID()});
  const csv=Buffer.from('Fecha;Concepto;Importe;Saldo\n10/01/2027;Opening;1000,00;1000,00\n12/01/2027;Payment A;-19,76;980,24\n12/01/2027;Payment B;-19,76;960,48');
  const preview=await imports.preview(csv,year.id,'invoice-flow.csv','text/csv');await imports.analyze({token:preview.token,account_id:bank.id,replace_current:true});const saved=await imports.commit({token:preview.token});await imports.discard({token:preview.token});let report=await service.get(saved.id),draft,invoice,request;
  await t.test('a transferred invoice remains searchable as its existing proposal in its own fiscal year',async()=>{
   assert.equal((await service.matches(report.id,3)).invoices[0].documentation_id,source.id);
   const moved=await docs.toInvoices(source.id,{version:source.version,exercise_id:year.id});draft=await documents.get(moved.id);
   assert.equal(draft.exercise.id,company.year);assert.notEqual(draft.exercise.id,year.id);assert.deepEqual((await documents.source(draft.id)).source_pdf,pdf);
   const matches=(await service.matches(report.id,3)).invoices;assert.equal(matches.length,1);assert.equal(matches[0].invoice_document_id,draft.id);
   assert.equal(await count('trade_invoices',company.id),0);assert.equal(await count('journal_entries',company.id),1);
   await assert.rejects(createInvoiceDocumentService(pool,foreign.id).get(draft.id),error('INVOICE_DOCUMENT_NOT_FOUND'));
  });
  await t.test('reviewed invoice posting creates its journal and both pending receipts once',async()=>{
   draft=await documents.update(draft.id,{version:draft.version,form:{...draft.form,offset_account_id:expense.id,vat_account_id:vat.id,automatic_receipts:false,receipts:[{due_date:'2026-10-22',amount:'9.88'},{due_date:'2026-11-22',amount:'9.88'}]}});
   assert.equal(draft.proposal.ready,true);
   const body={version:draft.version,confirm:true,action:'create'},posted=await documents.post(draft.id,body);assert.equal((await documents.post(draft.id,body)).id,posted.id);invoice=await invoices.get(posted.id);
   assert.equal(invoice.exercise_id,company.year);assert.equal(invoice.receipts.length,2);assert.equal(await count('journal_entries',company.id),2);
   const matches=await service.matches(report.id,3);assert.equal(matches.receipts.length,0);assert.equal(matches.invoices.length,1);assert.equal(matches.invoices[0].invoice_id,invoice.id);assert.equal(matches.invoices[0].receipt_count,2);
   request={version:report.version,movement_id:3,receipt_ids:invoice.receipts.map(row=>row.id).reverse(),request_id:randomUUID(),payment_method:'transfer',reference:'Bank payment',notes:''};
  });
  await t.test('invalid selections and wrong companies cannot settle the invoice',async()=>{
   await assert.rejects(service.settleMovement(report.id,{...request,receipt_ids:[request.receipt_ids[0],request.receipt_ids[0]]}),error('INVALID_REQUEST'));
   await assert.rejects(service.settleMovement(report.id,{...request,receipt_ids:[request.receipt_ids[0]]}),error('RECONCILIATION_RECEIPT_CHANGED'));
   await assert.rejects(createBankReconciliationService(pool,foreign.id).settleMovement(report.id,request),error('RECONCILIATION_NOT_FOUND'));
   assert.equal(await count('portfolio_settlements',company.id),0);
  });
  await t.test('failure on the second receipt rolls back every payment journal and leaves the posted invoice pending',async()=>{
   let inserted=0;const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('INSERT INTO portfolio_settlements')&&++inserted===2)throw new Error('Injected second receipt failure');return db.execute(sql,args);},query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   await assert.rejects(createBankReconciliationService(failing,company.id).settleMovement(report.id,request),/Injected second receipt failure/);
   assert.equal(await count('journal_entries',company.id),2);assert.equal(await count('portfolio_settlements',company.id),0);assert.equal((await service.get(report.id)).snapshot.posted_movements.length,0);
   for(const receipt of invoice.receipts)assert.equal((await portfolio.get(receipt.id)).remaining_amount,'9.88');
  });
  await t.test('one confirmation settles both receipts, preserves both years and reconciles only the chosen row under retries',async()=>{
   const [first,second]=await Promise.all([service.settleMovement(report.id,request),service.settleMovement(report.id,request)]);assert.deepEqual(first.entry_ids,second.entry_ids);assert.equal(second.replayed,true);assert.equal(first.entry_ids.length,2);
   assert.equal(await count('journal_entries',company.id),4);assert.equal(await count('trade_invoices',company.id),1);assert.equal(await count('portfolio_settlements',company.id),2);
   for(const receipt of invoice.receipts){const current=await portfolio.get(receipt.id);assert.equal(current.status,'settled');assert.equal(current.settlements[0].exercise_id,year.id);assert.equal(current.settlements[0].payment_date,'2027-01-12');assert.equal(current.settlements[0].bank_account_id,bank.id);}
   report=await service.get(report.id);assert.equal(report.snapshot.posted_movements.length,2);assert.deepEqual(report.snapshot.scope.matched_movements.map(row=>row.id),[3]);assert.ok(report.snapshot.scope.bank_pending.some(row=>row.id===2));
   assert.equal(reconciliationPostingState(report.snapshot.posted_movements,report.posted_entries,'-19.76').done,true);
   await assert.rejects(service.settleMovement(report.id,{...request,request_id:randomUUID(),version:report.version}),error('RECONCILIATION_MOVEMENT_MATCHED'));
   await assert.rejects(service.postMovement(report.id,{version:report.version,movement_id:3,date:'2027-01-12',concept:'Duplicate',remember:false,rule_concept:'',counter_lines:[{account_id:expense.id,debit:'19.76',credit:'0.00'}],request_id:randomUUID()}),error('RECONCILIATION_MOVEMENT_MATCHED'));
  });
  await t.test('changed payment amounts remain marked for review instead of allowing a duplicate journal',async()=>{
   const entryId=report.posted_entries[0].id;
   await pool.execute('UPDATE journal_lines SET credit=credit+0.01 WHERE company_id=? AND entry_id=? AND account_id=?',[company.id,entryId,bank.id]);
   try{const current=await service.get(report.id);assert.equal(reconciliationPostingState(current.snapshot.posted_movements,current.posted_entries,'-19.76').modified,true);await assert.rejects(service.settleMovement(report.id,{...request,request_id:randomUUID(),version:current.version}),error('RECONCILIATION_ENTRY_CHANGED'));}
   finally{await pool.execute('UPDATE journal_lines SET credit=credit-0.01 WHERE company_id=? AND entry_id=? AND account_id=?',[company.id,entryId,bank.id]);}
  });
  await t.test('backup restores every payment link and reanalysis preserves the combined bank amount',async()=>{
   const archive=await createDataBackupService(pool,company.id).export();assert.equal(readBackup(archive.file).tables.bank_reconciliations[0].snapshot.posted_movements.length,2);
   const backup=createDataBackupService(pool,target.id),ready=await backup.preview(archive.file);assert.equal(ready.ready,true);await backup.restore({token:ready.token,confirm:true,request_id:randomUUID()});
   const [[record]]=await pool.execute('SELECT id FROM bank_reconciliations WHERE company_id=?',[target.id]),restored=createBankReconciliationService(pool,target.id);let current=await restored.get(record.id);
   assert.equal(current.posted_entries.length,2);assert.ok(current.posted_entries.every(row=>!report.posted_entries.some(original=>original.id===row.id)));assert.equal(reconciliationPostingState(current.snapshot.posted_movements,current.posted_entries,'-19.76').done,true);
   await restored.reanalyze(current.id);current=await restored.get(current.id);assert.deepEqual(current.snapshot.scope.matched_movements.map(row=>row.id),[3]);assert.ok(current.snapshot.scope.bank_pending.some(row=>row.id===2));
  });
 }finally{
  for(const companyId of ids){for(const table of ['data_restores','bank_reconciliations','bank_reconciliation_rules','bank_connections','invoice_documents','company_documents','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','exercise_operations','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
