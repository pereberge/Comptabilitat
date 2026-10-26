import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createFarmService} from '../src/services/farms.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
import {farmPdf} from '../test-support/farm-fixture.js';
import {nextFarmLotCode} from '../../shared/farm-lots.js';
const error=code=>cause=>cause.code===code;
test('lot default numbering uses the farm code and advances the highest numeric suffix',()=>{
 assert.equal(nextFarmLotCode('12',[]),'12-1');assert.equal(nextFarmLotCode('12',[{code:'12-1'},{code:'12-2'}]),'12-3');assert.equal(nextFarmLotCode('12',[{code:'1'},{code:'12-9'},{code:'SAS'},{code:'13-500'}]),'12-10');
});
test('MySQL care: lot numbering, isolated cycle costs, edits, category detail, backups and period clear',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),companies=createCompanyService(pool),ids=[],tokens=[],name='Farm care '+randomUUID();
 const create=async(format='pig_production')=>{const row=await companies.createCompany({name,business_format:format,tax_id:'A25006107',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(row.id);const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[row.id]);return {...row,year:year.id};};
 try{
  const company=await create(),target=await create(),general=await create('general'),service=createFarmService(pool,company.id),other=createFarmService(pool,target.id);
  const preview=await service.preview(farmPdf(),company.year);await service.commit(preview.token);await service.discard(preview.token);const initial=await service.list(),farm=initial.farms.find(row=>row.code==='1');await service.saveFarm({...farm,code:'12'},farm.id);
  const first=await service.saveLot({farm_id:farm.id,entry_date:'2026-01-01',exit_date:'2026-06-30'}),second=await service.saveLot({farm_id:farm.id,entry_date:'2026-07-01',auto_code:true,code:'12-1'});
  let data=await service.list();assert.equal(data.lots.find(row=>row.id===first.id).code,'12-1');assert.equal(data.lots.find(row=>row.id===second.id).code,'12-2');
  const concurrent=await Promise.all([service.saveLot({farm_id:farm.id,entry_date:'2025-01-01',exit_date:'2025-03-31',auto_code:true}),service.saveLot({farm_id:farm.id,entry_date:'2025-04-01',exit_date:'2025-06-30',auto_code:true})]);data=await service.list();assert.deepEqual(concurrent.map(row=>data.lots.find(lot=>lot.id===row.id).code).sort(),['12-3','12-4']);
  const body={lot_id:second.id,event_date:'2026-08-15',amount:'125,55',notes:'Cuido de verano',request_id:randomUUID()},care=await service.saveProductionEvent('care',body);assert.equal((await service.saveProductionEvent('care',body)).id,care.id);
  await service.saveProductionEvent('care',{lot_id:first.id,event_date:'2026-02-15',amount:'250.00',notes:'Cuido anterior',request_id:randomUUID()});
  await assert.rejects(service.saveProductionEvent('care',{...body,amount:'-1',request_id:randomUUID()}),error('FARM_CARE_INVALID_AMOUNT'));await assert.rejects(other.saveProductionEvent('care',body),error('FARM_LOT_NOT_FOUND'));await assert.rejects(createFarmService(pool,general.id).saveProductionEvent('care',body),error('FARM_FORMAT_REQUIRED'));
  data=await service.list({farm_id:farm.id,lot_id:second.id,exercise_id:'all'});assert.equal(data.sales_totals.cost,'125.55');assert.equal(data.totals.invoices,0);assert.equal(data.lines.length,1);assert.equal(data.lines[0].source_kind,'care');assert.equal(data.categories.find(row=>row.category==='care').base,'125.55');
  assert.equal((await service.list({farm_id:farm.id,lot_id:first.id,exercise_id:'all'})).sales_totals.cost,'260.01');assert.equal((await service.list({lot_id:second.id,category:'feed'})).sales_totals.cost,'125.55');
  const lineB=initial.lines.find(row=>row.farm_id!==farm.id);await service.updateCost(lineB.id,{farm_id:lineB.farm_id,category:'care',version:lineB.version});assert.equal((await service.list({category:'care'})).totals.base,'395.55');
  await service.saveProductionEvent('care',{...body,amount:'175.55',version:1},care.id);await assert.rejects(service.saveProductionEvent('care',{...body,version:1},care.id),error('FARM_CHANGED'));
  const report=await service.reportData({farm_id:farm.id,lot_id:second.id});assert.equal(report.production.cost,'175.55');assert.ok((await service.reportPreview({farm_id:farm.id,lot_id:second.id})).includes('Cuido de verano'));
  const backup=createDataBackupService(pool,company.id),archive=await backup.export(),restore=createDataBackupService(pool,target.id);assert.equal(readBackup(archive.file).tables.farm_care_costs.length,2);const ready=await restore.preview(archive.file);tokens.push([restore,ready.token]);assert.equal(ready.ready,true);await restore.restore({token:ready.token,confirm:true,request_id:randomUUID()});data=await other.list();const restoredLot=data.lots.find(row=>row.code==='12-2');assert.equal((await other.reportData({farm_id:restoredLot.farm_id,lot_id:restoredLot.id})).sales_totals.cost,'175.55');
  const clear=createExerciseClearService(pool,target.id),clearPreview=await clear.preview(target.year);assert.equal(clearPreview.counts.farm_care_costs,2);await clear.clear(target.year,{confirmation:'96',preview_hash:clearPreview.preview_hash,request_id:randomUUID()});assert.equal((await other.list()).care.length,0);
  const legacy=structuredClone(archive.data);delete legacy.checksum;for(const section of ['schema','tables','references'])delete legacy[section].farm_care_costs;const oldCompany=await create(),oldRestore=createDataBackupService(pool,oldCompany.id),old=await oldRestore.preview(packBackup(sealBackup(legacy)));tokens.push([oldRestore,old.token]);assert.equal(old.ready,true);await oldRestore.restore({token:old.token,confirm:true,request_id:randomUUID()});assert.equal((await createFarmService(pool,oldCompany.id).list()).care.length,0);
  await service.removeProductionEvent('care',care.id,{version:2});assert.equal((await service.list({lot_id:second.id})).sales_totals.cost,'0.00');assert.equal((await service.list({lot_id:first.id})).sales_totals.cost,'260.01');
 }finally{for(const [owner,token]of tokens)await owner.discard(token);for(const companyId of ids){for(const table of ['data_restores','exercise_clear_rows','exercise_clears','farm_care_costs','farm_feed_transfers','farm_deaths','farm_sales','farm_cost_lines','farm_invoices','farm_lots','farm_documents','pig_farms','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}await pool.end();}
});
