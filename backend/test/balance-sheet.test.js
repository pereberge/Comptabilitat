import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBalanceSheet } from '../src/services/balance-sheet.js';
import mapping from '../src/services/pgc-balance-map.json' with {type:'json'};
import { decimal } from '../../shared/money.js';
import { amount } from '../src/services/report-amount.js';
import { balanceSheetCsv } from '../../frontend/src/services/balance-sheet-csv.js';
import { buildCsv } from '../../frontend/src/services/report-format.js';

function trial(values) {
 const rows=values.map(([parent,closing],i)=>({id:i+1,code:parent.padEnd(8,'0'),parent_code:parent,parent_description:'Account '+parent,description:'Subaccount '+parent,closing,debit:'0.00',credit:'0.00'}));
 const difference=rows.reduce((sum,row)=>sum+amount(row.closing),0n);
 return {company:{id:1,name:'Test'},exercise:{id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'},from:'2026-01-01',to:'2026-10-16',rows,checks:{differences:{closing:decimal(difference)}}};
}
function leaves(result){return result.sections.flatMap(function visit(node){return [...node.accounts.flatMap(a=>a.subaccounts),...node.children.flatMap(visit)];});}
test('100,000 assets equal capital: both official models reconcile',()=>{
 for(const model of ['normal','abbreviated']){
  const result=buildBalanceSheet(trial([['5720','100000.00'],['1000','-100000.00']]),model);
  assert.deepEqual(result.totals,{assets:'100000.00',equity_liabilities:'100000.00',difference:'0.00'});
  assert.equal(result.checks.valid,true);assert.equal(result.checks.reconciles_trial_balance,true);
 }
});
test('pending 473 tax payments stay in current assets and reconcile in both balance models',()=>{
 for(const model of ['normal','abbreviated']){
  const source=trial([['4730','578.06'],['4731','628.52'],['1000','-1206.58']]);source.rows[0].code='47300002';
  const result=buildBalanceSheet(source,model);
  assert.deepEqual(result.totals,{assets:'1206.58',equity_liabilities:'1206.58',difference:'0.00'});
  assert.equal(result.checks.complete,true);assert.equal(result.checks.reconciles_trial_balance,true);assert.equal(result.checks.no_double_count,true);
  const all=leaves(result);assert.equal(all.filter(row=>row.pgc_prefix==='473').length,2);
  const collect=node=>[node,...node.children.flatMap(collect)],nodes=result.sections.flatMap(collect);
  const caption=nodes.find(node=>node.accounts.some(account=>account.code==='4730'));
  assert.match(caption.label,model==='normal'?/Activos por impuesto corriente/:/Otros deudores/);assert.equal(caption.side,'asset');
  assert.equal(result.result.total,'0.00');
  const credited=buildBalanceSheet(trial([['4730','-0.01'],['5720','0.01']]),model);
  assert.equal(credited.totals.difference,'0.00');assert.equal(credited.diagnostic.warnings[0].code,'UNUSUAL_SIGN');
 }
});

test('accumulated amortization and impairments reduce their asset, never liabilities',()=>{
 const result=buildBalanceSheet(trial([['2130','100000.00'],['2813','-30000.00'],['2913','-5000.00'],['1000','-65000.00']]),'normal');
 assert.equal(result.totals.assets,'65000.00');assert.equal(result.checks.valid,true);
 const adjustments=leaves(result).filter(a=>a.corrector);assert.equal(adjustments.length,2);assert.equal(adjustments[0].amount,'-30000.00');
});
for(const [name,values,booked,residual,total] of [
 ['positive unregularized',[['572','100.00'],['700','-150.00'],['600','50.00']],'0.00','100.00','100.00'],
 ['negative unregularized',[['572','-100.00'],['700','-50.00'],['600','150.00']],'0.00','-100.00','-100.00'],
 ['regularized',[['572','100.00'],['129','-100.00']],'100.00','0.00','100.00'],
 ['partially regularized',[['572','100.00'],['129','-60.00'],['700','-70.00'],['600','30.00']],'60.00','40.00','100.00'],
 ['exceptional debit 129',[['572','100.00'],['129','20.00'],['700','-120.00']],'-20.00','120.00','100.00'],
]) test('result: '+name,()=>{
 const result=buildBalanceSheet(trial(values));assert.deepEqual(result.result,{booked_129:booked,residual_6_7:residual,total});
 assert.equal(result.totals.difference,'0.00');assert.equal(result.checks.complete,true);
 assert.equal(new Set(leaves(result).map(a=>a.id)).size,values.length);
});
test('opposite balances preserve signs and remain visible in diagnostic',()=>{
 const result=buildBalanceSheet(trial([['430','-200.00'],['400','200.00']]));
 assert.equal(result.totals.assets,'-200.00');assert.equal(result.totals.equity_liabilities,'-200.00');
 assert.equal(result.checks.balanced,true);assert.equal(result.checks.valid,false);assert.equal(result.diagnostic.warnings.length,2);
});
test('imported 2400 investments stay visible without assuming the missing related-party detail',()=>{
 for(const model of ['normal','abbreviated']){
  const source=trial([['2400','73584.00'],['2403','100.00'],['2404','200.00'],['2405','300.00'],['1000','-74184.00']]);source.rows[0].code='24000001';source.rows[0].description='INVERSIONS A NOU FONS';
  const result=buildBalanceSheet(source,model),all=leaves(result);
  assert.deepEqual(result.totals,{assets:'74184.00',equity_liabilities:'74184.00',difference:'0.00'});
  assert.equal(result.checks.complete,true);assert.equal(result.checks.no_double_count,true);assert.equal(result.checks.reconciles_trial_balance,true);
  const noncurrent=result.sections.find(node=>node.label==='A) ACTIVO NO CORRIENTE');
  const pending=noncurrent.children.find(node=>node.id==='asset-linked-participations');
  assert.equal(pending.amount,'73584.00');assert.equal(pending.accounts[0].code,'2400');assert.equal(pending.accounts[0].subaccounts[0].code,'24000001');
  assert.deepEqual(all.map(row=>row.pgc_prefix).sort(),['100','2400','2403','2404','2405']);
  assert.equal(result.checks.valid,false);assert.equal(result.diagnostic.warnings.length,1);assert.equal(result.diagnostic.warnings[0].code,'PGC_DETAIL_REQUIRED');
  assert.equal(result.diagnostic.warnings[0].account.amount,'73584.00');
  const csv=balanceSheetCsv(result);assert.ok(csv.some(row=>row.includes('24000001')));assert.ok(csv.some(row=>row.some(cell=>typeof cell==='string'&&cell.includes('desglose PGC'))));
  const credited=buildBalanceSheet(trial([['2400','-0.01'],['5720','0.01']]),model);
  assert.equal(credited.totals.difference,'0.00');assert.ok(credited.diagnostic.warnings.some(warning=>warning.code==='UNUSUAL_SIGN'));
 }
});
test('generic imported 2810 amortization reduces material assets in both models',()=>{
 for(const model of ['normal','abbreviated']){
  const result=buildBalanceSheet(trial([['2110','100000.00'],['2810','-13651.85'],['2811','-1000.00'],['1000','-85348.15']]),model);
  assert.deepEqual(result.totals,{assets:'85348.15',equity_liabilities:'85348.15',difference:'0.00'});
  assert.equal(result.checks.complete,true);assert.equal(result.checks.no_double_count,true);assert.equal(result.checks.reconciles_trial_balance,true);
  const material=result.sections[0].children.find(node=>node.label==='II. Inmovilizado material.');
  assert.equal(material.amount,'85348.15');assert.equal(leaves(result).find(row=>row.parent_code==='2810').corrector,true);
  if(model==='normal'){assert.equal(material.accounts[0].code,'2810');assert.equal(result.diagnostic.warnings[0].code,'PGC_DETAIL_REQUIRED');}
 }
});

test('unknown accounts cannot hide behind an arithmetically balanced result',()=>{
 const result=buildBalanceSheet(trial([['199','100.00'],['1991','-100.00']]));
 assert.equal(result.checks.balanced,true);assert.equal(result.checks.complete,false);assert.equal(result.checks.valid,false);
 assert.equal(result.diagnostic.unclassified.length,2);
 const incomplete=buildBalanceSheet(trial([['199','100.00'],['100','-100.00']]));
 assert.equal(incomplete.totals.difference,'-100.00');assert.equal(incomplete.checks.reconciles_trial_balance,true);
});
test('groups 8 and 9 are excluded from profit and explicitly require equity allocation',()=>{
 const result=buildBalanceSheet(trial([['572','100.00'],['900','-100.00']]));
 assert.equal(result.result.total,'0.00');assert.equal(result.diagnostic.unclassified[0].reason,'DIRECT_EQUITY_REQUIRES_ALLOCATION');assert.equal(result.checks.complete,false);
});
test('conditional accounts 551/552 are split by individual subaccount balance',()=>{
 const source=trial([['551','100.00'],['551','-100.00'],['5523','50.00'],['5523','-50.00']]);
 for(const model of ['normal','abbreviated']){
  const result=buildBalanceSheet(source,model);assert.equal(result.checks.complete,true);assert.equal(result.checks.valid,true);
  assert.equal(result.totals.assets,'150.00');assert.equal(result.totals.equity_liabilities,'150.00');
 }
});
test('real parent prevents misinterpreting subaccount suffix as official four-digit account',()=>{
 const result=buildBalanceSheet(trial([['240','100.00']]));assert.equal(result.diagnostic.unclassified.length,1);
});
test('duplicate source accounts are diagnosed and never contribute twice to the result',()=>{
 const source=trial([['700','-100.00'],['700','-100.00']]);source.rows[1].id=source.rows[0].id;
 const result=buildBalanceSheet(source);
 assert.equal(result.checks.no_double_count,false);assert.equal(result.result.total,'100.00');assert.equal(result.checks.result_reconciled,true);
 assert.equal(result.diagnostic.unclassified[0].reason,'DUPLICATE_ACCOUNT');
});
test('normal versus abbreviated layout follows distinct official account groupings',()=>{
 const source=trial([['213','10.00'],['100','-10.00']]);
 const normal=buildBalanceSheet(source,'normal'),abbreviated=buildBalanceSheet(source);
 assert.deepEqual(normal.totals,abbreviated.totals);
 assert.equal(mapping.models.normal.filter(n=>n.rules.length).length>mapping.models.abbreviated.filter(n=>n.rules.length).length,true);
 assert.equal(normal.sections[0].children.find(n=>n.label.startsWith('II.')).children.length,3);
 assert.equal(abbreviated.sections[0].children.find(n=>n.label.startsWith('II.')).children.length,0);
});
test('research and reimbursement rights use the PGC supplementary normal captions',()=>{
 const result=buildBalanceSheet(trial([['200','10.00'],['2800','-2.00'],['257','5.00'],['100','-13.00']]),'normal');
 assert.equal(result.checks.valid,true);
 const thirdParty=result.sections[0].children.find(n=>n.label.startsWith('V.'));
 assert.equal(thirdParty.amount,'5.00');
 const research=result.sections[0].children[0].children.find(n=>n.id==='asset-research');assert.equal(research.amount,'8.00');
});
test('large decimal precision, journal discrepancy, and opening warning remain explicit',()=>{
 const result=buildBalanceSheet(trial([['572','999999999999999.99'],['100','-999999999999999.98']]),'normal',{previous_activity:true,first_day_patrimonial:false});
 assert.equal(result.totals.difference,'0.01');assert.equal(result.checks.reconciles_trial_balance,true);
 assert.ok(result.diagnostic.warnings.some(w=>w.code==='UNBALANCED_JOURNAL'));
 assert.ok(result.diagnostic.warnings.some(w=>w.code==='OPENING_MAY_BE_MISSING'));
});
test('CSV preserves hierarchy, metadata, diagnostic, Spanish decimals and Excel text safety',()=>{
 const result=buildBalanceSheet(trial([['572','100.00'],['100','-100.00']]));result.company.name='=unsafe';
 const rows=balanceSheetCsv(result),csv=buildCsv(rows);
 assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes("'=unsafe"));assert.ok(csv.includes('100,00'));
 assert.ok(rows.some(r=>r[0]==='TOTAL ACTIVO'));assert.ok(rows.some(r=>typeof r[0]==='number'&&r[0]>1));
 assert.ok(csv.includes('16/10/2026'));assert.ok(csv.includes('Abreviado'));
});
