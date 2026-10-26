import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createAutomaticBackupManager} from '../src/services/automatic-backups.js';
import {defaultBackupSchedules} from '../src/services/backup-schedule.js';
import {readBackup,TABLE_ORDER} from '../src/services/backup-format.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {HttpError} from '../src/middleware/errors.js';
const rejects=code=>error=>error.code===code;
const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
test('MySQL automatic archives: complete backups, schedules, retries, isolation and confirmed deletion',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[];
 const directory=path.resolve('.verification/automatic-backups-'+randomUUID());let clock=new Date('2054-10-20T12:00Z'),failExport=false,exportCount=0,server;
 const manager=createAutomaticBackupManager(pool,{directory,now:()=>clock,exporter:async(companyId,db)=>{exportCount++;if(failExport)throw new HttpError(503,'SERVICE_UNAVAILABLE');return createDataBackupService(pool,companyId).export('all',{db});}});
 let permission=true;
 try{
  for(let index=0;index<2;index++)ids.push((await context.createCompany({name:'Copias ficticias '+randomUUID(),exercise:period(2054)})).id);
  await createExerciseService(pool,ids[0]).create(period(2025));
  const first=manager.forCompany(ids[0]),foreign=manager.forCompany(ids[1]),created=[];
  await t.test('default disabled, company export, compressed integrity, idempotency and foreign download',async()=>{
   assert.equal((await first.settings()).schedules.every(row=>!row.enabled),true);
   for(const frequency of ['daily','weekly','monthly']){const request={frequency,request_id:randomUUID()},copy=await first.run(request);created.push(copy);assert.equal(copy.summary.exercises.length,2);assert.equal((await first.run(request)).id,copy.id);}
   const file=await first.download(created[0].id),data=readBackup(file.file);assert.equal(data.scope.kind,'company');assert.equal(data.tables.accounting_exercises.length,2);assert.equal(data.tables.companies[0].id,ids[0]);
   assert.equal((await fs.readdir(path.join(directory,String(ids[0])))).filter(name=>name.endsWith('.partial')).length,0);
   await assert.rejects(foreign.download(created[0].id),rejects('BACKUP_COPY_NOT_FOUND'));
   await assert.rejects(first.download('../outside'),rejects('BACKUP_INVALID_FILTER'));
   await assert.rejects(first.run({frequency:'monthly',request_id:'x'}),rejects('BACKUP_INVALID_FILTER'));
   assert.equal((await foreign.list()).total,0);
  });
  await t.test('daily weekly and monthly schedules save, survive a new manager and catch up once',async()=>{
   clock=new Date('2054-10-21T12:00Z');const desired=defaultBackupSchedules().map(row=>({...row,enabled:true,run_time:'01:00',weekday:4,month_day:22}));
   const saved=await first.saveSettings({schedules:desired});assert.ok(saved.schedules.every(row=>row.next_run_at==='2054-10-21T23:00:00.000Z'));
   clock=new Date('2054-10-25T12:00Z');const restart=createAutomaticBackupManager(pool,{directory,now:()=>clock});await Promise.all([manager.tick(),restart.tick()]);
   const all=await first.list();assert.equal(all.total,6);const automatic=all.copies.filter(row=>row.trigger_kind==='scheduled');assert.equal(automatic.length,3);assert.ok(automatic.every(row=>row.created_date==='2054-10-25'));
   assert.equal(automatic.find(row=>row.frequency==='daily').scheduled_for,'2054-10-24T23:00:00.000Z');
   await manager.tick();assert.equal((await first.list()).total,6);const state=await first.settings();assert.equal(state.schedules[0].next_run_at,'2054-10-26T00:00:00.000Z');
   assert.equal((await first.saveSettings({schedules:desired})).schedules[0].next_run_at,state.schedules[0].next_run_at);
  });
  await t.test('filters combine dates and types, reject malformed filters and paginate',async()=>{
   assert.equal((await first.list({types:'daily,monthly',from:'2054-10-20',to:'2054-10-20'})).total,2);
   assert.equal((await first.list({types:'weekly'})).total,2);
   assert.equal((await first.list({page:2})).copies.length,0);
   for(const query of [{types:''},{types:'yearly'},{from:'2054-02-30'},{from:'2054-10-25',to:'2054-10-20'},{page:'0'}])await assert.rejects(first.list(query),rejects('BACKUP_INVALID_FILTER'));
  });
  await t.test('failed scheduled exports retry after five minutes and disabling persists',async()=>{
   const desired=defaultBackupSchedules();desired[0].enabled=true;desired[0].run_time='14:00';await foreign.saveSettings({schedules:desired});
   clock=new Date('2054-10-25T13:01Z');failExport=true;const before=exportCount;await manager.tick();assert.equal(exportCount,before+1);assert.equal((await foreign.settings()).schedules[0].last_error_code,'SERVICE_UNAVAILABLE');
   clock=new Date('2054-10-25T13:05Z');await manager.tick();assert.equal(exportCount,before+1);
   failExport=false;clock=new Date('2054-10-25T13:07Z');await manager.tick();assert.equal((await foreign.list()).total,1);assert.equal((await foreign.settings()).schedules[0].last_error_code,null);
   await first.saveSettings({schedules:defaultBackupSchedules()});await foreign.saveSettings({schedules:defaultBackupSchedules()});
  });
  await t.test('HTTP company scoping, downloads and write permissions',async()=>{
   const access=accessControl({current:async()=>({permissions:{accounting_write:permission,data_import:true}})});
   server=createApp(context,{},companyScope(pool,ids[0],{automaticBackups:manager}),access).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const request=(route,body,companyId=ids[0],method=body?'POST':'GET')=>fetch('http://127.0.0.1:'+server.address().port+'/api/data-backups/automatic/'+route,{method,headers:{'Content-Type':'application/json','X-Company-Id':String(companyId)},...(body?{body:JSON.stringify(body)}:{})});
   const response=await request('copies/'+created[0].id+'/download');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/gzip');assert.match(response.headers.get('content-disposition'),/\.json\.gz/);assert.ok((await response.arrayBuffer()).byteLength>0);
   assert.equal((await request('copies/'+created[0].id+'/download',null,ids[1])).status,404);
   permission=false;for(const route of ['run','delete-preview','delete'])assert.equal((await request(route,{})).status,403);
   assert.equal((await request('settings',{schedules:defaultBackupSchedules()},ids[0],'PUT')).status,403);assert.equal((await request('copies')).status,200);permission=true;
  });
  await t.test('deletion requires preview and confirmation, rejects stale and foreign tokens',async()=>{
   const filter={before_date:'2054-10-22',types:['daily','monthly']};let preview=await first.previewDelete(filter);assert.equal(preview.count,2);
   await assert.rejects(first.delete({token:preview.token}),rejects('BACKUP_CONFIRM_REQUIRED'));
   await assert.rejects(foreign.delete({token:preview.token,confirm:true}),rejects('BACKUP_PREVIEW_EXPIRED'));
   clock=new Date('2054-10-20T15:00Z');await first.run({frequency:'daily',request_id:randomUUID()});clock=new Date('2054-10-25T13:08Z');
   await assert.rejects(first.delete({token:preview.token,confirm:true}),rejects('BACKUP_ARCHIVE_CHANGED'));
   preview=await first.previewDelete(filter);clock=new Date('2054-10-25T13:24Z');await assert.rejects(first.delete({token:preview.token,confirm:true}),rejects('BACKUP_PREVIEW_EXPIRED'));
   for(const bad of [{},{before_date:'2054-02-30',types:['daily']},{before_date:'2054-10-22',types:[]},{ids:['../secret']},{ids:[created[0].id],types:['daily']}])await assert.rejects(first.previewDelete(bad),rejects('BACKUP_INVALID_FILTER'));
   preview=await first.previewDelete(filter);assert.equal(preview.count,3);assert.deepEqual(await first.delete({token:preview.token,confirm:true}),{deleted:3,pending:0});
   assert.equal((await first.list()).total,4);assert.equal((await first.list({to:'2054-10-20'})).copies[0].frequency,'weekly');assert.equal((await foreign.list()).total,1);
   await assert.rejects(first.download(created[0].id),rejects('BACKUP_COPY_NOT_FOUND'));
   const [[deleted]]=await pool.execute('SELECT request_id FROM backup_copies WHERE id=?',[created[0].id]);await assert.rejects(first.run({frequency:'daily',request_id:deleted.request_id}),rejects('BACKUP_COPY_NOT_FOUND'));
   assert.equal((await fs.readdir(path.join(directory,String(ids[0])))).length,4);
   const none=await first.previewDelete({ids:[randomUUID()]});assert.equal(none.count,0);
  });
  await t.test('integrity verification detects modified archives and individual deletion remains scoped',async()=>{
   const copy=(await first.list()).copies[0],target=path.join(directory,String(ids[0]),copy.id+'.json.gz'),original=await fs.readFile(target);await fs.writeFile(target,'corrupt');await assert.rejects(first.download(copy.id),rejects('BACKUP_CHECKSUM'));await fs.writeFile(target,original);
   const preview=await first.previewDelete({ids:[copy.id]});assert.equal(preview.count,1);await first.delete({token:preview.token,confirm:true});assert.equal((await first.list()).total,3);
  });
  await t.test('pending physical deletions resume after restart and never follow a company junction',async()=>{
   const copy=(await first.list()).copies[0],companyDir=path.join(directory,String(ids[0])),held=path.join(directory,'held-'+ids[0]);
   // Both resolved paths are inside this test's unique archive directory.
   const root=await fs.realpath(directory);assert.equal(path.dirname(await fs.realpath(companyDir)),root);assert.equal(path.dirname(held),root);
   await fs.rename(companyDir,held);await fs.symlink(held,companyDir,'junction');
   const preview=await first.previewDelete({ids:[copy.id]}),removed=await first.delete({token:preview.token,confirm:true});assert.deepEqual(removed,{deleted:0,pending:1});assert.ok(await fs.stat(path.join(held,copy.id+'.json.gz')));
   await fs.unlink(companyDir);await fs.rename(held,companyDir);await manager.tick();assert.equal((await first.list()).total,2);
  });
  await t.test('storage failure leaves no ready archive and the same manual request can be retried',async()=>{
   const blocked=path.join(directory,'blocked');await fs.writeFile(blocked,'test');const failing=createAutomaticBackupManager(pool,{directory:blocked,now:()=>clock}),request={frequency:'daily',request_id:randomUUID()},before=(await foreign.list()).total;
   await assert.rejects(failing.forCompany(ids[1]).run(request),rejects('BACKUP_STORAGE_ERROR'));assert.equal((await foreign.list()).total,before);
   const recovered=await foreign.run(request);assert.equal(recovered.status,'ready');assert.equal((await foreign.run(request)).id,recovered.id);assert.equal((await foreign.list()).total,before+1);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));await manager.stop();
  for(const companyId of ids){await pool.execute('DELETE FROM backup_copies WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM backup_schedules WHERE company_id=?',[companyId]);for(const table of [...TABLE_ORDER].reverse().filter(table=>!['companies','accounts'].includes(table)))await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE id=? AND company_id=?',[row.id,companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
