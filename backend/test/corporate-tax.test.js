import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {corporateAmount,corporatePeriod,calculateCorporateTax,normalizeCorporateTaxInput} from '../../shared/corporate-tax.js';
const hash='a'.repeat(64),period=year=>corporatePeriod({id:1,start_date:year+'-01-01',end_date:year+'-12-31'});
const source=(extra={})=>({net_result:'100000.00',income_tax_expense:'0.00',credits_473:'0.00',complete:true,source_hash:hash,records:[],today:'2027-01-01',...extra});
const input=(extra={})=>({previous_turnover:'500000.00',confirmed_general:true,reviewed_source_hash:hash,...extra});
const calculate=(settings={},data={},year=2026)=>calculateCorporateTax(source(data),input(settings),period(year),{strict:true});
test('IS: published rates by period start year, entity and exact micro brackets',()=>{
 for(const [year,regime,gross]of [[2024,'general','25000.00'],[2024,'micro','23000.00'],[2025,'micro','21500.00'],[2026,'micro','20000.00'],[2025,'small','24000.00'],[2026,'small','23000.00'],[2026,'new','15000.00'],[2026,'patrimonial','25000.00']]){
  const result=calculate({regime,new_entity_eligible:regime==='new',previous_turnover:regime==='general'?'12000000.00':regime==='small'?'2000000.00':'500000.00'},{},year);assert.equal(result.summary.gross_quota,gross);assert.equal(result.provisional,false);
 }
 assert.equal(calculate({regime:'micro'},{net_result:'50000.00'}).result,'9500.00');
 assert.equal(calculate({regime:'micro'},{net_result:'50000.03'}).result,'9500.01');
 const fiscal=corporatePeriod({start_date:'2025-07-01',end_date:'2026-06-30'});assert.equal(fiscal.year,2025);assert.equal(fiscal.short,false);assert.equal(calculateCorporateTax(source(),input({regime:'micro'}),fiscal).result,'21500.00');
});
test('IS: tax expense add-back, tax income, credits and negative taxable bases',()=>{
 const accrued=calculate({}, {net_result:'75000.00',income_tax_expense:'25000.00',credits_473:'4000.00'});assert.equal(accrued.boxes['00500'],'75000.00');assert.equal(accrued.boxes['00301'],'25000.00');assert.equal(accrued.boxes['00501'],'100000.00');assert.equal(accrued.result,'21000.00');assert.equal(accrued.boxes['01330'],'100000.00');assert.equal(accrued.boxes['00611'],'21000.00');
 const refund=calculate({}, {net_result:'-100.00',credits_473:'500.00'});assert.equal(refund.summary.gross_quota,'0.00');assert.equal(refund.result,'-500.00');assert.equal(refund.result_kind,'refund');assert.equal(refund.losses.generated,'100.00');
 const taxIncome=calculate({}, {net_result:'105000.00',income_tax_expense:'-5000.00'});assert.equal(taxIncome.boxes['00302'],'5000.00');assert.equal(taxIncome.summary.before_tax,'100000.00');
 const manual=calculate({credits_mode:'manual',withholdings:'100.01',payment_1:'200.02',payment_2:'300.03',payment_3:'400.04'},{credits_473:'9999.99'});assert.equal(manual.summary.credits,'1000.10');assert.equal(manual.result,'23999.90');
 assert.equal(calculate({}, {credits_473:'-1.00'}).provisional,true);
});
test('IS: BIN floor, percentage, availability, new-entity exception and reduced periods',()=>{
 const max={losses_mode:'maximum',losses_available:'9000000.00'};
 assert.equal(calculate(max,{net_result:'500000.00'}).losses.applied,'500000.00');
 assert.equal(calculate(max,{net_result:'1200000.00'}).losses.applied,'1000000.00');
 assert.equal(calculate(max,{net_result:'2000000.00'}).losses.applied,'1400000.00');
 assert.equal(calculate({...max,losses_available:'5.01'},{net_result:'2000000.00'}).losses.applied,'5.01');
 assert.equal(calculate({...max,regime:'new',new_entity_eligible:true,new_loss_exception:true},{net_result:'2000000.00'}).losses.applied,'2000000.00');
 // The third positive period may qualify for Art.26.3 even after the 15% rate has expired.
 assert.equal(calculate({...max,regime:'general',previous_turnover:'12000000.00',new_loss_exception:true},{net_result:'2000000.00'}).losses.applied,'2000000.00');
 assert.ok(calculate({...max,regime:'patrimonial',new_loss_exception:true}).issues.includes('CORPORATE_TAX_NEW_LOSS_REVIEW'));
 const short=corporatePeriod({start_date:'2026-01-01',end_date:'2026-06-30'}),result=calculateCorporateTax(source({net_result:'600000.00'}),input(max),short,{strict:true});assert.equal(short.days,181);assert.equal(short.short,true);assert.equal(result.losses.applied,'495890.41');
 assert.throws(()=>calculate({...max,losses_mode:'manual',losses_requested:'1400000.01'},{net_result:'2000000.00'}),{code:'CORPORATE_TAX_LOSSES_LIMIT'});
 const large=calculate({...max,previous_turnover:'25000000.00'},{net_result:'4000000.00'});assert.equal(large.losses.applied,'2000000.00');assert.ok(large.issues.includes('CORPORATE_TAX_SPECIAL_SCOPE'));
});
test('IS: capitalization, leveling and deduction limits are checked before saving',()=>{
 const model=calculate({regime:'micro',capitalization:'25000.00',leveling_decrease:'7500.00',losses_mode:'none',deductions:'3200.00'});assert.equal(model.boxes['00552'],'75000.00');assert.equal(model.summary.tax_base,'67500.00');assert.equal(model.summary.gross_quota,'13175.00');assert.equal(model.summary.liquid_quota,'9975.00');
 assert.equal(calculate({regime:'new',new_entity_eligible:true,capitalization:'25000.00'}).summary.tax_base,'75000.00');
 for(const [settings,code]of [[{capitalization:'25000.01'},'CAPITALIZATION'],[{regime:'small',leveling_decrease:'10000.01'},'LEVELING'],[{deductions:'6250.01'},'DEDUCTIONS'],[{double_tax_relief:'25000.01'},'RELIEF'],[{bonuses:'25000.01'},'BONUS']])assert.throws(()=>calculate(settings),{code:'CORPORATE_TAX_'+code+'_LIMIT'});
 assert.equal(calculate({deduction_limit:'50',enhanced_deduction_eligible:true,deductions:'12500.00'}).result,'12500.00');
 assert.equal(calculate({deduction_limit:'50'}).provisional,true);
 assert.equal(calculate({regime:'new'}).provisional,true);
 assert.equal(calculate({regime:'micro',previous_turnover:'1000000.00'}).provisional,true);
 assert.ok(calculate({regime:'general',previous_turnover:'500000.00'}).issues.includes('CORPORATE_TAX_REGIME_TURNOVER'));
 assert.ok(calculate({regime:'small',previous_turnover:'500000.00'}).issues.includes('CORPORATE_TAX_REGIME_TURNOVER'));
});
test('IS: short-period micro bracket is prorated before rounding the final tax',()=>{
 const short=corporatePeriod({start_date:'2026-01-01',end_date:'2026-06-30'}),model=calculateCorporateTax(source(),input({regime:'micro'}),short,{strict:true});assert.equal(model.result,'20504.11');assert.equal(model.brackets[0].base,'24794.52');
 const leap=corporatePeriod({start_date:'2024-01-01',end_date:'2024-12-31'});assert.equal(leap.days,366);assert.equal(leap.short,false);
 for(const dates of [['2026-02-30','2026-12-31'],['2026-01-01','2027-01-01'],['2026-12-31','2026-01-01']])assert.throws(()=>corporatePeriod({start_date:dates[0],end_date:dates[1]}),{code:'INVALID_CORPORATE_TAX_PERIOD'});
});
test('IS: stale evidence cannot silently reuse adjustments or a reviewed source',()=>{
 const row={id:randomUUID(),description:'Non-deductible penalty',amount:'100.00',direction:'increase',kind:'permanent',source_key:'journal:example:1',fingerprint:hash},record={key:row.source_key,fingerprint:hash,is_income_tax:false};
 assert.equal(calculate({adjustments:[row]},{records:[record]}).summary.adjusted_base,'100100.00');
 assert.throws(()=>calculate({adjustments:[row]},{records:[]}),{code:'CORPORATE_TAX_SOURCE_CHANGED'});
 const stale=calculateCorporateTax(source(),input({adjustments:[row]}),period(2026));assert.equal(stale.summary.adjusted_base,'100000.00');assert.deepEqual(stale.stale_adjustments,[row.id]);assert.equal(stale.provisional,true);
 assert.throws(()=>calculate({},{source_hash:'b'.repeat(64)}),{code:'CORPORATE_TAX_SOURCE_CHANGED'});
 assert.throws(()=>calculate({adjustments:[row]},{records:[{...record,is_income_tax:true}]}),{code:'CORPORATE_TAX_DUPLICATE_TAX_ADJUSTMENT'});
 assert.ok(calculate({}, {today:'2026-10-30'}).issues.includes('CORPORATE_TAX_PERIOD_IN_PROGRESS'));
});
test('IS: all amounts remain exact beyond Number precision and malformed inputs fail',()=>{
 assert.equal(corporateAmount('999999999999999999.99'),99999999999999999999n);
 assert.equal(calculate({}, {net_result:'999999999999999999.99'}).result,'250000000000000000.00');
 assert.equal(normalizeCorporateTaxInput({payment_1:'1,2'}).payment_1,'1.20');
 for(const settings of [{payment_1:1},{payment_1:'1.001'},{payment_1:'-1.00'},{unknown:true},{deduction_limit:'100'},{regime:'invalid'}])assert.throws(()=>normalizeCorporateTaxInput(settings),{code:'INVALID_CORPORATE_TAX_INPUT'});
});
