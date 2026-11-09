import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizePurchasePages} from '../src/services/purchase-document-layout.js';
import {invoicePages} from '../test-support/invoice-fixture.js';
function pages({vat='2,43',omitVat=false,secondReference=false}={}){
 const texts=['01 de Noviembre de 2026 Página 1 de 2','Factura núm: TEST-O2-123 (18 Sep - 17 Oct)',
  'Titular:','EMPRESA DE PROVES SL','B12345674','O2 Móvil 50GB','Cuotas mensuales 11,57 €','Base imponible 11,57 €',
  ...(!omitVat?['IVA (21.00 %) sobre 11,57 € '+vat+' €']:[]),'Total factura 14,00 €','Total a pagar 14,00 €',
  'Mandaremos el recibo a tu cuenta de BANCO DE PRUEBAS a','partir del 03 de Noviembre de 2026',
  'ayuda@o2online.es','Telefónica Móviles España, S.A. (Sociedad Unipersonal). C.I.F. A78923125'];
 const items=texts.map((text,index)=>({text,x:35,y:780-index*24}));items[3]={...items[3],x:100,y:items[2].y};
 return [{page:1,items},{page:2,items:[{text:'01 de Noviembre de 2026 Página 2 de 2',x:35,y:780},{text:'Factura núm: '+(secondReference?'OTHER-456':'TEST-O2-123'),x:35,y:756}]}];
}
test('O2 recognizes issuer, holder, dates and reconciled VAT summary without duplicating pages or consumption',()=>{
 const r=recognizePurchasePages(pages());assert.equal(r.parser,'o2-mobile');assert.equal(r.reference,'TEST-O2-123');
 assert.equal(r.supplier.name,'Telefónica Móviles España, S.A.');assert.equal(r.supplier.tax_id,'A78923125');
 assert.equal(r.customer.name,'EMPRESA DE PROVES SL');assert.equal(r.customer.tax_id,'B12345674');
 assert.equal(r.invoice_date,'2026-11-01');assert.equal(r.due_date,'2026-11-03');assert.equal(r.payment_method,'direct_debit');
 assert.equal(r.base_total,'11.57');assert.equal(r.tax_total,'2.43');assert.equal(r.total_amount,'14.00');
 assert.equal(r.lines.length,1);assert.equal(r.lines[0].tax_rate,'21.00');assert.equal(r.commercial_lines.length,0);
 assert.equal(r.totals_verified,true);assert.notEqual(r.multiple_invoices,true);
});
test('O2 leaves missing VAT unresolved and flags mismatched totals and multiple invoices',()=>{
 assert.equal(recognizePurchasePages(pages({omitVat:true})).tax_total,null);
 assert.equal(recognizePurchasePages(pages({omitVat:true})).lines.length,0);
 const mismatch=recognizePurchasePages(pages({vat:'2,44',secondReference:true}));
 assert.equal(mismatch.totals_verified,false);assert.equal(mismatch.multiple_invoices,true);
 assert.ok(mismatch.warnings.some(warning=>warning.includes('varias referencias')));
});
test('other supplier formats retain their existing extraction',()=>{
 const r=recognizePurchasePages(invoicePages());assert.equal(r.parser,'generic');assert.equal(r.supplier.name,'Electric Supplies SL');assert.equal(r.total_amount,'19.76');
});
