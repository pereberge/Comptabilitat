import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {checkDraft,supplierPayload} from '../src/services/supplier-invoices/service.js';
import {protectGmail,gmailQuery,pdfParts,googleRequest} from '../src/services/supplier-invoices/gmail.js';
const draft=()=>({supplier:{name:'Example SL',taxId:'B12345678'},invoiceNumber:'AB-2026/001',invoiceDate:'2026-11-06',dueDate:'2026-12-06',currency:'EUR',invoiceType:'standard',description:'',taxBreakdown:[{taxType:'vat',taxableBase:'100.00',taxRate:'21.00',taxAmount:'21.00'}],withholdings:[],lines:[],total:'121.00'});
test('incomplete drafts survive without fiscal validation or mutation',()=>{
 const incomplete={supplier:{},invoiceNumber:'A-1/2',invoiceDate:'',total:'',taxBreakdown:[]};assert.deepEqual(checkDraft(incomplete),incomplete);assert.deepEqual(checkDraft({}),{});assert.throws(()=>supplierPayload(incomplete,1,1));assert.throws(()=>checkDraft({...incomplete,taxBreakdown:'invalid'}));
});
test('validation preserves textual reference and explicit concept; empty concept uses invoice number',()=>{
 const input=draft();const result=supplierPayload(input,1,9,'abc123');assert.equal(result.invoiceNumber,input.invoiceNumber);assert.equal(result.description,input.invoiceNumber);assert.equal(result.externalId,'document:abc123');assert.equal(result.companyExternalId,'1');assert.equal(input.description,'');
 input.description='Material per al taller';assert.equal(supplierPayload(input,1,9).description,input.description);
});
test('exact signed totals, fiscal identifiers and valid calendar dates are required only on validation',()=>{
 const input=draft();assert.throws(()=>supplierPayload({...input,total:'121.01'},1,1),{code:'INTEGRATION_TOTAL_MISMATCH'});assert.throws(()=>supplierPayload({...input,invoiceDate:'2026-02-31'},1,1),{code:'INTEGRATION_INVALID_DATE'});
 input.invoiceType='credit_note';input.rectification={reason:'Devolució',originalInvoiceNumber:'ORIG-1'};input.taxBreakdown[0].taxableBase='-100.00';input.taxBreakdown[0].taxAmount='-21.00';input.total='-121.00';assert.equal(supplierPayload(input,1,1).total,'-121.00');
});
test('Gmail encryption binds each grant to a company and mailbox and never stores a plaintext token',()=>{
 const previous=process.env.GMAIL_ENCRYPTION_KEY;process.env.GMAIL_ENCRYPTION_KEY=randomBytes(32).toString('base64');
 try{const encrypted=protectGmail('secret-refresh-token','1:2');assert.ok(!encrypted.includes('secret'));assert.equal(protectGmail(encrypted,'1:2',true),'secret-refresh-token');assert.throws(()=>protectGmail(encrypted,'2:2',true),{code:'GMAIL_TOKEN_INVALID'});}finally{if(previous===undefined)delete process.env.GMAIL_ENCRYPTION_KEY;else process.env.GMAIL_ENCRYPTION_KEY=previous;}
});
test('Gmail date boundary, recursive attachments and safe provider errors',async()=>{
 assert.equal(gmailQuery('2026-11-06'),'has:attachment filename:pdf after:1793923200');assert.throws(()=>gmailQuery('2026-02-31'));
 const part={filename:'invoice.pdf',body:{data:'abc'}};assert.deepEqual(pdfParts({parts:[{parts:[part]},{filename:'logo.png'}]}),[part]);
 await assert.rejects(googleRequest('https://example.invalid',{},async()=>new Response(JSON.stringify({error:'invalid_grant'}),{status:400})),{code:'GMAIL_REAUTHORIZE'});
});
