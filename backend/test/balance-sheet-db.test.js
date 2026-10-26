import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createReportService } from '../src/services/reports.js';
import { createContextService } from '../src/services/context.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';

test('MySQL balance sheet: dates, exercises, regularization, trial reconciliation and HTTP scope',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database);let companyId,server;
 try {
  const [company]=await pool.execute('INSERT INTO companies(name) VALUES (?)',['Balance sheet integration']);companyId=company.insertId;
  const accounting=createAccountingService(pool,companyId),reports=createReportService(pool,companyId);
  const accounts={};
  for(const [key,code] of Object.entries({bank:'5720',capital:'1000',machine:'2130',amortization:'2813',expense:'6813',sales:'7000',result:'1290',unknown:'1990',tax:'4730',investment:'2400',genericAmortization:'2810'}))accounts[key]=await accounting.createAccount({code:code+'.0001',description:key});
  const exercises=[];
  for(const year of [2025,2026]){const [exercise]=await pool.execute('INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,?,?,?)',[companyId,String(year),year+'-01-01',year+'-12-31']);exercises.push(exercise.insertId);}
  const [previous,current]=exercises;
  const post=(exercise,day,lines)=>accounting.createEntry({exercise_id:exercise,entry_date:day,description:'Balance integration',request_id:randomUUID(),lines:lines.map(([key,debit,credit])=>({account_id:accounts[key].id,description:key,debit,credit}))});
  await post(previous,'2025-01-01',[['bank','500.00','0'],['capital','0','500.00']]);
  await post(current,'2026-01-01',[['machine','100000.00','0'],['capital','0','100000.00']]);
  await post(current,'2026-03-01',[['expense','30000.00','0'],['amortization','0','30000.00']]);
  await post(current,'2026-06-01',[['bank','40000.00','0'],['sales','0','40000.00']]);
  await post(current,'2026-07-01',[['sales','20000.00','0'],['result','0','20000.00']]);
  await post(current,'2026-08-01',[['sales','20000.00','0'],['expense','0','30000.00'],['result','10000.00','0']]);
  for(const status of ['draft','cancelled']){
   const entry=await post(current,'2026-02-01',[['bank','99.00','0'],['capital','0','99.00']]);
   await pool.execute('UPDATE journal_entries SET status=? WHERE id=? AND company_id=?',[status,entry.id,companyId]);
  }
  const query={exercise_id:current,model:'normal'};
  await t.test('intermediate dates exclude future, draft and cancelled entries',async()=>{
   const january=await reports.balanceSheet({...query,date:'2026-01-31'});assert.equal(january.totals.assets,'100000.00');assert.equal(january.totals.equity_liabilities,'100000.00');
   const march=await reports.balanceSheet({...query,date:'2026-03-31'});assert.equal(march.totals.assets,'70000.00');assert.equal(march.result.residual_6_7,'-30000.00');assert.equal(march.totals.difference,'0.00');
  });
  await t.test('profit survives partial and final regularization exactly once',async()=>{
   const june=await reports.balanceSheet({...query,date:'2026-06-30'});assert.deepEqual(june.result,{booked_129:'0.00',residual_6_7:'10000.00',total:'10000.00'});
   const july=await reports.balanceSheet({...query,date:'2026-07-31'});assert.deepEqual(july.result,{booked_129:'20000.00',residual_6_7:'-10000.00',total:'10000.00'});
   const august=await reports.balanceSheet({...query,date:'2026-08-31'});assert.deepEqual(august.result,{booked_129:'10000.00',residual_6_7:'0.00',total:'10000.00'});
   assert.equal(july.totals.assets,'110000.00');assert.equal(august.totals.difference,'0.00');
  });
  await t.test('two exercises stay isolated and earlier balances are never carried automatically',async()=>{
   const earlier=await reports.balanceSheet({exercise_id:previous,date:'2025-12-31'});assert.equal(earlier.totals.assets,'500.00');
   const later=await reports.balanceSheet({...query,date:'2026-12-31'});assert.equal(later.totals.assets,'110000.00');assert.equal(later.opening.previous_activity,true);
   assert.ok(later.diagnostic.warnings.some(w=>w.code==='OPENING_NOT_VERIFIABLE'));
  });
  await t.test('every presented subaccount reconciles with trial balance and ledger',async()=>{
   const date='2026-07-31',sheet=await reports.balanceSheet({...query,date});
   const trial=await reports.trialBalance({exercise_id:current,to:date});
   const collect=node=>[...node.accounts.flatMap(a=>a.subaccounts),...node.children.flatMap(collect)];
   const contributions=sheet.sections.flatMap(collect),byId=new Map(trial.rows.map(r=>[r.id,r]));
   for(const row of contributions){assert.equal(row.signed_balance,byId.get(row.id).closing);const ledger=await reports.ledger({exercise_id:current,account_id:row.id,to:date});assert.equal(ledger.totals.closing,row.signed_balance);}
   assert.equal(sheet.checks.reconciles_trial_balance,true);assert.equal(sheet.checks.no_double_count,true);
   assert.deepEqual(sheet.totals,(await reports.balanceSheet({...query,date,model:'abbreviated'})).totals);
  });
  await t.test('comparison uses the previous exercise of the same company and the same cutoff',async()=>{
   const compared=await reports.balanceSheet({...query,date:'2026-03-31',compare_previous:'true'});
   assert.equal(compared.compare_previous,true);assert.equal(compared.comparison.available,true);assert.equal(compared.comparison.previous.exercise.id,previous);assert.equal(compared.comparison.previous.date,'2025-03-31');
   assert.equal(compared.comparison.has_activity,true);assert.deepEqual(compared.comparison.totals.assets,{amount:'70000.00',previous_amount:'500.00',difference:'69500.00'});
   assert.equal(compared.comparison.previous.exclude_closing,true);
   const missing=await reports.balanceSheet({exercise_id:previous,date:'2025-12-31',compare_previous:true});assert.equal(missing.comparison.available,false);assert.equal(missing.comparison.reason,'PREVIOUS_EXERCISE_NOT_FOUND');
   assert.equal(missing.comparison.previous,undefined);
   const full=await reports.balanceSheet({...query,date:'2026-12-31',compare_previous:true});assert.equal(full.comparison.previous.date,'2025-12-31');
   const plain=await reports.balanceSheet({...query,compare_previous:'false'});assert.equal(plain.comparison,undefined);
   await assert.rejects(reports.balanceSheet({...query,compare_previous:'yes'}),cause=>cause.code==='INVALID_REPORT_FILTER');
  });
  await t.test('balanced output still discloses an unknown account',async()=>{
   const entry=await post(current,'2026-09-01',[['unknown','100.00','0'],['bank','0','100.00']]);
   const result=await reports.balanceSheet({...query,date:'2026-09-30'});assert.equal(result.checks.complete,false);assert.equal(result.diagnostic.unclassified.length,1);assert.equal(result.totals.difference,'-100.00');
   await pool.execute("UPDATE journal_entries SET status='cancelled' WHERE id=? AND company_id=?",[entry.id,companyId]);
  });
  await t.test('API validates model, exercise, dates, aliases and request company',async()=>{
   server=createApp(createContextService(pool,companyId),accounting,companyScope(pool,companyId)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port+'/api/accounting/balance-sheet?';
   const get=q=>fetch(base+new URLSearchParams(q));
   assert.equal((await get({...query,date:'2026-03-31'})).status,200);
   const comparison=await get({...query,date:'2026-03-31',compare_previous:'true'});assert.equal(comparison.status,200);assert.equal((await comparison.json()).comparison.previous.exercise.id,previous);
   assert.equal((await get({exerciseId:current,companyId,date:'2026-03-31',model:'abbreviated'})).status,200);
   for(const q of [{...query,date:'2025-12-31'},{...query,date:'2026-02-30'},{...query,model:'other'},{...query,companyId:companyId+1},{...query,compare_previous:'yes'}])assert.equal((await get(q)).status,400);
   const response=await get({...query,exercise_id:4294967295});assert.equal(response.status,404);
   assert.equal((await fetch(base+new URLSearchParams(query),{headers:{'X-Company-Id':'4294967295'}})).status,404);
  });
  await t.test('pending 473 payments reconcile by date and exercise in both models and comparisons',async()=>{
   await post(previous,'2025-10-20',[['tax','100.00','0'],['bank','0','100.00']]);
   await post(current,'2026-10-20',[['tax','578.06','0'],['bank','0','578.06']]);
   const collect=node=>[...node.accounts.flatMap(account=>account.subaccounts),...node.children.flatMap(collect)];
   for(const model of ['normal','abbreviated']){
    const sheet=await reports.balanceSheet({...query,model,date:'2026-10-31',compare_previous:true});
    assert.equal(sheet.totals.assets,'110000.00');assert.equal(sheet.totals.difference,'0.00');assert.equal(sheet.checks.complete,true);assert.equal(sheet.checks.reconciles_trial_balance,true);
    const tax=sheet.sections.flatMap(collect).find(row=>row.id===accounts.tax.id);assert.equal(tax.amount,'578.06');assert.equal(tax.pgc_prefix,'473');
    const earlier=sheet.comparison.previous;assert.equal(earlier.totals.difference,'0.00');assert.equal(earlier.sections.flatMap(collect).find(row=>row.id===accounts.tax.id).amount,'100.00');
    const september=await reports.balanceSheet({...query,model,date:'2026-09-30'});assert.equal(september.sections.flatMap(collect).some(row=>row.id===accounts.tax.id),false);
   }
   const ledger=await reports.ledger({exercise_id:current,account_id:accounts.tax.id,to:'2026-10-31'});assert.equal(ledger.totals.closing,'578.06');
  });
  await t.test('imported 2400 and generic 2810 reconcile with ledger, cutoffs, comparisons and HTTP',async()=>{
   await post(previous,'2025-11-20',[['investment','1000.00','0'],['capital','0','1000.00']]);
   await post(current,'2026-11-20',[['investment','73584.00','0'],['capital','0','73584.00']]);
   await post(current,'2026-11-21',[['expense','13651.85','0'],['genericAmortization','0','13651.85']]);
   const collect=node=>[...node.accounts.flatMap(account=>account.subaccounts),...node.children.flatMap(collect)];
   for(const model of ['normal','abbreviated']){
    const queryParams={...query,model,date:'2026-11-30',compare_previous:true};
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/accounting/balance-sheet?'+new URLSearchParams(queryParams));assert.equal(response.status,200);
    const sheet=await response.json();
    assert.deepEqual(sheet.totals,{assets:'169932.15',equity_liabilities:'169932.15',difference:'0.00'});
    assert.equal(sheet.checks.complete,true);assert.equal(sheet.checks.reconciles_trial_balance,true);assert.equal(sheet.checks.no_double_count,true);
    const all=sheet.sections.flatMap(collect),investment=all.filter(row=>row.id===accounts.investment.id);
    assert.equal(investment.length,1);assert.equal(investment[0].amount,'73584.00');
    assert.equal(all.find(row=>row.id===accounts.genericAmortization.id).amount,'-13651.85');
    assert.ok(sheet.diagnostic.warnings.some(warning=>warning.code==='PGC_DETAIL_REQUIRED'&&warning.account.id===accounts.investment.id));
    assert.equal(sheet.comparison.previous.totals.assets,'1500.00');assert.equal(sheet.comparison.previous.totals.difference,'0.00');
    assert.equal(sheet.comparison.previous.sections.flatMap(collect).find(row=>row.id===accounts.investment.id).amount,'1000.00');
    const october=await reports.balanceSheet({...query,model,date:'2026-10-31'});assert.equal(october.sections.flatMap(collect).some(row=>row.id===accounts.investment.id),false);
   }
   const ledger=await reports.ledger({exercise_id:current,account_id:accounts.investment.id,to:'2026-11-30'});assert.equal(ledger.totals.closing,'73584.00');
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(companyId){
   await pool.execute('DELETE FROM journal_lines WHERE company_id=?',[companyId]);
   await pool.execute('DELETE FROM journal_entries WHERE company_id=?',[companyId]);
   await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[companyId]);
   const [rows]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);
   for(const row of rows)await pool.execute('DELETE FROM accounts WHERE id=?',[row.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});
