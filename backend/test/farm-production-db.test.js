import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createFarmService} from '../src/services/farms.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
import {farmPdf} from '../test-support/farm-fixture.js';
const error=code=>cause=>cause.code===code;
test('MySQL production: entry kg and unit price, deaths, atomic feed transfers, report scope and backup compatibility',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),companies=createCompanyService(pool),ids=[],tokens=[],name='Farm production '+randomUUID();
 const create=async(format='pig_production')=>{const row=await companies.createCompany({name,business_format:format,tax_id:'A25006107',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(row.id);const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[row.id]);return {...row,year:year.id};};
 try{
  const company=await create(),target=await create(),general=await create('general'),service=createFarmService(pool,company.id),other=createFarmService(pool,target.id);
  const importPreview=await service.preview(farmPdf(),company.year);await service.commit(importPreview.token);await service.discard(importPreview.token);
  const initial=await service.list(),farmA=initial.farms.find(row=>row.code==='1'),farmB=initial.farms.find(row=>row.code==='2');
  const body=(farm,code)=>({farm_id:farm.id,code,entry_date:'2026-01-01',animals_in:10,entry_kg_per_pig:'20',entry_price_per_pig:'65',feed_opening_kg:'0',feed_closing_kg:'0'});
  const a=await service.saveLot({...body(farmA,'A'),exit_date:'2026-03-31',animals_out:9}),b=await service.saveLot(body(farmB,'B'));
  const line=initial.lines.find(row=>row.farm_id===farmA.id);await service.updateCost(line.id,{farm_id:farmA.id,category:'feed',feed_kg:'1000',version:line.version});
  await service.saveSale({lot_id:a.id,sale_date:'2026-01-31',pigs:9,kg_per_pig:'120',price_per_kg:'1.3',request_id:randomUUID()});
  const death={lot_id:a.id,event_date:'2026-01-25',pigs:1,notes:'Baja registrada',request_id:randomUUID()};const lost=await service.saveProductionEvent('death',death);assert.equal((await service.saveProductionEvent('death',death)).id,lost.id);
  const transfer={source_lot_id:a.id,destination_lot_id:b.id,event_date:'2026-01-20',kg:'200',price_per_kg:'0.01',request_id:randomUUID()};const moved=await Promise.all([service.saveProductionEvent('transfer',transfer),service.saveProductionEvent('transfer',transfer)]);assert.equal(moved[0].id,moved[1].id);
  let data=await service.reportData({farm_id:farmA.id,lot_id:a.id,from:'2026-02-01',category:'medicines'});assert.equal(data.sales.length,1);assert.equal(data.lines.length,1);assert.equal(data.deaths.length,1);assert.equal(data.transfers.length,1);assert.equal(data.production.conversion,'0.909');assert.equal(data.production.conversion_final,true);assert.equal(data.production.entry_cost,'650.00');assert.equal(data.production.cost,'658.01');assert.equal(data.production.result,'745.99');
  const destination=await service.reportData({farm_id:farmB.id,lot_id:b.id});assert.equal(destination.production.feed_in_kg,'200.000');assert.equal(destination.production.cost,'672.00');
  const [[before]]=await pool.execute('SELECT COUNT(*) AS total FROM farm_feed_transfers WHERE company_id=?',[company.id]);await assert.rejects(service.saveProductionEvent('transfer',{...transfer,kg:'2000',request_id:randomUUID()}),error('FARM_TRANSFER_INSUFFICIENT_FEED'));assert.equal((await pool.execute('SELECT COUNT(*) AS total FROM farm_feed_transfers WHERE company_id=?',[company.id]))[0][0].total,before.total);
  await assert.rejects(other.saveProductionEvent('transfer',transfer),error('FARM_LOT_NOT_FOUND'));await assert.rejects(createFarmService(pool,general.id).saveProductionEvent('death',death),error('FARM_FORMAT_REQUIRED'));await assert.rejects(service.reportData({farm_id:farmA.id,lot_id:b.id}),error('FARM_LOT_NOT_FOUND'));await assert.rejects(service.reportData({}),error('INVALID_ID'));
  await service.saveProductionEvent('transfer',{...transfer,kg:'300',version:1},moved[0].id);await assert.rejects(service.saveProductionEvent('transfer',{...transfer,version:1},moved[0].id),error('FARM_CHANGED'));await service.removeProductionEvent('transfer',moved[0].id,{version:2});
  data=await service.reportData({farm_id:farmA.id,lot_id:a.id});assert.equal(data.production.feed_net_kg,'1000.000');
  await service.saveProductionEvent('transfer',{...transfer,request_id:randomUUID()});
  const currentTransfer=(await service.list({lot_id:a.id})).transfers[0],farmC=await service.saveFarm({code:'3',name:'Granja C'}),c=await service.saveLot({farm_id:farmC.id,code:'C',entry_date:'2026-01-01'});
  const dependent=await service.saveProductionEvent('transfer',{source_lot_id:b.id,destination_lot_id:c.id,event_date:'2026-01-21',kg:'150',price_per_kg:'0.01',request_id:randomUUID()});
  await assert.rejects(service.removeProductionEvent('transfer',currentTransfer.id,{version:1}),error('FARM_TRANSFER_INSUFFICIENT_FEED'));
  assert.equal((await service.list({lot_id:a.id})).transfers.length,1);
  await service.removeProductionEvent('transfer',dependent.id,{version:1});
  const html=await service.reportPreview({farm_id:farmA.id,lot_id:a.id});for(const label of ['Bajas','Traspasos de pienso','Kilos','Índice de conversión','Salidas','gastos'])if(label!=='Kilos')assert.ok(html.toLowerCase().includes(label.toLowerCase()));assert.ok(!html.includes(farmB.name+' · Lote B</p>'));
  const backup=createDataBackupService(pool,company.id),archive=await backup.export(),restore=createDataBackupService(pool,target.id);assert.equal(readBackup(archive.file).tables.farm_deaths.length,1);assert.equal(readBackup(archive.file).tables.farm_feed_transfers.length,3);
  const preview=await restore.preview(archive.file);tokens.push([restore,preview.token]);assert.equal(preview.ready,true);await restore.restore({token:preview.token,confirm:true,request_id:randomUUID()});const restored=await other.list();const restoredLot=restored.lots.find(row=>row.code==='A');const report=await other.reportData({farm_id:restoredLot.farm_id,lot_id:restoredLot.id});assert.equal(report.production.result,'745.99');assert.equal(report.production.feed_net_kg,'800.000');
  const legacy=structuredClone(archive.data);delete legacy.checksum;for(const section of ['schema','tables','references']){delete legacy[section].farm_deaths;delete legacy[section].farm_feed_transfers;}
  for(const [table,fields]of [['farm_lots',['entry_kg_per_pig','entry_price_per_pig','entry_cost_included','feed_opening_kg','feed_closing_kg']],['farm_cost_lines',['feed_kg']]]){legacy.schema[table]=legacy.schema[table].filter(field=>!fields.includes(field));for(const row of [...legacy.tables[table],...legacy.references[table]])for(const field of fields)delete row[field];}
  const oldCompany=await create(),oldRestore=createDataBackupService(pool,oldCompany.id),oldPreview=await oldRestore.preview(packBackup(sealBackup(legacy)));tokens.push([oldRestore,oldPreview.token]);assert.equal(oldPreview.ready,true);await oldRestore.restore({token:oldPreview.token,confirm:true,request_id:randomUUID()});const oldData=await createFarmService(pool,oldCompany.id).list();assert.equal(oldData.deaths.length,0);assert.equal(oldData.transfers.length,0);assert.equal(oldData.lots[0].entry_kg_per_pig,null);
 }finally{
  for(const [owner,token]of tokens)await owner.discard(token);
  for(const companyId of ids){for(const table of ['data_restores','exercise_clear_rows','exercise_clears','farm_feed_transfers','farm_deaths','farm_sales','farm_cost_lines','farm_invoices','farm_lots','farm_documents','pig_farms','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}await pool.end();
 }
});
