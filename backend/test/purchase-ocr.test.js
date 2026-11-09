import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {readPurchaseDocument} from '../src/services/purchase-document-reader.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
const image=()=>{
 const canvas=createCanvas(1600,1000),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,1600,1000);context.fillStyle='black';context.font='42px Arial';
 ['FACTURA','Proveedor: SUPPLIER TEST SL','Factura: OCR-001','Fecha factura: 01/11/2026','Base imponible: 100,00','IVA 21 %','Cuota IVA: 21,00','Importe total: 121,00'].forEach((line,index)=>context.fillText(line,60,90+index*95));return canvas;
};
function scannedPdf(jpeg){
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 500] /Resources << /XObject << /Im 4 0 R >> >> /Contents 5 0 R >>'),Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 1600 /Height 1000 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'),jpeg,Buffer.from('\nendstream')]),Buffer.from('<< /Length 32 >>\nstream\nq 800 0 0 500 0 0 cm /Im Do Q\nendstream')];
 const parts=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=parts[0].length;
 objects.forEach((object,index)=>{offsets.push(length);const bytes=Buffer.concat([Buffer.from((index+1)+' 0 obj\n'),object,Buffer.from('\nendobj\n')]);parts.push(bytes);length+=bytes.length;});
 parts.push(Buffer.from('xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+length+'\n%%EOF'));return Buffer.concat(parts);
}
test('digital PDF extracts text without OCR and leaves the original untouched',async()=>{
 const buffer=invoicePdf('CUSTOMER TEST SL','DIGITAL-001'),before=Buffer.from(buffer),result=await readPurchaseDocument(buffer);
 assert.equal(result.engine,'pdf-text');assert.match(result.recognized_text,/DIGITAL-001/);assert.deepEqual(buffer,before);
});
test('explicit Tesseract mode renders a digital PDF and preserves verified digital fields',{timeout:180000},async()=>{
 const buffer=invoicePdf('CUSTOMER TEST SL','DIGITAL-002'),before=Buffer.from(buffer);
 const result=await readPurchaseDocument(buffer,{forceOcr:true});
 assert.equal(result.engine,'tesseract-local');assert.ok(result.confidence>40);
 assert.equal(result.reference,'DIGITAL-002');assert.equal(result.total_amount,'19.76');
 assert.equal(result.totals_verified,true);assert.equal(result.field_source,'pdf-text');assert.deepEqual(buffer,before);
});
test('local Tesseract recognizes a PNG and a scanned PDF using installed language models',{timeout:180000},async()=>{
 const canvas=image();
 for(const source of [canvas.toBuffer('image/png'),scannedPdf(canvas.toBuffer('image/jpeg'))]){
  const before=Buffer.from(source),result=await readPurchaseDocument(source);
  assert.equal(result.engine,'tesseract-local');assert.match(result.recognized_text,/FACTURA/i);assert.match(result.recognized_text,/121[,.]00/);assert.ok(result.confidence>40);assert.deepEqual(source,before);
 }
});
