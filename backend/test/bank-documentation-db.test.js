import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createDocumentationService} from '../src/services/documentation.js';
import {createInvoiceDocumentService} from '../src/services/invoice-documents.js';
import {createBankImportService} from '../src/services/bank-import.js';
import {createBankReconciliationService} from '../src/services/bank-reconciliations.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
const error=code=>cause=>cause.code===code;
test('MySQL bank anchors and invoice inbox: matching, refresh, direct draft transfer, retries and rollback',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],companies=createCompanyService(pool),name='Bank invoices '+randomUUID();
 const create=async companyName=>{const row=await companies.createCompany({name:companyName,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(row.id);const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[row.id]);return {...row,year:year.id};};
 const count=async(table,companyId)=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[companyId]))[0][0].n;
 try{
  const company=await create(name),foreign=await create('Foreign '+name),docs=createDocumentationService(pool,company.id),other=createDocumentationService(pool,foreign.id),accounting=createAccountingService(pool,company.id),bankImport=createBankImportService(pool,company.id),reconciliations=createBankReconciliationService(pool,company.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'Bank'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'});
  const post=(date,amount)=>accounting.createEntry({exercise_id:company.year,entry_date:date,description:'Opening test balance',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank movement',debit:amount,credit:'0.00'},{account_id:capital.id,description:'Capital',debit:'0.00',credit:amount}]});
  await post('2026-10-05','1000.03');await post('2026-10-10','5.00');
  const body={title:'Electricity invoice',description:'Manage later',folder:'pending_invoices',source_name:'invoice.pdf',source_mime:'application/pdf',request_id:randomUUID()},pdf=invoicePdf(name,'BANK-2026-1');
  let document=await docs.upload(pdf,body),reportId;
  await t.test('inbox PDFs retain verified extracted metadata and are related only to forward bank movements',async()=>{
   assert.equal(document.invoice_extraction.total_amount,'19.76');assert.equal(document.invoice_extraction.due_date,'2026-10-22');
   const csv=Buffer.from('Fecha;Concepto;Importe;Saldo\n15/10/2026;Opening transfer;1000,00;1000,00\n22/10/2026;Electric Supplies BANK-2026-1;-19,76;980,24');
   const preview=await bankImport.preview(csv,company.year,'statement.csv','text/csv'),analysis=await bankImport.analyze({token:preview.token,account_id:bank.id});
   assert.equal(analysis.snapshot.scope.last_matching_date,'2026-10-15');assert.equal(analysis.snapshot.scope.last_matching_book_date,'2026-10-05');
   assert.equal(analysis.snapshot.scope.balance_match_difference,'0.03');assert.equal(analysis.snapshot.scope.book_analysis_start_date,'2026-10-06');
   assert.equal(analysis.snapshot.pending_invoice_matches.length,1);assert.equal(analysis.snapshot.pending_invoice_matches[0].candidates[0].documentation_id,document.id);
   assert.equal(analysis.snapshot.proposals.length,0);assert.equal(analysis.snapshot.book_unmatched.length,1);
   reportId=(await bankImport.commit({token:preview.token})).id;await bankImport.discard({token:preview.token});
   assert.equal((await reconciliations.get(reportId)).pending_invoice_matches.length,1);
   await assert.rejects(createBankReconciliationService(pool,foreign.id).reanalyze(reportId),error('RECONCILIATION_NOT_FOUND'));
   await pool.execute("UPDATE bank_reconciliations SET snapshot=JSON_REMOVE(snapshot,'$.bank_rows') WHERE company_id=? AND id=?",[company.id,reportId]);
   await reconciliations.reanalyze(reportId);assert.equal((await reconciliations.get(reportId)).snapshot.scope.balance_match_tolerance,'0.03');
   assert.equal(await count('journal_entries',company.id),2);assert.equal(await count('trade_invoices',company.id),0);
  });
  await t.test('one-click transfer selects the invoice year, preserves original bytes and creates one draft under concurrent retries',async()=>{
   const prior=await createExerciseService(pool,company.id).create({name:'2025',start_date:'2025-01-01',end_date:'2025-12-31'});
   await assert.rejects(other.toInvoices(document.id,{version:document.version,exercise_id:foreign.year}),error('DOCUMENTATION_NOT_FOUND'));
   const [first,second]=await Promise.all([docs.toInvoices(document.id,{version:document.version,exercise_id:prior.id}),docs.toInvoices(document.id,{version:document.version,exercise_id:prior.id})]);
   assert.equal(first.id,second.id);assert.equal(first.exercise_id,company.year);assert.equal(await count('invoice_documents',company.id),1);
   const invoiceDocuments=createInvoiceDocumentService(pool,company.id),draft=await invoiceDocuments.get(first.id);assert.equal(draft.status,'draft');assert.equal(draft.form.reference,'BANK-2026-1');assert.equal(draft.invoice_id,null);
   assert.deepEqual((await invoiceDocuments.source(first.id)).source_pdf,pdf);document=await docs.get(document.id);assert.equal(document.folder,'managed_invoices');
   assert.equal((await docs.toInvoices(document.id,{version:1,exercise_id:company.year})).id,first.id);
   assert.equal((await reconciliations.get(reportId)).pending_invoice_matches.length,0);
   await reconciliations.reanalyze(reportId);assert.equal((await reconciliations.get(reportId)).snapshot.pending_invoice_matches.length,0);
   assert.equal(await count('journal_entries',company.id),2);assert.equal(await count('trade_invoices',company.id),0);
  });
  await t.test('stale metadata, wrong owners and non-PDF files keep the original pending',async()=>{
   const stale=await docs.upload(invoicePdf(name,'STALE'),{...body,request_id:randomUUID()});await docs.update(stale.id,{title:'Changed',description:'',version:stale.version});
   await assert.rejects(docs.toInvoices(stale.id,{version:stale.version,exercise_id:company.year}),error('DOCUMENTATION_CHANGED'));
   const wrong=await other.upload(pdf,{...body,request_id:randomUUID()});await assert.rejects(other.toInvoices(wrong.id,{version:wrong.version,exercise_id:foreign.year}),error('INVOICE_DOCUMENT_COMPANY_MISMATCH'));assert.equal((await other.get(wrong.id)).folder,'pending_invoices');
   const image=await docs.upload(Buffer.from('image original'),{...body,source_name:'image.png',source_mime:'image/png',request_id:randomUUID()});await assert.rejects(docs.toInvoices(image.id,{version:image.version,exercise_id:company.year}),error('DOCUMENTATION_INVOICE_PDF_REQUIRED'));
   assert.equal(await count('invoice_documents',foreign.id),0);
  });
  await t.test('failure when moving the original rolls back the new invoice draft',async()=>{
   const pending=await docs.upload(invoicePdf(name,'ROLLBACK'),{...body,request_id:randomUUID()}),before=await count('invoice_documents',company.id);
   const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith("UPDATE company_documents SET folder='managed_invoices'"))throw new Error('Injected move failure');return db.execute(sql,args);},query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};},execute:(...args)=>pool.execute(...args)};
   await assert.rejects(createDocumentationService(failing,company.id).toInvoices(pending.id,{version:pending.version,exercise_id:company.year}),/Injected move failure/);
   assert.equal(await count('invoice_documents',company.id),before);assert.equal((await docs.get(pending.id)).folder,'pending_invoices');
  });
 }finally{
  for(const companyId of ids){for(const table of ['bank_reconciliations','bank_connections','invoice_documents','company_documents','journal_lines','journal_entries','exercise_operations','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
