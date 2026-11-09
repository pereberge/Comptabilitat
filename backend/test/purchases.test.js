import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseNumber,purchaseDecimal,purchaseLine,purchaseTotals,purchasePriceChange} from '../../shared/purchases.js';
import {recognizePurchasePages} from '../src/services/purchase-document-layout.js';
import {purchaseDocumentMime} from '../src/services/purchase-document-reader.js';
import {createPurchaseService} from '../src/services/purchases.js';
import {randomUUID} from 'node:crypto';
test('purchase invoice limits match accounting without reducing order or receipt capacity',async()=>{
 let attempted=0;const marker=new Error('SIMULATED_CONNECTION');
 const service=createPurchaseService({getConnection:async()=>{attempted++;throw marker;}},85);
 const body=count=>({request_id:randomUUID(),lines:Array.from({length:count},()=>({description:'Material',quantity:'1',unit_price:'1',discount_rate:'0',tax_rate:'21'}))});
 for(const [kind,count] of [['invoices',41],['orders',101],['receipts',101]])await assert.rejects(service.save(kind,null,body(count)),error=>error.code==='PURCHASE_TOO_MANY_LINES');
 assert.equal(attempted,0);
 for(const [kind,count] of [['invoices',40],['orders',100],['receipts',100]])await assert.rejects(service.save(kind,null,body(count)),error=>error===marker);
 assert.equal(attempted,3);
});
test('purchase quantities, prices, discounts and VAT use exact decimal arithmetic',()=>{
 assert.equal(purchaseNumber('1,234567'),1234567n);assert.equal(purchaseDecimal(1234567n),'1.234567');
 const line=purchaseLine({quantity:'3',unit_price:'2.50',discount_rate:'0',tax_rate:'21'});
 assert.equal(line.base,'7.50');assert.equal(line.tax_amount,'1.58');assert.equal(line.total,'9.08');
 assert.equal(purchaseLine({quantity:'1000',unit_price:'0.123456',discount_rate:'10',tax_rate:'21'}).base,'111.11');
 assert.equal(purchasePriceChange('100','105.25'),'5.25');assert.equal(purchasePriceChange('0','1'),null);
 assert.equal(purchaseTotals([{quantity:'1',unit_price:null,tax_rate:'21'}]).unpriced,true);
 for(const quantity of ['-1','1e2','1.1234567','1.000,00',''])assert.throws(()=>purchaseLine({quantity,unit_price:'1',tax_rate:'21'}));
 assert.throws(()=>purchaseLine({quantity:'1',unit_price:'1',discount_rate:'101',tax_rate:'21'}));
});
test('commercial PDF table recognizes quantity, unit price, discount, VAT and source page',()=>{
 const item=(text,x,y)=>({text,x,y});
 const result=recognizePurchasePages([{page:1,items:[item('FACTURA',10,800),item('CODIGO',10,700),item('DESCRIPCION',80,700),item('CANTIDAD',260,700),item('PRECIO',340,700),item('DTO',420,700),item('IVA',470,700),item('A-1',10,680),item('Article de prova',80,680),item('2,5',260,680),item('10,00',340,680),item('5',420,680),item('21',470,680)]}]);
 assert.equal(result.commercial_lines.length,1);assert.equal(result.commercial_lines[0].quantity,'2.5');assert.equal(result.commercial_lines[0].unit_price,'10.00');assert.equal(result.commercial_lines[0].discount_rate,'5');assert.equal(result.commercial_lines[0].tax_rate,'21');
});
test('uploads validate PDF, PNG and JPEG signatures instead of trusting file extensions',()=>{
 assert.equal(purchaseDocumentMime(Buffer.from('\r\nMIME preamble\r\n%PDF-1.7\n')),'application/pdf');
 assert.equal(purchaseDocumentMime(Buffer.from([137,80,78,71,13,10,26,10])),'image/png');
 assert.equal(purchaseDocumentMime(Buffer.from([255,216,255,0])),'image/jpeg');
 assert.throws(()=>purchaseDocumentMime(Buffer.from('<script>fake.pdf</script>')),error=>error.code==='PURCHASE_INVALID_FILE');
});
