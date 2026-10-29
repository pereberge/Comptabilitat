import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateVatModel,vatPeriod} from '../../shared/vat-model.js';
import {calculateVatSettlement} from '../src/services/vat-settlement.js';
const period=vatPeriod({year:2026,frequency:'quarterly',period:1});
const source=(direction,base,tax,extra={})=>({key:direction,fingerprint:'a'.repeat(64),direction,base,tax_amount:tax,rate:'21.00',category:direction==='issued'?'output':'domestic',review_required:false,...extra});
function fixture({output='210.00',input='105.00',compensation='0.00',balance='100.00'}={}){
 const sources=[];if(output!=='0.00')sources.push(source('issued','1000.00',output));if(input!=='0.00')sources.push(source('received',input==='210.00'?'1000.00':'500.00',input));
 const model={...calculateVatModel(sources,{confirmed_general:true,compensation_pending:compensation,apply_compensation:compensation!=='0.00'},period),period,company:{id:1,name:'Company'},settlements:[]};
 return {model,data:{vatAccounts:[{id:11,code:'47700021',description:'Output VAT',debit:'0.00',credit:output},{id:12,code:'47200021',description:'Input VAT',debit:input,credit:'0.00'}],treasuryAccounts:[{id:21,code:'47500001',description:'HP acreedora IVA',balance:'0.00'},{id:22,code:'47000001',description:'HP deudora IVA',balance}],exercise:{id:5,name:'2026',status:'open'}}};
}
test('settlement debits every 477 subaccount, credits 472 and posts the payable to the real 4750',()=>{
 const {model,data}=fixture(),proposal=calculateVatSettlement(model,data);
 assert.equal(proposal.ready,true);assert.equal(proposal.date,'2026-03-31');assert.deepEqual(proposal.lines.map(line=>[line.code,line.debit,line.credit]),[['47700021','210.00','0.00'],['47200021','0.00','105.00'],['47500001','0.00','105.00']]);assert.equal(proposal.totals.debit,proposal.totals.credit);
});
test('previous compensation credits 4700 and reduces 4750 without touching the bank',()=>{
 const {model,data}=fixture({compensation:'50.00'}),proposal=calculateVatSettlement(model,data);
 assert.equal(proposal.result,'55.00');assert.equal(proposal.ready,true);assert.ok(proposal.lines.some(line=>line.code==='47000001'&&line.credit==='50.00'));assert.ok(proposal.lines.some(line=>line.code==='47500001'&&line.credit==='55.00'));assert.ok(proposal.lines.every(line=>!line.code.startsWith('57')));assert.equal(proposal.totals.debit,proposal.totals.credit);
 const insufficient=calculateVatSettlement(model,{...data,treasuryAccounts:data.treasuryAccounts.map(account=>({...account,balance:'0.00'}))});assert.equal(insufficient.ready,false);assert.ok(insufficient.issues.some(issue=>issue.code==='VAT_SETTLEMENT_COMPENSATION_BALANCE'));
});
test('credit VAT debits 4700 and an exactly offset period needs no treasury line',()=>{
 const {model,data}=fixture({output:'0.00'}),credit=calculateVatSettlement(model,data);
 assert.equal(credit.ready,true);assert.ok(credit.lines.some(line=>line.code==='47000001'&&line.debit==='105.00'));
 const equal=fixture({input:'210.00'}),zero=calculateVatSettlement(equal.model,equal.data);assert.equal(zero.lines.length,2);assert.equal(zero.ready,true);assert.deepEqual(zero.required_accounts,[]);
});
test('partial deduction or fiscal/book date differences cannot silently produce a liquidation entry',()=>{
 const {model,data}=fixture();const partial={...model,total_deductible:'52.50'};
 const proposal=calculateVatSettlement(partial,data);assert.equal(proposal.comparison.input_difference,'52.50');assert.equal(proposal.lines.length,0);assert.equal(proposal.ready,false);assert.ok(proposal.issues.some(issue=>issue.code==='VAT_SETTLEMENT_DIFFERENCE'));
 const missing=calculateVatSettlement(model,{...data,vatAccounts:[]});assert.equal(missing.comparison.output_difference,'-210.00');assert.equal(missing.lines.length,0);
});
test('retention accounts under 4750 are not proposed and ambiguous choices require an eligible company account',()=>{
 const {model,data}=fixture(),retention={id:30,code:'47500000',description:'RETENCIONS MODEL 111',balance:'0.00'};
 const proposal=calculateVatSettlement(model,{...data,treasuryAccounts:[retention,...data.treasuryAccounts]});assert.equal(proposal.selected_accounts['4750'],21);assert.equal(proposal.account_candidates['4750'].find(account=>account.id===30).eligible,false);
 assert.throws(()=>calculateVatSettlement(model,{...data,treasuryAccounts:[retention,...data.treasuryAccounts]},{payable_account_id:30}),{code:'INVALID_VAT_SETTLEMENT_ACCOUNT'});
 const other={id:31,code:'47500002',description:'Otra cuenta IVA',balance:'0.00'},ambiguous=calculateVatSettlement(model,{...data,treasuryAccounts:[...data.treasuryAccounts,other]});assert.equal(ambiguous.ready,false);assert.equal(ambiguous.selected_accounts['4750'],null);
 assert.equal(calculateVatSettlement(model,{...data,treasuryAccounts:[...data.treasuryAccounts,other]},{payable_account_id:31}).selected_accounts['4750'],31);
 assert.throws(()=>calculateVatSettlement(model,data,{payable_account_id:999}),{code:'INVALID_VAT_SETTLEMENT_ACCOUNT'});
});
test('unreviewed models, existing liquidation, missing accounts and closed exercises remain explicit',()=>{
 const {model,data}=fixture();
 const reviewed=calculateVatSettlement({...model,provisional:true,settlements:[{entry_id:100,number:3,date:period.to}]},{...data,exercise:{...data.exercise,status:'closed'}});
 assert.equal(reviewed.ready,false);for(const code of ['VAT_SETTLEMENT_REVIEW','VAT_SETTLEMENT_EXISTS','VAT_SETTLEMENT_CLOSED'])assert.ok(reviewed.issues.some(issue=>issue.code===code));
 const missing=calculateVatSettlement(model,{...data,treasuryAccounts:[]});assert.equal(missing.lines.at(-1).account_id,null);assert.equal(missing.lines.at(-1).code,'4750');assert.equal(missing.ready,false);
});
test('zero-net accounts never create a dummy zero-amount journal',()=>{
 const {model,data}=fixture({output:'0.00',input:'0.00'}),proposal=calculateVatSettlement(model,data);assert.equal(proposal.lines.length,0);assert.equal(proposal.empty,true);assert.equal(proposal.ready,false);
});
test('negative VAT adjustments reverse the account side and keep the credit settlement balanced',()=>{
 const {model,data}=fixture();const sources=[source('issued','-100.00','-21.00',{category:'output_adjustment'}),source('received','50.00','10.50')];
 const adjusted={...model,...calculateVatModel(sources,{confirmed_general:true},period)};
 const accounts=[{id:11,code:'47700021',description:'Output VAT correction',debit:'21.00',credit:'0.00'},{id:12,code:'47200021',description:'Input VAT',debit:'10.50',credit:'0.00'}];
 const proposal=calculateVatSettlement(adjusted,{...data,vatAccounts:accounts});assert.equal(proposal.ready,true);assert.deepEqual(proposal.lines.map(line=>[line.code,line.debit,line.credit]),[['47700021','0.00','21.00'],['47200021','0.00','10.50'],['47000001','31.50','0.00']]);assert.equal(proposal.totals.debit,proposal.totals.credit);
});
