import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProfitLoss} from '../src/services/profit-loss.js';
import {compareBalanceSheets,compareReportPeriods} from '../src/services/balance-comparison.js';
import {profitLossCsv} from '../../frontend/src/services/profit-loss-csv.js';
import {buildCsv} from '../../frontend/src/services/report-format.js';
import {exerciseMonths,previousYearCutoff} from '../../shared/report-periods.js';
function statement(values,year=2024){return buildProfitLoss({company:{id:1,name:'Fictitious'},exercise:{id:year,name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'},from:year+'-02-01',to:year+'-02-29',rows:values.map(([parent,debit,credit],i)=>({id:i+1,code:parent.padEnd(8,'0'),parent_code:parent,parent_description:'Parent '+parent,description:'Account '+parent,debit,credit}))});}
function nodes(sheet){return sheet.sections.flatMap(section=>section.children);}
test('income statement separates operating, financial and tax results with exact signed amounts',()=>{
 const report=statement([['700','0.00','1000.25'],['706','10.00','0.00'],['600','300.00','0.00'],['608','0.00','20.00'],['640','100.00','0.00'],['681','50.00','0.00'],['778','0.00','5.00'],['762','0.00','2.00'],['662','7.00','0.00'],['6300','112.05','0.00'],['129','0.00','99999.00'],['900','0.00','99999.00']]);
 assert.deepEqual(report.totals,{operating:'565.25',financial:'-5.00',before_tax:'560.25',net:'448.20'});assert.equal(report.checks.complete,true);assert.equal(report.checks.reconciles,true);
 assert.equal(nodes(report).find(row=>row.id==='sales').amount,'990.25');assert.equal(nodes(report).find(row=>row.id==='supplies').amount,'-280.00');
});
test('PGC provision, inventory and tax subgroups use their actual parent and ambiguous custom accounts are explicit',()=>{
 const report=statement([['6930','10.00','0.00'],['7931','0.00','3.00'],['7957','0.00','4.00'],['7954','0.00','5.00'],['7951','0.00','6.00'],['693','8.00','0.00'],['6999','2.00','0.00']]);
 assert.equal(nodes(report).find(row=>row.id==='inventory').amount,'-10.00');assert.equal(nodes(report).find(row=>row.id==='staff').amount,'4.00');assert.equal(nodes(report).find(row=>row.id==='other_expenses').amount,'5.00');assert.equal(nodes(report).find(row=>row.id==='provisions').amount,'6.00');
 assert.equal(report.checks.complete,false);assert.equal(report.diagnostic.unclassified[0].parent_code,'693');assert.equal(report.diagnostic.unclassified_amount,'-8.00');assert.equal(report.checks.reconciles,true);
});
test('monthly losses, empty periods and large decimals retain cents',()=>{
 assert.equal(statement([['600','99.99','0.00']]).totals.net,'-99.99');assert.equal(statement([]).totals.net,'0.00');assert.equal(statement([]).has_activity,false);
 assert.equal(statement([['700','0.00','999999999999999.99'],['600','999999999999999.98','0.00']]).totals.net,'0.01');
});
test('comparison CSV retains distinct month ranges, previous-only accounts and result changes',()=>{
 const current=statement([['700','0.00','100.25']]),previous=statement([['700','0.00','90.00'],['600','10.00','0.00']],2023);previous.to='2023-02-28';
 current.compare_previous=true;current.comparison={available:true,previous,...compareBalanceSheets(current,previous)};
 const csv=buildCsv(profitLossCsv(current));assert.match(csv,/29\/02\/2024/);assert.match(csv,/28\/02\/2023/);assert.match(csv,/20,25/);assert.match(csv,/Account 600/);assert.match(csv,/Excluir|excluyen/);
 assert.deepEqual(current.comparison.totals.net,{amount:'100.25',previous_amount:'80.00',difference:'20.25'});
});
test('month options support leap years, non-calendar exercises and clipped boundary months',()=>{
 assert.equal(previousYearCutoff('2025-02-28'),'2024-02-29');assert.equal(previousYearCutoff('2024-02-29'),'2023-02-28');assert.equal(previousYearCutoff('2025-02-15'),'2024-02-15');assert.equal(exerciseMonths({start_date:'9999-12-01',end_date:'9999-12-31'}).length,1);
 const months=exerciseMonths({start_date:'2023-07-15',end_date:'2024-06-20'});assert.equal(months.length,12);assert.equal(months[0].from,'2023-07-15');assert.equal(months.at(-1).to,'2024-06-20');assert.equal(months.find(row=>row.value==='2024-02').to,'2024-02-29');assert.equal(exerciseMonths(null).length,0);
});

test('three annual columns retain third-only detail, exact cents and missing versus empty exercises',()=>{
 const current=statement([['700','0.00','100.25']],2024),previous=statement([['700','0.00','90.00']],2023),older=statement([['600','10.01','0.00'],['662','0.01','0.00']],2022);
 older.to='2022-02-28';previous.to='2023-02-28';
 const comparison=compareReportPeriods([current,previous,older]);
 assert.deepEqual(comparison.totals.net,['100.25','90.00','-10.02']);
 const supplies=comparison.sections.find(node=>node.id==='operating').children.find(node=>node.id==='supplies');
 assert.deepEqual(supplies.amounts,['0.00','0.00','-10.01']);assert.deepEqual(supplies.accounts[0].subaccounts[0].ids,[null,null,1]);
 assert.deepEqual(compareReportPeriods([current,previous,null]).totals.net,['100.25','90.00',null]);
 assert.deepEqual(compareReportPeriods([current,previous,statement([],2022)]).totals.net,['100.25','90.00','0.00']);
 current.compare_previous=true;current.comparison={multiple:{periods:[current,previous,older].map(sheet=>({available:true,sheet:{...sheet}})),...comparison}};
 const rows=profitLossCsv(current),csv=buildCsv(rows);
 assert.equal(rows.find(row=>row[0]==='Nivel').length,5);assert.match(csv,/2022/);assert.match(csv,/-10,02/);assert.match(csv,/Account 600/);assert.match(csv,/28\/02\/2022/);
 current.comparison.multiple={periods:[{available:true,sheet:current.comparison.multiple.periods[0].sheet},{available:true,sheet:previous},{available:false,reason:'PREVIOUS_EXERCISE_NOT_FOUND',expected_end:'2022-12-31'}],...compareReportPeriods([current,previous,null])};
 const missingCsv=buildCsv(profitLossCsv(current));assert.match(missingCsv,/No disponible/);assert.match(missingCsv,/PREVIOUS_EXERCISE_NOT_FOUND/);
});
