import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createInstallmentTaxService} from '../src/services/installment-tax.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
import {createApp} from '../src/app.js';
import {createContextService} from '../src/services/context.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
test('MySQL: model 202 periods, actual evidence, separate drafts, portable backup and access',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),db=await pool.getConnection();await db.beginTransaction();let server;
 const execute=db.execute.bind(db),scoped={execute,getConnection:async()=>({execute,beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}})};
 try{
  const [company]=await execute('INSERT INTO companies(name) VALUES (?)',['202 rollback fixture']),companyId=company.insertId;
  const [other]=await execute('INSERT INTO companies(name) VALUES (?)',['202 restore fixture']),otherId=other.insertId;
  for(const owner of [companyId,otherId])await execute('INSERT INTO company_details(company_id,tax_id) VALUES (?,?)',[owner,'B12345674']);
  const [year]=await execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'2026','2026-01-01','2026-12-31')",[companyId]),exerciseId=year.insertId;
  const accounting=createAccountingService(scoped,companyId),tax=createInstallmentTaxService(scoped,companyId),accounts={};
  for(const [key,code]of [['sales','7000'],['expense','6290'],['bank','5720'],['credits','4730']])accounts[key]=await accounting.createAccount({code:code+'.0001',description:'202 '+key});
  async function entry(date,debit,credit,total){return accounting.createEntry({exercise_id:exerciseId,entry_date:date,description:'202 fixture',request_id:randomUUID(),lines:[{account_id:accounts[debit].id,description:'202 debit',debit:total,credit:'0.00'},{account_id:accounts[credit].id,description:'202 credit',debit:'0.00',credit:total}]});}
  const sale=await entry('2026-01-15','bank','sales','120000.00');await entry('2026-01-16','expense','bank','20000.00');await entry('2026-02-01','credits','bank','5000.00');const later=await entry('2026-05-01','bank','sales','50000.00');await entry('2026-10-15','bank','sales','25000.00');await entry('2026-12-15','bank','sales','500000.00');
  const april={exercise_id:exerciseId,year:2026,period:1},october={...april,period:2};let saved,reference;
  await t.test('40.3 reads exact cumulative ranges and never deducts a global 473 balance',async()=>{
   const initial=await tax.get(april),criteria={...initial.input,method:'40.3',regime:'micro',previous_turnover:'500000.00',option_confirmed:true};
   const first=await tax.preview(april,criteria);assert.equal(first.boxes['04'],'100000.00');assert.equal(first.result,'14000.00');assert.equal(first.source.records.length,3);assert.equal(first.input.previous_payments,'0.00');assert.equal(first.source.credits_473,'5000.00');
   const next=await tax.preview(october,criteria);assert.equal(next.boxes['04'],'150000.00');assert.equal(next.result,'21500.00');
   const last=await tax.preview({...april,period:3},criteria);assert.equal(last.boxes['04'],'175000.00');assert.equal(last.result,'25250.00');
   saved=await tax.save(april,{version:0,input:{...first.input,confirmed:true,reviewed_source_hash:first.source_hash,withholdings:'1000.00',previous_payments:'2000.00'}});assert.equal(saved.draft.version,1);assert.equal(saved.result,'11000.00');assert.equal(saved.provisional,false);assert.equal(saved.settlement_proposal.lines[0].debit,'11000.00');assert.equal(saved.settlement_proposal.lines[1].credit,'11000.00');
  });
  await t.test('periods remain independent and concurrent versions cannot overwrite a saved draft',async()=>{
   const initial=await tax.get(october);assert.equal(initial.draft.version,0);assert.equal(initial.input.method,'40.2');
   reference=await tax.save(october,{version:0,input:{...initial.input,previous_turnover:'500000.00',reference_base:'10000.00',reference_note:'Modelo 200 presentado · 2025',reference_confirmed:true,confirmed:true,reviewed_source_hash:initial.source_hash}});assert.equal(reference.result,'1800.00');assert.equal(reference.previous_drafts.length,1);
   assert.deepEqual((await tax.get(april)).input,saved.input);await assert.rejects(tax.save(april,{version:0,input:saved.input}),{code:'INSTALLMENT_TAX_DRAFT_CONFLICT'});
   await assert.rejects(createInstallmentTaxService(scoped,otherId).get(april),{code:'EXERCISE_NOT_FOUND'});
  });
  await t.test('changes after the cutoff preserve review while changes within it invalidate evidence',async()=>{
   await execute('UPDATE journal_lines SET description=? WHERE company_id=? AND entry_id=?',['After cutoff edit',companyId,later.id]);assert.equal((await tax.get(april)).source_hash,saved.source_hash);
   await execute('UPDATE journal_lines SET description=? WHERE company_id=? AND entry_id=?',['Inside cutoff edit',companyId,sale.id]);const changed=await tax.get(april);assert.notEqual(changed.source_hash,saved.source_hash);assert.ok(changed.issues.includes('CORPORATE_TAX_SOURCE_CHANGED'));
   await assert.rejects(tax.save(april,{version:1,input:saved.input}),{code:'CORPORATE_TAX_SOURCE_CHANGED'});
   const fixed={...changed.input,reviewed_source_hash:changed.source_hash};saved=await tax.save(april,{version:1,input:fixed});assert.equal(saved.provisional,false);
   const stable=await tax.get(october);assert.equal(stable.source_hash,reference.source_hash);assert.equal(stable.result,'1800.00');assert.equal(stable.provisional,false);
  });
  await t.test('backup restores 202 periods and evidence with new IDs and accepts older archives',async()=>{
   const backups=createDataBackupService(scoped,companyId),archive=await backups.export(exerciseId),parsed=readBackup(archive.file);assert.equal(parsed.tables.installment_tax_drafts.length,2);
   const dest=createDataBackupService(scoped,otherId),preview=await dest.preview(archive.file,'all');assert.equal(preview.ready,true);const restored=await dest.restore({token:preview.token,request_id:randomUUID(),confirm:true});
   const after=await createInstallmentTaxService(scoped,otherId).get({...april,exercise_id:restored.exercise_ids[0]});assert.equal(after.source_hash,saved.source_hash);assert.equal(after.provisional,false);assert.equal(after.result,saved.result);
   const legacy=structuredClone(parsed);delete legacy.checksum;for(const section of ['schema','tables','references'])delete legacy[section].installment_tax_drafts;assert.deepEqual(readBackup(packBackup(sealBackup(legacy))).tables.installment_tax_drafts,[]);
   const bad=structuredClone(parsed);delete bad.checksum;bad.tables.installment_tax_drafts[0].period=4;assert.throws(()=>readBackup(packBackup(sealBackup(bad))),{code:'BACKUP_INVALID_ACCOUNTING'});
  });
  await t.test('HTTP enforces company isolation, permits read-only preview and protects writes',async()=>{
   const user={key:'202-test',role:'user',company_ids:[companyId],permissions:{accounting_write:false}};
   server=createApp(createContextService(scoped,companyId),accounting,companyScope(scoped,companyId),accessControl({current:async()=>user})).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port,path='/api/tax/installments',query='?'+new URLSearchParams(april),headers={'Content-Type':'application/json','X-Company-Id':String(companyId)};
   assert.equal((await fetch(base+path+query,{headers})).status,200);assert.equal((await fetch(base+path+query,{headers:{...headers,'X-Company-Id':String(otherId)}})).status,403);
   assert.equal((await fetch(base+path+'/preview'+query,{method:'POST',headers,body:JSON.stringify(saved.input)})).status,200);assert.equal((await fetch(base+path+'/draft'+query,{method:'PUT',headers,body:JSON.stringify({version:2,input:saved.input})})).status,403);
  });
  await t.test('exercise clear archives 202 drafts and preserves other company drafts',async()=>{
   const clear=createExerciseClearService(scoped,companyId),preview=await clear.preview(exerciseId);assert.equal(preview.counts.installment_drafts,2);const cleared=await clear.clear(exerciseId,{preview_hash:preview.preview_hash,confirmation:'96',request_id:randomUUID()});assert.equal(cleared.counts.installment_drafts,2);assert.equal((await tax.get(april)).draft.version,0);
   const archive=await clear.backup(cleared.clear_id);let count=0;for await(const row of archive.rows())if(row.table==='installment_tax_drafts')count++;assert.equal(count,2);const [[otherCount]]=await execute('SELECT COUNT(*) AS total FROM installment_tax_drafts WHERE company_id=?',[otherId]);assert.equal(otherCount.total,2);
  });
 }finally{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await db.rollback();db.release();await pool.end();}
});
