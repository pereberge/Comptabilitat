import test from 'node:test';import assert from 'node:assert/strict';
import {recognizePurchasePages} from '../src/services/purchase-document-layout.js';import {readPurchaseDocument} from '../src/services/purchase-document-reader.js';
import {santIsidrePages,santIsidrePdf} from '../test-support/sant-isidre-fixture.js';
test('Sant Isidre separates two invoices, identifies supplier and fiscal totals, and retains all 37 plus 20 detail lines',()=>{
 const result=recognizePurchasePages(santIsidrePages());assert.equal(result.multiple_invoices,true);assert.equal(result.invoices.length,2);
 const [a,b]=result.invoices;assert.equal(a.reference,'2026-1-TEST-A');assert.equal(b.reference,'2026-1-TEST-B');assert.deepEqual(a.source_pages,[1,2,3]);assert.deepEqual(b.source_pages,[4,5]);
 assert.equal(a.supplier.tax_id,'F25003518');assert.equal(a.customer.name,'CUSTOMER TEST SA');assert.equal(a.customer.tax_id,'A12345678');assert.equal(a.invoice_date,'2026-10-17');assert.equal(a.due_date,'2026-12-17');
 assert.equal(a.base_total,'37.00');assert.equal(a.tax_total,'3.70');assert.equal(a.total_amount,'40.70');assert.equal(a.commercial_lines.length,37);assert.equal(b.commercial_lines.length,20);assert.equal(a.totals_verified,true);assert.equal(b.totals_verified,true);
 assert.equal(a.commercial_lines[0].supplier_code,'00000001');assert.equal(b.commercial_lines.at(-1).supplier_code,'00000120');assert.equal(b.commercial_lines.at(-1).farm,'FARM TEST');assert.equal(a.commercial_lines[0].tax_rate,'10');
});
test('Sant Isidre keeps printed price precision and exposes rounding differences without adjusting source quantities',()=>{
 const pages=santIsidrePages().slice(0,3);pages[0].items.find(item=>item.x===371&&item.y===599).text='1.234,50';pages[0].items.find(item=>item.x===420&&item.y===599).text='0,35010';
 const result=recognizePurchasePages(pages);assert.equal(result.commercial_lines[0].quantity,'1234.50');assert.equal(result.commercial_lines[0].unit_price,'0.35010');assert.equal(result.base_total,'37.00');assert.equal(result.totals_verified,false);assert.ok(result.warnings.some(value=>value.includes('arrodoniments')));
});
test('the actual PDF reader preserves the separate invoice groups and all detail lines',async()=>{
 const result=await readPurchaseDocument(santIsidrePdf());assert.equal(result.engine,'pdf-text');assert.deepEqual(result.invoices.map(row=>row.commercial_lines.length),[37,20]);
});
