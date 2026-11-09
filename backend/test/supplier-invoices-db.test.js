import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createSupplierInvoiceService,readSupplierPdf} from '../src/services/supplier-invoices/service.js';
import {createSupplierGmailService} from '../src/services/supplier-invoices/gmail.js';
import {createImportedInvoiceService} from '../src/integrations/received-invoices.js';
import {createInvoiceDocumentService} from '../src/services/invoice-documents.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup} from '../src/services/backup-format.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
const text=`FACTURA
Número de factura: F-2026/001
Fecha factura: 06/11/2026
Vencimiento: 06/12/2026
Proveedor: Example SL
NIF proveedor: B12345678
Base imponible: 100,00 EUR
IVA 21% 21,00 EUR
TOTAL FACTURA: 121,00 EUR`;
test('supplier inbox: drafts, classification, scoped originals, transactional reception, accounting and backups',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);
 try{
  const company=await context.createCompany({name:'Supplier inbox test '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);
  const other=await context.createCompany({name:'Supplier inbox other '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(other.id);
  const exercise=(await context.getContext(company.id)).exercises[0],actor='test-validator',service=createSupplierInvoiceService(pool,company.id,{actor,reader:async()=>({text,pages:1})}),foreign=createSupplierInvoiceService(pool,other.id),imported=createImportedInvoiceService(pool,company.id),accounting=createAccountingService(pool,company.id);
  const party=await accounting.createAccount({code:'4000.0001',description:'Example SL'}),expense=await accounting.createAccount({code:'6000.0001',description:'Materials'}),vat=await accounting.createAccount({code:'4720.0021',description:'IVA 21%'});
  const bytes=Buffer.from('%PDF-1.4\nsynthetic test document'),saved=await service.import(bytes,exercise.id,'test.pdf');let doc=await service.get(saved.id);
  const count=async table=>Number((await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[company.id]))[0][0].n);
  await t.test('real PDF reader extracts text locally; exact original and hash replay are preserved',async()=>{
   const fixture=await invoicePdf('generic');const reading=await readSupplierPdf(fixture);assert.ok(reading.pages>0);assert.ok(reading.text.length>0);
   assert.equal((await service.import(bytes,exercise.id,'renamed.pdf')).id,doc.id);assert.deepEqual((await service.source(doc.id)).source_pdf,bytes);assert.equal(doc.review_kind,'invoice');assert.equal(doc.supplier_draft.invoiceNumber,'F-2026/001');
   await assert.rejects(foreign.get(doc.id),{code:'INVOICE_DOCUMENT_NOT_FOUND'});await assert.rejects(foreign.source(doc.id),{code:'INVOICE_DOCUMENT_NOT_FOUND'});
  });
  await t.test('classification requires no fiscal fields; incomplete save does not validate or post',async()=>{
   doc=await service.classify(doc.id,{version:doc.version,kind:'not_invoice'});assert.equal((await service.list({kind:'not_invoice'})).length,1);await assert.rejects(service.validate(doc.id,{version:doc.version}),{code:'SUPPLIER_NOT_INVOICE'});
   doc=await service.classify(doc.id,{version:doc.version,kind:'invoice'});const old=doc.version;
   doc=await service.save(doc.id,{version:doc.version,draft:{supplier:{},invoiceNumber:'ABC-1/2',total:'',taxBreakdown:[]},rememberSupplier:true});assert.ok(doc.templateWarning);assert.equal(doc.supplier_draft.invoiceNumber,'ABC-1/2');assert.equal(doc.validated_at,null);assert.equal(await count('integration_received_invoices'),0);assert.equal(await count('journal_entries'),0);
   await assert.rejects(service.save(doc.id,{version:old,draft:{}}),{code:'INVOICE_DOCUMENT_CHANGED'});await assert.rejects(service.validate(doc.id,{version:doc.version}));
   await assert.rejects(createInvoiceDocumentService(pool,company.id).post(doc.id,{version:doc.version,confirm:true,action:'create'}),{code:'SUPPLIER_DOCUMENT_LOCKED'});
  });
  await t.test('validation atomically receives once, records actor, and leaves accounting untouched',async()=>{
   const d={supplier:{name:'Example SL',taxId:'B12345678'},invoiceNumber:'F-2026/001',invoiceDate:'2026-11-06',dueDate:'2026-12-06',currency:'EUR',description:'',invoiceType:'standard',taxBreakdown:[{taxType:'vat',taxableBase:'100.00',taxRate:'21',taxAmount:'21.00'}],withholdings:[],lines:[],total:'121.00'};
   doc=await service.save(doc.id,{version:doc.version,draft:d,rememberSupplier:true});assert.equal(doc.templateWarning,null);assert.equal(await count('supplier_invoice_templates'),1);
   const results=await Promise.all([service.validate(doc.id,{version:doc.version}),service.validate(doc.id,{version:doc.version})]);assert.equal(results[0].id,results[1].id);assert.equal(await count('integration_received_invoices'),1);assert.equal(await count('journal_entries'),0);
   doc=await service.get(doc.id);assert.equal(doc.validated_by,actor);assert.ok(doc.validated_at);assert.equal((await imported.get(doc.reception_id)).payload.description,d.invoiceNumber);await assert.rejects(service.classify(doc.id,{version:doc.version,kind:'not_invoice'}),{code:'SUPPLIER_DOCUMENT_LOCKED'});
  });
  await t.test('internal posting adopts an existing matching journal and attaches its original PDF',async()=>{
   const entry=await accounting.createEntry({exercise_id:exercise.id,entry_date:'2026-11-06',description:'Factura F-2026/001',request_id:randomUUID(),lines:[{account_id:expense.id,description:'Material',debit:'100.00',credit:'0.00'},{account_id:vat.id,description:'IVA',debit:'21.00',credit:'0.00'},{account_id:party.id,description:'Proveïdor',debit:'0.00',credit:'121.00'}]});
   // Match the pre-existing party through its fiscal profile as the normal invoice service does.
   await pool.execute('UPDATE accounts SET party_profile=? WHERE company_id=? AND id=?',[JSON.stringify({name:'Example SL',tax_id:'B12345678'}),company.id,party.id]);
   let row=await imported.get(doc.reception_id);assert.equal(row.entry_candidates.length,1);assert.equal(row.entry_candidates[0].entry_id,entry.id);
   const form={...row.form,party_account_id:party.id,offset_account_id:expense.id,vat_account_id:vat.id};
   await assert.rejects(imported.post(row.id,{version:row.version,form},actor),{code:'INVOICE_DOCUMENT_DUPLICATE_CANDIDATE'});
   const posted=await imported.post(row.id,{version:row.version,form,entry_id:entry.id},actor);assert.equal(await count('journal_entries'),1);assert.equal(await count('trade_invoices'),1);assert.equal(await count('portfolio_receipts'),1);assert.equal((await service.get(doc.id)).invoice_id,posted.id);
   assert.equal((await imported.post(row.id,{version:row.version,form,entry_id:entry.id},actor)).id,posted.id);
  });
  await t.test('fiscal duplicates are received for review and cannot create another journal',async()=>{
   const second=await service.import(Buffer.from('%PDF-1.4\nsecond copy'),exercise.id,'second.pdf');let copy=await service.get(second.id);copy=await service.save(copy.id,{version:copy.version,draft:doc.supplier_draft});const receipt=await service.validate(copy.id,{version:copy.version});assert.equal(receipt.possibleDuplicate,true);const received=await imported.get(receipt.id);assert.equal(received.can_post,false);await imported.cancel(receipt.id,{version:received.version},actor);assert.equal((await service.get(second.id)).reception_status,'cancelled');
  });
  await t.test('mailbox settings are scoped and originals, revisions and templates survive backup restore',async()=>{
   const gmail=createSupplierGmailService(pool,company.id);await gmail.save({email:'test@example.invalid',startDate:'2026-11-01'});assert.equal((await gmail.list()).length,1);assert.equal((await createSupplierGmailService(pool,other.id).list()).length,0);
   const backup=await createDataBackupService(pool,company.id).export('all'),data=readBackup(backup.file);assert.ok(data.tables.supplier_invoice_revisions.length);assert.equal(data.tables.supplier_invoice_templates.length,1);
   await pool.execute('UPDATE companies SET name=? WHERE id=?',[company.name,other.id]);
   const restore=createDataBackupService(pool,other.id),preview=await restore.preview(backup.file,'all');assert.equal(preview.ready,true,JSON.stringify(preview.blockers));await restore.restore({confirm:true,token:preview.token,request_id:randomUUID()});const [restored]=await foreign.list();assert.ok(restored.reception_id);assert.ok((await foreign.get(restored.id)).history.length);
  });
 }finally{
  for(const companyId of ids){for(const table of ['supplier_invoice_revisions','supplier_invoice_templates','supplier_invoice_import_errors','supplier_gmail_mailboxes','invoice_documents','integration_events','integration_received_invoices','supplier_expense_preferences','data_restores','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}await pool.end();
 }
});
