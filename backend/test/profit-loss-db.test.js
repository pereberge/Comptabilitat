import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createReportService} from '../src/services/reports.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';

test('MySQL monthly statements: periods, comparison, annual entries, ledger and API isolation',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[];let server;
 async function company(){const [row]=await pool.execute('INSERT INTO companies(name) VALUES (?)',['Fictitious monthly reports '+randomUUID()]);ids.push(row.insertId);return row.insertId;}
 try{
  const companyId=await company(),foreign=await company(),accounting=createAccountingService(pool,companyId),reports=createReportService(pool,companyId);
  const years=[];for(const year of [2023,2024]){const [row]=await pool.execute('INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,?,?,?)',[companyId,String(year),year+'-01-01',year+'-12-31']);years.push(row.insertId);}
  const bank=await accounting.createAccount({code:'5720.0001',description:'Bank'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'}),sales=await accounting.createAccount({code:'7000.0001',description:'Sales'}),expense=await accounting.createAccount({code:'6000.0001',description:'Supplies'}),tax=await accounting.createAccount({code:'6300.0001',description:'Income tax'}),result=await accounting.createAccount({code:'1290.0001',description:'Profit'});
  async function post(year,day,lines,type='normal',status='posted'){
   const entry=await accounting.createEntry({exercise_id:years[year],entry_date:day,description:'Fictitious '+type,request_id:randomUUID(),lines:lines.map(([account,debit,credit])=>({account_id:account.id,description:'Fictitious',debit,credit}))});
   if(type!=='normal'||status!=='posted')await pool.execute('UPDATE journal_entries SET entry_type=?,status=? WHERE company_id=? AND id=?',[type,status,companyId,entry.id]);return entry;
  }
  const sale=(year,day,value,status)=>post(year,day,[[bank,value,'0'],[sales,'0',value]],'normal',status);
  await sale(0,'2023-01-15','100.00');await sale(0,'2023-02-28','50.00');await sale(0,'2023-03-01','70.00');
  await post(1,'2024-01-01',[[bank,'2000.00','0'],[capital,'0','2000.00']],'opening');await post(1,'2024-01-01',[[bank,'10000.00','0'],[sales,'0','10000.00']],'opening');
  await sale(1,'2024-01-15','200.00');await post(1,'2024-02-01',[[expense,'60.00','0'],[bank,'0','60.00']]);await sale(1,'2024-02-29','100.25');await sale(1,'2024-03-01','90.00');
  await sale(1,'2024-02-05','9000.00','cancelled');await sale(1,'2024-02-05','8000.00','draft');
  await post(1,'2024-12-31',[[tax,'20.00','0'],[bank,'0','20.00']]);
  await post(1,'2024-12-31',[[sales,'390.25','0'],[expense,'0','60.00'],[tax,'0','20.00'],[result,'0','310.25']],'regularization');
  await post(1,'2024-12-31',[[capital,'20.00','0'],[bank,'0','20.00']],'closing');
  await t.test('monthly and cumulative results exclude drafts, cancelled, opening, regularization and closing entries',async()=>{
   const month=await reports.profitLoss({exercise_id:years[1],from:'2024-02-01',to:'2024-02-29'});assert.equal(month.totals.net,'40.25');assert.equal(month.checks.complete,true);
   assert.equal((await reports.profitLoss({exercise_id:years[1],to:'2024-02-29'})).totals.net,'240.25');
   assert.equal((await reports.profitLoss({exercise_id:years[1]})).totals.net,'310.25');
   const empty=await reports.profitLoss({exercise_id:years[1],from:'2024-04-01',to:'2024-04-30'});assert.equal(empty.has_activity,false);assert.equal(empty.totals.net,'0.00');
  });
  await t.test('both periods have independent date ranges and leap-year comparison',async()=>{
   const report=await reports.profitLoss({exercise_id:years[1],to:'2024-02-29',compare_previous:true});assert.equal(report.comparison.previous.to,'2023-02-28');assert.deepEqual(report.comparison.totals.net,{amount:'240.25',previous_amount:'150.00',difference:'90.25'});
   const custom=await reports.profitLoss({exercise_id:years[1],to:'2024-02-29',compare_previous:true,previous_from:'2023-01-01',previous_to:'2023-01-31'});assert.equal(custom.comparison.previous.to,'2023-01-31');assert.equal(custom.comparison.previous.totals.net,'100.00');
   const missing=await reports.profitLoss({exercise_id:years[0],compare_previous:true});assert.equal(missing.comparison.reason,'PREVIOUS_EXERCISE_NOT_FOUND');
  });
  await t.test('balance-sheet comparison supports independently chosen month cutoffs',async()=>{
   const sheet=await reports.balanceSheet({exercise_id:years[1],date:'2024-02-29',compare_previous:true,previous_date:'2023-03-31'});assert.equal(sheet.comparison.previous.date,'2023-03-31');assert.equal(sheet.comparison.previous.totals.assets,'220.00');
  });
  await t.test('ledger drill-down uses the same annual-entry exclusions including opening balance',async()=>{
   const ledger=await reports.ledger({exercise_id:years[1],account_id:sales.id,from:'2024-02-01',to:'2024-12-31',exclude_annual:true});assert.equal(ledger.rows.length,2);assert.equal(ledger.totals.opening,'-200.00');assert.equal(ledger.totals.debit,'0.00');assert.equal(ledger.totals.credit,'190.25');assert.equal(ledger.exclude_annual,true);
  });
  await t.test('invalid current and previous ranges are rejected',async()=>{
   for(const query of [{from:'2024-03-01',to:'2024-02-29'},{from:'2023-12-01'},{compare_previous:'yes'},{exclude_annual:'yes'},{compare_previous:true,previous_from:'2023-03-01',previous_to:'2023-02-28'},{compare_previous:true,previous_to:'2022-01-01'}])await assert.rejects(reports.profitLoss({exercise_id:years[1],...query}));
   await assert.rejects(reports.balanceSheet({exercise_id:years[1],compare_previous:true,previous_date:'2022-01-01'}));
   await assert.rejects(reports.profitLoss({exercise_id:years[1],company_id:foreign}));
  });
  await t.test('a full February compares through February 29 in a leap prior year',async()=>{
   const [next]=await pool.execute('INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,?,?,?)',[companyId,'2025','2025-01-01','2025-12-31']);
   const report=await reports.profitLoss({exercise_id:next.insertId,to:'2025-02-28',compare_previous:true});assert.equal(report.comparison.previous.to,'2024-02-29');assert.equal(report.comparison.previous.totals.net,'240.25');
   const sheet=await reports.balanceSheet({exercise_id:next.insertId,date:'2025-02-28',compare_previous:true});assert.equal(sheet.comparison.previous.date,'2024-02-29');
  });
  await t.test('three exercises use independent periods, report absent years, and preserve exact results',async()=>{
   const missing=await reports.profitLoss({exercise_id:years[1],to:'2024-02-29',compare_previous:true,comparison_count:3});
   assert.equal(missing.comparison.multiple.periods.length,3);assert.equal(missing.comparison.multiple.periods[2].reason,'PREVIOUS_EXERCISE_NOT_FOUND');assert.deepEqual(missing.comparison.multiple.totals.net,['240.25','150.00',null]);
   const [old]=await pool.execute('INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,?,?,?)',[companyId,'2022','2022-01-01','2022-12-31']);years.push(old.insertId);
   await sale(2,'2022-01-15','33.33');await sale(2,'2022-02-28','66.66');await sale(2,'2022-03-01','99.99');
   const triple=await reports.profitLoss({exercise_id:years[1],to:'2024-02-29',compare_previous:true,comparison_count:'3'});
   assert.deepEqual(triple.comparison.multiple.periods.map(period=>period.sheet.exercise.name),['2024','2023','2022']);assert.deepEqual(triple.comparison.multiple.totals.net,['240.25','150.00','99.99']);assert.equal(triple.comparison.multiple.periods[2].sheet.to,'2022-02-28');
   const custom=await reports.profitLoss({exercise_id:years[1],to:'2024-02-29',compare_previous:true,comparison_count:3,previous_from:'2023-02-01',previous_to:'2023-02-28',older_from:'2022-03-01',older_to:'2022-03-31'});
   assert.deepEqual(custom.comparison.multiple.totals.net,['240.25','50.00','99.99']);assert.equal(custom.comparison.multiple.periods[2].sheet.from,'2022-03-01');
   for(const query of [{comparison_count:4},{comparison_count:'3.0'},{comparison_count:[]},{comparison_count:3,older_from:'2022-03-01',older_to:'2022-02-28'},{comparison_count:3,older_to:'2021-12-31'},{comparison_count:3,older_from:'bad'}])await assert.rejects(reports.profitLoss({exercise_id:years[1],compare_previous:true,...query}));
   const [[next]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND name=?',[companyId,'2025']);const empty=await reports.profitLoss({exercise_id:next.id,compare_previous:true,comparison_count:3});assert.deepEqual(empty.comparison.multiple.totals.net,['0.00','310.25','220.00']);
   const hidden=await reports.profitLoss({exercise_id:years[1],compare_previous:false,comparison_count:3});assert.equal(hidden.comparison,undefined);
  });
  await t.test('non-calendar exercises compare their own fiscal boundaries',async()=>{
   const fiscalId=await company(),fiscalReports=createReportService(pool,fiscalId);let current;
   for(const [name,start,end] of [['2024/25','2024-07-15','2025-06-30'],['2025/26','2025-07-01','2026-06-20']]){const [row]=await pool.execute('INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,?,?,?)',[fiscalId,name,start,end]);current=row.insertId;}
   const full=await fiscalReports.profitLoss({exercise_id:current,compare_previous:true});assert.equal(full.comparison.previous.from,'2024-07-15');assert.equal(full.comparison.previous.to,'2025-06-30');assert.equal(full.comparison.has_activity,false);
   const partial=await fiscalReports.profitLoss({exercise_id:current,from:'2026-01-01',to:'2026-03-31',compare_previous:true});assert.equal(partial.comparison.previous.from,'2025-01-01');assert.equal(partial.comparison.previous.to,'2025-03-31');
  });
  await t.test('read-only API routes enforce company scope',async()=>{
   const app=createApp({},{},companyScope(pool,companyId));server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
   let response=await fetch(base+'/api/accounting/profit-loss?exercise_id='+years[1]+'&from=2024-02-01&to=2024-02-29',{headers:{'X-Company-Id':String(companyId)}});assert.equal(response.status,200);assert.equal((await response.json()).totals.net,'40.25');
   response=await fetch(base+'/api/accounting/profit-loss?exercise_id='+years[1]+'&compare_previous=true&comparison_count=3',{headers:{'X-Company-Id':String(companyId)}});assert.equal(response.status,200);assert.deepEqual((await response.json()).comparison.multiple.periods.map(period=>period.sheet.company.id),[companyId,companyId,companyId]);
   response=await fetch(base+'/api/accounting/profit-loss?exercise_id='+years[1]+'&compare_previous=true&comparison_count=3',{headers:{'X-Company-Id':String(foreign)}});assert.equal(response.status,404);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const id of ids){await pool.execute('DELETE FROM journal_lines WHERE company_id=?',[id]);await pool.execute('DELETE FROM journal_entries WHERE company_id=?',[id]);await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[id]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[id]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[id,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[id]);}await pool.end();
 }
});
