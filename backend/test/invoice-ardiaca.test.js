import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {recognizeArdiacaInvoice} from '../src/services/invoice-ardiaca.js';
import {parseInvoicePages} from '../src/services/invoice-pdf.js';
import {recognizePurchasePages} from '../src/services/purchase-document-layout.js';
import {extractInvoiceDocument} from '../src/services/invoice-documents.js';

function pages(){const item=(text,x,y)=>({text,x,y});return [{page:1,items:[
 item('AGROPECUARIA ARDIACA MORLO, SL',43,787),item('CL. SANT PASCUAL BAILON, 33',43,773),item('CIF/NIF: B25457086',44,734),
 item('Datos del cliente',319,732),item('RECICLAJES DEL BAJO CINCA, SL',319,714),item('CIF/NIF: B22299945',319,659),
 item('Nº factura',53,636),item('Fecha',134,636),item('S26/125',59,620),item('06/11/2026',124,620),
 item('Unidades',49,567),item('Descripción',101,567),item('PVP',397,567),item('% IVA',477,567),
 item('38,000',65,534),item('HORES TRACTOR',101,534),item('125,0000',378,534),item('10',481,534),item('4.750,00',517,534),
 item('Base imponible',60,244),item('IVA',220,244),item('Total factura',481,244),item('4.750,00',103,225),item('475,00',214,225),item('5.225,00',511,225),
 item('Vencimientos:',302,156),item('06/11/2026',374,156),
 ]}];}

test('Ardiaca identifies invoice columns and parties, preserves commercial precision and verifies all totals',()=>{
 for(const parse of [parseInvoicePages,recognizePurchasePages]){
  const result=parse(pages());assert.equal(result.parser,'ardiaca');assert.equal(result.reference,'S26/125');assert.equal(result.invoice_date,'2026-11-06');assert.equal(result.due_date,'2026-11-06');
  assert.equal(result.supplier.tax_id,'B25457086');assert.equal(result.customer.tax_id,'B22299945');assert.equal(result.base_total,'4750.00');assert.equal(result.tax_total,'475.00');assert.equal(result.total_amount,'5225.00');assert.equal(result.totals_verified,true);
  assert.equal(result.commercial_lines[0].quantity,'38.000');assert.equal(result.commercial_lines[0].unit_price,'125.0000');assert.equal(result.commercial_lines[0].tax_rate,'10');
 }
});

test('Ardiaca does not confirm inconsistent amounts, wrong identity, missing summary or invalid dates',()=>{
 for(const change of [
  p=>p[0].items.find(i=>i.text==='5.225,00').text='5.226,00',
  p=>p[0].items.find(i=>i.text==='125,0000').text='126,0000',
  p=>p[0].items.find(i=>i.text==='CIF/NIF: B25457086').text='CIF/NIF: B11111111',
  p=>p[0].items=p[0].items.filter(i=>i.text!=='IVA'),
  p=>p[0].items.find(i=>i.text==='06/11/2026').text='31/02/2026',
 ]){const p=pages();change(p);assert.equal(recognizeArdiacaInvoice(p),null);}
});

test('provided S26/125 PDF is readable and recognized through both real extraction paths',{skip:!process.env.TEST_ARDIACA_PDF},async()=>{
 const buffer=readFileSync(process.env.TEST_ARDIACA_PDF),extracted=await extractInvoiceDocument(buffer);assert.equal(extracted.reference,'S26/125');assert.equal(extracted.total_amount,'5225.00');assert.equal(extracted.totals_verified,true);
 const task=getDocument({data:Uint8Array.from(buffer),verbosity:0});try{const pdf=await task.promise;assert.equal(pdf.numPages,1);const p=await pdf.getPage(1),content=await p.getTextContent();const result=recognizePurchasePages([{page:1,items:content.items.filter(i=>i.str?.trim()).map(i=>({text:i.str,x:i.transform[4],y:i.transform[5]}))}]);assert.equal(result.commercial_lines.length,1);assert.equal(result.commercial_lines[0].description,'HORES TRACTOR');assert.equal(result.total_amount,'5225.00');}finally{await task.destroy();}
});
