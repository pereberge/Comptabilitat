import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createInvoiceService } from '../src/services/invoices.js';
import { createInvoiceDocumentService } from '../src/services/invoice-documents.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';
import { invoicePdf } from '../test-support/invoice-fixture.js';
async function cleanup(pool,ids){for(const companyId of ids){
 for(const table of ['invoice_documents','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
 const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
}}
function failurePool(pool){return {execute:pool.execute.bind(pool),async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('INSERT INTO portfolio_receipts'))throw new Error('Injected invoice document failure');return db.execute(sql,args);},query:db.query.bind(db),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};}
test('MySQL PDF archive, proposal editing, atomic posting and existing journal adoption',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
 try{
  const company=await context.createCompany({name:'Invoice document '+randomUUID(),tax_id:'B12345674',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);
  const foreign=await context.createCompany({name:'Foreign document '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(foreign.id);
  const exercise=(await context.getContext(company.id)).exercises[0],accounting=createAccountingService(pool,company.id),service=createInvoiceDocumentService(pool,company.id),invoices=createInvoiceService(pool,company.id);
  const party=await accounting.createAccount({code:'4100.0001',description:'Electric Supplies SL'}),cost=await accounting.createAccount({code:'6280.0001',description:'Suministro electrico'}),vat=await accounting.createAccount({code:'4720.0021',description:'IVA 21%'});
  const count=async table=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[company.id]))[0][0].n;
  const pdf=invoicePdf(company.name,'SUP-2026-1');let doc,posted;
  await t.test('preview and archive write no journals; retries preserve one original, searchable by amount and supplier',async()=>{
   const preview=await service.preview(pdf,exercise.id,'factura.pdf');assert.equal(preview.proposal.form.party_account_id,party.id);assert.equal(preview.proposal.ready,false);assert.equal(await count('invoice_documents'),0);
   const results=await Promise.all([service.archive({token:preview.token}),service.archive({token:preview.token})]);assert.equal(results[0].id,results[1].id);doc=await service.get(results[0].id);assert.equal(doc.status,'draft');assert.equal(await count('invoice_documents'),1);assert.equal(await count('journal_entries'),0);assert.equal(await count('trade_invoices'),0);assert.equal(await count('portfolio_receipts'),0);
   assert.deepEqual((await service.source(doc.id)).source_pdf,pdf);assert.equal(doc.source_sha256,createHash('sha256').update(pdf).digest('hex'));
   for(const search of ['SUP-2026-1','Electric','19,76','factura.pdf','B11111111'])assert.equal((await service.list({exercise_id:exercise.id,search})).length,1);
   const duplicate=await service.preview(pdf,exercise.id,'otra.pdf');assert.equal(duplicate.existing_document_id,doc.id);assert.equal((await service.archive({token:duplicate.token})).id,doc.id);
  });
  await t.test('company ownership, foreign IDs, discarded previews and confirmation are enforced',async()=>{
   const other=createInvoiceDocumentService(pool,foreign.id);await assert.rejects(other.get(doc.id),error=>error.code==='INVOICE_DOCUMENT_NOT_FOUND');await assert.rejects(other.source(doc.id),error=>error.code==='INVOICE_DOCUMENT_NOT_FOUND');
   await assert.rejects(other.list({exercise_id:exercise.id}),error=>error.code==='EXERCISE_NOT_FOUND');
   const otherExercise=(await context.getContext(foreign.id)).exercises[0];await assert.rejects(other.preview(pdf,otherExercise.id,'wrong.pdf'),error=>error.code==='INVOICE_DOCUMENT_COMPANY_MISMATCH');
   const preview=await service.preview(invoicePdf(company.name,'DISCARD'),exercise.id,'discard.pdf');await assert.rejects(other.archive({token:preview.token}),error=>error.code==='INVOICE_DOCUMENT_PREVIEW_EXPIRED');await service.discard({token:preview.token});await assert.rejects(service.archive({token:preview.token}),error=>error.code==='INVOICE_DOCUMENT_PREVIEW_EXPIRED');
   await assert.rejects(service.post(doc.id,{version:doc.version,action:'create'}),error=>error.code==='INVOICE_DOCUMENT_CONFIRM_REQUIRED');assert.equal(await count('journal_entries'),0);
  });
  await t.test('edits use version checks and posting atomically creates the journal and installment schedule once',async()=>{
   const form={...doc.form,offset_account_id:cost.id,vat_account_id:vat.id,receipts:[{due_date:'2026-10-22',amount:'9.76'},{due_date:'2026-11-22',amount:'10.00'}]};
   await assert.rejects(service.update(doc.id,{version:0,form}),error=>error.code==='INVOICE_DOCUMENT_CHANGED');doc=await service.update(doc.id,{version:doc.version,form});assert.equal(doc.proposal.ready,true);
   const request={version:doc.version,confirm:true,action:'create'};const results=await Promise.all([service.post(doc.id,request),service.post(doc.id,request)]);assert.equal(results[0].id,results[1].id);posted=await invoices.get(results[0].id);
   assert.equal(await count('journal_entries'),1);assert.equal(posted.total_amount,'19.76');assert.equal(posted.receipts.length,2);assert.equal(posted.receipts[0].due_date,'2026-10-22');assert.equal(posted.receipts[0].remaining_amount,'9.76');assert.equal(posted.documents[0].id,doc.id);
   assert.equal((await service.get(doc.id)).status,'posted');await assert.rejects(service.update(doc.id,{version:doc.version,form}),error=>error.code==='INVOICE_DOCUMENT_ALREADY_POSTED');
  });
  let linkedDoc,entry;
  await t.test('an existing matching journal is adopted with receipts and without another journal',async()=>{
   entry=await accounting.createEntry({exercise_id:exercise.id,entry_date:'2026-10-20',description:'S/ FAC. SUP-EXISTING',request_id:randomUUID(),lines:[{account_id:cost.id,description:'Existing expense',debit:'16.33',credit:'0.00'},{account_id:vat.id,description:'IVA',debit:'3.43',credit:'0.00'},{account_id:party.id,description:'Supplier',debit:'0.00',credit:'19.76'}]});
   const preview=await service.preview(invoicePdf(company.name,'SUP-EXISTING'),exercise.id,'existing.pdf');assert.equal(preview.proposal.candidates[0].entry_id,entry.id);assert.equal(preview.proposal.ready,true);
   linkedDoc=await service.get((await service.archive({token:preview.token})).id);const before=await count('journal_entries');
   await assert.rejects(service.post(linkedDoc.id,{version:linkedDoc.version,confirm:true,action:'create'}),error=>error.code==='INVOICE_DOCUMENT_DUPLICATE_CANDIDATE');
   await assert.rejects(service.post(linkedDoc.id,{version:linkedDoc.version,confirm:true,action:'link',entry_id:posted.entry_id}),error=>error.code==='INVOICE_DOCUMENT_DUPLICATE_CANDIDATE');
   const result=await service.post(linkedDoc.id,{version:linkedDoc.version,confirm:true,action:'link',entry_id:entry.id});const linked=await invoices.get(result.id);assert.equal(linked.entry_id,entry.id);assert.equal(linked.receipts.length,1);assert.equal(await count('journal_entries'),before);assert.equal((await service.get(linkedDoc.id)).status,'linked');
   await assert.rejects(invoices.create({...linkedDoc.form,request_id:randomUUID(),reference:'OTHER-REFERENCE'},{existing_entry_id:entry.id}),error=>error.code==='INVOICE_EXISTING_ENTRY_LINKED');
  });
  await t.test('a different PDF of the same invoice attaches to its invoice without duplicating receipts or journals',async()=>{
   const otherPdf=Buffer.concat([pdf,Buffer.from('\n% second scan')]);const preview=await service.preview(otherPdf,exercise.id,'second-scan.pdf');assert.equal(preview.proposal.existing_invoice.id,posted.id);
   const saved=await service.get((await service.archive({token:preview.token})).id),before=[await count('journal_entries'),await count('portfolio_receipts')];
   const result=await service.post(saved.id,{version:saved.version,confirm:true,action:'attach'});assert.equal(result.id,posted.id);assert.deepEqual([await count('journal_entries'),await count('portfolio_receipts')],before);
   assert.equal((await invoices.get(posted.id)).documents.length,2);
  });
  await t.test('receipt insertion failure rolls back the invoice, journal and document status',async()=>{
   // Different value avoids the duplicate journal candidates from the preceding invoices.
   const preview=await service.preview(invoicePdf(company.name,'ROLLBACK'),exercise.id,'rollback.pdf');let saved=await service.get((await service.archive({token:preview.token})).id);
   const form={...saved.form,offset_account_id:cost.id,vat_account_id:vat.id,lines:[{description:'Different service',base:'100.00',tax_rate:'21'}],receipts:[{due_date:'2026-11-01',amount:'121.00'}]};saved=await service.update(saved.id,{version:saved.version,form});
   const before=[await count('journal_entries'),await count('trade_invoices'),await count('portfolio_receipts')];
   await assert.rejects(createInvoiceDocumentService(failurePool(pool),company.id).post(saved.id,{version:saved.version,confirm:true,action:'create'}),/Injected invoice document failure/);
   assert.deepEqual([await count('journal_entries'),await count('trade_invoices'),await count('portfolio_receipts')],before);assert.equal((await service.get(saved.id)).status,'draft');
  });
  await t.test('invoice-linked journals can be edited directly while retaining the original document and invoice',async()=>{
   const original=await accounting.getEntry(posted.entry_id),invoice=await invoices.get(posted.id);
   assert.equal(original.editable,true);assert.equal(Number(original.linked_document),1);
   const changedCost=await accounting.createAccount({code:'6280.0002',description:'Corrected supply account'});
   const payload={exercise_id:exercise.id,revision:original.revision,entry_date:original.entry_date,description:'Corrected invoice posting',lines:original.lines.map(line=>({id:line.id,account_id:line.account_id===cost.id?changedCost.id:line.account_id,description:'Corrected accounting concept',debit:line.debit,credit:line.credit}))};
   const saved=await accounting.updateEntry(original.id,payload);
   assert.equal(saved.number,original.number);assert.equal(saved.description,payload.description);
   assert.equal(saved.lines.find(line=>line.account_id===changedCost.id).debit,'16.33');
   assert.deepEqual(saved.lines.map(line=>line.id),original.lines.map(line=>line.id));
   const listed=await accounting.listEntries({exercise_id:exercise.id,view:'lines',number:String(saved.number)});
   assert.ok(listed.some(line=>line.entry_id===saved.id&&line.account_name==='Corrected supply account'));
   const unchangedInvoice=await invoices.get(posted.id);
   assert.equal(unchangedInvoice.total_amount,invoice.total_amount);assert.equal(unchangedInvoice.entry_id,saved.id);
   assert.equal((await service.get(doc.id)).entry_id,saved.id);assert.deepEqual((await service.source(doc.id)).source_pdf,pdf);
   await assert.rejects(accounting.updateEntry(original.id,{...payload,description:'Stale modification'}),error=>error.code==='ENTRY_CHANGED');
   await assert.rejects(accounting.updateEntry(original.id,{...payload,revision:saved.revision,lines:payload.lines.map((line,index)=>index===0?{...line,credit:'999.00'}:line)}));
   assert.equal((await accounting.getEntry(original.id)).revision,saved.revision);
  });
  await t.test('an edited posting date is persisted and survives reopening with a matching journal',async()=>{
   await accounting.createEntry({exercise_id:exercise.id,entry_date:'2026-10-20',description:'Factura DATE-SAVE',request_id:randomUUID(),lines:[{account_id:cost.id,description:'Supply',debit:'16.33',credit:'0.00'},{account_id:vat.id,description:'VAT',debit:'3.43',credit:'0.00'},{account_id:party.id,description:'Supplier',debit:'0.00',credit:'19.76'}]});
   const preview=await service.preview(invoicePdf(company.name,'DATE-SAVE'),exercise.id,'date-save.pdf');
   assert.equal(preview.proposal.form.posting_date,'2026-10-20');
   let draft=await service.get((await service.archive({token:preview.token})).id);
   const saved=await service.update(draft.id,{version:draft.version,form:{...draft.form,posting_date:'2026-10-15'}});
   assert.equal(saved.form.posting_date,'2026-10-15');
   assert.equal((await service.get(draft.id)).form.posting_date,'2026-10-15');
   const [[stored]]=await pool.execute('SELECT form FROM invoice_documents WHERE company_id=? AND id=?',[company.id,draft.id]);
   assert.equal((typeof stored.form==='string'?JSON.parse(stored.form):stored.form).posting_date,'2026-10-15');
  });
  await t.test('a different invoice reference and date can create a new journal despite equal supplier and amounts',async()=>{
   const preview=await service.preview(invoicePdf(company.name,'NEW-SAME-AMOUNT'),exercise.id,'new-invoice.pdf');
   let draft=await service.get((await service.archive({token:preview.token})).id);
   draft=await service.update(draft.id,{version:draft.version,form:{...draft.form,invoice_date:'2026-10-16',posting_date:'2026-10-16',offset_account_id:cost.id,vat_account_id:vat.id}});
   assert.equal(draft.proposal.candidates.length,0);assert.ok(draft.proposal.similar_entries.length>0);
   const before=await count('journal_entries');
   const result=await service.post(draft.id,{version:draft.version,confirm:true,action:'create'});
   const invoice=await invoices.get(result.id);assert.equal(invoice.reference,'NEW-SAME-AMOUNT');assert.equal(invoice.invoice_date,'2026-10-16');assert.notEqual(invoice.entry_id,posted.entry_id);assert.equal(await count('journal_entries'),before+1);
  });
  await t.test('API serves the exact scoped source, lists documents and rejects foreign retrieval',async()=>{
   server=createApp(context,accounting,companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';
   const source=await fetch(base+'/invoice-documents/'+doc.id+'/source',{headers:{'X-Company-Id':String(company.id)}});assert.equal(source.status,200);assert.match(source.headers.get('content-type'),/application\/pdf/);assert.equal(source.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await source.arrayBuffer()),pdf);
   assert.equal((await fetch(base+'/invoice-documents/'+doc.id+'/source',{headers:{'X-Company-Id':String(foreign.id)}})).status,404);
   assert.equal((await fetch(base+'/invoice-documents?exercise_id='+exercise.id,{headers:{'X-Company-Id':String(company.id)}})).status,200);
   const response=await fetch(base+'/invoice-documents/preview?exercise_id='+exercise.id,{method:'POST',headers:{'X-Company-Id':String(company.id),'Content-Type':'application/pdf','X-File-Name':encodeURIComponent('Factura amb accents.pdf')},body:pdf});assert.equal(response.status,200);const result=await response.json();assert.equal(result.source_name,'Factura amb accents.pdf');await service.discard({token:result.token});
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});
