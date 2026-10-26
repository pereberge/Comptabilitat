import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createExerciseService } from '../src/services/exercises.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createInvoiceService } from '../src/services/invoices.js';
import { createInvoiceDocumentService } from '../src/services/invoice-documents.js';
import { createInvoiceDeletionService } from '../src/services/invoice-deletion.js';
import { createDocumentationService } from '../src/services/documentation.js';
import { createPortfolioService } from '../src/services/portfolio.js';
import { createExerciseClearService } from '../src/services/exercise-clear.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';
import { invoicePdf } from '../test-support/invoice-fixture.js';

const error=code=>cause=>cause.code===code;
const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
async function cleanup(pool,ids){for(const companyId of ids){
 for(const table of ['invoice_deletion_rows','invoice_deletions','company_documents','exercise_clear_rows','exercise_clears','invoice_documents','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','exercise_operations','journal_imports','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
 const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
}}
function failingPool(pool,match){return {async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(match(sql,args))throw new Error('Injected invoice deletion failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};}

test('MySQL invoice deletion: no new backups, atomic removal, code 96 and company scope',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
 try{
  const company=await context.createCompany({name:'Invoice deletion '+randomUUID(),exercise:period(2026)});ids.push(company.id);
  const foreign=await context.createCompany({name:'Foreign deletion '+randomUUID(),exercise:period(2026)});ids.push(foreign.id);
  const year=(await context.getContext(company.id)).exercises[0],next=await createExerciseService(pool,company.id).create(period(2027));
  const invoices=createInvoiceService(pool,company.id),portfolio=createPortfolioService(pool,company.id),service=createInvoiceDeletionService(pool,company.id),documents=createInvoiceDocumentService(pool,company.id),accounting=createAccountingService(pool,company.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'Bank'}),cost=await accounting.createAccount({code:'6280.0001',description:'Electricidad'}),vat=await accounting.createAccount({code:'4720.0021',description:'IVA 21%'});
  const create=(reference,extra={})=>invoices.create({exercise_id:year.id,direction:'received',reference,invoice_date:'2026-10-15',posting_date:'2026-10-15',party:{name:'Electric Supplies SL',tax_id:'B11111111'},party_parent:'4100',offset_account_id:cost.id,vat_account_id:vat.id,request_id:randomUUID(),lines:[{description:'Electricity',base:'16.33',tax_rate:'21'}],receipts:[{due_date:'2026-10-22',amount:'19.76'}],...extra});
  const payment=(exercise_id=year.id,payment_date='2026-10-22',amount='5.00')=>({exercise_id,payment_date,amount,bank_account_id:bank.id,payment_method:'transfer',request_id:randomUUID()});
  const request=preview=>({confirmation:'96',preview_hash:preview.preview_hash,request_id:randomUUID()});
  const count=async table=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[company.id]))[0][0].n;
  const preserved=await create('PRESERVED');
  let draft,attached,invoice;
  await t.test('unposted drafts can be deleted without 96, with version and company checks',async()=>{
   const preview=await documents.preview(invoicePdf(company.name,'DRAFT-DELETE'),year.id,'draft.pdf');draft=await documents.get((await documents.archive({token:preview.token})).id);
   const before=await count('journal_entries');
   await assert.rejects(createInvoiceDocumentService(pool,foreign.id).remove(draft.id,{version:draft.version}),error('INVOICE_DOCUMENT_NOT_FOUND'));
   await assert.rejects(documents.remove(draft.id,{version:0}),error('INVOICE_DOCUMENT_CHANGED'));
   assert.equal((await documents.remove(draft.id,{version:draft.version})).deleted,true);
   await assert.rejects(documents.source(draft.id),error('INVOICE_DOCUMENT_NOT_FOUND'));assert.equal(await count('journal_entries'),before);
  });
  await t.test('posted or linked PDFs reject the easy-delete path',async()=>{
   invoice=await create('ATTACHED');
   const preview=await documents.preview(invoicePdf(company.name,'ATTACHED'),year.id,'original.pdf');
   attached=await documents.get((await documents.archive({token:preview.token})).id);
   await documents.post(attached.id,{version:attached.version,confirm:true,action:'attach'});
   attached=await documents.get(attached.id);
   await assert.rejects(documents.remove(attached.id,{version:attached.version}),error('INVOICE_DOCUMENT_ALREADY_POSTED'));
  });
  await t.test('security code is exact and preview is required; changes invalidate consent',async()=>{
   const preview=await service.preview(invoice.id);
   for(const confirmation of [undefined,'',96,' 96','96 ','95'])await assert.rejects(service.remove(invoice.id,{...request(preview),confirmation}),error('INVOICE_DELETE_CODE'));
   await assert.rejects(service.remove(invoice.id,{confirmation:'96',request_id:randomUUID()}),error('INVOICE_DELETE_PREVIEW_REQUIRED'));
   await portfolio.update(invoice.receipts[0].id,{due_date:'2026-11-01',payment_method:'transfer',notes:'Changed'});
   await assert.rejects(service.remove(invoice.id,request(preview)),error('INVOICE_DELETE_STALE'));
   assert.equal((await invoices.get(invoice.id)).id,invoice.id);
  });
  await t.test('request record or deletion failure rolls back invoice, receipts, payments, documents and journals',async()=>{
   await portfolio.settle(invoice.receipts[0].id,payment());
   const preview=await service.preview(invoice.id),before=await count('journal_entries'),requests=await count('invoice_deletions');
   for(const match of [sql=>sql.startsWith('INSERT INTO invoice_deletions('),sql=>sql.startsWith('DELETE FROM journal_lines')]){
    await assert.rejects(createInvoiceDeletionService(failingPool(pool,match),company.id).remove(invoice.id,request(preview)),/Injected invoice deletion failure/);
    assert.equal(await count('journal_entries'),before);assert.equal(await count('invoice_deletions'),requests);assert.equal(await count('invoice_deletion_rows'),0);
    assert.equal((await invoices.get(invoice.id)).receipts[0].remaining_amount,'14.76');assert.equal((await documents.get(attached.id)).invoice_id,invoice.id);
   }
  });
  await t.test('code 96 deletes the full graph once without a backup and returns original PDFs to draft',async()=>{
   const reverse=(await portfolio.get(invoice.receipts[0].id)).settlements[0];
   await portfolio.reverse(reverse.id,{exercise_id:year.id,date:'2026-10-23',reason:'Correction',request_id:randomUUID()});
   await portfolio.settle(invoice.receipts[0].id,payment(year.id,'2026-10-24','3.00'));
   const preview=await service.preview(invoice.id),body=request(preview);
   assert.deepEqual(preview.counts,{invoices:1,receipts:1,settlements:2,entries:4,lines:9,documents:1});
   const results=await Promise.all([service.remove(invoice.id,body),service.remove(invoice.id,body)]);
   assert.equal(results[0].invoice_id,results[1].invoice_id);assert.equal(results.filter(row=>row.replayed).length,1);
   for(const result of results)assert.equal(Object.hasOwn(result,'backup_id'),false);
   assert.equal(await count('invoice_deletion_rows'),0);
   const [requests]=await pool.execute('SELECT id,result FROM invoice_deletions WHERE company_id=? AND request_id=?',[company.id,body.request_id]);
   assert.equal(requests.length,1);assert.equal(Object.hasOwn(requests[0].result,'backup_id'),false);
   await assert.rejects(service.backup(requests[0].id),error('INVOICE_DELETE_BACKUP_NOT_FOUND'));
   const [[original]]=await pool.execute('SELECT source_pdf FROM invoice_documents WHERE company_id=? AND id=?',[company.id,attached.id]);
   assert.deepEqual(original.source_pdf,invoicePdf(company.name,'ATTACHED'));
   await assert.rejects(invoices.get(invoice.id),error('INVOICE_NOT_FOUND'));
   const pending=await documents.get(attached.id);assert.equal(pending.status,'draft');assert.equal(pending.invoice_id,null);assert.equal(pending.entry_id,null);assert.ok(pending.version>attached.version);
   assert.equal((await invoices.get(preserved.id)).receipts[0].remaining_amount,'19.76');
   assert.deepEqual(await service.history(),[]);
   await assert.rejects(service.remove(preserved.id,body),error('REQUEST_CONFLICT'));
  });
  await t.test('copies created before this change remain available',async()=>{
   const result={invoice_id:invoice.id,reference:'LEGACY-COPY',replayed:false};
   const [saved]=await pool.execute('INSERT INTO invoice_deletions(company_id,invoice_id,reference,request_id,request_hash,result) VALUES (?,?,?,?,?,?)',[company.id,invoice.id,result.reference,randomUUID(),'a'.repeat(64),JSON.stringify(result)]);
   const original={id:invoice.id,reference:result.reference};
   await pool.execute('INSERT INTO invoice_deletion_rows(company_id,deletion_id,table_name,row_id,record_action,row_data) VALUES (?,?,?,?,?,?)',[company.id,saved.insertId,'trade_invoices',invoice.id,'delete',JSON.stringify(original)]);
   const history=await service.history();assert.equal(history.length,1);assert.equal(history[0].id,saved.insertId);
   const backup=await service.backup(saved.insertId);assert.equal(backup.format,'contabilitat-invoice-deletion');assert.deepEqual(backup.rows[0].row_data,original);
  });
  await t.test('void invoices remove both invoice and reversal journals',async()=>{
   const row=await create('VOID');
   await invoices.void(row.id,{exercise_id:year.id,date:'2026-10-22',reason:'Wrong invoice',request_id:randomUUID()});
   const preview=await service.preview(row.id);assert.equal(preview.invoice.status,'void');assert.equal(preview.counts.entries,2);await service.remove(row.id,request(preview));
   await assert.rejects(invoices.get(row.id),error('INVOICE_NOT_FOUND'));
  });
  await t.test('closed affected years and dependent openings block deletion',async()=>{
   const row=await create('CLOSED'),paid=await portfolio.settle(row.receipts[0].id,payment(next.id,'2027-01-02'));
   await pool.execute("UPDATE accounting_exercises SET is_default=0,status='closed' WHERE company_id=? AND id=?",[company.id,next.id]);
   let preview=await service.preview(row.id);assert.equal(preview.ready,false);assert.match(preview.blockers[0].message,/2027/);
   await assert.rejects(service.remove(row.id,request(preview)),error('INVOICE_DELETE_DEPENDENCIES'));
   await pool.execute("UPDATE accounting_exercises SET status='open' WHERE company_id=? AND id=?",[company.id,next.id]);
   const opening=await accounting.createEntry({exercise_id:next.id,entry_date:'2027-01-01',description:'Dependent opening',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'1',credit:'0'},{account_id:cost.id,description:'Other',debit:'0',credit:'1'}]});
   await pool.execute("UPDATE journal_entries SET entry_type='opening' WHERE company_id=? AND id=?",[company.id,opening.id]);
   preview=await service.preview(row.id);assert.equal(preview.ready,false);assert.ok(preview.blockers.some(item=>/apertura/.test(item.message)));
   await pool.execute("UPDATE journal_entries SET entry_type='normal' WHERE company_id=? AND id=?",[company.id,opening.id]);
   preview=await service.preview(row.id);assert.equal(preview.ready,true);assert.equal(preview.exercises.length,2);await service.remove(row.id,request(preview));
   await assert.rejects(accounting.getEntry(paid.settlements[0].entry_id),error('ENTRY_NOT_FOUND'));
   assert.ok(await accounting.getEntry(opening.id));
  });
  await t.test('HTTP endpoints enforce company scope, code, versions and access to previous copies',async()=>{
   server=createApp(context,accounting,companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port+'/api';
   const http=(path,companyId=company.id,method='GET',body)=>fetch(base+path,{method,headers:{'X-Company-Id':String(companyId),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
   assert.equal((await http('/invoices/'+preserved.id+'/delete-preview',foreign.id)).status,404);
   assert.equal((await http('/invoices/'+preserved.id+'/delete',foreign.id,'POST',request(await service.preview(preserved.id)))).status,404);
   const history=await service.history();assert.equal((await http('/invoice-deletions/'+history[0].id+'/backup',foreign.id)).status,404);
   const backup=await http('/invoice-deletions/'+history[0].id+'/backup');assert.equal(backup.status,200);assert.match(backup.headers.get('content-disposition'),/attachment/);
   assert.equal((await http('/invoices/'+preserved.id+'/delete',company.id,'POST',{confirmation:'95'})).status,400);
   const draft=(await documents.list({exercise_id:year.id}))[0];
   assert.equal((await http('/invoice-documents/'+draft.id,foreign.id,'DELETE',{version:draft.version})).status,404);
   assert.equal((await http('/invoice-documents/'+draft.id,company.id,'DELETE',{version:draft.version})).status,200);
   const preview=await(await http('/invoices/'+preserved.id+'/delete-preview')).json();
   const response=await http('/invoices/'+preserved.id+'/delete',company.id,'POST',request(preview));assert.equal(response.status,200);assert.equal(Object.hasOwn(await response.json(),'backup_id'),false);
   const [[record]]=await pool.execute('SELECT id FROM invoice_deletions WHERE company_id=? AND invoice_id=? ORDER BY id DESC LIMIT 1',[company.id,preserved.id]);
   assert.equal((await http('/invoice-deletions/'+record.id+'/backup')).status,404);
   assert.equal((await service.history()).length,1);assert.equal(await count('invoice_deletion_rows'),1);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});

test('MySQL miscellaneous documentation: exact originals, search, editing, retries and isolation',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
 try{
  const company=await context.createCompany({name:'Documentation '+randomUUID(),exercise:period(2026)});ids.push(company.id);
  const foreign=await context.createCompany({name:'Foreign documentation '+randomUUID(),exercise:period(2026)});ids.push(foreign.id);
  const service=createDocumentationService(pool,company.id),other=createDocumentationService(pool,foreign.id),year=(await context.getContext(company.id)).exercises[0],buffer=Buffer.from('%PDF-1.7\nOriginal català\n'),body={title:'Contracte lloguer',description:'Finca de Lleida. Referència especial 123.',source_name:'contracte-2025.pdf',source_mime:'application/pdf',request_id:randomUUID()};
  let doc;
  await t.test('uploads preserve exact originals; request retries create one document',async()=>{
   const results=await Promise.all([service.upload(buffer,body),service.upload(buffer,body)]);doc=results[0];assert.equal(results[0].id,results[1].id);
   assert.equal((await service.list()).length,1);assert.equal(doc.source_sha256,createHash('sha256').update(buffer).digest('hex'));assert.equal(doc.source_size,buffer.length);assert.equal(doc.description,body.description);assert.deepEqual((await service.source(doc.id)).content,buffer);
   await assert.rejects(service.upload(buffer,{...body,title:'Changed'}),error('REQUEST_CONFLICT'));
   for(const search of ['lloguer','LLEIDA','especial 123','2025.pdf'])assert.equal((await service.list({search})).length,1);
   assert.equal((await service.list({search:'absent'})).length,0);assert.equal((await other.list()).length,0);
   assert.equal((await other.list({search:'Lleida'})).length,0);
  });
  await t.test('description edits have version checks and foreign IDs cannot be read or changed',async()=>{
   await assert.rejects(other.get(doc.id),error('DOCUMENTATION_NOT_FOUND'));await assert.rejects(other.source(doc.id),error('DOCUMENTATION_NOT_FOUND'));
   await assert.rejects(other.update(doc.id,{title:'Foreign',description:'',version:doc.version}),error('DOCUMENTATION_NOT_FOUND'));await assert.rejects(other.remove(doc.id,{version:doc.version}),error('DOCUMENTATION_NOT_FOUND'));
   await assert.rejects(service.update(doc.id,{title:'Changed',description:'',version:0}),error('DOCUMENTATION_CHANGED'));
   doc=await service.update(doc.id,{title:'Contracte revisat',description:'Assegurança tècnica. Nova descripció.',version:doc.version});
   assert.equal((await service.list({search:'asseguranca'})).length,1);assert.equal(doc.version,2);assert.deepEqual((await service.source(doc.id)).content,buffer);
  });
  await t.test('invalid metadata, empty and oversized files, and malformed base64 are rejected',async()=>{
   for(const content of [Buffer.alloc(0),Buffer.alloc(10*1024*1024+1)])await assert.rejects(service.upload(content,{...body,request_id:randomUUID()}),error('DOCUMENTATION_INVALID_FILE'));
   await assert.rejects(service.upload(buffer,{...body,title:''}),error('DOCUMENTATION_INVALID_METADATA'));
   await assert.rejects(service.upload(buffer,{...body,description:'x'.repeat(4001)}),error('DOCUMENTATION_INVALID_METADATA'));
   for(const content_base64 of ['%%==','a===','ab==','YWJj====','AAAA'.repeat(3495255)])await assert.rejects(service.uploadEncoded({...body,content_base64}),error('DOCUMENTATION_INVALID_FILE'));
  });
  await t.test('HTTP upload accepts a full 10 MB file and long Unicode descriptions; source is an attachment',async()=>{
   server=createApp(context,createAccountingService(pool,company.id),companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port+'/api';
   const http=(path,companyId=company.id,method='GET',data)=>fetch(base+path,{method,headers:{'X-Company-Id':String(companyId),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
   const content=Buffer.alloc(10*1024*1024,0x5a),response=await http('/documentation',company.id,'POST',{...body,request_id:randomUUID(),source_name:'diversos.zip',source_mime:'application/zip',description:'À'.repeat(4000),content_base64:content.toString('base64')});assert.equal(response.status,201);const large=await response.json();assert.equal(large.description.length,4000);
   const source=await http('/documentation/'+large.id+'/source');assert.equal(source.status,200);assert.equal(source.headers.get('x-content-type-options'),'nosniff');assert.match(source.headers.get('content-disposition'),/attachment/);assert.equal(source.headers.get('content-type'),'application/octet-stream');assert.deepEqual(Buffer.from(await source.arrayBuffer()),content);
   assert.equal((await http('/documentation/'+large.id+'/source',foreign.id)).status,404);
   assert.equal((await http('/documentation/'+large.id,company.id,'DELETE',{version:large.version})).status,200);
   assert.equal((await http('/documentation/'+large.id+'/source')).status,404);
   const invalid=await http('/documentation',company.id,'POST',{...body,content_base64:'!bad'});assert.equal(invalid.status,400);
  });
  await t.test('documentation survives accounting period clearing and remains editable in a closed year',async()=>{
   const clear=createExerciseClearService(pool,company.id);
   await pool.execute("UPDATE accounting_exercises SET is_default=0,status='closed' WHERE company_id=? AND id=?",[company.id,year.id]);
   doc=await service.update(doc.id,{title:doc.title,description:'Se conserva al vaciar ejercicios',version:doc.version});
   const preview=await clear.preview(year.id);await clear.clear(year.id,{confirmation:'96',preview_hash:preview.preview_hash,request_id:randomUUID()});
   assert.deepEqual((await service.source(doc.id)).content,buffer);assert.equal((await service.get(doc.id)).description,'Se conserva al vaciar ejercicios');
   await assert.rejects(service.remove(doc.id,{version:1}),error('DOCUMENTATION_CHANGED'));
   assert.equal((await service.remove(doc.id,{version:doc.version})).deleted,true);assert.equal((await service.list()).length,0);
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});
