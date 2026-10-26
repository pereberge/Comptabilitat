import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createFarmService} from '../src/services/farms.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
import {farmPdf} from '../test-support/farm-fixture.js';
const error=code=>cause=>cause.code===code;
test('MySQL lots: entry, close, next entry, exact costs across years, manual assignment, isolation and restore',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),ids=[],tokens=[],companies=createCompanyService(pool),name='Farm lots '+randomUUID();
 const create=async(format='pig_production')=>{const company=await companies.createCompany({name,business_format:format,tax_id:'A25006107',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);const [[period]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);return {...company,exerciseId:period.id};};
 try{
  const source=await create(),target=await create(),general=await create('general'),service=createFarmService(pool,source.id),other=createFarmService(pool,target.id);
  const first=await service.preview(farmPdf(),source.exerciseId);await service.commit(first.token);await service.discard(first.token);
  const initial=await service.list(),farmA=initial.farms.find(row=>row.code==='1'),farmB=initial.farms.find(row=>row.code==='2');
  const body=(farm,code,entry,exit=null)=>({farm_id:farm.id,code,entry_date:entry,exit_date:exit,animals_in:1000});
  const one=await service.saveLot(body(farmA,'A1','2026-01-01'));
  await assert.rejects(service.saveLot(body(farmA,'A2','2026-04-01')),error('FARM_LOT_ALREADY_OPEN'));
  let data=await service.list({farm_id:farmA.id});assert.equal(data.lines[0].effective_lot_id,one.id);assert.equal(data.totals.base,'10.01');
  await service.saveLot({...body(farmA,'A1','2026-01-01','2026-03-31'),animals_out:995,version:1},one.id);
  await assert.rejects(service.saveLot({...body(farmA,'A1','2026-01-01','2026-03-30'),version:1},one.id),error('FARM_CHANGED'));
  const two=await service.saveLot(body(farmA,'A2','2026-04-01'));
  await assert.rejects(service.saveLot(body(farmA,'OVERLAP','2026-03-15','2026-04-15')),error('FARM_LOT_OVERLAP'));
  const cross=await service.saveLot(body(farmB,'B1','2025-12-01'));
  const prior=await createExerciseService(pool,source.id).create({name:'2025',start_date:'2025-01-01',end_date:'2025-12-31'});
  const old=await service.preview(farmPdf({reference:'2025-1-2',invoiceDate:'16/12/2025'}),prior.id);await service.commit(old.token);await service.discard(old.token);
  data=await service.list({farm_id:farmB.id,lot_id:cross.id,exercise_id:'all'});assert.equal(data.totals.base,'40.00');assert.equal(data.totals.invoices,2);
  assert.equal((await service.list({farm_id:farmB.id,lot_id:cross.id,exercise_id:source.exerciseId})).totals.base,'20.00');
  await service.saveLot({...body(farmB,'B1','2025-12-01','2026-02-28'),version:1,animals_out:998},cross.id);
  await service.saveLot(body(farmB,'B2','2026-03-01'));
  await assert.rejects(other.saveLot(body(farmA,'foreign','2026-01-01')),error('FARM_NOT_FOUND'));
  await assert.rejects(other.list({lot_id:one.id}),error('FARM_LOT_NOT_FOUND'));
  await assert.rejects(createFarmService(pool,general.id).saveLot(body(farmA,'general','2026-01-01')),error('FARM_FORMAT_REQUIRED'));
  let line=(await service.list({farm_id:farmA.id,exercise_id:source.exerciseId})).lines[0];
  await service.updateCost(line.id,{farm_id:farmA.id,category:line.category,lot_assignment:'manual',lot_id:two.id,version:line.version});
  line=(await service.list({lot_id:two.id})).lines[0];assert.equal(line.effective_lot_id,two.id);assert.equal(line.lot_reason,'manual');
  await service.updateCost(line.id,{farm_id:farmA.id,category:'other',version:line.version});line=(await service.list({lot_id:two.id})).lines[0];assert.equal(line.lot_id,two.id);
  await assert.rejects(service.updateCost(line.id,{farm_id:farmA.id,category:'other',lot_assignment:'manual',lot_id:cross.id,version:line.version}),error('FARM_LOT_NOT_FOUND'));
  await service.updateCost(line.id,{farm_id:farmB.id,category:'other',version:line.version});line=(await service.list()).lines.find(row=>row.id===line.id);assert.equal(line.lot_assignment,'auto');assert.equal(line.lot_id,null);assert.equal(line.effective_lot_id,cross.id);
  await service.updateCost(line.id,{farm_id:farmA.id,category:'other',lot_assignment:'unassigned',version:line.version});line=(await service.list({farm_id:farmA.id,lot_id:'pending',exercise_id:source.exerciseId})).lines[0];assert.equal(line.effective_lot_id,null);
  await service.updateCost(line.id,{farm_id:farmA.id,category:'other',lot_assignment:'manual',lot_id:one.id,version:line.version});
  const third=await service.saveFarm({code:'3',name:'Concurrency farm'});
  const concurrent=await Promise.allSettled([service.saveLot(body(third,'C1','2026-01-01')),service.saveLot(body(third,'C2','2026-02-01'))]);assert.equal(concurrent.filter(result=>result.status==='fulfilled').length,1);assert.equal(concurrent.find(result=>result.status==='rejected').reason.code,'FARM_LOT_ALREADY_OPEN');
  const backup=createDataBackupService(pool,source.id),archive=await backup.export(),restore=createDataBackupService(pool,target.id);
  assert.equal(readBackup(archive.file).tables.farm_lots.length,5);
  const preview=await restore.preview(archive.file);tokens.push([restore,preview.token]);assert.equal(preview.ready,true);await restore.restore({token:preview.token,confirm:true,request_id:randomUUID()});
  data=await other.list();assert.equal(data.lots.length,5);assert.equal(data.totals.base,'60.02');const restored=data.lines.find(row=>row.lot_assignment==='manual');assert.notEqual(restored.lot_id,one.id);assert.equal(restored.lot_code,'A1');assert.equal(data.lots.find(row=>row.code==='A1').status,'closed');
  const replacement=await restore.preview(archive.file,'all',true);tokens.push([restore,replacement.token]);assert.equal(replacement.ready,true);await restore.restore({token:replacement.token,confirm:true,confirmation:'96',request_id:randomUUID()});assert.equal((await other.list()).lots.length,5);
  const before=await createExerciseClearService(pool,target.id).preview(target.exerciseId);await createExerciseClearService(pool,target.id).clear(target.exerciseId,{confirmation:'96',preview_hash:before.preview_hash,request_id:randomUUID()});data=await other.list();assert.equal(data.lots.length,5);assert.equal(data.lines.length,2);
  const legacy=structuredClone(archive.data);delete legacy.checksum;for(const section of ['schema','tables','references'])delete legacy[section].farm_lots;
  legacy.schema.farm_cost_lines=legacy.schema.farm_cost_lines.filter(field=>!['lot_id','lot_assignment'].includes(field));for(const row of [...legacy.tables.farm_cost_lines,...legacy.references.farm_cost_lines]){delete row.lot_id;delete row.lot_assignment;}
  const legacyCompany=await create(),legacyRestore=createDataBackupService(pool,legacyCompany.id),legacyPreview=await legacyRestore.preview(packBackup(sealBackup(legacy)));tokens.push([legacyRestore,legacyPreview.token]);assert.equal(legacyPreview.ready,true);await legacyRestore.restore({token:legacyPreview.token,confirm:true,request_id:randomUUID()});const legacyData=await createFarmService(pool,legacyCompany.id).list();assert.equal(legacyData.lots.length,0);assert.equal(legacyData.lines.length,4);
 }finally{
  for(const [owner,token]of tokens)await owner.discard(token);
  for(const companyId of ids){for(const table of ['data_restores','exercise_clear_rows','exercise_clears','farm_cost_lines','farm_invoices','farm_lots','farm_documents','pig_farms','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
