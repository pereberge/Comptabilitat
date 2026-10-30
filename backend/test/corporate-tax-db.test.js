import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCorporateTaxService} from '../src/services/corporate-tax.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createContextService} from '../src/services/context.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
test('MySQL: IS annual source, add-back, drafts, backup portability and access',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),db=await pool.getConnection();await db.beginTransaction();let server;
 const execute=db.execute.bind(db),scoped={execute,getConnection:async()=>({execute,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}})};
 try{
  const [company]=await execute('INSERT INTO companies(name) VALUES (?)',['IS rollback fixture']),companyId=company.insertId;
  await execute('INSERT INTO company_details(company_id,tax_id) VALUES (?,?)',[companyId,'B12345674']);
  const [other]=await execute('INSERT INTO companies(name) VALUES (?)',['IS other fixture']),otherId=other.insertId;
  await execute('INSERT INTO company_details(company_id,tax_id) VALUES (?,?)',[otherId,'B12345674']);
  const [exercise]=await execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'IS 2025','2025-01-01','2025-12-31')",[companyId]),exerciseId=exercise.insertId;
  const [prior]=await execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'IS 2024','2024-01-01','2024-12-31')",[companyId]);
  const accounting=createAccountingService(scoped,companyId),tax=createCorporateTaxService(scoped,companyId),query={exercise_id:exerciseId},accounts={};
  for(const [key,code]of [['sales','7000'],['expense','6290'],['bank','5720'],['current','6300'],['credits','4730'],['payable','4752'],['refund','4709']])accounts[key]=await accounting.createAccount({code:code+'.0001',description:'IS '+key});
  async function entry(year,debit,credit,total,description='IS fixture entry'){return accounting.createEntry({exercise_id:year,entry_date:year===exerciseId?'2025-06-01':'2024-06-01',description,request_id:randomUUID(),lines:[{account_id:accounts[debit].id,description,debit:total,credit:'0.00'},{account_id:accounts[credit].id,description,debit:'0.00',credit:total}]});}
  await entry(prior.insertId,'bank','sales','400000.00');await entry(exerciseId,'bank','sales','120000.00');const expense=await entry(exerciseId,'expense','bank','20000.00');await entry(exerciseId,'credits','bank','1000.00');
  const opening=await entry(exerciseId,'credits','bank','5000.00');await execute("UPDATE journal_entries SET entry_type='opening' WHERE company_id=? AND id=?",[companyId,opening.id]);
  let saved;
  await t.test('actual PGC parents and fiscal dates produce an annual source without opening entries',async()=>{
   const data=await tax.get(query);assert.equal(data.summary.net_result,'100000.00');assert.equal(data.summary.credits,'1000.00');assert.equal(data.result,'24000.00');assert.equal(data.source.complete,true);assert.equal(data.source.previous_turnover.amount,'400000.00');assert.equal(data.input.previous_turnover,null);assert.equal(data.source.records.length,3);
   await assert.rejects(createCorporateTaxService(scoped,otherId).get(query),{code:'EXERCISE_NOT_FOUND'});
  });
  await t.test('source-linked adjustments, review, optimistic versions and a balanced read-only proposal',async()=>{
   const data=await tax.get(query),row=data.source.records.find(row=>row.entry_id===expense.id);
   const input={...data.input,previous_turnover:'400000.00',regime:'micro',confirmed_general:true,reviewed_source_hash:data.source_hash,adjustments:[{id:randomUUID(),description:'Multa no deducible',direction:'increase',kind:'permanent',amount:'100.00',source_key:row.key,fingerprint:row.fingerprint}]};
   saved=await tax.save(query,{version:0,input});assert.equal(saved.draft.version,1);assert.equal(saved.provisional,false);assert.equal(saved.result,'20522.00');assert.equal(saved.settlement_proposal.ready,true);assert.equal(saved.settlement_proposal.totals.debit,saved.settlement_proposal.totals.credit);assert.equal(saved.settlement_proposal.lines.length,3);
   assert.deepEqual((await tax.get(query)).input,saved.input);await assert.rejects(tax.save(query,{version:0,input}),{code:'CORPORATE_TAX_DRAFT_CONFLICT'});
   const [[count]]=await execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=? AND exercise_id=?',[companyId,exerciseId]);assert.equal(count.count,4);
  });
  await t.test('closed years retain activity while closing and regularization do not zero the income statement',async()=>{
   const closing=await entry(exerciseId,'sales','bank','120000.00');await execute("UPDATE journal_entries SET entry_type='regularization' WHERE company_id=? AND id=?",[companyId,closing.id]);await execute("UPDATE accounting_exercises SET status='closed' WHERE company_id=? AND id=?",[companyId,exerciseId]);
   const data=await tax.get(query);assert.equal(data.summary.net_result,'100000.00');assert.equal(data.source_hash,saved.source_hash);assert.equal(data.provisional,false);assert.ok(data.settlement_proposal.issues.includes('CORPORATE_TAX_EXERCISE_CLOSED'));
   await execute("UPDATE accounting_exercises SET status='open' WHERE company_id=? AND id=?",[companyId,exerciseId]);
  });
  await t.test('exercise backups preserve the draft and stable evidence across new database IDs',async()=>{
   const backups=createDataBackupService(scoped,companyId),archive=await backups.export('all'),parsed=readBackup(archive.file);assert.equal(parsed.tables.corporate_tax_drafts.length,1);assert.equal(parsed.tables.corporate_tax_drafts[0].exercise_id,exerciseId);
   const dest=createDataBackupService(scoped,otherId),preview=await dest.preview(archive.file,'all');assert.equal(preview.ready,true);const restored=await dest.restore({token:preview.token,request_id:randomUUID(),confirm:true});
   const [[destYear]]=await execute("SELECT id FROM accounting_exercises WHERE company_id=? AND start_date='2025-01-01'",[otherId]);assert.ok(restored.exercise_ids.includes(destYear.id));const loaded=await createCorporateTaxService(scoped,otherId).get({exercise_id:destYear.id});assert.equal(loaded.source_hash,saved.source_hash);assert.equal(loaded.adjustments[0].stale,false);assert.equal(loaded.result,saved.result);assert.equal(loaded.provisional,false);
   const legacy={...parsed};delete legacy.checksum;for(const section of ['tables','references','schema']){legacy[section]={...parsed[section]};delete legacy[section].corporate_tax_drafts;}assert.deepEqual(readBackup(packBackup(sealBackup(legacy))).tables.corporate_tax_drafts,[]);
   const yearOnly=readBackup((await backups.export(prior.insertId)).file);assert.equal(yearOnly.tables.corporate_tax_drafts.length,0);
  });
  await t.test('HTTP allows assigned-company preview and blocks writing without accounting permission',async()=>{
   const user={key:'is-test',role:'user',company_ids:[companyId],permissions:{accounting_write:false}};
   server=createApp(createContextService(scoped,companyId),accounting,companyScope(scoped,companyId),accessControl({current:async()=>user})).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const origin='http://127.0.0.1:'+server.address().port,qs='?exercise_id='+exerciseId,headers={'Content-Type':'application/json','X-Company-Id':String(companyId)};
   assert.equal((await fetch(origin+'/api/tax/corporate'+qs,{headers})).status,200);assert.equal((await fetch(origin+'/api/tax/corporate'+qs,{headers:{...headers,'X-Company-Id':String(otherId)}})).status,403);
   assert.equal((await fetch(origin+'/api/tax/corporate/preview'+qs,{method:'POST',headers,body:JSON.stringify(saved.input)})).status,200);assert.equal((await fetch(origin+'/api/tax/corporate/draft'+qs,{method:'PUT',headers,body:JSON.stringify({version:1,input:saved.input})})).status,403);
  });
  await t.test('a posted IS accrual is added back without losing its cleared 473 prepayments',async()=>{
   const model=await tax.get(query),proposal=model.settlement_proposal;
   await accounting.createEntry({exercise_id:exerciseId,entry_date:proposal.date,description:proposal.description,request_id:randomUUID(),lines:proposal.lines.map(line=>({account_id:line.account_id,description:line.description,debit:line.debit,credit:line.credit}))});
   const data=await tax.get(query);assert.equal(data.summary.before_tax,'100000.00');assert.equal(data.summary.credits,'1000.00');assert.equal(data.result,saved.result);assert.equal(data.settlement_proposal.existing.length,1);assert.equal(data.settlement_proposal.lines.length,0);assert.equal(data.provisional,true);
   await assert.rejects(tax.save(query,{version:1,input:saved.input}),{code:'CORPORATE_TAX_SOURCE_CHANGED'});
  });
  await t.test('exercise clearing archives and removes only this exercise draft',async()=>{
   const clear=createExerciseClearService(scoped,companyId),preview=await clear.preview(exerciseId);assert.equal(preview.counts.corporate_drafts,1);const cleared=await clear.clear(exerciseId,{preview_hash:preview.preview_hash,confirmation:'96',request_id:randomUUID()});assert.equal(cleared.counts.corporate_drafts,1);assert.equal((await tax.get(query)).draft.version,0);const archive=await clear.backup(cleared.clear_id);let found=false;for await(const row of archive.rows())if(row.table==='corporate_tax_drafts')found=true;assert.equal(found,true);
  });
 }finally{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await db.rollback();db.release();await pool.end();}
});
