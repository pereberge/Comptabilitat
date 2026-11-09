import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInvoicePages} from '../src/services/invoice-pdf.js';
import {printedMoney,invoiceRecognition,learnInvoiceFormat,applyInvoiceFormat,recognizeInvoiceFormat} from '../src/services/invoice-recognition.js';
const page=text=>[{items:text.split('\n').map(text=>({text}))}];
const invoice=(reference='F-2026-1',base='1.000,00',tax='210,00',total='1.210,00')=>`FACTURA: ${reference}\nProveedor: Proveïdor SL\nNIF proveedor: B11111111\nCliente: Empresa SL\nNIF cliente: B12345674\nFecha factura: 06/11/2026\nBase imponible: ${base}\nIVA 21%\nCuota IVA: ${tax}\nTotal factura: ${total}`;
test('invoice recognition extracts names, references, dates and exact amounts in Spanish and Catalan layouts',()=>{
 const extraction=parseInvoicePages(page(invoice()));
 assert.equal(extraction.reference,'F-2026-1');assert.equal(extraction.supplier.name,'Proveidor SL');assert.equal(extraction.invoice_date,'2026-11-06');assert.equal(extraction.base_total,'1000.00');assert.equal(extraction.tax_total,'210.00');assert.equal(extraction.total_amount,'1210.00');assert.equal(extraction.totals_verified,true);assert.equal(invoiceRecognition(extraction).status,'pending_review');
 const catalan=parseInvoicePages(page(invoice().replace('Fecha factura','Data').replace('Base imponible','Base imposable').replace('Cuota IVA','Quota IVA').replace('Total factura','Import total')));assert.equal(catalan.totals_verified,true);
});
test('amounts accept both decimal conventions without rounding or accepting ambiguous integers',()=>{
 for(const [input,expected]of [['1.234,56','1234.56'],['1,234.56','1234.56'],['0,00','0.00'],['-12,34','-12.34'],['1234.56','1234.56'],['1.234',null],['n/a',null]])assert.equal(printedMoney(input),expected,input);
 assert.equal(parseInvoicePages(page(invoice('US-1','1,000.00','210.00','1,210.00'))).total_amount,'1210.00');
});
test('PDF items on one visual line are joined in reading order, including split labels and values',()=>{
 const extraction=parseInvoicePages([{items:[{text:'21,00',x:200,y:100},{text:'Total factura:',x:10,y:80},{text:'121,00',x:200,y:80},{text:'Cuota IVA:',x:10,y:100},{text:'Factura:',x:10,y:200},{text:'VIS-1',x:150,y:200},{text:'Proveedor: Empresa SL',x:10,y:180},{text:'Fecha factura: 06/11/2026',x:10,y:160},{text:'Base imponible: 100,00',x:10,y:140},{text:'IVA 21%',x:10,y:120}]}]);
 assert.equal(extraction.reference,'VIS-1');assert.equal(extraction.total_amount,'121.00');assert.equal(extraction.totals_verified,true);
});
test('partial invoices stay pending data; unreadable PDFs and non-invoices are not fabricated',()=>{
 assert.equal(invoiceRecognition(parseInvoicePages(page('FACTURA: F-11\nTotal factura: 25,00'))).kind,'possible_invoice');
 assert.equal(invoiceRecognition(parseInvoicePages(page(''))).kind,'unreadable');
 assert.equal(invoiceRecognition(parseInvoicePages(page('CONTRATO DE ARRENDAMIENTO\nImporte total: 500,00'))).kind,'document');
 for(const label of ['PROFORMA','PRESUPUESTO','ALBARÁN','EXTRACTE BANCARI'])assert.equal(invoiceRecognition(parseInvoicePages(page(label+'\n'+invoice()))).kind,'document');
 const multi=parseInvoicePages(page(invoice()+'\nFactura: F-2026-2'));assert.equal(multi.multiple_invoices,true);assert.equal(invoiceRecognition(multi).status,'needs_data');
 assert.equal(invoiceRecognition({...multi,multiple_invoices:false,currency:'USD',totals_verified:true}).status,'needs_data');
});
const reviewed=extraction=>({direction:'received',party:{name:'Proveïdor SL',tax_id:'B11111111'},reference:extraction.reference,invoice_date:extraction.invoice_date,base_total:extraction.base_total,tax_total:extraction.tax_total,total_amount:extraction.total_amount,receipts:[]});
test('confirmed formats retain label rules and supplier identity, never historical dates, references or amounts',()=>{
 const extraction=parseInvoicePages(page(invoice()));const format=learnInvoiceFormat(extraction,reviewed(extraction),{});
 assert.ok(format);assert.ok(format.rules.some(rule=>rule.field==='reference'));assert.ok(format.rules.some(rule=>rule.field==='total_amount'));
 const rules=JSON.stringify(format.rules);for(const stale of ['F-2026-1','1210.00','1000.00','06/11/2026'])assert.ok(!rules.includes(stale));
 const next=parseInvoicePages(page(invoice('F-2026-9','200,00','42,00','242,00')));const result=applyInvoiceFormat(next,format);
 assert.equal(result.reference,'F-2026-9');assert.equal(result.total_amount,'242.00');assert.equal(result.base_total,'200.00');assert.equal(result.recognized_format,'Proveïdor SL');assert.equal(result.totals_verified,true);assert.equal(invoiceRecognition(result).status,'pending_review');
});
test('learned labels recover a manually corrected unfamiliar layout from the new document',()=>{
 const source=invoice().replace('FACTURA:','NÚMERO DOCUMENTO:').replace('Total factura:','TOTAL DOCUMENTO:');
 const extraction=parseInvoicePages(page('FACTURA\n'+source));const form={...reviewed(extraction),reference:'F-2026-1',total_amount:'1210.00'};
 const format=learnInvoiceFormat(extraction,form,{});assert.ok(format);
 const next=parseInvoicePages(page('FACTURA\n'+source.replace('F-2026-1','F-2026-2').replace('1.210,00','2.420,00').replace('1.000,00','2.000,00').replace('210,00','420,00')));
 const result=applyInvoiceFormat(next,format);assert.equal(result.reference,'F-2026-2');assert.equal(result.total_amount,'2420.00');assert.equal(result.totals_verified,true);
});
test('formats require the supplier identity and every essential label, and refuse ambiguous values',()=>{
 const extraction=parseInvoicePages(page(invoice())),format=learnInvoiceFormat(extraction,reviewed(extraction),{});
 for(const text of [invoice().replaceAll('B11111111','B99999999'),invoice().replace('Total factura:','Saldo:'),invoice()+'\nTotal factura: 10,00','PROFORMA\n'+invoice()]){const next=parseInvoicePages(page(text));assert.equal(applyInvoiceFormat(next,format),next);}
 assert.equal(learnInvoiceFormat({...extraction,multiple_invoices:true},reviewed(extraction),{}),null);
 assert.equal(learnInvoiceFormat(extraction,{...reviewed(extraction),reference:'MANUALLY-INVENTED'},{}),null);
 for(const invalid of [{...format,supplier:null},{...format,rules:[null]},{...format,rules:[{field:'reference',label:'',offset:0}]}])assert.equal(applyInvoiceFormat(extraction,invalid),extraction);
});
test('format lookup is company scoped and uses only confirmed documents',async()=>{
 const extraction=parseInvoicePages(page(invoice())),format=learnInvoiceFormat(extraction,reviewed(extraction),{});let calls=0;
 const db={async execute(sql,args){calls++;assert.deepEqual(args,[17]);assert.match(sql,/status IN \('posted','linked'\)/);return [[{invoice_format:JSON.stringify(format)}]];}};
 assert.equal((await recognizeInvoiceFormat(db,17,extraction)).recognized_format,'Proveïdor SL');assert.equal(calls,1);
 assert.equal(await recognizeInvoiceFormat(db,17,null),null);assert.equal(calls,1);
});
