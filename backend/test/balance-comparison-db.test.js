import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createExerciseService } from '../src/services/exercises.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createReportService } from '../src/services/reports.js';

test('MySQL comparison: company scope, closing, leap years, fiscal periods, gaps and empty history',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);
 async function company(periods){
  const created=await context.createCompany({name:'Comparison test '+randomUUID(),exercise:periods[0]});ids.push(created.id);
  const years=[(await context.getContext(created.id)).exercises[0]];
  for(const period of periods.slice(1))years.push(await createExerciseService(pool,created.id).create(period));
  const accounting=createAccountingService(pool,created.id),bank=await accounting.createAccount({code:'5720.0001',description:'Bank'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'});
  async function post(exercise,day,value,closing=false){
   const entry=await accounting.createEntry({exercise_id:exercise.id,entry_date:day,description:closing?'Closing':'Opening',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:closing?'0':value,credit:closing?value:'0'},{account_id:capital.id,description:'Capital',debit:closing?value:'0',credit:closing?'0':value}]});
   if(closing)await pool.execute("UPDATE journal_entries SET entry_type='closing' WHERE company_id=? AND id=?",[created.id,entry.id]);
  }
  return {id:created.id,years,post,accounting,bank,reports:createReportService(pool,created.id)};
 }
 const year=value=>({name:String(value),start_date:value+'-01-01',end_date:value+'-12-31'});
 try {
  const foreign=await company([year(2023),year(2025)]);await foreign.post(foreign.years[0],'2023-01-01','999999.99');await foreign.post(foreign.years[1],'2025-01-01','888888.88');
  const leap=await company([year(2023),year(2024)]);
  await leap.post(leap.years[0],'2023-02-28','100.00');await leap.post(leap.years[0],'2023-03-01','50.00');await leap.post(leap.years[0],'2023-12-31','150.00',true);
  await leap.post(leap.years[1],'2024-02-29','200.00');await leap.post(leap.years[1],'2024-12-31','200.00',true);
  await t.test('leap day is clamped to February 28 and foreign-company balances never enter',async()=>{
   const result=await leap.reports.balanceSheet({exercise_id:leap.years[1].id,date:'2024-02-29',compare_previous:true});
   assert.equal(result.comparison.previous.company.id,leap.id);assert.equal(result.comparison.previous.date,'2023-02-28');assert.equal(result.comparison.previous.totals.assets,'100.00');assert.equal(result.comparison.totals.assets.difference,'100.00');
  });
  await t.test('both closing entries are excluded at fiscal year end',async()=>{
   const result=await leap.reports.balanceSheet({exercise_id:leap.years[1].id,date:'2024-12-31',compare_previous:true});
   assert.deepEqual(result.comparison.totals.assets,{amount:'200.00',previous_amount:'150.00',difference:'50.00'});assert.equal(result.comparison.previous.exclude_closing,true);
  });
  await t.test('a missing intervening year is reported instead of comparing an older one',async()=>{
   const result=await foreign.reports.balanceSheet({exercise_id:foreign.years[1].id,compare_previous:true});assert.equal(result.comparison.available,false);assert.equal(result.comparison.expected_end,'2024-12-31');assert.equal(result.comparison.previous,undefined);
  });
  const fiscal=await company([{name:'2024/25',start_date:'2024-07-01',end_date:'2025-06-30'},{name:'2025/26',start_date:'2025-07-01',end_date:'2026-06-30'}]);
  await fiscal.post(fiscal.years[0],'2024-07-01','10.00');await fiscal.post(fiscal.years[1],'2025-07-01','20.00');
  await t.test('non-calendar exercises compare the matching cutoff and their own final days',async()=>{
   const partial=await fiscal.reports.balanceSheet({exercise_id:fiscal.years[1].id,date:'2026-01-15',compare_previous:true});assert.equal(partial.comparison.previous.date,'2025-01-15');assert.equal(partial.comparison.totals.assets.difference,'10.00');
   const full=await fiscal.reports.balanceSheet({exercise_id:fiscal.years[1].id,compare_previous:true});assert.equal(full.comparison.previous.date,'2025-06-30');
  });
  const empty=await company([{name:'Short 2025',start_date:'2025-06-01',end_date:'2025-12-31'},year(2026)]);
  await t.test('empty previous data and an unavailable equivalent cutoff are explicit',async()=>{
   const noCutoff=await empty.reports.balanceSheet({exercise_id:empty.years[1].id,date:'2026-03-31',compare_previous:true});assert.equal(noCutoff.comparison.available,false);assert.equal(noCutoff.comparison.reason,'PREVIOUS_PERIOD_UNAVAILABLE');
   const noData=await empty.reports.balanceSheet({exercise_id:empty.years[1].id,compare_previous:true});assert.equal(noData.comparison.available,true);assert.equal(noData.comparison.has_activity,false);assert.equal(noData.comparison.previous.totals.assets,'0.00');
   assert.equal(noData.comparison.generated_result.previous_amount,'0.00');
  });
  await t.test('previous generated profit survives regularization and allocation, respecting cutoff and posted status',async()=>{
   const allocated=await company([year(2025),year(2026)]),accounts={bank:allocated.bank};
   for(const [key,code] of Object.entries({sales:'7000',expense:'6220',result:'1290',retained:'1200'}))accounts[key]=await allocated.accounting.createAccount({code:code+'.0001',description:key});
   async function post(exercise,date,lines,type='normal',status='posted'){
    const entry=await allocated.accounting.createEntry({exercise_id:exercise.id,entry_date:date,description:'Generated result test',request_id:randomUUID(),lines:lines.map(([key,debit,credit])=>({account_id:accounts[key].id,description:key,debit,credit}))});
    if(type!=='normal'||status!=='posted')await pool.execute('UPDATE journal_entries SET entry_type=?,status=? WHERE company_id=? AND id=?',[type,status,allocated.id,entry.id]);
   }
   const [previous,current]=allocated.years;
   await post(previous,'2025-05-01',[['bank','2000.00','0'],['sales','0','2000.00']]);
   await post(previous,'2025-12-01',[['expense','305.94','0'],['bank','0','305.94']]);
   await post(previous,'2025-12-31',[['sales','2000.00','0'],['expense','0','305.94'],['result','0','1694.06']],'regularization');
   await post(previous,'2025-12-31',[['result','1694.06','0'],['retained','0','1694.06']]);
   await post(current,'2026-05-01',[['bank','17796.79','0'],['sales','0','17796.79']]);
   for(const status of ['draft','cancelled'])await post(previous,'2025-05-02',[['bank','999.99','0'],['sales','0','999.99']],'normal',status);
   const before=await allocated.accounting.listEntries({exercise_id:previous.id,view:'lines'});
   for(const model of ['normal','abbreviated']){
    const report=await allocated.reports.balanceSheet({exercise_id:current.id,compare_previous:true,model});
    assert.deepEqual(report.comparison.generated_result,{amount:'17796.79',previous_amount:'1694.06',difference:'16102.73'});
    assert.equal(report.comparison.previous.result.total,'0.00');assert.equal(report.comparison.previous.result.booked_129,'0.00');
    assert.equal(report.comparison.previous.totals.assets,'1694.06');assert.equal(report.comparison.previous.totals.equity_liabilities,'1694.06');
    const partial=await allocated.reports.balanceSheet({exercise_id:current.id,date:'2026-06-30',compare_previous:true,model});
    assert.equal(partial.comparison.previous.date,'2025-06-30');assert.equal(partial.comparison.generated_result.previous_amount,'2000.00');
   }
   assert.deepEqual(await allocated.accounting.listEntries({exercise_id:previous.id,view:'lines'}),before);
  });
 }finally{
  for(const id of ids){await pool.execute('DELETE FROM journal_lines WHERE company_id=?',[id]);await pool.execute('DELETE FROM journal_entries WHERE company_id=?',[id]);await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[id]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[id]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE id=? AND company_id=?',[row.id,id]);await pool.execute('DELETE FROM companies WHERE id=?',[id]);}
  await pool.end();
 }
});
