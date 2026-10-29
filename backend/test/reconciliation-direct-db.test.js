import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createBankImportService} from '../src/services/bank-import.js';
import {createBankReconciliationService} from '../src/services/bank-reconciliations.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup} from '../src/services/backup-format.js';
const error=code=>cause=>cause.code===code;
test('MySQL direct reconciliation: current list, atomic journal posting, criteria, retries and replacement',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],companies=createCompanyService(pool);
 const create=async name=>{const company=await companies.createCompany({name,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);return {...company,year:year.id};};
 const count=async(table,companyId)=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[companyId]))[0][0].n;
 try{
  const company=await create('Direct bank '+randomUUID()),foreign=await create('Foreign direct '+randomUUID()),accounting=createAccountingService(pool,company.id),imports=createBankImportService(pool,company.id),service=createBankReconciliationService(pool,company.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'Bank'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'}),expense=await accounting.createAccount({code:'6290.0001',description:'Cleaning'}),interest=await accounting.createAccount({code:'6620.0001',description:'Interest'});
  await accounting.createEntry({exercise_id:company.year,entry_date:'2026-01-01',description:'Opening',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'1000.00',credit:'0.00'},{account_id:capital.id,description:'Capital',debit:'0.00',credit:'1000.00'}]});
  const csv='Fecha;Concepto;Importe;Saldo\n10/01/2026;Opening;1000,00;1000,00\n12/01/2026;SERVEI NETEJA 01;-100,00;900,00\n20/01/2026;SERVEI NETEJA 02;-200,00;700,00';
  const prepare=async(content,direct=true)=>{const preview=await imports.preview(Buffer.from(content),company.year,'direct.csv','text/csv'),analysis=await imports.analyze({token:preview.token,account_id:bank.id,replace_current:direct});return {preview,analysis};};
  const old=await prepare(csv,false),oldSaved=await imports.commit({token:old.preview.token});await imports.discard({token:old.preview.token});let report;
  await t.test('upload opens a direct list and replaces the previous report in the same exercise',async()=>{
   const next=await prepare(csv+'\n'),saved=await imports.commit({token:next.preview.token});await imports.discard({token:next.preview.token});report=await service.get(saved.id);
   assert.equal(report.snapshot.workflow,'direct');assert.equal(report.snapshot.work_anchor.bank_date,'2026-01-10');assert.equal(report.snapshot.work_start_date,'2026-01-11');assert.equal(await count('bank_reconciliations',company.id),1);
   await assert.rejects(service.get(oldSaved.id),error('RECONCILIATION_NOT_FOUND'));assert.equal((await service.list({exercise_id:company.year}))[0].workflow,'direct');
  });
  const body=()=>({version:report.version,movement_id:2,date:'2026-01-12',concept:'SERVEI NETEJA 01',remember:true,rule_concept:'SERVEI NETEJA',counter_lines:[{account_id:expense.id,debit:'100.00',credit:'0.00'}],request_id:randomUUID()});
  await t.test('manual save posts exactly one balanced journal and remembers the criterion atomically',async()=>{
   const request=body(),[first,second]=await Promise.all([service.postMovement(report.id,request),service.postMovement(report.id,request)]);assert.equal(first.entry_id,second.entry_id);assert.equal(second.replayed,true);
   assert.equal(await count('journal_entries',company.id),2);assert.equal(await count('bank_reconciliation_rules',company.id),1);report=await service.get(report.id);
   assert.equal(report.posted_entries.length,1);assert.equal(report.posted_entries[0].status,'posted');assert.equal(report.snapshot.proposals[0].lines[0].debit,'200.00');assert.equal(report.snapshot.work_anchor.bank_date,'2026-01-10');
   const [lines]=await pool.execute('SELECT debit,credit FROM journal_lines WHERE company_id=? AND entry_id=?',[company.id,first.entry_id]);assert.equal(lines.length,2);assert.equal(lines[0].debit,'100.00');assert.equal(lines[1].credit,'100.00');
   await assert.rejects(service.postMovement(report.id,{...request,counter_lines:[{account_id:interest.id,debit:'100.00',credit:'0.00'}]}),error('REQUEST_CONFLICT'));
   await assert.rejects(service.postMovement(report.id,{...body(),version:report.version}),error('RECONCILIATION_MOVEMENT_MATCHED'));
  });
  await t.test('fresh uploads of the same file recalculate while retaining posted row status',async()=>{
   const repeated=await prepare(csv+'\n'),saved=await imports.commit({token:repeated.preview.token});await imports.discard({token:repeated.preview.token});assert.equal(saved.id,report.id);report=await service.get(saved.id);
   assert.equal(report.snapshot.posted_movements.length,1);assert.equal(report.snapshot.work_start_date,'2026-01-11');assert.equal(await count('journal_entries',company.id),2);
  });
  await t.test('a changed saved entry must be reviewed instead of posting a duplicate',async()=>{
   const entryId=report.snapshot.posted_movements[0].entry_id;
   async function change(amount){const entry=await accounting.getEntry(entryId);await accounting.updateEntry(entryId,{exercise_id:entry.exercise_id,entry_date:entry.entry_date,description:entry.description,revision:entry.revision,lines:entry.lines.map(line=>({id:line.id,account_id:line.account_id,description:line.description,debit:line.debit==='0.00'?'0.00':amount,credit:line.credit==='0.00'?'0.00':amount}))});}
   await change('90.00');report=await service.get(report.id);assert.equal(report.posted_entries[0].bank_amount,'-90.00');
   await assert.rejects(service.postMovement(report.id,body()),error('RECONCILIATION_ENTRY_CHANGED'));assert.equal(await count('journal_entries',company.id),2);
   await change('100.00');await service.reanalyze(report.id);report=await service.get(report.id);assert.equal(report.posted_entries[0].bank_amount,'-100.00');
  });
  await t.test('a failure while saving the list rolls back both the journal and its criterion',async()=>{
   const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('UPDATE bank_reconciliations SET snapshot='))throw new Error('Injected direct failure');return db.execute(sql,args);},query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   const next={...body(),movement_id:3,date:'2026-01-20',concept:'SERVEI NETEJA 02',rule_concept:'NETEJA 02',counter_lines:[{account_id:expense.id,debit:'160.00',credit:'0.00'},{account_id:interest.id,debit:'40.00',credit:'0.00'}]};
   await assert.rejects(createBankReconciliationService(failing,company.id).postMovement(report.id,next),/Injected direct failure/);assert.equal(await count('journal_entries',company.id),2);assert.equal(await count('bank_reconciliation_rules',company.id),1);
   await assert.rejects(createBankReconciliationService(pool,foreign.id).postMovement(report.id,next),error('RECONCILIATION_NOT_FOUND'));
   const result=await service.postMovement(report.id,next);assert.ok(result.entry_id);report=await service.get(report.id);assert.equal(report.snapshot.posted_movements.length,2);assert.equal(await count('journal_entries',company.id),3);
   const archive=readBackup((await createDataBackupService(pool,company.id).export()).file);assert.equal(archive.tables.bank_reconciliations[0].snapshot.posted_movements.length,2);
  });
  await t.test('a failed replacement keeps the current extract, and a new extract removes only its reports',async()=>{
   const future=await prepare(csv+'\n\n');
   const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('DELETE FROM bank_reconciliations WHERE company_id=? AND exercise_id=? AND id<>?'))throw new Error('Injected replacement failure');return db.execute(sql,args);},query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   await assert.rejects(createBankImportService(failing,company.id).commit({token:future.preview.token}),/Injected replacement failure/);assert.equal(await count('bank_reconciliations',company.id),1);await service.get(report.id);
   const next=await imports.commit({token:future.preview.token});await imports.discard({token:future.preview.token});assert.notEqual(next.id,report.id);assert.equal(await count('bank_reconciliations',company.id),1);assert.equal(await count('journal_entries',company.id),3);assert.equal(await count('bank_reconciliation_rules',company.id),2);
   await assert.rejects(service.get(report.id),error('RECONCILIATION_NOT_FOUND'));
  });
 }finally{
  for(const companyId of ids){for(const table of ['bank_reconciliation_rules','bank_reconciliations','bank_connections','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
