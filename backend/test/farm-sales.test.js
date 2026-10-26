import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateFarmSale} from '../../shared/farm-sale-money.js';
import {validateFarmSale} from '../src/services/farm-sales.js';
import {farmReportHtml} from '../src/services/farms-report.js';
const error=code=>cause=>cause.code===code;
test('sales reports identify manual revenue and retain price precision while escaping lot names',()=>{
 const sale=calculateFarmSale({pigs:100,kg_per_pig:'112.35',price_per_kg:'1.65275'}),data={company:{name:'Test',tax_id:'A25006107'},groups:[],pending:{lines:0},totals:{base:'0.00',vat:'0.00',total:'0.00'},lines:[],sales:[{...sale,lot_code:'<script>',farm_name:'Test',sale_date:'2026-01-31'}],sales_totals:{count:1,pigs:100,total_kg:sale.total_kg,revenue:sale.total_amount,cost:'0.00',result:sale.total_amount}};
 const html=farmReportHtml(data);assert.match(html,/Ventas manuales y resultado registrado/);assert.match(html,/1,65275/);assert.match(html,/112,35/);assert.match(html,/&lt;script&gt;/);assert.ok(!html.includes('<script>'));
});
test('manual pig sales calculate total weight and euros with exact decimal rounding',()=>{
 assert.deepEqual(calculateFarmSale({pigs:100,kg_per_pig:'112,35',price_per_kg:'1,65'}),{pigs:100,kg_per_pig:'112.350',price_per_kg:'1.65000',total_kg:'11235.000',total_amount:'18537.75'});
 assert.equal(calculateFarmSale({pigs:3,kg_per_pig:'112.345',price_per_kg:'1.675'}).total_amount,'564.53');
 assert.equal(calculateFarmSale({pigs:1,kg_per_pig:'1.005',price_per_kg:'1'}).total_amount,'1.01');
 assert.equal(calculateFarmSale({pigs:3,kg_per_pig:'0.001',price_per_kg:'1.66667'}).total_amount,'0.01');
 assert.equal(calculateFarmSale({pigs:10000000,kg_per_pig:'1',price_per_kg:'999999.99'}).total_amount,'9999999900000.00');
});
test('manual sales reject missing, negative, fractional pigs, invalid precision and overflowing totals',()=>{
 const body={pigs:100,kg_per_pig:'112.35',price_per_kg:'1.65'};
 for(const pigs of [0,-1,1.5,'1e2',10000001,null])assert.throws(()=>calculateFarmSale({...body,pigs}),error('FARM_SALE_INVALID_PIGS'));
 for(const fields of [{kg_per_pig:'-1'},{kg_per_pig:'0'},{kg_per_pig:'112.1234'},{price_per_kg:'0'},{price_per_kg:'1.123456'},{price_per_kg:'1,2.3'}])assert.throws(()=>calculateFarmSale({...body,...fields}),error('FARM_SALE_INVALID_NUMBER'));
 assert.throws(()=>calculateFarmSale({pigs:10000000,kg_per_pig:'9999.999',price_per_kg:'999999.99999'}),error('FARM_SALE_TOTAL_TOO_LARGE'));
 assert.throws(()=>validateFarmSale({...body,lot_id:1,sale_date:'2026-02-30'}),error('INVALID_DATE'));
 const calculated=validateFarmSale({...body,lot_id:1,sale_date:'2026-01-31',total_amount:'0.01',total_kg:'0.001'});assert.equal(calculated.total_amount,'18537.75');
});
