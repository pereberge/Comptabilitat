import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createExerciseService } from '../src/services/exercises.js';
import { createJournalImportService } from '../src/services/journal-import.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createReportService } from '../src/services/reports.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';
import { journalPdf } from '../test-support/journal-fixture.js';

async function clean(pool,ids) {
  for(const id of ids){
    await pool.execute('DELETE FROM journal_lines WHERE company_id=?',[id]);await pool.execute('DELETE FROM journal_entries WHERE company_id=?',[id]);
    await pool.execute('DELETE FROM journal_imports WHERE company_id=?',[id]);await pool.execute('DELETE FROM accounting_exercises WHERE company_id=?',[id]);
    const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[id]);
    for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[id,row.id]);
    await pool.execute('DELETE FROM companies WHERE id=?',[id]);
  }
}
const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});

test('MySQL: exercise creation prevents overlap, isolates companies and atomically selects a default',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
  const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);
  try {
    for(let i=0;i<2;i++){const company=await context.createCompany({name:'Exercise test '+randomUUID(),exercise:period(2025)});ids.push(company.id);}
    const service=createExerciseService(pool,ids[0]), before=await service.list();
    const created=await service.create(period(2026));assert.equal(created.status,'open');assert.equal(created.is_default,true);
    const rows=await service.list();assert.equal(rows.find(row=>row.id===created.id).entries_count,0);assert.equal(rows.filter(row=>row.is_default).length,1);assert.equal(rows.find(row=>row.id===before[0].id).is_default,false);
    await assert.rejects(service.create({...period(2026),name:'Overlap'}),cause=>cause.code==='EXERCISE_PERIOD_OVERLAP');
    await assert.rejects(service.create({...period(2027),name:'2026'}),cause=>cause.code==='EXERCISE_NAME_EXISTS');
    await assert.rejects(service.create({...period(2027),start_date:'2027-02-30'}),cause=>cause.code==='INVALID_DATE');
    const concurrent=await Promise.allSettled([service.create(period(2027)),service.create(period(2027))]);assert.equal(concurrent.filter(row=>row.status==='fulfilled').length,1);
    assert.equal((await service.list()).filter(row=>row.is_default).length,1);assert.equal((await createExerciseService(pool,ids[1]).list()).length,1);
    const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM journal_entries WHERE company_id=?',[ids[0]]);assert.equal(count.total,0);
  }finally{await clean(pool,ids);await pool.end();}
});

test('MySQL: journal restoration is atomic, idempotent, source-faithful and supports closed-year reports',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
  const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId);let server;
  try {
    const companies=[];
    for(let i=0;i<3;i++){const company=await context.createCompany({name:'Journal test '+randomUUID(),exercise:period(2025)});ids.push(company.id);companies.push(company);}
    const [first,second,third]=companies, exercise=(await context.getContext(first.id)).exercises[0], service=createJournalImportService(pool,first.id);
    const source=journalPdf(first.name,{split:true}), preview=await service.preview(source,exercise.id,'test-journal.pdf');
    assert.equal(preview.totals.debit,'197.00');assert.equal(preview.sample[0].number,0);
    assert.equal((await createAccountingService(pool,first.id).listAccounts()).length,0);
    await assert.rejects(createJournalImportService(pool,second.id).commit(preview.token),cause=>cause.code==='JOURNAL_PREVIEW_EXPIRED');
    const results=await Promise.all([service.commit(preview.token),service.commit(preview.token)]);assert.deepEqual(results.map(row=>row.replayed).sort(),[false,true]);
    assert.equal(results[0].entries,4);assert.equal(results[0].lines,8);
    const repeat=await service.preview(source,exercise.id);assert.equal(repeat.already_imported,true);assert.equal((await service.commit(repeat.token)).replayed,true);
    const repaginated=await service.preview(journalPdf(first.name),exercise.id);assert.equal(repaginated.already_imported,true);
    await assert.rejects(service.preview(journalPdf(first.name.toUpperCase()),exercise.id),cause=>cause.code==='JOURNAL_NOT_EMPTY');
    const [[stored]]=await pool.execute('SELECT * FROM journal_imports WHERE company_id=?',[first.id]);
    assert.deepEqual(stored.source_pdf,source);assert.equal(stored.source_hash,createHash('sha256').update(source).digest('hex'));
    const accounting=createAccountingService(pool,first.id), entries=await accounting.listEntries({exercise_id:exercise.id,view:'lines'});
    assert.equal(entries.length,8);
    const opening=await accounting.listEntries({exercise_id:exercise.id,number:'0',view:'lines'});assert.equal(opening.length,2);
    const negative=await accounting.listEntries({exercise_id:exercise.id,number:'4',view:'lines'});assert.equal(negative[0].debit,'-1.50');assert.equal(negative[0].account_name,'BANCO ANTIGUO');
    assert.equal((await accounting.getEntry(negative[0].entry_id)).lines[0].account_description,'BANCO ANTIGUO');
    const [[zero]]=await pool.execute('SELECT COUNT(*) AS total FROM journal_lines WHERE company_id=? AND debit=0 AND credit=0',[first.id]);assert.equal(zero.total,2);
    assert.equal((await context.getContext(first.id)).exercises[0].status,'closed');
    const reports=createReportService(pool,first.id),full=await reports.trialBalance({exercise_id:exercise.id}),preclose=await reports.trialBalance({exercise_id:exercise.id,exclude_closing:'true'});
    assert.equal(full.totals.debit,'197.00');assert.equal(full.totals.debtor,'0.00');assert.equal(preclose.totals.debtor,'98.50');
    const balance=await reports.balanceSheet({exercise_id:exercise.id});assert.equal(balance.exclude_closing,true);assert.equal(balance.totals.assets,'98.50');assert.equal(balance.checks.balanced,true);
    const bank=(await accounting.listAccounts({kind:'subaccount'})).find(row=>row.code==='57200001');
    assert.equal((await reports.ledger({exercise_id:exercise.id,account_id:bank.id})).totals.closing,'0.00');
    assert.equal((await reports.ledger({exercise_id:exercise.id,account_id:bank.id,exclude_closing:true})).totals.closing,'98.50');
    const future=await createExerciseService(pool,first.id).create(period(2026));
    await assert.rejects(service.preview(source,future.id),cause=>cause.code==='JOURNAL_PERIOD_MISMATCH');
    assert.equal((await accounting.listEntries({exercise_id:future.id})).length,0);
    const manual={exercise_id:future.id,entry_date:'2026-01-01',description:'Manual',request_id:randomUUID(),lines:[{account_id:bank.id,description:'D',debit:'-1.50',credit:'0.00'},{account_id:bank.id,description:'C',debit:'0.00',credit:'-1.50'}]};
    await assert.rejects(accounting.createEntry(manual),cause=>cause.code==='INVALID_AMOUNT');
    await assert.rejects(accounting.createEntry({...manual,lines:manual.lines.map(line=>({...line,debit:'0.00',credit:'0.00'}))}),cause=>cause.code==='INVALID_LINE_AMOUNTS');
    await assert.rejects(createJournalImportService(pool,second.id).preview(source,(await context.getContext(second.id)).exercises[0].id),cause=>cause.code==='JOURNAL_COMPANY_MISMATCH');

    const secondExercise=(await context.getContext(second.id)).exercises[0];
    const failingPool={execute:pool.execute.bind(pool),async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.includes('INSERT INTO journal_lines')&&args[3]===2)throw new Error('Injected line failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
    const failing=createJournalImportService(failingPool,second.id),failedPreview=await failing.preview(journalPdf(second.name),secondExercise.id);
    await assert.rejects(failing.commit(failedPreview.token),/Injected line failure/);
    assert.equal((await createAccountingService(pool,second.id).listAccounts()).length,0);assert.equal((await context.getContext(second.id)).exercises[0].status,'open');
    for(const table of ['journal_imports','journal_entries','journal_lines']){const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM '+table+' WHERE company_id=?',[second.id]);assert.equal(count.total,0);}
    const occupied=createAccountingService(pool,second.id),bank2=await occupied.createAccount({code:'5720.0001',description:'Bank'}),capital2=await occupied.createAccount({code:'1000.0000',description:'Capital'});
    await occupied.createEntry({exercise_id:secondExercise.id,entry_date:'2025-01-01',description:'Existing manual entry',request_id:randomUUID(),lines:[{account_id:bank2.id,description:'D',debit:'1.00',credit:'0.00'},{account_id:capital2.id,description:'C',debit:'0.00',credit:'1.00'}]});
    await assert.rejects(createJournalImportService(pool,second.id).preview(journalPdf(second.name),secondExercise.id),cause=>cause.code==='JOURNAL_NOT_EMPTY');
    assert.equal((await occupied.listEntries({exercise_id:secondExercise.id})).length,1);

    server=createApp(context,accounting,companyScope(pool,first.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const url='http://127.0.0.1:'+server.address().port+'/api',headers={'X-Company-Id':String(third.id)};
    const thirdExercise=(await context.getContext(third.id)).exercises[0];
    const response=await fetch(url+'/journal-import/preview?exercise_id='+thirdExercise.id,{method:'POST',headers:{...headers,'Content-Type':'application/pdf'},body:journalPdf(third.name)});assert.equal(response.status,200);
    const data=await response.json(),committed=await fetch(url+'/journal-import/commit',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({token:data.token})});assert.equal(committed.status,200);assert.equal((await committed.json()).entries,4);
    const listed=await(await fetch(url+'/exercises',{headers})).json();assert.equal(listed[0].import.lines,8);assert.equal(listed[0].status,'closed');
    const createdResponse=await fetch(url+'/exercises',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(period(2026))});assert.equal(createdResponse.status,201);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await clean(pool,ids);await pool.end();}
});
