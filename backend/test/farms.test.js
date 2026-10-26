import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseFarmInvoicePages,extractFarmPdf} from '../src/services/farm-pdf.js';
import {allocateRounded,scaled} from '../../shared/farm-costs.js';
import {farmReportHtml} from '../src/services/farms-report.js';
import {farmPages,farmPdf,item} from '../test-support/farm-fixture.js';
const code=expected=>error=>error.message===expected;
test('farm PDF keeps source millieuro amounts and allocates exact invoice cents without counting delivery totals',async()=>{
 const parsed=parseFarmInvoicePages(farmPages()),invoice=parsed.invoices[0];
 assert.equal(parsed.totals.base,'30.01');assert.equal(parsed.totals.vat,'3.00');assert.equal(parsed.totals.total,'33.01');assert.equal(parsed.farms.length,2);assert.equal(invoice.lines.length,2);
 assert.equal(invoice.lines[0].source_amount,'10.005');assert.equal(invoice.lines[0].base_amount,'10.01');assert.equal(invoice.lines[1].base_amount,'20.00');assert.equal(parsed.totals.unassigned_base,'0.00');
 const extracted=await extractFarmPdf(farmPdf());assert.deepEqual(extracted.totals,parsed.totals);
 assert.deepEqual(allocateRounded([-1005n,-2005n],10n,-301n),[-101n,-200n]);
});
test('farm boundaries reset between invoices; exact duplicates are skipped and conflicting references rejected',()=>{
 const parsed=parseFarmInvoicePages([...farmPages(),...farmPages(),...farmPages({reference:'2026-1-2',withFarms:false})]);
 assert.equal(parsed.totals.duplicates,1);assert.equal(parsed.invoices.length,2);assert.equal(parsed.totals.unassigned_base,'30.01');assert.ok(parsed.invoices[1].lines.every(line=>line.farm_code===null));
 const other=farmPages();other[0].items.find(row=>row.text==='PINSO TEST').text='OTHER';
 assert.throws(()=>parseFarmInvoicePages([...farmPages(),...other]),code('FARM_PDF_CONFLICTING_INVOICE'));
 assert.throws(()=>parseFarmInvoicePages([...farmPages(),...farmPages({tax:'B12345674'})]),code('FARM_PDF_MULTIPLE_COMPANIES'));
});
test('multi-page invoice carries its farm and rejects missing or corrupted carry and totals',()=>{
 const original=farmPages(),top=original[0].items.filter(row=>row.y>=625),rows=original[0].items.filter(row=>row.y<625),footer=rows.filter(row=>row.y<120);
 const pages=[{items:[...top,...rows.filter(row=>row.y>560),item('RÒSSEC:',158,41),item('10,005',464,41)]},{items:[...top,item('SUMA ANTERIOR:',158,613),item('10,005',464,613),...rows.filter(row=>row.y>=500&&row.y<=540&&row.text!=='GRANJA:'&&!/^2 Granja/.test(row.text)),...footer]}];
 const parsed=parseFarmInvoicePages(pages);assert.ok(parsed.invoices[0].lines.every(row=>row.farm_code==='1'));assert.deepEqual(parsed.invoices[0].pages,[1,2]);
 const changed=structuredClone(pages);changed[1].items.find(row=>row.text==='10,005'&&row.y===613).text='10,105';assert.throws(()=>parseFarmInvoicePages(changed),code('FARM_PDF_CARRY_MISMATCH'));
 const incomplete=structuredClone(original);incomplete[0].items.find(row=>row.text==='33,01').text='33,02';assert.throws(()=>parseFarmInvoicePages(incomplete),code('FARM_PDF_TOTAL_MISMATCH'));
 const unconsumed=structuredClone(original);unconsumed[0].items.push(item('5,000',480,400));assert.throws(()=>parseFarmInvoicePages(unconsumed),code('FARM_PDF_UNREAD_AMOUNT'));
});
test('unpriced informational rows keep zero cost while preserving printed invoice VAT rounding',()=>{
 const pages=farmPages();pages[0].items.push(item('09000002',99,400),item('0',142,400),item('INFORMATIU',157,400),item('1,00',386,400),item('30,010',529,400));
 const parsed=parseFarmInvoicePages(pages);assert.equal(parsed.totals.lines,3);assert.equal(parsed.totals.base,'30.01');assert.equal(parsed.invoices[0].lines[2].base_amount,'0.00');assert.equal(parsed.invoices[0].lines[2].informational,true);
 const rounding=farmPages();rounding[0].items.find(row=>row.text==='3,00').text='2,99';rounding[0].items.find(row=>row.text==='33,01').text='33,00';assert.equal(parseFarmInvoicePages(rounding).totals.vat,'2.99');
});
test('report escapes farm, supplier and source descriptions',()=>{
 const data={company:{name:'<script>x</script>',tax_id:'A'},totals:{base:'1.00',vat:'0.10',total:'1.10'},groups:[{code:'1',name:'<img>',lines:1,base:'1.00',vat:'0.10',total:'1.10'}],pending:{lines:0},lines:[]};
 const html=farmReportHtml(data);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;img&gt;'));
});
test('mixed VAT invoices reconcile each printed base and quota independently',()=>{
 const pages=farmPages(),items=pages[0].items;
 for(const row of items){if(row.text==='10,005')row.text='10,000';if(row.text==='20,005')row.text='20,000';if(row.text==='30,010')row.text='30,000';if(row.text==='30,01')row.text='30,00';if(row.text==='3,00')row.text='5,20';if(row.text==='33,01')row.text='35,20';if(row.text==='10'&&row.y===520)row.text='21';}
 const aggregateRate=items.findIndex(row=>row.x===243&&row.y===92);items.splice(aggregateRate,1);
 items.push(item('10,00',243,74),item('10,000',201,74),item('1,000',300,74),item('21,00',243,59),item('20,000',201,59),item('4,200',300,59));
 const parsed=parseFarmInvoicePages(pages);assert.equal(parsed.totals.vat,'5.20');assert.equal(parsed.invoices[0].lines[1].vat_amount,'4.20');
 const changed=structuredClone(pages);changed[0].items.find(row=>row.text==='4,200').text='4,210';assert.throws(()=>parseFarmInvoicePages(changed),code('FARM_PDF_VAT_TOTAL_MISMATCH'));
});
test('real source bundle reconciles all invoices, farms and cents',{skip:!process.env.TEST_FARM_PDF},async()=>{
 const parsed=await extractFarmPdf(await readFile(process.env.TEST_FARM_PDF));
 assert.equal(parsed.pages,193);assert.equal(parsed.totals.invoices,136);assert.equal(parsed.totals.lines,2092);assert.equal(parsed.farms.length,22);assert.equal(parsed.totals.base,'1655961.60');assert.equal(parsed.totals.vat,'169646.83');assert.equal(parsed.totals.total,'1825608.43');assert.equal(parsed.totals.unassigned_base,'76142.08');assert.equal(parsed.totals.price_review_lines,0);
 for(const invoice of parsed.invoices)assert.equal(invoice.lines.reduce((sum,row)=>sum+scaled(row.base_amount,2),0n),scaled(invoice.base_total,2));
 assert.ok(parsed.invoices.flatMap(invoice=>invoice.lines).filter(line=>line.informational).every(line=>line.base_amount==='0.00'&&line.vat_amount==='0.00'));
});
