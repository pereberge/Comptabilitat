import test from 'node:test';
import assert from 'node:assert/strict';
import {reconciliationConcept,findReconciliationRule,scaleReconciliationCounterLines,reconciliationProposal} from '../../shared/reconciliation-proposals.js';
import {buildBankAnalysis} from '../src/services/bank-analysis.js';
import {validateBankRows} from '../src/services/bank-statement.js';
const bank={id:1,code:'57200001',kind:'subaccount',description:'Bank'},principal={id:2,code:'17000001',kind:'subaccount',description:'Loan'},interest={id:3,code:'66200001',kind:'subaccount',description:'Interest'},accounts=[bank,principal,interest];
const split=[{account_id:2,debit:'80.00',credit:'0.00'},{account_id:3,debit:'20.00',credit:'0.00'}];
test('remembered splits scale variable amounts with exact cents and deterministic rounding',()=>{
 assert.deepEqual(scaleReconciliationCounterLines(split,'-100.00','-250.00'),[{account_id:2,debit:'200.00',credit:'0.00'},{account_id:3,debit:'50.00',credit:'0.00'}]);
 const half=[{account_id:2,debit:'0.01',credit:'0.00'},{account_id:3,debit:'0.01',credit:'0.00'}];assert.deepEqual(scaleReconciliationCounterLines(half,'-0.02','-0.01'),[{account_id:2,debit:'0.01',credit:'0.00'}]);
 const mixed=[{account_id:2,debit:'120.00',credit:'0.00'},{account_id:3,debit:'0.00',credit:'20.00'}];assert.deepEqual(scaleReconciliationCounterLines(mixed,'-100.00','-50.00'),[{account_id:2,debit:'60.00',credit:'0.00'},{account_id:3,debit:'0.00',credit:'10.00'}]);
 assert.throws(()=>scaleReconciliationCounterLines(split,'-100.00','100.00'));
 assert.throws(()=>scaleReconciliationCounterLines([{account_id:2,debit:'1.00',credit:'0.01'}],'-0.99','-1.00'));
 assert.throws(()=>scaleReconciliationCounterLines([{account_id:2,debit:'9999999999999.99',credit:'0.00'},{account_id:3,debit:'0.00',credit:'9999999999999.98'}],'-0.01','-2.00'));
});
test('criteria normalize accents, respect direction and words, and favor the most specific text',()=>{
 assert.equal(reconciliationConcept('  càrrec · Neteja  '),'CARREC NETEJA');
 const rules=[{id:1,concept_key:'NETEJA',direction:'out'},{id:2,concept_key:'NETEJA LOCAL',direction:'out'},{id:3,concept_key:'NETEJA LOCAL',direction:'in'}];
 assert.equal(findReconciliationRule(rules,'Pagament Neteja Local octubre','-10.00').rule.id,2);assert.equal(findReconciliationRule(rules,'Abonament Neteja Local','10.00').rule.id,3);assert.equal(findReconciliationRule(rules,'NETEJADORA','-10.00').rule,null);
 assert.equal(findReconciliationRule([{concept_key:'ALFA BETA',direction:'out'},{concept_key:'BETA ALFA',direction:'out'}],'ALFA BETA ALFA','-10.00').ambiguous,true);
});
test('manual choices and saved criteria create balanced loan proposals before generic unresolved classification',()=>{
 const rows=[{id:1,date:'2026-01-10',value_date:'2026-01-10',concept:'PRESTEC FINANCERA gener',amount:'-100.00',balance:'900.00',page:1},{id:2,date:'2026-01-20',value_date:'2026-01-20',concept:'PRESTEC FINANCERA febrer',amount:'-200.00',balance:'700.00',page:1}],statement=validateBankRows(rows,{bank:{name:'Bank'},pages:1,mime:'text/csv'});
 const rule={id:1,concept:'PRESTEC FINANCERA',concept_key:'PRESTEC FINANCERA',direction:'out',bank_amount:'-100.00',counter_lines:split};
 const data=buildBankAnalysis({company:{id:1,name:'Test'},exercise:{id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'},account:bank,accounts,statement,lines:[],history:[],sourceName:'test.csv',sourceHash:'a'.repeat(64),rules:[rule],manualProposals:[{movement_id:1,date:rows[0].date,concept:'Manual custom concept',bank_amount:'-100.00',counter_lines:[{account_id:2,debit:'90.00',credit:'0.00'},{account_id:3,debit:'10.00',credit:'0.00'}]}]});
 assert.equal(data.proposals.length,2);assert.equal(data.unresolved.length,0);assert.equal(data.proposals[0].source,'manual');assert.equal(data.proposals[0].concept,'Manual custom concept');assert.equal(data.proposals[1].source,'saved_rule');assert.equal(data.proposals[1].concept,rows[1].concept);assert.equal(data.proposals[1].lines[0].debit,'160.00');
 assert.equal(reconciliationProposal(rows[0],rule,bank,[bank]),null);
});
