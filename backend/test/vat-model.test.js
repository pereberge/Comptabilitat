import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {vatPeriod,calculateVatModel,normalizeVatInput} from '../../shared/vat-model.js';
import {invoiceVatSources,journalVatSources} from '../src/services/vat-sources.js';

const period=vatPeriod({year:'2026',frequency:'quarterly',period:'1'});
const source=(extra={})=>({key:randomUUID(),fingerprint:'a'.repeat(64),direction:'issued',base:'100.00',tax_amount:'21.00',rate:'21.00',category:'output',review_required:false,...extra});
const review=row=>({key:row.key,fingerprint:row.fingerprint,category:row.category,base:row.base,rate:row.rate,deductible_percent:'100.00'});
test('VAT periods use calendar months, quarters, leap years and strict filters',()=>{
 assert.equal(period.from,'2026-01-01');assert.equal(period.to,'2026-03-31');assert.equal(period.code,'1T');
 assert.equal(vatPeriod({year:'2024',frequency:'monthly',period:'2'}).to,'2024-02-29');
 assert.equal(vatPeriod({year:2026,frequency:'monthly',period:12}).code,'12');
 for(const input of [{year:'2026x',frequency:'monthly',period:'1'},{year:2026,frequency:'quarterly',period:5},{year:2026,frequency:'monthly',period:0},{year:2026,frequency:'monthly',period:13},{year:2026,frequency:[],period:1}])assert.throws(()=>vatPeriod(input),{code:'INVALID_VAT_PERIOD'});
});
test('ordinary VAT totals retain exact cents and all box contributions reconcile',()=>{
 const sources=[source(),source({base:'200.00',tax_amount:'20.00',rate:'10.00'}),source({base:'100.00',tax_amount:'4.00',rate:'4.00'}),source({direction:'received',base:'50.00',tax_amount:'10.50',category:'domestic'})];
 const model=calculateVatModel(sources,{confirmed_general:true},period);
 assert.equal(model.boxes['07'],'100.00');assert.equal(model.boxes['27'],'45.00');assert.equal(model.boxes['28'],'50.00');assert.equal(model.boxes['45'],'10.50');assert.equal(model.result,'34.50');assert.equal(model.provisional,false);
 for(const box of ['27','45','46','64','66','71'])assert.equal(model.contributions[box].reduce((sum,row)=>sum+BigInt(row.amount.replace('.','')),0n),BigInt(model.boxes[box].replace('.','')));
});
test('deductible VAT supports partial deduction and zero-rate purchases do not inflate bases',()=>{
 const row=source({direction:'received',category:'domestic',base:'100.00',tax_amount:'21.01'}),zero=source({direction:'received',category:'domestic',base:'1000.00',rate:'0.00',tax_amount:'0.00'});
 const model=calculateVatModel([row,zero],{confirmed_general:true,overrides:[{...review(row),deductible_percent:'50.00'}]},period);
 assert.equal(model.boxes['28'],'100.00');assert.equal(model.boxes['29'],'10.51');assert.equal(model.result,'-10.51');
});
test('acquisitions account for accrued and deductible tax once and trace the net result',()=>{
 const row=source({direction:'received',category:'intra',paired_output:true});
 const model=calculateVatModel([row],{confirmed_general:true},period);
 assert.equal(model.boxes['10'],'100.00');assert.equal(model.boxes['11'],'21.00');assert.equal(model.boxes['36'],'100.00');assert.equal(model.boxes['37'],'21.00');assert.equal(model.result,'0.00');assert.deepEqual(model.contributions['46'],[{key:row.key,amount:'0.00'}]);
});
test('zero-rate intracommunity acquisitions declare accrued bases without deductible bases',()=>{
 const row=source({direction:'received',category:'intra',rate:'0.00',tax_amount:'0.00'});
 const model=calculateVatModel([row],{confirmed_general:true},period);
 assert.equal(model.boxes['10'],'100.00');assert.equal(model.boxes['11'],'0.00');assert.equal(model.boxes['36'],undefined);assert.equal(model.boxes['37'],undefined);assert.equal(model.result,'0.00');
});
test('rectifications preserve signs and compensation is limited to the positive result',()=>{
 const rows=[source(),source({base:'-10.00',tax_amount:'-2.10',category:'output_adjustment'}),source({direction:'received',category:'input_adjustment',base:'-10.00',tax_amount:'-2.10'})];
 let model=calculateVatModel(rows,{compensation_pending:'100.00',apply_compensation:true},period);
 assert.equal(model.boxes['14'],'-10.00');assert.equal(model.boxes['15'],'-2.10');assert.equal(model.boxes['41'],'-2.10');assert.equal(model.boxes['78'],'21.00');assert.equal(model.boxes['87'],'79.00');assert.equal(model.result,'0.00');
 assert.equal(model.contributions['71'].reduce((sum,row)=>sum+BigInt(row.amount.replace('.','')),0n),0n);
 assert.ok(model.contributions['71'].some(row=>row.key==='manual:compensation'&&row.amount==='-21.00'));
 model=calculateVatModel([source({direction:'received',category:'domestic'})],{compensation_pending:'50.00',apply_compensation:true},period);
 assert.equal(model.boxes['78'],'0.00');assert.equal(model.boxes['87'],'50.00');assert.equal(model.result,'-21.00');
});
test('pending and unreviewed sources cannot be mistaken for a complete declaration',()=>{
 const pending=source({category:'pending'}),unreviewed=source({review_required:true});
 const model=calculateVatModel([pending,unreviewed],{confirmed_general:true},period);
 assert.equal(model.pending_count,1);assert.equal(model.unreviewed_count,1);assert.equal(model.result,'21.00');assert.equal(model.provisional,true);
 assert.equal(calculateVatModel([],{},period).provisional,true);
 assert.equal(calculateVatModel([],{confirmed_general:true},{year:2018}).provisional,true);
});
test('changed and removed source evidence invalidates stored reviews',()=>{
 const row=source({review_required:true}),input={confirmed_general:true,overrides:[review(row)]};
 assert.equal(calculateVatModel([row],input,period).provisional,false);
 const changed={...row,fingerprint:'b'.repeat(64)};
 assert.deepEqual(calculateVatModel([changed],input,period).stale_keys,[row.key]);
 assert.throws(()=>calculateVatModel([changed],input,period,{strict:true}),{code:'VAT_SOURCE_CHANGED'});
 assert.throws(()=>calculateVatModel([],input,period,{strict:true}),{code:'VAT_SOURCE_CHANGED'});
});
test('invalid percentages, categories, duplicate reviews, directions and impossible rates are rejected',()=>{
 const row=source();
 for(const override of [{...review(row),deductible_percent:'100.01'},{...review(row),category:'__proto__'},{...review(row),category:'domestic'},{...review(row),rate:'10.00'}])assert.throws(()=>calculateVatModel([row],{overrides:[override]},period),{code:'INVALID_VAT_INPUT'});
 assert.throws(()=>normalizeVatInput({overrides:[review(row),review(row)]}),{code:'INVALID_VAT_INPUT'});
 assert.throws(()=>normalizeVatInput({compensation_pending:'-1.00'}),{code:'INVALID_VAT_INPUT'});
});
const invoice=(extra={})=>({invoice_id:1,request_id:randomUUID(),exercise_id:1,direction:'issued',reference:'F-1',invoice_date:'2026-01-15',posting_date:'2026-02-01',party_name:'Customer',party_tax_id:'',entry_id:1,void_entry_id:null,void_date:null,offset_code:'70000000',position:1,description:'Sale',base:'100.00',tax_rate:'21.00',tax_amount:'21.00',...extra});
test('invoice source dates distinguish accrual from purchase registration and split later cancellations',()=>{
 const january=vatPeriod({year:2026,frequency:'monthly',period:1}),february=vatPeriod({year:2026,frequency:'monthly',period:2}),march=vatPeriod({year:2026,frequency:'monthly',period:3});
 const sale=invoice({void_date:'2026-03-01',void_entry_id:2,void_status:'posted'});
 assert.equal(invoiceVatSources([sale],january).length,1);assert.equal(invoiceVatSources([sale],february).length,0);
 const cancelled=invoiceVatSources([sale],march)[0];assert.equal(cancelled.base,'-100.00');assert.equal(cancelled.tax_amount,'-21.00');assert.equal(cancelled.category,'output_adjustment');assert.equal(cancelled.review_required,true);
 const received=invoice({direction:'received',offset_code:'60000000'});assert.equal(invoiceVatSources([received],january).length,0);assert.equal(invoiceVatSources([received],february).length,1);
});
const journal=(extra={})=>({entry_id:1,entry_request_id:'11111111-1111-1111-1111-111111111111',exercise_id:1,number:1,entry_date:'2026-01-15',entry_description:'Purchase',source_entry_reference:null,position:1,description:'Purchase',debit:'100.00',credit:'0.00',code:'60000000',account_description:'Purchases',...extra});
test('imported journal VAT infers exact bases and requires human confirmation',()=>{
 const rows=[journal(),journal({position:2,code:'47200000',debit:'21.00'}),journal({position:3,code:'40000001',debit:'0.00',credit:'121.00',account_description:'Supplier'})];
 const {sources}=journalVatSources(rows);assert.equal(sources.length,1);assert.equal(sources[0].base,'100.00');assert.equal(sources[0].rate,'21.00');assert.equal(sources[0].category,'domestic');assert.equal(sources[0].review_required,true);
 const remapped=journalVatSources(rows.map(row=>({...row,entry_id:900,exercise_id:900}))).sources[0];assert.equal(remapped.key,sources[0].key);assert.equal(remapped.fingerprint,sources[0].fingerprint);
 const changed=journalVatSources(rows.map(row=>({...row,description:'Updated'}))).sources[0];assert.notEqual(changed.fingerprint,sources[0].fingerprint);
});
test('ambiguous journal splits and investment purchases stay pending',()=>{
 const split=[journal(),journal({position:2,code:'47200001',debit:'10.00'}),journal({position:3,code:'47200002',debit:'11.00'})];
 assert.ok(journalVatSources(split).sources.every(row=>row.category==='pending'));
 const investment=[journal({code:'21300000'}),journal({position:2,code:'47200000',debit:'21.00'})];assert.equal(journalVatSources(investment).sources[0].category,'pending');
});
test('customer and supplier journals without VAT lines remain visible for zero-rate or exemption review',()=>{
 const sale=[journal({code:'70000000',debit:'0.00',credit:'100.00'}),journal({position:2,code:'43000001',debit:'100.00',credit:'0.00'})];
 const [issued]=journalVatSources(sale).sources;assert.equal(issued.category,'pending');assert.equal(issued.base,'100.00');assert.equal(issued.tax_amount,'0.00');
 const purchase=[journal(),journal({position:2,code:'40000001',debit:'0.00',credit:'100.00'})];
 const [received]=journalVatSources(purchase).sources;assert.equal(received.category,'non_deductible');assert.equal(received.review_required,true);
 const payroll=[journal({code:'64000000'}),journal({position:2,code:'46500000',debit:'0.00',credit:'100.00'})];assert.equal(journalVatSources(payroll).sources.length,0);
});
test('VAT settlements are excluded and self-assessed journal pairs are represented once',()=>{
 const settlement=[journal({code:'47700000',debit:'21.00'}),journal({position:2,code:'47500000',debit:'0.00',credit:'21.00'})];
 const ignored=journalVatSources(settlement);assert.equal(ignored.sources.length,0);assert.equal(ignored.settlements.length,1);
 const pair=[journal(),journal({position:2,code:'47200000',debit:'21.00'}),journal({position:3,code:'47700000',debit:'0.00',credit:'21.00'}),journal({position:4,code:'40000001',debit:'0.00',credit:'100.00'})];
 const {sources}=journalVatSources(pair);assert.equal(sources.length,1);assert.equal(sources[0].paired_output,true);assert.equal(sources[0].category,'pending');
});
