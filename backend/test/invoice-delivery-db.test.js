import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createInvoiceDocumentService} from '../src/services/invoice-documents.js';
import {createInvoiceDeliveryService} from '../src/services/invoice-delivery.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {createApp} from '../src/app.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
async function cleanup(pool,ids){for(const companyId of ids){for(const table of ['invoice_documents','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}}
const attachedPdf=eml=>Buffer.from(eml.slice(eml.indexOf('Content-Type: application/pdf')).split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\s/g,''),'base64');
test('MySQL invoice delivery: exact scoped originals, email attachments, tenant isolation and no accounting changes',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[];let server;
 try{
  const period={name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'},company=await context.createCompany({name:'Delivery test '+randomUUID(),tax_id:'B12345674',exercise:period}),foreign=await context.createCompany({name:'Foreign delivery '+randomUUID(),exercise:period});ids.push(company.id,foreign.id);
  const exercise=(await context.getContext(company.id)).exercises[0],invoices=createInvoiceService(pool,company.id),docs=createInvoiceDocumentService(pool,company.id),generated=invoicePdf(company.name,'GENERATED'),render=async()=>generated,delivery=createInvoiceDeliveryService(pool,company.id,{render});
  const body={exercise_id:exercise.id,direction:'received',reference:'SUP-2026-1',invoice_date:'2026-10-15',party:{name:'Electric Supplies SL',tax_id:'B11111111'},lines:[{description:'Suministro',base:'16.33',tax_rate:'21'}],receipts:[{due_date:'2026-10-22',amount:'19.76'}],request_id:randomUUID()};
  const received=await invoices.create(body),issued=await invoices.create({...body,direction:'issued',reference:'F-2026-1',party:{name:'Client de prova',email:'client@example.com'},request_id:randomUUID()}),other=await invoices.create({...body,reference:'SUP-OTHER',request_id:randomUUID()});
  const original=invoicePdf(company.name,received.reference),preview=await docs.preview(original,exercise.id,'original.pdf'),doc=await docs.get((await docs.archive({token:preview.token})).id);await docs.post(doc.id,{version:doc.version,confirm:true,action:'attach'});
  const counts=async()=>Promise.all(['trade_invoices','trade_invoice_lines','portfolio_receipts','journal_entries','journal_lines','invoice_documents'].map(async table=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[company.id]))[0][0].n));const before=await counts();
  await t.test('received PDF and draft use the exact archived supplier original; generated summary remains selectable',async()=>{
   assert.deepEqual((await delivery.pdf(received.id)).file,original);assert.deepEqual((await delivery.pdf(received.id,{source:'generated'})).file,generated);assert.match(await delivery.print(received.id),/no sustituye el documento original/);
   const draft=await delivery.draft(received.id,{to:'client@example.com',subject:'Factura rebuda',message:'Aquí tens la factura.'});assert.deepEqual(attachedPdf(draft.file.toString()),original);
   assert.deepEqual((await delivery.pdf(issued.id)).file,generated);
  });
  await t.test('document IDs cannot cross invoices or companies',async()=>{
   await assert.rejects(delivery.pdf(other.id,{source:'original',document_id:doc.id}),error=>error.code==='INVOICE_PDF_SOURCE_NOT_FOUND');await assert.rejects(delivery.pdf(issued.id,{source:'original'}),error=>error.code==='INVOICE_PDF_SOURCE_NOT_FOUND');
   await assert.rejects(createInvoiceDeliveryService(pool,foreign.id,{render}).pdf(received.id),error=>error.code==='INVOICE_NOT_FOUND');
  });
  await t.test('HTTP returns safe file headers, isolates tenants and rejects header injection',async()=>{
   const scope=companyScope(pool,company.id);server=createApp(context,createAccountingService(pool,company.id),(req,res,next)=>scope(req,res,()=>{req.invoiceDelivery=createInvoiceDeliveryService(pool,req.companyId,{render});next();})).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api/invoices/',headers={'X-Company-Id':String(company.id)};
   const pdf=await fetch(base+received.id+'/pdf',{headers});assert.equal(pdf.status,200);assert.match(pdf.headers.get('content-type'),/application\/pdf/);assert.match(pdf.headers.get('content-disposition'),/^attachment; filename="factura-/);assert.equal(pdf.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(Buffer.from(await pdf.arrayBuffer()),original);
   const print=await fetch(base+issued.id+'/print',{headers});assert.match(print.headers.get('content-type'),/text\/html/);assert.match(await print.text(),/Client de prova/);
   const email={to:'client@example.com',subject:'Factura de prova',message:'Bon dia'},draft=await fetch(base+issued.id+'/email-draft',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(email)});assert.equal(draft.status,200);assert.match(draft.headers.get('content-type'),/message\/rfc822/);assert.match(draft.headers.get('content-disposition'),/\.eml"$/);assert.deepEqual(attachedPdf(await draft.text()),generated);
   for(const path of ['print','pdf','email-draft']){const response=await fetch(base+issued.id+'/'+path,{method:path==='email-draft'?'POST':'GET',headers:{'X-Company-Id':String(foreign.id),'Content-Type':'application/json'},...(path==='email-draft'?{body:JSON.stringify(email)}:{})});assert.equal(response.status,404);}
   const unsafe=await fetch(base+issued.id+'/email-draft',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({...email,to:'x@example.com\r\nBcc: bad@example.com'})});assert.equal(unsafe.status,400);
  });
  assert.deepEqual(await counts(),before);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});
