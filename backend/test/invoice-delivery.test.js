import test from 'node:test';
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {invoiceHtml,invoiceFilename,validateEmailDraft,validateDeliveryOptions,emailDraftMessage} from '../src/services/invoice-delivery-format.js';
import {renderInvoicePdf,closeInvoicePdfRenderer} from '../src/services/invoice-pdf-renderer.js';
import {fiscalInvoice} from '../test-support/verifactu-fixture.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
const invoice=()=>fiscalInvoice({withholding_rate:'15.00',payment_method:'transfer',party_address:'Carrer del Client, 10',party_email:'client@example.com',issuer_snapshot:{name:'Emissor & Àngels SL',tax_id:'B12345674',address:'Carrer Major, 1',iban:'ES9121000418450200051332',invoice_notes:'Gràcies per la confiança'},receipts:[{due_date:'2026-11-21',amount:'106.00',account_id:999}],offset_code:'7000.0001',party_code:'4300.0001'});
const decodePart=(eml,type)=>{const marker='Content-Type: '+type,part=eml.slice(eml.indexOf(marker)).split('\r\n\r\n')[1].split('\r\n--')[0];return Buffer.from(part.replace(/\s/g,''),'base64');};

test('customer copy preserves exact withholding, bank data and due dates, escapes content and excludes internal accounts',()=>{
 const html=invoiceHtml(invoice());assert.match(html,/Emissor &amp; Àngels SL/);assert.match(html,/Servicio &lt;prueba&gt; &amp; asesoría/);assert.match(html,/121,00 €/);assert.match(html,/−15,00 €/);assert.match(html,/106,00 €/);assert.match(html,/21\/11\/2026/);assert.match(html,/ES9121000418450200051332/);assert.doesNotMatch(html,/7000\.0001|4300\.0001|account_id/);
 assert.doesNotMatch(invoiceHtml({...invoice(),notes:'<script>alert(1)</script>'},'https://example.com/logo.png'),/<script>|src="https:/);
});
test('received copies identify supplier and recipient and clearly mark the accounting summary',()=>{
 const html=invoiceHtml({...invoice(),direction:'received',party_name:'Proveedor de prueba'});assert.match(html,/Resumen de factura recibida/);assert.match(html,/no sustituye el documento original/);assert.ok(html.indexOf('Proveedor de prueba')<html.indexOf('Destinatario'));assert.doesNotMatch(html,/IBAN|Gràcies per la confiança/);
});
test('mail drafts preserve UTF-8 text and exact PDF bytes with an editable unsent message',()=>{
 const file=invoicePdf('Client','EMAIL-1'),body={to:'client@example.com',subject:'Factura d’assessorament · Àngels i Companyia '.repeat(4),message:'Bon dia,\n\nAquí tens la factura.\nGràcies.'},eml=emailDraftMessage(body,file,invoiceFilename(invoice())).toString('utf8');
 assert.match(eml,/^X-Unsent: 1\r\n/);assert.match(eml,/To: client@example.com\r\n/);assert.match(eml,/Content-Disposition: attachment; filename="factura-/);assert.deepEqual(decodePart(eml,'application/pdf'),file);assert.equal(decodePart(eml,'text/plain').toString('utf8'),body.message);
 const subject=eml.match(/Subject: ([\s\S]*?)\r\nMIME-Version/)[1].replace(/=\?UTF-8\?B\?([^?]+)\?=/g,(_,value)=>Buffer.from(value,'base64').toString('utf8')).replace(/\r\n /g,'');assert.equal(subject,body.subject.trim());
 assert.doesNotMatch(emailDraftMessage({...body,to:''},file,'factura.pdf').toString(),/\r\nTo:/);
});
test('unsafe email headers, attachment names and ambiguous document sources are rejected',()=>{
 const body={to:'client@example.com',subject:'Factura',message:'Hola'};
 for(const to of ['client@example.com\r\nBcc: other@example.com','a@example.com,b@example.com','a@example.com; b@example.com'])assert.throws(()=>validateEmailDraft({...body,to}),error=>error.code==='INVOICE_EMAIL_ADDRESS');
 assert.throws(()=>validateEmailDraft({...body,subject:'Factura\r\nBcc: other@example.com'}),error=>error.code==='INVOICE_EMAIL_SUBJECT');
 assert.throws(()=>validateEmailDraft({...body,message:'x'.repeat(6001)}),error=>error.code==='INVOICE_EMAIL_MESSAGE');
 assert.throws(()=>validateDeliveryOptions({source:'generated',document_id:1}),error=>error.code==='INVOICE_DELIVERY_INVALID');
 assert.throws(()=>validateDeliveryOptions({source:'wrong'}),error=>error.code==='INVOICE_DELIVERY_INVALID');
 assert.throws(()=>emailDraftMessage(body,invoicePdf(),'bad\r\nname.pdf'),error=>error.code==='INVOICE_EMAIL_INVALID');
 assert.match(invoiceFilename({...invoice(),reference:'../CON: 1\r\nInjected'}),/^[A-Za-z0-9._-]+\.pdf$/);
});
test('Edge PDF contains Unicode, exact totals and the final lines across multiple A4 pages',{skip:process.env.TEST_INVOICE_PDF!=='1'},async t=>{
 t.after(closeInvoicePdfRenderer);
 const data=invoice();data.lines=Array.from({length:65},(_,index)=>({...data.lines[0],description:'Línia '+(index+1)+' · assessorament comptable'}));
 const file=await renderInvoicePdf(invoiceHtml(data));assert.equal(file.subarray(0,5).toString(),'%PDF-');const task=getDocument({data:new Uint8Array(file),useSystemFonts:true,disableFontFace:true});
 try{const pdf=await task.promise;assert.ok(pdf.numPages>1);let text='';for(let page=1;page<=pdf.numPages;page++)text+=(await(await pdf.getPage(page)).getTextContent()).items.map(item=>item.str).join(' ')+' ';assert.match(text,/Emissor & Àngels SL/);assert.match(text,/Línia 65/);assert.match(text,/121,00/);assert.match(text,/106,00/);assert.match(text,/21\/11\/2026/);assert.doesNotMatch(text,/7000\.0001|4300\.0001/);}finally{await task.destroy();}
});
