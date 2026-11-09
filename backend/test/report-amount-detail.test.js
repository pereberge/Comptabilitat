import test from 'node:test';
import assert from 'node:assert/strict';
import {buildBalanceSheet} from '../src/services/balance-sheet.js';
import {buildProfitLoss} from '../src/services/profit-loss.js';
import {balanceDetailSections} from '../../frontend/src/services/balance-detail.js';
import {reportAmountRows,buildReportAmountDetail,reportDetailLedgerQuery} from '../../frontend/src/services/report-amount-detail.js';
const company={id:19,name:'Detail company'};
const exercise=year=>({id:year,name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
const row=(id,parent_code,closing,code=parent_code+'00001')=>({id,code,parent_code,description:'Subaccount '+code,parent_description:'Account '+parent_code,closing,debit:closing.startsWith('-')?'0.00':closing,credit:closing.startsWith('-')?closing.slice(1):'0.00'});
function balance(year=2026,offset=0){return buildBalanceSheet({company,exercise:exercise(year),from:year+'-01-01',to:year+'-10-31',exclude_closing:true,rows:[row(offset+1,'572','200.00'),row(offset+2,'100','-120.00'),row(offset+3,'129','-30.00'),row(offset+4,'600','10.00'),row(offset+5,'700','-60.00')],checks:{differences:{closing:'0.00'}}});}
function profit(year=2026,offset=0){return buildProfitLoss({company,exercise:exercise(year),from:year+'-03-01',to:year+'-10-31',rows:[row(offset+4,'600','10.00'),row(offset+5,'700','60.00'),row(offset+6,'662','5.00'),row(offset+7,'630','2.00')].map(item=>({...item,debit:item.parent_code==='700'?'0.00':item.closing,credit:item.parent_code==='700'?item.closing:'0.00'}))});}
function allNodes(nodes){return nodes.flatMap(node=>[node,...allNodes(node.children)]);}
test('each balance heading resolves exactly its contributing subaccounts without double counting',()=>{
 const sheet=balance(),before=JSON.stringify(sheet);
 for(const node of allNodes(sheet.sections)){const detail=buildReportAmountDetail([sheet],{kind:'node',id:node.id});assert.equal(detail.total,node.amount,node.label);assert.equal(new Set(detail.rows.map(row=>row.code)).size,detail.rows.length);}
 assert.equal(JSON.stringify(sheet),before);
});
test('balance side totals, discrepancy, booked result and residual retain their financial signs',()=>{
 const sheet=balance();for(const key of ['assets','equity_liabilities','difference'])assert.equal(buildReportAmountDetail([sheet],{kind:'total',key}).total,sheet.totals[key]);
 for(const key of ['total','booked_129','residual_6_7'])assert.equal(buildReportAmountDetail([sheet],{kind:'result',key}).total,sheet.result[key]);
 const difference=reportAmountRows(sheet,{kind:'total',key:'difference'});assert.equal(difference.find(row=>row.parent_code==='100').amount,'-120.00');
});
test('profit and loss totals use the exact selected period and include taxes only in the net result',()=>{
 const sheet=profit();for(const key of ['operating','financial','before_tax','net'])assert.equal(buildReportAmountDetail([sheet],{kind:'total',key}).total,sheet.totals[key]);
 assert.equal(buildReportAmountDetail([sheet],{kind:'total',key:'before_tax'}).rows.some(row=>row.code.startsWith('630')),false);
 for(const node of allNodes(sheet.sections))assert.equal(buildReportAmountDetail([sheet],{kind:'node',id:node.id}).total,node.amount);
});
test('account prefixes and digit grouping remain constrained to their PGC heading',()=>{
 const sheet=balance(),node=allNodes(sheet.sections).find(node=>node.accounts.some(account=>account.code==='572'));
 assert.deepEqual(reportAmountRows(sheet,{kind:'account',node_id:node.id,code:'572'}).map(row=>row.code),['57200001']);
 assert.equal(reportAmountRows(sheet,{kind:'account',node_id:'nonexistent',code:'572'}).length,0);
 for(const digits of [3,4,8]){const grouped={...sheet,sections:balanceDetailSections(sheet.sections,digits)},detail=buildReportAmountDetail([grouped],{kind:'total',key:'assets'});assert.equal(detail.total,sheet.totals.assets);}
});
test('comparison details join by code and preserve independent account IDs, periods and zero columns',()=>{
 const current=balance(2026),previous=balance(2025,100),selection={kind:'total',key:'assets'};
 const detail=buildReportAmountDetail([current,previous],selection);assert.equal(detail.total,'0.00');assert.deepEqual(detail.rows[0].values.map(value=>value.account.id),[1,101]);assert.deepEqual(detail.rows[0].values.map(value=>value.sheet.exercise.id),[2026,2025]);
 const priorOnly={...previous,sections:[]};const missing=buildReportAmountDetail([current,priorOnly],selection);assert.equal(missing.total,'200.00');assert.equal(missing.rows[0].values[1],null);
});
test('subaccount selection opens its exact amount; a missing or empty heading has an honest empty detail',()=>{
 const sheet=profit(),node=allNodes(sheet.sections).find(node=>node.accounts.some(account=>account.code==='600'));
 const detail=buildReportAmountDetail([sheet],{kind:'subaccount',node_id:node.id,code:'60000001'});assert.equal(detail.total,'-10.00');assert.equal(detail.rows.length,1);
 assert.deepEqual(reportAmountRows(sheet,{kind:'node',id:'absent'}),[]);assert.equal(buildReportAmountDetail([sheet],{kind:'node',id:'absent'}).total,'0.00');
});
test('ledger queries preserve the company, exercise, dates and annual-entry exclusions of each clicked amount',()=>{
 const sheet=balance(2025),account=reportAmountRows(sheet,{kind:'total',key:'assets'})[0];
 assert.deepEqual(reportDetailLedgerQuery(sheet,account,{kind:'total'}),{company_id:'19',exercise_id:'2025',account_id:'1',from:'2025-01-01',to:'2025-10-31',exclude_closing:'true'});
 const pl=profit(2026);const query=reportDetailLedgerQuery(pl,{id:4},{kind:'node'});assert.equal(query.exclude_annual,'true');assert.equal(query.from,'2026-03-01');assert.equal(query.exclude_closing,undefined);
 assert.equal(reportDetailLedgerQuery(sheet,account,{kind:'generated_result'}).exclude_annual,'true');
 assert.equal(buildReportAmountDetail([pl],{kind:'generated_result'}).total,pl.totals.net);
});
test('unclassified values are shown without silently mixing them into the report totals',()=>{
 const sheet={...balance(),diagnostic:{unclassified:[{id:50,code:'88000001',description:'Review',signed_balance:'12.50'}]}};
 assert.equal(buildReportAmountDetail([sheet],{kind:'unclassified',code:'88000001'}).total,'12.50');assert.equal(buildReportAmountDetail([sheet],{kind:'total',key:'difference'}).total,'0.00');
});
test('detail sums retain cent precision beyond JavaScript safe integer ranges',()=>{
 const sheet={...profit(),sections:[{id:'large',accounts:[{subaccounts:[{id:1,code:'70000001',signed_balance:'-90071992547409.91',amount:'90071992547409.91'},{id:2,code:'70000002',signed_balance:'-0.02',amount:'0.02'}]}],children:[]}]};
 assert.equal(buildReportAmountDetail([sheet],{kind:'node',id:'large'}).total,'90071992547409.93');
});
