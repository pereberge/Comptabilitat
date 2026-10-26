import test from 'node:test';
import assert from 'node:assert/strict';
import {lotProduction,feedQuantity,feedDeliveryDate,transferAmounts} from '../../shared/farm-production.js';
const lot={id:1,animals_in:10,animals_out:9,entry_kg_per_pig:'20.000',entry_price_per_pig:'65.00',entry_cost_included:0,feed_opening_kg:'0.000',feed_closing_kg:'0.000',exit_date:'2026-03-31'};
const lines=[{category:'feed',product_code:'65000001',quantity:'1000.00',feed_kg:null,base_amount:'200.00',informational:0}];
const sales=[{pigs:9,total_kg:'1080.000',total_amount:'1404.00'}],deaths=[{pigs:1}],transfer={source_lot_id:1,destination_lot_id:2,kg:'200.000',total_amount:'40.00'};
test('production report calculates entry price per animal, mortality, net feed and economic conversion',()=>{
 const p=lotProduction(lot,lines,sales,deaths,[transfer]);assert.equal(p.entry_total_kg,'200.000');assert.equal(p.entry_cost,'650.00');assert.equal(p.dead_pigs,1);assert.equal(p.remaining_pigs,0);assert.equal(p.mortality_percent,'10.00');assert.equal(p.feed_consumed_kg,'800.000');assert.equal(p.gain_kg,'880.000');assert.equal(p.conversion,'0.909');assert.equal(p.conversion_final,true);assert.equal(p.cost,'810.00');assert.equal(p.result,'594.00');
 const destination=lotProduction({...lot,id:2},lines,sales,deaths,[transfer]);assert.equal(destination.feed_net_kg,'1200.000');assert.equal(destination.cost,'890.00');assert.equal(Number(p.cost)+Number(destination.cost),1700);
 assert.equal(lotProduction({...lot,entry_cost_included:1},lines,sales,deaths,[transfer]).cost,'160.00');
});
test('missing entries, unknown feed units and unrecorded deaths are shown as pending, never invented',()=>{
 const p=lotProduction({...lot,entry_kg_per_pig:null,entry_price_per_pig:null,exit_date:null,feed_closing_kg:null},lines,sales,[],[]);assert.equal(p.entry_total_kg,null);assert.equal(p.entry_cost_missing,true);assert.equal(p.dead_pigs,0);assert.equal(p.remaining_pigs,1);assert.equal(p.conversion,null);assert.equal(p.conversion_final,false);
 const unknown={...lines[0],product_code:'05000001'};assert.equal(feedQuantity(unknown),null);assert.equal(lotProduction(lot,[unknown],sales,deaths,[]).conversion,null);
 assert.equal(feedQuantity({...unknown,feed_kg:'100.125'}),100125n);assert.equal(feedQuantity({...lines[0],informational:1}),0n);
 assert.equal(lotProduction(lot,[],sales,deaths,[]).conversion,null);
});
test('feed transfer valuation preserves exact cents and accepts comma decimal input',()=>{
 assert.deepEqual(transferAmounts({kg:'100,125',price_per_kg:'0,32145'}),{kg:'100.125',price_per_kg:'0.32145',total_amount:'32.19'});
 for(const body of [{kg:'0',price_per_kg:'1'},{kg:'1',price_per_kg:'-1'}])assert.throws(()=>transferAmounts(body));
});
test('feed availability uses delivery dates, including year rollover, with invoice date as a fallback',()=>{
 assert.equal(feedDeliveryDate({invoice_date:'2026-02-05',delivery_date:'15/01'}),'2026-01-15');
 assert.equal(feedDeliveryDate({invoice_date:'2026-01-05',delivery_date:'28/12'}),'2025-12-28');
 assert.equal(feedDeliveryDate({invoice_date:'2026-02-05',delivery_date:'31/02'}),'2026-02-05');
});
