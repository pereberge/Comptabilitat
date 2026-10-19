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

test('MySQL: reports from posted entries with exact balances', {skip:process.env.TEST_MYSQL!=='1'}, async t => {
 const pool=mysql.createPool(config.database);let companyId,otherId,server;
 try {
  const [company]=await pool.execute('INSERT INTO companies(name) VALUES (?)',['Report integration test']);companyId=company.insertId;
  const [other]=await pool.execute('INSERT INTO companies(name) VALUES (?)',['Other report company']);otherId=other.insertId;
  const accounting=createAccountingService(pool,companyId),reports=createReportService(pool,companyId);
  const a=await accounting.createAccount({code:'4300.0001',description:'Debtor'});
  const b=await accounting.createAccount({code:'4300.0002',description:'Creditor'});
  const bank=await accounting.createAccount({code:'5720.0001',description:'Bank'});
  const empty=await accounting.createAccount({code:'4000.0001',description:'Unused'});
  const [period]=await pool.execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'Fiscal','2026-02-01','2027-01-31')",[companyId]);
  const exercise_id=period.insertId;
  const [next]=await pool.execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'Next','2027-02-01','2028-01-31')",[companyId]);
  const post=(date,lines,concept='Movement',exercise=exercise_id)=>accounting.createEntry({exercise_id:exercise,entry_date:date,description:concept,request_id:randomUUID(),lines:lines.map(([account,debit,credit],i)=>({account_id:account.id,description:concept+' '+i,debit,credit}))});
  const opening=await post('2026-02-01',[[a,'1000.00','0'],[bank,'0','1000.00']],'Opening');
  await post('2026-03-01',[[bank,'300.00','0'],[b,'0','300.00']]);
  await post('2026-03-01',[[a,'0','100.00'],[bank,'100.00','0']]);
  await post('2026-03-01',[[a,'0.10','0'],[a,'0.20','0'],[bank,'0','0.30']]);
  await post('2027-02-01',[[a,'999.00','0'],[bank,'0','999.00']],'Next year',next.insertId);
  for(const status of ['draft','cancelled']) {
   const entry=await post('2026-03-02',[[a,'500.00','0'],[bank,'0','500.00']],status);
   await pool.execute('UPDATE journal_entries SET status=? WHERE id=? AND company_id=?',[status,entry.id,companyId]);
  }
  const query={exercise_id,from:'2026-03-01',to:'2026-03-31'};
  await t.test('two-line entry reaches both ledgers exactly once',async()=>{
   const first=await reports.ledger({exercise_id,account_id:a.id,from:'2026-02-01',to:'2026-02-01'});
   const second=await reports.ledger({exercise_id,account_id:bank.id,from:'2026-02-01',to:'2026-02-01'});
   assert.equal(first.rows.length,1);assert.equal(second.rows.length,1);
   assert.equal(first.rows[0].entry_id,opening.id);assert.equal(first.totals.debit,'1000.00');assert.equal(second.totals.credit,'1000.00');
  });
  await t.test('running balance and deterministic same-day line order',async()=>{
   const result=await reports.ledger({...query,account_id:a.id});
   assert.deepEqual(result.rows.map(row=>row.balance),['900.00','900.10','900.30']);
   assert.deepEqual(result.rows.map(row=>row.position),[1,1,2]);
   assert.equal(result.totals.closing,'900.30');
  });
  await t.test('credit balances have a negative sign',async()=>{
   const result=await reports.ledger({...query,account_id:b.id});
   assert.equal(result.rows[0].balance,'-300.00');assert.equal(result.totals.closing,'-300.00');
  });
  await t.test('opening balance comes from earlier movements of same exercise',async()=>{
   const result=await reports.ledger({...query,account_id:a.id});
   assert.equal(result.totals.opening,'1000.00');assert.equal(result.totals.debit,'0.30');assert.equal(result.totals.credit,'100.00');
  });
  await t.test('opening entries are not duplicated or imported from another year',async()=>{
   const result=await reports.ledger({exercise_id,account_id:a.id});
   assert.equal(result.totals.opening,'0.00');assert.equal(result.totals.debit,'1000.30');
   const after=await reports.ledger({exercise_id:next.insertId,account_id:a.id});assert.equal(after.totals.debit,'999.00');assert.equal(after.totals.opening,'0.00');
  });
  await t.test('accumulated and period trial balance totals reconcile',async()=>{
   const result=await reports.trialBalance(query);
   assert.equal(result.from,'2026-02-01');assert.equal(result.totals.debit,'1400.30');assert.equal(result.totals.credit,'1400.30');assert.equal(result.checks.balanced,true);
   const period=await reports.trialBalance({...query,mode:'period'});
   assert.equal(period.totals.debit,'400.30');assert.equal(period.totals.credit,'400.30');assert.equal(period.totals.opening,'0.00');assert.equal(period.checks.balanced,true);
  });
  await t.test('debit and credit final balances classified correctly',async()=>{
   const result=await reports.trialBalance(query);
   const debtor=result.rows.find(row=>row.id===a.id),creditor=result.rows.find(row=>row.id===b.id);
   assert.equal(debtor.debtor,'900.30');assert.equal(debtor.creditor,'0.00');assert.equal(creditor.creditor,'300.00');assert.equal(creditor.debtor,'0.00');
  });
  await t.test('grouping nets opposite balances through real ancestor hierarchy',async()=>{
   for(const level of ['3','2','1']) {
    const result=await reports.trialBalance({...query,level});
    const row=result.rows.find(row=>row.code==='430'.slice(0,Number(level)));
    assert.equal(row.debtor,'600.30');assert.equal(row.creditor,'0.00');assert.equal(row.children.length,2);assert.equal(result.checks.balanced,true);
   }
  });
  await t.test('company and exercise isolation, date boundaries and invalid filters',async()=>{
   const foreign=createReportService(pool,otherId);
   await assert.rejects(foreign.ledger({...query,account_id:a.id}),e=>e.code==='EXERCISE_NOT_FOUND');
   await assert.rejects(foreign.trialBalance(query),e=>e.code==='EXERCISE_NOT_FOUND');
   await assert.rejects(reports.ledger({...query,from:'2026-01-01',account_id:a.id}),e=>e.code==='DATE_OUTSIDE_EXERCISE');
   await assert.rejects(reports.trialBalance({...query,level:'4'}),e=>e.code==='INVALID_REPORT_FILTER');
   const result=await reports.trialBalance({exercise_id:next.insertId});assert.equal(result.totals.debit,'999.00');
  });
  await t.test('draft and cancelled entries excluded',async()=>{
   const result=await reports.ledger({...query,account_id:a.id});
   assert.equal(result.rows.length,3);assert.equal(result.totals.debit,'0.30');
  });
  await t.test('empty accounts visibility and empty periods preserve previous balance',async()=>{
   assert.ok(!(await reports.trialBalance(query)).rows.some(row=>row.id===empty.id));
   const all=await reports.trialBalance({...query,show_empty:'true'});assert.ok(all.rows.some(row=>row.id===empty.id));
   const result=await reports.ledger({...query,from:'2026-04-01',to:'2026-04-30',account_id:a.id});
   assert.equal(result.rows.length,0);assert.equal(result.totals.opening,'900.30');assert.equal(result.totals.closing,'900.30');
  });
  await t.test('pagination parameters do not truncate calculations or export result',async()=>{
   assert.deepEqual(await reports.trialBalance(query),await reports.trialBalance({...query,page:'2',limit:'1'}));
   assert.deepEqual(await reports.ledger({...query,account_id:a.id}),await reports.ledger({...query,account_id:a.id,page:'2',limit:'1'}));
  });
  await t.test('backend returns exact discrepancy if historic data is unbalanced',async()=>{
   await pool.execute('UPDATE journal_lines SET debit=1000.01 WHERE entry_id=? AND account_id=?',[opening.id,a.id]);
   const result=await reports.trialBalance(query);
   assert.equal(result.checks.balanced,false);assert.equal(result.checks.differences.movements,'0.01');assert.equal(result.checks.differences.closing,'0.01');
   await pool.execute('UPDATE journal_lines SET debit=1000.00 WHERE entry_id=? AND account_id=?',[opening.id,a.id]);
  });
  await t.test('REST endpoints obey request company scope',async()=>{
   server=createApp(createContextService(pool,companyId),accounting,companyScope(pool,companyId)).listen(0,'127.0.0.1');
   await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
   const params=new URLSearchParams({...query,account_id:a.id});
   assert.equal((await fetch(base+'/api/accounting/ledger?'+params)).status,200);
   assert.equal((await fetch(base+'/api/accounting/trial-balance?'+params)).status,200);
   assert.equal((await fetch(base+'/api/accounting/ledger?'+params,{headers:{'X-Company-Id':String(otherId)}})).status,404);
  });
 } finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  if(companyId){
   await pool.execute('DELETE FROM journal_lines WHERE company_id=?',[companyId]);
   await pool.execute('DELETE FROM journal_entries WHERE company_id=?',[companyId]);
   await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[companyId]);
   const [rows]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);
   for(const row of rows)await pool.execute('DELETE FROM accounts WHERE id=?',[row.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  if(otherId)await pool.execute('DELETE FROM companies WHERE id=?',[otherId]);
  await pool.end();
 }
});
