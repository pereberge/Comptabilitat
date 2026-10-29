import test from 'node:test';
import assert from 'node:assert/strict';
import {bankHistorySuggestions} from '../src/services/bank-history-suggestions.js';
const bank={id:1,code:'57200005',description:'Cajamar',kind:'subaccount'},cost={id:2,code:'62500003',description:'GASTOS RODA',kind:'subaccount'},partner={id:3,code:'55100000',description:'C/C SOCIS',kind:'subaccount'},rent={id:4,code:'70000003',description:'LLOGUER PIS RODA',kind:'subaccount'},interest={id:5,code:'76900001',description:'INT CAJAMAR',kind:'subaccount'},withholding={id:6,code:'47300001',description:'RETENCIONS',kind:'subaccount'},accounts=[bank,cost,partner,rent,interest,withholding];
function groupedHistory(){
 const lines=[];let position=0;
 for(const [account,description,amount,direction]of [[cost,'ibi parking','11.07','out'],[cost,'ibi pis','95.03','out'],[partner,'basures','52.20','in'],[rent,'lloguer abril','372.50','in'],[interest,'interesos','1550.68','in'],[withholding,'ret interesos','294.63','out']]){
  const common={entry_id:51,number:51,entry_date:'2026-04-15',status:'posted',entry_type:'normal',description,entry_description:'Moviments agrupats'};
  lines.push({...common,position:++position,code:account.code,debit:direction==='out'?amount:'0.00',credit:direction==='in'?amount:'0.00'});
  lines.push({...common,position:++position,code:bank.code,debit:direction==='in'?amount:'0.00',credit:direction==='out'?amount:'0.00'});
 }
 return lines;
}
test('history finds individual counterparts inside grouped entries with Catalan and Spanish concepts',()=>{
 const suggest=bankHistorySuggestions(groupedHistory(),bank,accounts);
 for(const [concept,amount,expected]of [['TRANSFERENCIA RECIBIDA BASURA SEPT','52.20',partner.id],['TRANSFERENCIA RECIBIDA ALQUILER OCTUBRE','372.50',rent.id],['RECIBO RODA DE BERA','-11.08',cost.id],['RECIBO RODA DE BERA','-95.04',cost.id],['INTRS.ACREEDORES 2026091520261015','848.04',interest.id],['I.R.C. 2026091520261015','-161.13',withholding.id]]){
  const idea=suggest({id:1,date:'2026-10-15',concept,amount});assert.ok(idea,concept);assert.equal(idea.source,'history');assert.equal(idea.history_number,51);assert.equal(idea.history_date,'2026-04-15');assert.equal(idea.lines.find(line=>line.account_id!==bank.id).account_id,expected);assert.equal(idea.bank_effect,amount);
 }
});
test('an idea needs concept evidence and does not resolve conflicting accounts or other bank history',()=>{
 const history=groupedHistory(),other={id:7,code:'70000008',description:'LLOGUER PIS CAMBRILS',kind:'subaccount'};
 const duplicated=history.filter(line=>line.description==='lloguer abril').map(line=>({...line,entry_id:80,number:80,code:line.code===rent.code?other.code:line.code}));
 const suggest=bankHistorySuggestions([...history,...duplicated],bank,[...accounts,other]);assert.equal(suggest({id:1,date:'2026-10-15',concept:'ALQUILER OCTUBRE',amount:'372.50'}),null);
 assert.equal(suggest({id:2,date:'2026-10-15',concept:'TRANSFERENCIA RECIBIDA',amount:'52.20'}),null);
 assert.equal(bankHistorySuggestions(history.map(line=>({...line,status:'cancelled'})),bank,accounts)({id:2,date:'2026-10-15',concept:'BASURA',amount:'52.20'}),null);
 assert.equal(bankHistorySuggestions(history,{...bank,id:99,code:'57200099'},accounts)({id:2,date:'2026-10-15',concept:'BASURA',amount:'52.20'}),null);
 assert.equal(bankHistorySuggestions(history,bank,accounts)({id:2,date:'2026-01-01',concept:'BASURA',amount:'52.20'}),null);
});
test('a single bank movement can suggest the complete historical split while preserving exact totals',()=>{
 const history=[{entry_id:1,number:1,entry_date:'2026-01-01',status:'posted',entry_type:'normal',position:1,code:bank.code,description:'SERVEI LOCAL',debit:'0.00',credit:'100.00'},{entry_id:1,number:1,entry_date:'2026-01-01',status:'posted',entry_type:'normal',position:2,code:cost.code,description:'SERVEI LOCAL',debit:'80.00',credit:'0.00'},{entry_id:1,number:1,entry_date:'2026-01-01',status:'posted',entry_type:'normal',position:3,code:withholding.code,description:'SERVEI LOCAL',debit:'20.00',credit:'0.00'}];
 const idea=bankHistorySuggestions(history,bank,accounts)({id:1,date:'2026-10-15',concept:'SERVEI LOCAL OCTUBRE',amount:'-50.00'});assert.equal(idea.lines[0].debit,'40.00');assert.equal(idea.lines[1].debit,'10.00');assert.equal(idea.lines[2].credit,'50.00');assert.match(idea.basis,/Repartiment orientatiu/);
});
test('entry descriptions provide evidence when a bank line only contains generic text',()=>{
 const history=[{entry_id:10,number:10,entry_date:'2026-01-01',status:'posted',entry_type:'normal',position:1,code:bank.code,description:'MOVIMIENTO',entry_description:'ALQUILER GENER',debit:'372.50',credit:'0.00'},{entry_id:10,number:10,entry_date:'2026-01-01',status:'posted',entry_type:'normal',position:2,code:rent.code,description:'LLOGUER GENER',entry_description:'ALQUILER GENER',debit:'0.00',credit:'372.50'}];
 const idea=bankHistorySuggestions(history,bank,accounts)({id:1,date:'2026-10-15',concept:'ALQUILER OCTUBRE',amount:'372.50'});assert.equal(idea.history_number,10);assert.equal(idea.lines[1].account_id,rent.id);
});
