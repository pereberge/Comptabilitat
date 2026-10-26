import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBalanceSheet } from '../src/services/balance-sheet.js';
import { compareBalanceSheets } from '../src/services/balance-comparison.js';
import { amount } from '../src/services/report-amount.js';
import { decimal } from '../../shared/money.js';
import { balanceDetailSections } from '../../frontend/src/services/balance-detail.js';
import { balanceSheetCsv } from '../../frontend/src/services/balance-sheet-csv.js';

function sheet(year, values, model='abbreviated') {
 const rows=values.map(([id,code,parent,closing])=>({id,code,parent_code:parent,parent_description:'Cuenta '+parent,description:'Subcuenta '+id,closing,debit:'0.00',credit:'0.00'}));
 return buildBalanceSheet({company:{id:1,name:'Detail',subaccount_length:8},exercise:{id:year,name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'},from:year+'-01-01',to:year+'-12-31',rows,checks:{differences:{closing:decimal(rows.reduce((sum,row)=>sum+amount(row.closing),0n))}}},model);
}
function accounts(nodes){return nodes.flatMap(node=>[...node.accounts,...accounts(node.children)]);}
function comparison(model='abbreviated'){
 const current=sheet(2026,[[1,'57200001','5720','100.01'],[2,'57200101','5720','200.02'],[3,'10000001','1000','-300.03']],model);
 const previous=sheet(2025,[[1,'57200001','5720','90.00'],[4,'57200002','5720','60.00'],[5,'21300001','2130','150.00'],[3,'10000001','1000','-300.00']],model);
 return {...current,compare_previous:true,comparison:{available:true,has_activity:true,previous,...compareBalanceSheets(current,previous)}};
}

test('every account detail level preserves PGC totals and exact annual variation in both models',()=>{
 for(const model of ['normal','abbreviated']){
  const report=comparison(model),before=structuredClone(report);
  for(const digits of [3,4,5,6,7,8]){
   const nodes=balanceDetailSections(report.comparison.sections,digits),rows=accounts(nodes);
   assert.deepEqual(nodes.map(node=>[node.id,node.amount,node.previous_amount,node.difference]),report.comparison.sections.map(node=>[node.id,node.amount,node.previous_amount,node.difference]));
   const banks=rows.filter(row=>row.code.startsWith('572'));
   assert.equal(decimal(banks.reduce((sum,row)=>sum+amount(row.amount),0n)),'300.03');
   assert.equal(decimal(banks.reduce((sum,row)=>sum+amount(row.previous_amount),0n)),'150.00');
   assert.equal(decimal(banks.reduce((sum,row)=>sum+amount(row.difference),0n)),'150.03');
   assert.ok(rows.every(row=>row.code.length===digits));
  }
  assert.deepEqual(report,before);
  assert.strictEqual(balanceDetailSections(report.sections),report.sections);
 }
});

test('full subaccount detail retains period-specific Mayor links, including previous-only accounts',()=>{
 const report=comparison(),rows=accounts(balanceDetailSections(report.comparison.sections,8));
 assert.ok(rows.every(row=>row.detail_is_subaccount&&!row.subaccounts.length));
 const previous=rows.find(row=>row.code==='57200002');
 assert.equal(previous.current_id,null);assert.equal(previous.previous_id,4);assert.equal(previous.amount,'0.00');assert.equal(previous.previous_amount,'60.00');assert.equal(previous.difference,'-60.00');
 const current=rows.find(row=>row.code==='57200101');assert.equal(current.current_id,2);assert.equal(current.previous_id,null);
});

test('grouping keeps conditional accounts on their own balance side and retains precision and negative signs',()=>{
 const current=sheet(2026,[[1,'55100001','5510','10.00'],[2,'55100002','5510','-20.00'],[3,'57200001','5720','999999999999999.99'],[4,'57200002','5720','0.02'],[5,'28100001','2810','-0.01']]);
 const previous=sheet(2025,[[3,'57200001','5720','999999999999999.98']]);
 const compared=compareBalanceSheets(current,previous),nodes=balanceDetailSections(compared.sections,3),rows=accounts(nodes);
 assert.equal(rows.filter(row=>row.code==='551').length,2);
 const bank=rows.find(row=>row.code==='572');assert.equal(bank.amount,'1000000000000000.01');assert.equal(bank.previous_amount,'999999999999999.98');assert.equal(bank.difference,'0.03');
 assert.equal(rows.find(row=>row.code==='281').amount,'-0.01');
});

test('CSV places each side total after its own headings, with exact yearly amounts and differences at every digit level',()=>{
 const report=comparison();
 for(const digits of [0,3,4,5,6,7,8]){
  const rows=balanceSheetCsv(report,{digits}),asset=rows.findIndex(row=>row[1]==='TOTAL ACTIVO'),equity=rows.findIndex(row=>row[1]==='TOTAL PATRIMONIO NETO Y PASIVO'),difference=rows.findIndex(row=>row[1]==='DIFERENCIA');
  assert.ok(asset>0&&equity>asset&&difference>equity);
  const firstEquityLabel=report.comparison.sections.find(node=>node.side==='equity_liabilities').label;
  assert.ok(rows.findIndex(row=>row[1]===firstEquityLabel)>asset);
  assert.equal(rows.filter(row=>row[1]==='TOTAL ACTIVO').length,1);assert.equal(rows.filter(row=>row[1]==='TOTAL PATRIMONIO NETO Y PASIVO').length,1);
  assert.deepEqual(rows[asset].slice(2),[{amount:'300.03'},{amount:'300.00'},{amount:'0.03'}]);
  assert.deepEqual(rows[equity].slice(2),[{amount:'300.03'},{amount:'300.00'},{amount:'0.03'}]);
  assert.deepEqual(rows[difference].slice(2),[{amount:'0.00'},{amount:'0.00'},{amount:'0.00'}]);
  const bankRows=rows.filter(row=>typeof row[1]==='string'&&/^572\d* ·/.test(row[1]));
  if(digits){assert.ok(bankRows.every(row=>row[1].split(' · ')[0].length===digits));assert.ok(rows.some(row=>row[0]==='Dígitos de las cuentas'&&row[1]===String(digits)));}
 }
 const single=balanceSheetCsv({...report,comparison:undefined,compare_previous:false},{digits:8});
 const asset=single.findIndex(row=>row[0]==='TOTAL ACTIVO'),equity=single.findIndex(row=>row[0]==='TOTAL PATRIMONIO NETO Y PASIVO');
 assert.ok(asset>0&&equity>asset);assert.deepEqual(single[asset][1],{amount:'300.03'});
});
