import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createReportService } from '../src/services/reports.js';
import { createApp } from '../src/app.js';
import { createContextService } from '../src/services/context.js';
import { companyScope } from '../src/middleware/company-scope.js';

test('MySQL: multi-exercise ledger preserves each annual balance', {skip:process.env.TEST_MYSQL!=='1'}, async t=>{
 const pool=mysql.createPool(config.database),companies=[];let server;
 try{
  for(const name of ['Multi-exercise ledger test','Other multi-exercise company']){
   const [row]=await pool.execute('INSERT INTO companies(name) VALUES (?)',[name]);companies.push(row.insertId);
  }
  const [companyId,otherId]=companies,accounting=createAccountingService(pool,companyId),reports=createReportService(pool,companyId);
  const account=await accounting.createAccount({code:'4300.0001',description:'Multi-year customer'});
  const bank=await accounting.createAccount({code:'5720.0001',description:'Test bank'});
  const empty=await accounting.createAccount({code:'4000.0001',description:'No movements'});
  const years=[];
  for(const [name,start,end]of [['2023/24','2023-04-01','2024-03-31'],['2025/26','2025-04-01','2026-03-31'],['2026/27','2026-04-01','2027-03-31']]){
   const [row]=await pool.execute('INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,?,?,?)',[companyId,name,start,end]);years.push(row.insertId);
  }
  const [foreignYear]=await pool.execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'Foreign','2026-04-01','2027-03-31')",[otherId]);
  const foreignAccount=await createAccountingService(pool,otherId).createAccount({code:'4300.0001',description:'Other customer'});
  const post=async(exercise_id,entry_date,debit,credit,type='normal',status='posted')=>{
   const entry=await accounting.createEntry({exercise_id,entry_date,description:type,request_id:randomUUID(),lines:[{account_id:account.id,description:type,debit,credit},{account_id:bank.id,description:type,debit:credit,credit:debit}]});
   await pool.execute('UPDATE journal_entries SET entry_type=?,status=? WHERE company_id=? AND id=?',[type,status,companyId,entry.id]);return entry;
  };
  await post(years[0],'2023-04-01','100.00','0','opening');
  await post(years[0],'2023-05-10','0','20.00');
  await post(years[0],'2024-03-31','0','80.00','closing');
  await post(years[1],'2025-04-01','80.00','0','opening');
  await post(years[1],'2025-05-10','0','30.00');
  await post(years[1],'2026-03-31','0','50.00','closing');
  await post(years[2],'2026-04-01','50.00','0','opening');
  await post(years[2],'2026-05-10','0.10','0');
  await post(years[2],'2026-05-10','0.20','0');
  await post(years[1],'2025-06-01','900.00','0','normal','draft');
  await post(years[1],'2025-06-02','800.00','0','normal','cancelled');
  await pool.execute("UPDATE accounting_exercises SET status='closed' WHERE company_id=? AND id IN (?,?)",[companyId,years[0],years[1]]);
  const query={company_id:companyId,exercise_id:years[2],account_id:account.id,multi_exercise:'true',exercise_from_id:years[0],exercise_to_id:years[2]};
  const counts=async()=>{
   const [[row]]=await pool.execute('SELECT (SELECT COUNT(*) FROM journal_entries WHERE company_id=?) AS entries,(SELECT COUNT(*) FROM journal_lines WHERE company_id=?) AS line_count,(SELECT COUNT(*) FROM accounting_exercises WHERE company_id=?) AS exercises',[companyId,companyId,companyId]);return row;
  };
  const before=await counts();
  await t.test('includes closed, non-calendar and nonconsecutive exercises in chronological order',async()=>{
   const result=await reports.ledger(query);
   assert.equal(result.multi_exercise,true);assert.equal(result.from,'2023-04-01');assert.equal(result.to,'2027-03-31');
   assert.deepEqual(result.sections.map(s=>s.exercise.id),years);
   assert.deepEqual(result.sections.map(s=>s.rows[0].number),[1,1,1]);
   assert.deepEqual(result.sections.map(s=>s.rows[0].balance),['100.00','80.00','50.00']);
   assert.deepEqual(result.sections.map(s=>s.totals.closing),['0.00','0.00','50.30']);
   assert.equal(result.sections[1].rows.length,3); // Drafts and cancellations excluded.
   assert.equal(result.totals,undefined); // No misleading sum of annual balances.
  });
  await t.test('excluding closings preserves each opening once without carrying a balance twice',async()=>{
   const result=await reports.ledger({...query,exclude_closing:true});
   assert.deepEqual(result.sections.map(s=>s.totals.closing),['80.00','50.00','50.30']);
   assert.deepEqual(result.sections.map(s=>s.totals.opening),['0.00','0.00','0.00']);
   assert.equal(result.sections[2].totals.debit,'50.30');
  });
  await t.test('clips dates to each exercise and calculates the earlier balance in that exercise',async()=>{
   const result=await reports.ledger({...query,from:'2023-05-01',to:'2026-05-10',exclude_closing:'true'});
   assert.equal(result.sections[0].from,'2023-05-01');assert.equal(result.sections[0].totals.opening,'100.00');
   assert.equal(result.sections[1].from,'2025-04-01');assert.equal(result.sections[1].to,'2026-03-31');
   assert.equal(result.sections[2].to,'2026-05-10');assert.equal(result.sections[2].totals.closing,'50.30');
   const later=await reports.ledger({...query,from:'2026-05-01',to:'2026-05-10'});
   assert.equal(later.sections.length,1);assert.equal(later.sections[0].totals.opening,'50.00');
  });
  await t.test('handles empty accounts, empty periods and a range containing a single exercise',async()=>{
   const result=await reports.ledger({...query,account_id:empty.id});
   assert.equal(result.sections.length,3);assert.ok(result.sections.every(s=>s.rows.length===0&&s.totals.closing==='0.00'));
   const period=await reports.ledger({...query,from:'2025-07-01',to:'2025-07-31'});
   assert.equal(period.sections.length,1);assert.equal(period.sections[0].rows.length,0);assert.equal(period.sections[0].totals.opening,'50.00');
   const single=await reports.ledger({...query,exercise_from_id:years[1],exercise_to_id:years[1]});
   const legacy=await reports.ledger({exercise_id:years[1],account_id:account.id});
   assert.deepEqual(single.sections[0].rows,legacy.rows);assert.deepEqual(single.sections[0].totals,legacy.totals);
  });
  await t.test('rejects foreign exercises/accounts, reversed ranges, invalid filters and dates',async()=>{
   for(const key of ['exercise_id','exercise_from_id','exercise_to_id'])await assert.rejects(reports.ledger({...query,[key]:foreignYear.insertId}),e=>e.code==='EXERCISE_NOT_FOUND');
   await assert.rejects(reports.ledger({...query,account_id:foreignAccount.id}),e=>e.code==='ACCOUNT_NOT_FOUND');
   await assert.rejects(reports.ledger({...query,company_id:otherId}),e=>e.code==='INVALID_COMPANY');
   await assert.rejects(reports.ledger({...query,exercise_from_id:years[2],exercise_to_id:years[0]}),e=>e.code==='INVALID_REPORT_FILTER');
   await assert.rejects(reports.ledger({...query,multi_exercise:'all'}),e=>e.code==='INVALID_REPORT_FILTER');
   await assert.rejects(reports.ledger({...query,exclude_closing:'yes'}),e=>e.code==='INVALID_REPORT_FILTER');
   await assert.rejects(reports.ledger({...query,exercise_from_id:undefined}),e=>e.code==='INVALID_ID');
   for(const dates of [{from:'2023-03-31'},{to:'2027-04-01'},{from:'2026-05-11',to:'2026-05-10'},{from:'2024-06-01',to:'2024-07-01'}])await assert.rejects(reports.ledger({...query,...dates}),e=>e.code==='DATE_OUTSIDE_EXERCISE');
   await assert.rejects(reports.ledger({...query,from:'2026-02-30'}),e=>e.code==='INVALID_DATE');
   await assert.rejects(reports.ledger({...query,multi_exercise:false,from:'2023-04-01'}),e=>e.code==='DATE_OUTSIDE_EXERCISE');
  });
  await t.test('REST response respects scope and entry details across exercises',async()=>{
   server=createApp(createContextService(pool,companyId),accounting,companyScope(pool,companyId)).listen(0,'127.0.0.1');
   await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
   const url=base+'/api/accounting/ledger?'+new URLSearchParams(query);
   const response=await fetch(url);assert.equal(response.status,200);const result=await response.json();
   assert.equal(result.sections.length,3);
   const detail=await fetch(base+'/api/entries/'+result.sections[0].rows[0].entry_id);assert.equal(detail.status,200);
   assert.equal((await detail.json()).exercise_id,years[0]);
   assert.equal((await fetch(url,{headers:{'X-Company-Id':String(otherId)}})).status,400);
  });
  assert.deepEqual(await counts(),before);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of companies){
   await pool.execute('DELETE FROM journal_lines WHERE company_id=?',[companyId]);
   await pool.execute('DELETE FROM journal_entries WHERE company_id=?',[companyId]);
   await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[companyId]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);
   for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE id=?',[row.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});