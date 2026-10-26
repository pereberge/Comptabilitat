import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createJournalImportService} from '../src/services/journal-import.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {sealBackup,packBackup} from '../src/services/backup-format.js';
import {diariPdf} from '../test-support/diari-fixture.js';
import {journalPdf} from '../test-support/journal-fixture.js';
const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
async function clean(pool,ids){
 for(const id of ids){
  for(const table of ['data_restores','journal_lines','journal_entries','journal_imports','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[id]);
  const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[id]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[id,account.id]);
  await pool.execute('DELETE FROM companies WHERE id=?',[id]);
 }
}
test('MySQL DIARI: company format, explicit source alias, original identities, replay, edits and backup compatibility',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[],name='DIARI integration '+randomUUID();
 const create=async(year,body={})=>{const company=await context.createCompany({name,exercise:period(year),...body});ids.push(company.id);return {company,exercise:(await context.getContext(company.id)).exercises[0]};};
 try{
  const {company,exercise}=await create(2026),service=createJournalImportService(pool,company.id),pdf=diariPdf();
  assert.equal(company.business_format,'general');
  await assert.rejects(service.preview(pdf,exercise.id),error=>error.code==='JOURNAL_FORMAT_MISMATCH');
  await context.updateCompany(company.id,{name,business_format:'pig_production'});
  await assert.rejects(service.preview(pdf,exercise.id),error=>error.code==='JOURNAL_COMPANY_MISMATCH');
  await context.updateCompany(company.id,{name,journal_source_name:'DIARI TEST SL'});
  assert.equal((await context.getCompany(company.id)).business_format,'pig_production');
  const preview=await service.preview(pdf,exercise.id);assert.equal(preview.source_format,'diari_ca');assert.equal(preview.numbering,'sequential');
  assert.equal(preview.sample[0].source_journal_code,'01');assert.equal(preview.sample.at(-1).source_entry_reference,'9');
  await context.updateCompany(company.id,{name,business_format:'general'});
  await assert.rejects(service.commit(preview.token),error=>error.code==='JOURNAL_FORMAT_MISMATCH');
  await context.updateCompany(company.id,{name,business_format:'pig_production'});
  const imported=await service.commit(preview.token);assert.equal(imported.entries,4);assert.equal(imported.lines,8);
  const repeated=await service.preview(diariPdf(undefined,{split:true}),exercise.id);assert.equal(repeated.already_imported,true);assert.equal((await service.commit(repeated.token)).replayed,true);
  const accounting=createAccountingService(pool,company.id),lines=await accounting.listEntries({exercise_id:exercise.id,view:'lines'});
  const negative=lines.filter(line=>line.source_journal_code==='D1'&&line.source_entry_reference==='1');
  assert.deepEqual(negative.map(line=>line.source_line_number),[1,3]);assert.equal(negative[0].description,'');
  const entry=await accounting.getEntry(lines.find(line=>line.source_journal_code==='S1').entry_id);
  const edited=await accounting.updateEntry(entry.id,{exercise_id:exercise.id,revision:entry.revision,entry_date:entry.entry_date,description:entry.description+' edited',lines:entry.lines.map(line=>({id:line.id,account_id:line.account_id,description:line.description,debit:line.debit,credit:line.credit}))});
  assert.equal(edited.source_entry_reference,'7');assert.deepEqual(edited.lines.map(line=>line.source_line_number),[1,2]);
  const [[stored]]=await pool.execute('SELECT source_format,source_pdf FROM journal_imports WHERE company_id=?',[company.id]);assert.equal(stored.source_format,'diari_ca');assert.deepEqual(stored.source_pdf,pdf);
  const backup=await createDataBackupService(pool,company.id).export('all'),target=await create(2026),restore=createDataBackupService(pool,target.company.id);
  const review=await restore.preview(backup.file);assert.equal(review.ready,true);await restore.restore({token:review.token,confirm:true,request_id:randomUUID()});
  assert.equal((await context.getCompany(target.company.id)).business_format,'pig_production');
  assert.equal((await context.getCompany(target.company.id)).journal_source_name,'DIARI TEST SL');
  const restored=await createAccountingService(pool,target.company.id).listEntries({exercise_id:target.exercise.id,view:'lines'});
  assert.deepEqual(restored.map(line=>[line.source_journal_code,line.source_entry_reference,line.source_line_number]),lines.map(line=>[line.source_journal_code,line.source_entry_reference,line.source_line_number]));
  const legacy=await create(2025),legacyImport=createJournalImportService(pool,legacy.company.id);
  await legacyImport.commit((await legacyImport.preview(journalPdf(name),legacy.exercise.id)).token);
  const old=structuredClone((await createDataBackupService(pool,legacy.company.id).export('all')).data);
  const added={companies:['business_format'],company_details:['journal_source_name'],journal_imports:['source_format'],journal_entries:['source_journal_code','source_entry_reference'],journal_lines:['source_line_number']};
  for(const [table,fields]of Object.entries(added)){old.schema[table]=old.schema[table].filter(field=>!fields.includes(field));for(const row of [...old.tables[table],...old.references[table]])for(const field of fields)delete row[field];}
  const {checksum,...content}=old,oldTarget=await create(2025),oldRestore=createDataBackupService(pool,oldTarget.company.id),oldReview=await oldRestore.preview(packBackup(sealBackup(content)));
  assert.equal(oldReview.ready,true);await oldRestore.restore({token:oldReview.token,confirm:true,request_id:randomUUID()});
  assert.equal((await context.getCompany(oldTarget.company.id)).business_format,'general');
  assert.equal((await createAccountingService(pool,oldTarget.company.id).listEntries({exercise_id:oldTarget.exercise.id,view:'lines'})).length,8);
 }finally{await clean(pool,ids);await pool.end();}
});
test('provided DIARI imports and verifies every source movement in a temporary company',{skip:process.env.TEST_MYSQL!=='1'||!process.env.TEST_DIARI_PDF},async()=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[];
 try{
  const company=await context.createCompany({name:'Provided DIARI test '+randomUUID(),business_format:'pig_production',journal_source_name:'P. ARB',exercise:period(2026)});ids.push(company.id);
  const exercise=(await context.getContext(company.id)).exercises[0],service=createJournalImportService(pool,company.id),pdf=readFileSync(process.env.TEST_DIARI_PDF);
  const preview=await service.preview(pdf,exercise.id),result=await service.commit(preview.token);
  assert.equal(result.entries,1091);assert.equal(result.lines,4748);assert.equal(result.accounts,206);assert.equal(result.debit,'21898935.47');assert.equal(result.credit,'21898935.47');
  const [[stored]]=await pool.execute('SELECT source_hash,source_format FROM journal_imports WHERE company_id=?',[company.id]);assert.equal(stored.source_hash,createHash('sha256').update(pdf).digest('hex'));assert.equal(stored.source_format,'diari_ca');
  const [[identities]]=await pool.execute('SELECT COUNT(DISTINCT source_journal_code,source_entry_reference) AS total FROM journal_entries WHERE company_id=?',[company.id]);assert.equal(identities.total,1091);
  assert.equal((await context.getContext(company.id)).exercises[0].status,'open');
 }finally{await clean(pool,ids);await pool.end();}
});
