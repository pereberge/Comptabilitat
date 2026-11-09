import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createJournalImportService} from '../src/services/journal-import.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createReportService} from '../src/services/reports.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createAutomaticBackupManager} from '../src/services/automatic-backups.js';
import {readBackup} from '../src/services/backup-format.js';
import {journalPagesPdf} from '../test-support/journal-fixture.js';
import {diariPages} from '../test-support/diari-fixture.js';

function pdf(name,spec){
 const cell=(text,x,y)=>({text,x,y,width:30,fontSize:6.6}),money=n=>Number(n).toFixed(2).replace('.',',');
 const items=[cell('LISTADO DEL DIARIO',225,796),cell('EMPRESA: '+name,100,783),cell('DE FECHA: 01/01/2026',301,783),cell('A FECHA: 31/12/2026',405,783),
  ...[['CUENTA',25.5],['NOMBRE',80.7],['CONCEPTO',264],['DEBE',474.2],['HABER',538.7]].map(([text,x])=>cell(text,x,764)),cell('1',565,13)];
 let y=744,total=0;
 const values=(d,c)=>[cell(money(d),455,y),cell(money(c),527,y-0.95)];
 for(const {number,amount,copies=1}of spec){
  items.push(cell('29/09/2026',23.2,y),cell(String(number),83,y),cell('COBRO '+number,156,y));y-=15;
  for(const bank of [true,false])for(let i=0;i<copies;i++){
   items.push(cell(bank?'5720000001':'4300000001',23.2,y),cell(bank?'BANCO':'CLIENTE',80.7,y),cell('COBRO '+number,264,y-0.05),...values(bank?amount:0,bank?0:amount));y-=12;
  }
  items.push(cell('Total asiento:',380,y),...values(amount*copies,amount*copies));y-=18;total+=amount*copies;
 }
 y=60;items.push(cell('Total general:',380,y),...values(total,total));
 return journalPagesPdf([{page:1,items}]);
}
const period={name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'};

test('MySQL journal update: replace changed entries, preserve history, backup, concurrency, rollback and restore',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool({...config.database,connectionLimit:8}),ids=[],context=createContextService(pool,config.companyId);
 const directory=resolve('.verification/journal-update-tests-'+randomUUID());
 try{
  const name='Journal update '+randomUUID().slice(0,8),company=await context.createCompany({name,subaccount_length:10,exercise:period});ids.push(company.id);
  const exercise=(await context.getContext(company.id)).exercises[0],service=createJournalImportService(pool,company.id,{backupDirectory:directory}),accounting=createAccountingService(pool,company.id);
  const original=pdf(name,[{number:1,amount:10},{number:2,amount:20,copies:4},{number:4,amount:7}]);
  await service.commit((await service.preview(original,exercise.id)).token);
  const before=await accounting.listEntries({exercise_id:exercise.id}),first=await accounting.getEntry(before.find(e=>e.number===1).id),second=await accounting.getEntry(before.find(e=>e.number===2).id),retained=await accounting.getEntry(before.find(e=>e.number===4).id);
  const next=pdf(name,[{number:1,amount:10},{number:2,amount:20},{number:3,amount:30}]);
  let update;
  await t.test('preview and concurrent confirmation replace all duplicate lines and preserve entry identities',async()=>{
   update=await service.preview(next,exercise.id,'nuevo.pdf');assert.equal(update.updating,true);assert.equal(update.already_imported,false);
   assert.deepEqual(update.changes,{added:1,updated:1,unchanged:1,retained:1});
   assert.deepEqual(update.change_details.map(change=>[change.number,change.action]),[[2,'updated'],[3,'added']]);
   const detail=update.change_details[0];
   assert.equal(detail.entry_id,second.id);assert.equal(detail.before.totals.debit,'80.00');assert.equal(detail.after.totals.debit,'20.00');
   assert.equal(detail.before.totals.lines,8);assert.equal(detail.after.totals.lines,2);
   assert.equal(detail.before.lines.filter(line=>line.change==='removed').length,6);
   assert.equal(detail.before.lines[0].account_name,'BANCO');assert.equal(detail.after.lines[0].account_name,'BANCO');
   assert.deepEqual((await accounting.getEntry(second.id)).lines,second.lines,'La revisión detallada no escribe apuntes.');
   const results=await Promise.all([service.commit(update.token),service.commit(update.token)]);
   assert.deepEqual(results.map(r=>r.replayed).sort(),[false,true]);
   const result=results.find(r=>!r.replayed);assert.equal(result.updated,true);assert.ok(result.backup_id);
   const savedFirst=await accounting.getEntry(first.id),savedSecond=await accounting.getEntry(second.id);
   assert.deepEqual(savedFirst.lines.map(l=>l.id),first.lines.map(l=>l.id));
   assert.equal(savedSecond.number,2);assert.equal(savedSecond.lines.length,2);assert.equal(savedSecond.lines[0].debit,'20.00');
   assert.deepEqual(await accounting.getEntry(retained.id),retained);
   const years=await createExerciseService(pool,company.id).list();assert.equal(years.length,1);assert.equal(years[0].entries_count,4);assert.equal(years[0].import.lines,6);
   const ledger=await createReportService(pool,company.id).ledger({exercise_id:exercise.id,account_id:savedFirst.lines[0].account_id});assert.equal(ledger.totals.closing,'67.00');
   const [imports]=await pool.execute('SELECT source_pdf FROM journal_imports WHERE company_id=? ORDER BY id',[company.id]);assert.equal(imports.length,2);assert.deepEqual(imports[0].source_pdf,original);assert.deepEqual(imports[1].source_pdf,next);
   const backup=await createAutomaticBackupManager(pool,{directory}).forCompany(company.id).download(result.backup_id);
   const decoded=readBackup(backup.file);assert.equal(decoded.tables.journal_entries.length,3);assert.equal(decoded.tables.journal_lines.filter(l=>l.entry_id===second.id).length,8);
  });
  await t.test('identical copies and retries preserve subsequent manual edits',async()=>{
   let entry=await accounting.getEntry(first.id);await accounting.updateEntry(first.id,{exercise_id:exercise.id,revision:entry.revision,entry_date:entry.entry_date,description:'Local correction',lines:entry.lines.map(({id,account_id,description,debit,credit})=>({id,account_id,description,debit,credit}))});
   assert.equal((await service.commit(update.token)).replayed,true);
   const replay=await service.preview(next,exercise.id);assert.equal(replay.already_imported,true);assert.deepEqual(replay.change_details,[]);await service.commit(replay.token);
   assert.equal((await accounting.getEntry(first.id)).description,'Local correction');
  });
  const changed=pdf(name,[{number:1,amount:11},{number:2,amount:25},{number:3,amount:30}]);
  await t.test('backup storage failures leave the journal and its PDF version intact',async()=>{
   const notDirectory=directory+'/not-a-directory';await writeFile(notDirectory,'Backup failure fixture');
   const blocked=createJournalImportService(pool,company.id,{backupDirectory:notDirectory}),preview=await blocked.preview(changed,exercise.id);
   await assert.rejects(blocked.commit(preview.token),error=>error.code==='BACKUP_STORAGE_ERROR');
   assert.equal((await accounting.getEntry(second.id)).lines[0].debit,'20.00');
   const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM journal_imports WHERE company_id=?',[company.id]);assert.equal(count.n,2);
  });
  await t.test('stale preview aborts without overwriting intervening changes',async()=>{
   const preview=await service.preview(changed,exercise.id),entry=await accounting.getEntry(first.id);
   await accounting.updateEntry(first.id,{exercise_id:exercise.id,revision:entry.revision,entry_date:entry.entry_date,description:'Concurrent edit',lines:entry.lines.map(({id,account_id,description,debit,credit})=>({id,account_id,description,debit,credit}))});
   await assert.rejects(service.commit(preview.token),error=>error.code==='JOURNAL_PREVIEW_STALE');
   assert.equal((await accounting.getEntry(first.id)).description,'Concurrent edit');
   assert.equal((await accounting.getEntry(second.id)).lines[0].debit,'20.00');
  });
  await t.test('a write failure rolls back changed entries and the new PDF version together',async()=>{
   const snapshot=JSON.stringify(await accounting.listEntries({exercise_id:exercise.id,view:'lines'}));
   const failingPool={execute:pool.execute.bind(pool),async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.includes('INSERT INTO journal_lines')&&args[1]===second.id&&args[3]===2)throw new Error('Injected journal update failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   const failing=createJournalImportService(failingPool,company.id,{backupDirectory:directory}),preview=await failing.preview(changed,exercise.id);
   await assert.rejects(failing.commit(preview.token),/Injected journal update failure/);
   assert.equal(JSON.stringify(await accounting.listEntries({exercise_id:exercise.id,view:'lines'})),snapshot);
   const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM journal_imports WHERE company_id=?',[company.id]);assert.equal(count.n,2);
  });
  await t.test('backup and restore preserve multiple PDFs and links to retained old entries',async()=>{
   const backup=await createDataBackupService(pool,company.id).export('all');assert.equal(readBackup(backup.file).tables.journal_imports.length,2);
   const destination=await context.createCompany({name,subaccount_length:10,exercise:period});ids.push(destination.id);
   const restore=createDataBackupService(pool,destination.id),preview=await restore.preview(backup.file);assert.equal(preview.ready,true);
   await restore.restore({token:preview.token,confirm:true,request_id:randomUUID()});
   const targetYear=(await context.getContext(destination.id)).exercises[0],restored=await createAccountingService(pool,destination.id).listEntries({exercise_id:targetYear.id});assert.equal(restored.length,4);
   const [versions]=await pool.execute('SELECT id,source_pdf FROM journal_imports WHERE company_id=? ORDER BY id',[destination.id]);assert.equal(versions.length,2);assert.deepEqual(versions[0].source_pdf,original);assert.deepEqual(versions[1].source_pdf,next);
   assert.equal(restored.find(e=>e.number===4).import_id,versions[0].id);
  });
  await t.test('closed exercises reject accounting changes',async()=>{
   await pool.execute("UPDATE accounting_exercises SET status='closed',is_default=0 WHERE company_id=? AND id=?",[company.id,exercise.id]);
   await assert.rejects(service.preview(changed,exercise.id),error=>error.code==='JOURNAL_UPDATE_CLOSED');
  });
 }finally{
  for(const companyId of ids){
   for(const table of ['data_restores','backup_copies','journal_lines','journal_entries','journal_imports','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);
   await pool.execute('DELETE FROM company_details WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});

test('MySQL DIARI update: reordered source references keep their original entry numbers',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId);let company;
 try{
  company=await context.createCompany({name:'DIARI UPDATE SL',business_format:'pig_production',exercise:period});
  const exercise=(await context.getContext(company.id)).exercises[0],service=createJournalImportService(pool,company.id,{backupDirectory:resolve('.verification/journal-update-tests-'+randomUUID())});
  const pages=diariPages(company.name),original=journalPagesPdf(pages);await service.commit((await service.preview(original,exercise.id)).token);
  const [before]=await pool.execute('SELECT id,number,source_journal_code,source_entry_reference FROM journal_entries WHERE company_id=? ORDER BY number',[company.id]);
  const changed=structuredClone(pages);
  // Change a reference so this is a new source entry; the later original remains
  // identified by journal/reference, regardless of its sequential source number.
  changed[0].items.find(item=>item.text==='7'&&item.x===183.72).text='8';
  const preview=await service.preview(journalPagesPdf(changed),exercise.id);assert.deepEqual(preview.changes,{added:1,updated:0,unchanged:3,retained:1});await service.commit(preview.token);
  const [after]=await pool.execute('SELECT id,number,source_journal_code,source_entry_reference FROM journal_entries WHERE company_id=? ORDER BY number',[company.id]);
  assert.equal(after.length,5);assert.deepEqual(after.slice(0,4),before);assert.equal(after[4].source_entry_reference,'8');assert.equal(after[4].number,5);
 }finally{
  if(company){for(const table of ['backup_copies','journal_lines','journal_entries','journal_imports','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[company.id]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[company.id]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[company.id,row.id]);await pool.execute('DELETE FROM company_details WHERE company_id=?',[company.id]);await pool.execute('DELETE FROM companies WHERE id=?',[company.id]);}
  await pool.end();
 }
});
