import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createFarmService} from '../src/services/farms.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {readBackup,packBackup,sealBackup,FARM_TABLES} from '../src/services/backup-format.js';
import {farmPdf} from '../test-support/farm-fixture.js';
const code=expected=>error=>error.code===expected;
test('MySQL farm register: format and tenant isolation, source PDF, exact costs, deduplication, allocation and backup restore',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),ids=[],tokens=[],companies=createCompanyService(pool),name='Farm test '+randomUUID();
 const create=async business_format=>{const company=await companies.createCompany({name,business_format,tax_id:'A25006107',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);const [[period]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);return {...company,exerciseId:period.id};};
 try{
  const source=await create('pig_production'),target=await create('pig_production'),general=await create('general'),service=createFarmService(pool,source.id),pdf=farmPdf();
  await assert.rejects(createFarmService(pool,general.id).list(),code('FARM_FORMAT_REQUIRED'));
  await assert.rejects(service.preview(farmPdf({tax:'B12345674'}),source.exerciseId),code('FARM_COMPANY_MISMATCH'));
  await assert.rejects(service.preview(pdf,target.exerciseId),code('EXERCISE_NOT_FOUND'));
  const preview=await service.preview(pdf,source.exerciseId,'farm.pdf');assert.equal(preview.ready,true);assert.equal(preview.totals.base,'30.01');
  await assert.rejects(createFarmService(pool,target.id).commit(preview.token),code('FARM_PREVIEW_EXPIRED'));
  const committed=await service.commit(preview.token);assert.equal(committed.imported,1);assert.equal((await service.commit(preview.token)).imported,0);
  const duplicate=await service.preview(pdf,source.exerciseId);assert.equal(duplicate.ready,false);assert.equal(duplicate.duplicates.length,1);await service.discard(duplicate.token);await service.discard(preview.token);
  let data=await service.list({exercise_id:source.exerciseId});assert.equal(data.lines.length,2);assert.equal(data.totals.total,'33.01');assert.equal(data.farms.length,2);assert.deepEqual((await service.source(committed.document_id)).source_pdf,pdf);
  await assert.rejects(createFarmService(pool,target.id).source(committed.document_id),code('FARM_DOCUMENT_NOT_FOUND'));
  const line=data.lines[0];await service.updateCost(line.id,{farm_id:null,category:'other',version:line.version});
  await assert.rejects(service.updateCost(line.id,{farm_id:null,category:'other',version:line.version}),code('FARM_CHANGED'));
  const foreignFarm=await createFarmService(pool,target.id).saveFarm({code:'foreign',name:'Foreign'});
  await assert.rejects(service.updateCost(line.id,{farm_id:foreignFarm.id,category:'other',version:line.version+1}),code('FARM_NOT_FOUND'));
  data=await service.list({farm_id:'pending'});assert.equal(data.pending.base,'10.01');assert.equal(data.lines[0].source_farm_code,'1');
  const [[journal]]=await pool.execute('SELECT COUNT(*) AS total FROM journal_entries WHERE company_id=?',[source.id]);assert.equal(journal.total,0);
  const backup=createDataBackupService(pool,source.id),restore=createDataBackupService(pool,target.id),archive=await backup.export();assert.equal(readBackup(archive.file).tables.farm_cost_lines.length,2);
  await pool.execute("UPDATE companies SET business_format='general' WHERE id=?",[source.id]);
  assert.equal(readBackup((await backup.export()).file).tables.farm_cost_lines.length,2);
  await assert.rejects(service.list(),code('FARM_FORMAT_REQUIRED'));
  await pool.execute("UPDATE companies SET business_format='pig_production' WHERE id=?",[source.id]);
  let review=await restore.preview(archive.file);tokens.push([restore,review.token]);assert.equal(review.ready,true);await restore.restore({token:review.token,confirm:true,request_id:randomUUID()});
  const restored=await createFarmService(pool,target.id).list();assert.equal(restored.totals.base,'30.01');assert.equal(restored.pending.base,'10.01');assert.ok(restored.lines.every(row=>row.company_id===target.id));
  const clear=createExerciseClearService(pool,target.id),clearReview=await clear.preview(target.exerciseId);assert.equal(clearReview.counts.farm_costs,2);
  await clear.clear(target.exerciseId,{confirmation:'96',preview_hash:clearReview.preview_hash,request_id:randomUUID()});assert.equal((await createFarmService(pool,target.id).list()).lines.length,0);
  review=await restore.preview(archive.file);tokens.push([restore,review.token]);assert.equal(review.ready,true);await restore.restore({token:review.token,confirm:true,request_id:randomUUID()});assert.equal((await createFarmService(pool,target.id).list()).lines.length,2);
  const legacy=structuredClone(archive.data);delete legacy.checksum;for(const table of FARM_TABLES){delete legacy.tables[table];delete legacy.schema[table];delete legacy.references[table];}
  assert.equal(readBackup(packBackup(sealBackup(legacy))).tables.pig_farms.length,0);
  const legacyTarget=await create('pig_production'),legacyRestore=createDataBackupService(pool,legacyTarget.id),legacyPreview=await legacyRestore.preview(packBackup(sealBackup(legacy)));tokens.push([legacyRestore,legacyPreview.token]);assert.equal(legacyPreview.ready,true);
  await legacyRestore.restore({token:legacyPreview.token,confirm:true,request_id:randomUUID()});assert.equal((await createFarmService(pool,legacyTarget.id).list()).lines.length,0);
 }finally{
  for(const [owner,token]of tokens)await owner.discard(token);
  for(const companyId of ids){for(const table of ['data_restores','exercise_clear_rows','exercise_clears','farm_cost_lines','farm_invoices','farm_documents','pig_farms','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
