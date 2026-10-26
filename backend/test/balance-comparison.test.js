import test from 'node:test';
import assert from 'node:assert/strict';
import { compareBalanceSheets, previousExerciseEnd, previousYearDate } from '../src/services/balance-comparison.js';
import { buildBalanceSheet } from '../src/services/balance-sheet.js';
import { amount } from '../src/services/report-amount.js';
import { decimal } from '../../shared/money.js';
import { balanceSheetCsv } from '../../frontend/src/services/balance-sheet-csv.js';
import { buildCsv } from '../../frontend/src/services/report-format.js';

function sheet(year,values,model='abbreviated') {
 const rows=values.map(([id,parent,closing])=>({id,code:parent.padEnd(8,'0')+id,parent_code:parent,parent_description:'Parent '+parent,description:'Sub '+id,closing,debit:'0.00',credit:'0.00'}));
 return buildBalanceSheet({company:{id:1,name:'Comparison'},exercise:{id:year,name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'},from:year+'-01-01',to:year+'-12-31',rows,checks:{differences:{closing:decimal(rows.reduce((sum,row)=>sum+amount(row.closing),0n))}}},model);
}
function subs(nodes){return nodes.flatMap(node=>[...node.accounts.flatMap(account=>account.subaccounts),...subs(node.children)]);}
test('comparison aligns each hierarchy and includes accounts present in only one year',()=>{
 for(const model of ['normal','abbreviated']){
  const current=sheet(2026,[[1,'5720','150.01'],[2,'1000','-150.01']],model),previous=sheet(2025,[[1,'5720','100.00'],[2,'1000','-125.00'],[3,'2130','25.00']],model);
  const result=compareBalanceSheets(current,previous);
  assert.deepEqual(result.totals.assets,{amount:'150.01',previous_amount:'125.00',difference:'25.01'});
  const old=subs(result.sections).find(row=>row.id===3);assert.equal(old.amount,'0.00');assert.equal(old.previous_amount,'25.00');assert.equal(old.difference,'-25.00');assert.equal(old.current_id,null);assert.equal(old.previous_id,3);
  const bank=subs(result.sections).find(row=>row.id===1);assert.equal(bank.difference,'50.01');
 }
});
test('comparison retains precision beyond Number and conditional accounts changing side',()=>{
 const current=sheet(2026,[[1,'551','100.00'],[2,'1000','-100.00'],[3,'5720','999999999999999.99']]);
 const previous=sheet(2025,[[1,'551','-100.00'],[2,'1000','100.00'],[3,'5720','999999999999999.98']]);
 const result=compareBalanceSheets(current,previous),bank=subs(result.sections).find(row=>row.id===3),conditional=subs(result.sections).filter(row=>row.id===1);
 assert.equal(bank.difference,'0.01');assert.equal(conditional.length,2);assert.ok(conditional.some(row=>row.previous_id===null));assert.ok(conditional.some(row=>row.current_id===null));
});

test('generated annual result remains visible and exports after the previous profit was allocated',()=>{
 for(const model of ['normal','abbreviated']){
  const current={...sheet(2026,[[1,'5720','17796.79'],[2,'7000','-17796.79']],model),generated_result:'17796.79'};
  const previous={...sheet(2025,[[1,'5720','1694.06'],[3,'1200','-1694.06']],model),generated_result:'1694.06'};
  const report={...current,compare_previous:true,comparison:{available:true,has_activity:true,previous,...compareBalanceSheets(current,previous)}};
  assert.deepEqual(report.comparison.generated_result,{amount:'17796.79',previous_amount:'1694.06',difference:'16102.73'});
  assert.equal(report.comparison.result.total.previous_amount,'0.00');
  assert.deepEqual(report.comparison.totals.equity_liabilities,report.comparison.totals.assets);
  const row=balanceSheetCsv(report).find(row=>row[1]==='Resultado generado en el ejercicio');
  assert.deepEqual(row.slice(2),[{amount:'17796.79'},{amount:'1694.06'},{amount:'16102.73'}]);
  const single=balanceSheetCsv({...previous,compare_previous:false});
  assert.deepEqual(single.find(row=>row[0]==='Resultado generado en el ejercicio'),['Resultado generado en el ejercicio',{amount:'1694.06'}]);
  assert.equal(previous.result.total,'0.00');assert.equal(previous.totals.difference,'0.00');
 }
});
test('comparison dates handle leap days, fiscal boundaries and month/day cutoffs',()=>{
 assert.equal(previousYearDate('2024-02-29'),'2023-02-28');assert.equal(previousYearDate('2025-02-28'),'2024-02-28');
 assert.equal(previousYearDate('2026-01-15'),'2025-01-15');assert.equal(previousExerciseEnd('2025-01-01'),'2024-12-31');assert.equal(previousExerciseEnd('2025-07-01'),'2025-06-30');
});
test('comparison CSV includes two dates, exact changes, previous-only accounts and both diagnostics',()=>{
 const current=sheet(2026,[[1,'5720','150.01'],[2,'1000','-150.01']]),previous=sheet(2025,[[1,'5720','100.00'],[2,'1000','-125.00'],[3,'2130','25.00']]);
 current.compare_previous=true;current.comparison={available:true,previous,has_activity:true,...compareBalanceSheets(current,previous)};
 const rows=balanceSheetCsv(current),csv=buildCsv(rows);
 assert.ok(csv.includes('31/12/2026'));assert.ok(csv.includes('31/12/2025'));assert.ok(csv.includes('Variación (€)'));assert.ok(csv.includes('25,01'));assert.ok(csv.includes('-25,00'));assert.ok(csv.includes('Sub 3'));
 assert.equal(rows.filter(row=>row[0]==='Diagnóstico y comprobaciones').length,2);
 const total=rows.find(row=>row[1]==='TOTAL ACTIVO');assert.deepEqual(total.slice(2),[{amount:'150.01'},{amount:'125.00'},{amount:'25.01'}]);
 const missing={...current,comparison:{available:false,reason:'PREVIOUS_EXERCISE_NOT_FOUND',expected_end:'2025-12-31'}};
 assert.ok(buildCsv(balanceSheetCsv(missing)).includes('No hay un ejercicio anterior'));
});
