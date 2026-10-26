import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createCompanyEvolutionService} from '../src/services/company-evolution.js';
import {createReportService} from '../src/services/reports.js';
test('MySQL master evolution: three companies, net equity, annual result, cutoff and empty years',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);
 const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
 async function company(){
  const item=await context.createCompany({name:'Evolution test '+randomUUID(),exercise:period(2025)});ids.push(item.id);
  const years=[(await context.getContext(item.id)).exercises[0],await createExerciseService(pool,item.id).create(period(2026))];
  const service=createAccountingService(pool,item.id),accounts={};
  for(const [key,code]of Object.entries({bank:'5720',capital:'1000',loan:'1700',sales:'7000',expense:'6220',result:'1290',retained:'1200'}))accounts[key]=await service.createAccount({code:code+'.0001',description:key});
  async function post(year,day,lines,type='normal',status='posted'){
   const entry=await service.createEntry({exercise_id:years[year].id,entry_date:day,description:'Evolution fixture',request_id:randomUUID(),lines:lines.map(([key,debit,credit])=>({account_id:accounts[key].id,description:key,debit,credit}))});
   if(type!=='normal'||status!=='posted')await pool.execute('UPDATE journal_entries SET entry_type=?,status=? WHERE company_id=? AND id=?',[type,status,item.id,entry.id]);
  }
  return {id:item.id,years,post,service};
 }
 try{
  const a=await company(),b=await company(),empty=await company(),foreign=await company();
  await a.post(0,'2025-01-01',[['bank','1500','0'],['capital','0','1000'],['loan','0','500']],'opening');
  await a.post(0,'2025-05-01',[['bank','200','0'],['sales','0','200']]);
  await a.post(0,'2025-06-01',[['expense','50','0'],['bank','0','50']]);
  await a.post(0,'2025-12-31',[['sales','200','0'],['expense','0','50'],['result','0','150']],'regularization');
  await a.post(0,'2025-12-31',[['result','150','0'],['retained','0','150']]);
  await a.post(0,'2025-12-31',[['capital','1000','0'],['loan','500','0'],['retained','150','0'],['bank','0','1650']],'closing');
  await a.post(1,'2026-01-01',[['bank','1650','0'],['capital','0','1000'],['loan','0','500'],['retained','0','150']],'opening');
  await a.post(1,'2026-05-01',[['bank','100','0'],['sales','0','100']]);
  await a.post(1,'2026-06-01',[['expense','25.01','0'],['bank','0','25.01']]);
  await a.post(1,'2026-12-31',[['bank','900','0'],['sales','0','900']]);
  for(const status of ['draft','cancelled'])await a.post(1,'2026-05-02',[['bank','999','0'],['sales','0','999']],'normal',status);
  await b.post(0,'2025-01-01',[['bank','100','0'],['capital','0','100']],'opening');
  await b.post(0,'2025-05-01',[['expense','50','0'],['bank','0','50']]);
  await foreign.post(0,'2025-01-01',[['bank','999999','0'],['sales','0','999999']]);
  const evolution=createCompanyEvolutionService(pool,{companyIds:[a.id,b.id,empty.id],today:()=> '2026-10-24'});
  const before=await a.service.listEntries({exercise_id:a.years[0].id,view:'lines'}),report=await evolution.get();
  assert.equal(report.as_of,'2026-10-24');assert.equal(report.companies.length,3);assert.ok(!report.companies.some(company=>company.id===foreign.id));
  const first=report.companies.find(company=>company.id===a.id).years;
  assert.equal(first[0].net_equity,'1150.00');assert.equal(first[0].profit,'150.00');assert.equal(first[1].net_equity,'1224.99');assert.equal(first[1].profit,'74.99');assert.equal(first[1].partial,true);
  assert.equal(report.companies.find(company=>company.id===b.id).years[0].profit,'-50.00');
  assert.ok(report.companies.find(company=>company.id===empty.id).years.every(year=>year.net_equity===null&&year.profit===null&&!year.has_activity));
  for(const year of first){
   const sheet=await createReportService(pool,a.id).balanceSheet({exercise_id:year.exercise_id,date:year.cutoff});
   assert.equal(year.profit,sheet.generated_result);assert.equal(year.net_equity,sheet.sections.find(section=>section.id==='equity_liabilities-19').amount);
  }
  assert.deepEqual(await a.service.listEntries({exercise_id:a.years[0].id,view:'lines'}),before);
  await assert.rejects(evolution.get({as_of:'2026-02-30'}),error=>error.code==='INVALID_DATE');
 }finally{
  for(const companyId of ids){
   await pool.execute('DELETE FROM journal_lines WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM journal_entries WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[companyId]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});
