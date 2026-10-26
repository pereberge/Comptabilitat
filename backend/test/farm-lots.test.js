import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveFarmLot,farmLotsOverlap} from '../../shared/farm-lots.js';
import {validateFarmLot} from '../src/services/farm-lots.js';
const lot=(id,start,end=null,farm_id=10)=>({id,farm_id,code:'L'+id,entry_date:start,exit_date:end});
const cost=invoice_date=>({farm_id:10,invoice_date,lot_assignment:'auto',lot_id:null});
test('closed and new lots keep invoice costs in distinct cycles, including same-day ambiguous turnover',()=>{
 const lots=[lot(1,'2025-10-01','2026-03-01'),lot(2,'2026-03-01')];
 assert.equal(resolveFarmLot(cost('2026-01-16'),lots).lot.id,1);
 assert.equal(resolveFarmLot(cost('2026-04-16'),lots).lot.id,2);
 assert.equal(resolveFarmLot(cost('2026-03-01'),lots).lot,null);assert.equal(resolveFarmLot(cost('2026-03-01'),lots).reason,'ambiguous_date');
 assert.equal(resolveFarmLot(cost('2025-09-30'),lots).lot,null);
 assert.equal(resolveFarmLot({...cost('2026-04-16'),farm_id:null},lots).reason,'no_farm');
 assert.equal(resolveFarmLot({...cost('2026-04-16'),lot_assignment:'unassigned'},lots).lot,null);
 assert.equal(resolveFarmLot({...cost('2026-04-16'),lot_assignment:'manual',lot_id:1},lots).lot.id,1);
 assert.equal(resolveFarmLot({...cost('2026-04-16'),lot_assignment:'manual',lot_id:3},[...lots,lot(3,'2026-01-01',null,11)]).lot,null);
 assert.equal(farmLotsOverlap(lots[0],lots[1]),false);assert.equal(farmLotsOverlap(lots[0],lot(3,'2026-02-01','2026-04-01')),true);
});
test('lot entry, exit and animal numbers are explicit and validated',()=>{
 const body={farm_id:10,code:'2026-01',entry_date:'2026-01-01'};assert.equal(validateFarmLot(body).exit_date,null);assert.equal(validateFarmLot(body).animals_in,null);
 for(const [fields,code]of [[{exit_date:'2025-12-31'},'FARM_LOT_INVALID_DATES'],[{entry_date:'2026-02-30'},'INVALID_DATE'],[{animals_in:-1},'FARM_LOT_INVALID_ANIMALS'],[{animals_in:1.5},'FARM_LOT_INVALID_ANIMALS'],[{animals_out:10},'FARM_LOT_EXIT_REQUIRED']])assert.throws(()=>validateFarmLot({...body,...fields}),error=>error.code===code);
 assert.equal(validateFarmLot({...body,exit_date:'2026-03-01',animals_in:1000,animals_out:995}).animals_out,995);
});
