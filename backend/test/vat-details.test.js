import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateVatModel,vatPeriod} from '../../shared/vat-model.js';
import {groupVatDetails,vatDetailCents} from '../../shared/vat-details.js';
import {appendVatDetailCsv} from '../../frontend/src/services/vat-details.js';
const period=vatPeriod({year:2026,frequency:'quarterly',period:1});
const source=(key,direction,base,tax,code,extra={})=>({key,fingerprint:'a'.repeat(64),direction,base,tax_amount:tax,rate:'21.00',category:direction==='issued'?'output':'domestic',review_required:false,reference:key,description:key,party_name:'Party',date:'2026-01-15',vat_accounts:code?[{id:1,code,description:'VAT account',tax_amount:tax}]:[],...extra});
test('fiscal details separate 477 and 472, keep subaccounts and sum bases and quotas exactly',()=>{
 const sources=[source('sale1','issued','100.00','21.00','47700001'),source('sale2','issued','200.00','42.00','47700002'),source('purchase','received','50.00','10.50','47200001')];
 const model=calculateVatModel(sources,{confirmed_general:true},period),groups=groupVatDetails(model.records);
 assert.deepEqual(groups.map(group=>group.code),['477','472']);assert.equal(groups[0].accounts.length,2);assert.equal(groups[0].totals.base,'300.00');assert.equal(groups[0].totals.tax,'63.00');assert.equal(groups[1].totals.tax,'10.50');assert.equal(groups[1].totals.included,'10.50');
 assert.deepEqual(groups[0].accounts.map(account=>account.totals.tax),['21.00','42.00']);
 const filtered=groupVatDetails(model.records.slice(0,1));assert.equal(filtered[0].totals.tax,'21.00');assert.equal(filtered[0].count,1);
});
test('registered and deductible VAT remain distinct with partial deduction and rectifications',()=>{
 const first=source('purchase','received','100.00','21.00','47200001'),reversal=source('credit','received','-20.00','-4.20','47200001',{category:'input_adjustment'});
 const model=calculateVatModel([first,reversal],{confirmed_general:true,overrides:[{key:first.key,fingerprint:first.fingerprint,category:'domestic',base:first.base,rate:first.rate,deductible_percent:'50.00'}]},period);
 const group=groupVatDetails(model.records).find(group=>group.code==='472');assert.equal(group.totals.base,'80.00');assert.equal(group.totals.tax,'16.80');assert.equal(group.totals.included,'6.30');
});
test('self-assessed VAT appears on both sides while box and result contributions never double count',()=>{
 const row=source('intra','received','100.00','21.00','47200001',{category:'intra',paired_output:true,vat_accounts:[{id:1,code:'47200001',description:'Input VAT',tax_amount:'21.00'},{id:2,code:'47700001',description:'Output VAT',tax_amount:'21.00'}]});
 const model=calculateVatModel([row],{confirmed_general:true},period);
 const output=groupVatDetails(model.records,{box:'27',contributions:model.contributions['27']});assert.deepEqual(output.map(group=>group.code),['477']);assert.equal(output[0].totals.contribution,'21.00');
 const input=groupVatDetails(model.records,{box:'45',contributions:model.contributions['45']});assert.deepEqual(input.map(group=>group.code),['472']);assert.equal(input[0].totals.contribution,'21.00');
 const result=groupVatDetails(model.records,{box:'71',contributions:model.contributions['71']});assert.equal(result[0].totals.contribution,'21.00');assert.equal(result[1].totals.contribution,'-21.00');assert.equal(result.reduce((sum,group)=>sum+vatDetailCents(group.totals.contribution),0n),0n);
});
test('zero-quota operations remain visible and pending tax is not labelled as included in the model',()=>{
 const zero=source('zero','received','100.00','0.00','',{category:'non_deductible',rate:'0.00'}),pending=source('pending','issued','100.00','21.00','47700001',{category:'pending'});
 const model=calculateVatModel([zero,pending],{confirmed_general:true},period),groups=groupVatDetails(model.records);
 assert.deepEqual(groups.map(group=>group.code),['477','472','other']);assert.equal(groups[0].totals.tax,'21.00');assert.equal(groups[0].totals.included,'0.00');assert.equal(groups[2].totals.base,'100.00');
});
test('CSV includes separate blocks, partial sums and exact monetary cells',()=>{
 const model=calculateVatModel([source('sale','issued','100.00','21.00','47700001'),source('purchase','received','50.00','10.50','47200001')],{confirmed_general:true},period),rows=[];
 appendVatDetailCsv(rows,model.records);
 assert.ok(rows.some(row=>row[0]==='477 · IVA repercutido'));assert.ok(rows.some(row=>row[0]==='472 · IVA soportado'));
 const partial=rows.find(row=>row[0]==='Subtotal 47700001');assert.deepEqual(partial[7],{amount:'100.00'});assert.deepEqual(partial[9],{amount:'21.00'});
});
