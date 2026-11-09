import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createDocumentationService} from '../src/services/documentation.js';
import {createInvoiceDocumentService} from '../src/services/invoice-documents.js';
import {recognizeInvoiceFormat} from '../src/services/invoice-recognition.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
test('MySQL document detection, review drafts and remembered formats preserve originals and company isolation',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[];
 try{
  const company=await context.createCompany({name:'Recognition '+randomUUID(),tax_id:'B12345674',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);
  const foreign=await context.createCompany({name:'Other recognition '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(foreign.id);
  const docs=createDocumentationService(pool,company.id),service=createInvoiceDocumentService(pool,company.id),exercise=(await context.getContext(company.id)).exercises[0];
  const buffer=invoicePdf(company.name,'RECOGNITION-1'),body={title:'Documento nuevo',description:'',source_name:'documento.pdf',source_mime:'application/pdf',request_id:randomUUID()};
  const preview=await docs.previewEncoded({content_base64:buffer.toString('base64')});assert.equal(preview.recognition.kind,'invoice');assert.equal(preview.extraction.reference,'RECOGNITION-1');
  const detected=await docs.upload(buffer,body);assert.equal(detected.folder,'pending_invoices');assert.equal(detected.recognition.status,'pending_review');assert.deepEqual((await docs.source(detected.id)).content,buffer);
  assert.equal((await docs.upload(buffer,body)).id,detected.id);
  const general=await docs.upload(buffer,{...body,auto_detect:false,request_id:randomUUID()});assert.equal(general.folder,'general');
  await assert.rejects(createDocumentationService(pool,foreign.id).analyze(general.id,{version:general.version}),cause=>cause.code==='DOCUMENTATION_NOT_FOUND');
  const analyzed=await docs.analyze(general.id,{version:general.version});assert.equal(analyzed.folder,'pending_invoices');
  await assert.rejects(docs.analyze(general.id,{version:general.version}),cause=>cause.code==='DOCUMENTATION_CHANGED');
  const draft=await docs.toInvoices(detected.id,{version:detected.version,exercise_id:exercise.id});let document=await service.get(draft.id);assert.equal(document.status,'draft');
  assert.equal((await pool.execute('SELECT COUNT(*) AS n FROM journal_entries WHERE company_id=?',[company.id]))[0][0].n,0);
  const accounting=createAccountingService(pool,company.id),party=await accounting.createAccount({code:'4100.0001',description:'Electric Supplies SL'}),expense=await accounting.createAccount({code:'6280.0001',description:'Suministros'}),vat=await accounting.createAccount({code:'4720.0021',description:'IVA 21%'});
  document=await service.update(draft.id,{version:document.version,form:{...document.form,party_account_id:party.id,offset_account_id:expense.id,vat_account_id:vat.id}});
  await service.post(document.id,{version:document.version,confirm:true,action:'create'});
  const posted=await service.get(document.id);assert.ok(posted.extraction.learned_template);
  const next=await service.preview(invoicePdf(company.name,'RECOGNITION-2'),exercise.id,'next.pdf');assert.equal(next.extraction.recognized_format,'Electric Supplies SL');assert.equal(next.extraction.reference,'RECOGNITION-2');
  const unrelated=await recognizeInvoiceFormat(pool,foreign.id,{...next.extraction,recognized_format:undefined});assert.equal(unrelated.recognized_format,undefined);
  assert.deepEqual((await docs.source(detected.id)).content,buffer);
 }finally{
  for(const companyId of ids){for(const table of ['company_documents','invoice_documents','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
