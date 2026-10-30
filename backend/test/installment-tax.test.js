import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installmentPeriod,normalizeInstallmentTaxInput,calculateInstallmentTax} from '../../shared/installment-tax.js';
const hash='b'.repeat(64),period=(year=2026,payment=1,dates={})=>installmentPeriod({id:1,start_date:year+'-01-01',end_date:year+'-12-31',...dates},{year,period:payment});
const source=extra=>({source_hash:hash,net_result:'100000.00',income_tax_expense:'0.00',credits_473:'99999.00',complete:true,today:'2027-01-01',records:[],...extra});
const input=extra=>({previous_turnover:'500000.00',confirmed:true,reviewed_source_hash:hash,...extra});
const calculate=(value={},data={},p=period())=>calculateInstallmentTax(source(data),input(value),p,{strict:true});
test('202: 40.2 uses 18% of the declared reference without deducting prior instalments',()=>{
 const settings={reference_base:'10000.00',reference_confirmed:true,previous_payments:'800.00',withholdings:'500.00'};
 const april=calculate(settings);assert.equal(april.result,'1800.00');assert.equal(april.boxes['01'],'10000.00');assert.equal(april.provisional,false);
 for(const payment of [2,3])assert.equal(calculate(settings,{},period(2026,payment)).result,'1800.00');
 assert.equal(calculate({...settings,reference_base:'-1.00'}).result,'0.00');assert.equal(calculate({...settings,reference_base:'0.25'}).result,'0.05');
 assert.equal(calculate({...settings,reference_base:'999999999999999999.99'}).result,'180000000000000000.00');
 assert.equal(calculate({reference_base:'0',reference_confirmed:true}).mandatory,false);
 assert.ok(calculate().issues.includes('INSTALLMENT_TAX_REFERENCE_REQUIRED'));
});
test('202: actual calendar cutoffs and noncalendar fiscal periods stay distinct',()=>{
 for(const [payment,to,filing]of [[1,'2026-03-31','2026-04-01'],[2,'2026-09-30','2026-10-01'],[3,'2026-11-30','2026-12-01']]){const value=period(2026,payment);assert.equal(value.to,to);assert.equal(value.filing_from,filing);}
 const fiscal=period(2026,1,{start_date:'2025-07-01',end_date:'2026-06-30'});assert.equal(fiscal.from,'2025-07-01');assert.equal(fiscal.annual.year,2025);assert.equal(fiscal.annual.short,false);
 assert.throws(()=>period(2026,2,{start_date:'2025-07-01',end_date:'2026-06-30'}),{code:'INVALID_INSTALLMENT_TAX_PERIOD'});
 assert.throws(()=>period(2026,4),{code:'INVALID_INSTALLMENT_TAX_PERIOD'});
});
test('202: turnover boundaries, optional census choice and ordinary 5/7 vs 19/20 rates',()=>{
 const normal={method:'40.3',previous_turnover:'6000000.00',regime:'small',option_confirmed:true};
 assert.equal(calculate(normal).result,'16000.00');assert.equal(calculate(normal).required_method,null);
 const required=calculate({...normal,previous_turnover:'6000000.01',option_confirmed:false});assert.equal(required.required_method,'40.3');assert.equal(required.provisional,false);
 assert.ok(calculate({reference_confirmed:true,previous_turnover:'6000000.01'}).issues.includes('INSTALLMENT_TAX_METHOD_REQUIRED'));
 assert.ok(calculate({...normal,option_confirmed:false}).issues.includes('INSTALLMENT_TAX_OPTION_REQUIRED'));
 const large=calculate({method:'40.3',previous_turnover:'10000000.00',regime:'general'});assert.equal(large.brackets[0].rate,'24.00');assert.equal(large.result,'24000.00');assert.equal(large.summary.minimum,'23000.00');assert.equal(large.mandatory,true);
 const below=calculate({...normal,previous_turnover:'9999999.99'});assert.equal(below.brackets[0].rate,'16.00');assert.equal(below.summary.minimum,'0.00');
 const general=calculate({method:'40.3',regime:'patrimonial',option_confirmed:true});assert.equal(general.brackets[0].rate,'17.00');
});
test('202: micro rates, grouping, new entity and the full-year 50k band',()=>{
 const settings={method:'40.3',regime:'micro',option_confirmed:true};
 const value=calculate(settings);assert.equal(value.result,'14000.00');assert.deepEqual(value.brackets.map(row=>row.rate),['13.00','15.00']);assert.equal(value.boxes['19'],'100000.00');assert.equal(value.boxes['26'],'14000.00');
 assert.equal(calculate(settings,{net_result:'50000.00'}).result,'6500.00');
 const old=calculate(settings,{},period(2025));assert.equal(old.result,'15000.00');assert.equal(old.brackets.length,1);
 const noncalendar=calculate(settings,{},period(2026,1,{start_date:'2025-07-01',end_date:'2026-06-30'}));assert.equal(noncalendar.result,'15000.00');
 assert.equal(calculate({method:'40.3',regime:'new',new_entity_eligible:true,option_confirmed:true}).result,'10000.00');
});
test('202: cumulative tax add-back, reviewed credits and minimum deduct only actual previous payments',()=>{
 const settings={method:'40.3',regime:'general',previous_turnover:'12000000.00',withholdings:'10000.00',previous_payments:'2000.00',bonuses:'1000.00'};
 const model=calculate(settings,{net_result:'90000.00',income_tax_expense:'10000.00'});assert.equal(model.boxes['04'],'90000.00');assert.equal(model.boxes['05'],'10000.00');assert.equal(model.boxes['13'],'100000.00');assert.equal(model.summary.gross,'24000.00');assert.equal(model.summary.ordinary,'11000.00');assert.equal(model.summary.minimum,'18700.00');assert.equal(model.result,'18700.00');
 const zero=calculate({...settings,previous_payments:'100000.00'},{net_result:'-500.00'});assert.equal(zero.result,'0.00');assert.equal(zero.boxes['32'],'-111000.00');assert.equal(zero.mandatory,true);
 const ledger=calculate({method:'40.3',regime:'micro',option_confirmed:true},{credits_473:'999999.00'});assert.equal(ledger.result,'14000.00');
});
test('202: loss carryforwards, prior capitalization and leveling have bounded bases',()=>{
 const settings={method:'40.3',regime:'micro',option_confirmed:true,capitalization:'10000.00',losses_available:'20000.00',losses_mode:'maximum',leveling_decrease:'7000.00'};
 const model=calculate(settings);assert.equal(model.boxes['14'],'20000.00');assert.equal(model.boxes['44'],'10000.00');assert.equal(model.boxes['19'],'63000.00');assert.equal(model.result,'8450.00');
 assert.throws(()=>calculate({...settings,leveling_decrease:'7000.01'}),{code:'CORPORATE_TAX_LEVELING_LIMIT'});
 const short=period(2026,1,{start_date:'2026-01-01',end_date:'2026-06-30'});assert.equal(calculate({method:'40.3',regime:'micro',option_confirmed:true}, {},short).result,'14504.11');
});
test('202: stale source, malformed inputs and unsupported cases remain explicit',()=>{
 assert.throws(()=>calculate({confirmed:true,reviewed_source_hash:'c'.repeat(64)}),{code:'CORPORATE_TAX_SOURCE_CHANGED'});
 const row={id:randomUUID(),description:'Multa',direction:'increase',kind:'permanent',amount:'100.00',source_key:'journal:test:1',fingerprint:hash};
 assert.throws(()=>calculate({method:'40.3',adjustments:[row],regime:'micro',option_confirmed:true}),{code:'CORPORATE_TAX_SOURCE_CHANGED'});
 for(const settings of [{method:'40.4'},{reference_base:'1.001'},{bonuses:'-1'},{confirmed:1},{previous_payments:100},{unknown:true}])assert.throws(()=>normalizeInstallmentTaxInput(settings),{code:'INVALID_INSTALLMENT_TAX_INPUT'});
 assert.ok(calculate({special_scope:true}).issues.includes('INSTALLMENT_TAX_SPECIAL_SCOPE'));
 assert.ok(calculate({}, {today:'2026-02-01'}).issues.includes('INSTALLMENT_TAX_PERIOD_IN_PROGRESS'));
});
