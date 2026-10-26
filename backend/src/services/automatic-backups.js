import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createDataBackupService} from './data-backup.js';
import {sha,MAX_BACKUP_FILE,fail} from './backup-format.js';
import {id,date} from './validation.js';
import {backupFrequencies,backupTimezone,defaultBackupSchedules,validateBackupSchedules,nextBackupRun,latestBackupDue,localBackupDate} from './backup-schedule.js';

const stamp=value=>value.toISOString().slice(0,19).replace('T',' ');
const iso=value=>value?new Date(String(value).replace(' ','T')+'Z').toISOString():null;
const json=value=>typeof value==='string'?JSON.parse(value):value;
const marks=values=>values.map(()=>'?').join(',');
const uuid=value=>{if(typeof value!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))fail('BACKUP_INVALID_FILTER');return value.toLowerCase();};
const frequency=value=>{if(!backupFrequencies.includes(value))fail('BACKUP_INVALID_FILTER');return value;};
const types=value=>{if(typeof value==='string')value=value.split(',');if(!Array.isArray(value)||!value.length||value.length>3)fail('BACKUP_INVALID_FILTER');return [...new Set(value.map(frequency))].sort();};
const validDate=value=>{try{return date(value);}catch{fail('BACKUP_INVALID_FILTER');}};
const storageCode=error=>error.code==='ENOSPC'?'BACKUP_STORAGE_FULL':error.status?error.code:/^(ER_|ECONN|ETIMEDOUT|PROTOCOL_)/.test(error.code||'')?'SERVICE_UNAVAILABLE':'BACKUP_STORAGE_ERROR';
const publicCopy=row=>({id:row.id,company_id:row.company_id,frequency:row.frequency,trigger_kind:row.trigger_kind,scheduled_for:iso(row.scheduled_for),file_name:row.file_name,size_bytes:Number(row.size_bytes),summary:json(row.summary),created_at:iso(row.created_at),created_date:row.created_date,status:row.status,deletion_error_code:row.deletion_error_code});
function deletionFilter(body){
 if(!body||typeof body!=='object')fail('BACKUP_INVALID_FILTER');
 if(body.ids!==undefined){if(body.before_date!==undefined||body.types!==undefined||!Array.isArray(body.ids)||!body.ids.length||body.ids.length>500)fail('BACKUP_INVALID_FILTER');return {ids:[...new Set(body.ids.map(uuid))].sort()};}
 return {before_date:validDate(body.before_date),types:types(body.types)};
}
function deleteWhere(filter){return filter.ids?{sql:'id IN ('+marks(filter.ids)+')',params:filter.ids}:{sql:'created_date < ? AND frequency IN ('+marks(filter.types)+')',params:[filter.before_date,...filter.types]};}
const fingerprint=rows=>sha(rows.map(row=>[row.id,row.file_sha256,row.status]).sort((a,b)=>a[0].localeCompare(b[0])));

export function createAutomaticBackupManager(pool,options={}){
 const directory=path.resolve(options.directory||fileURLToPath(new URL('../../../.local-backups/automatic/',import.meta.url)));
 const now=options.now||(()=>new Date()),previews=new Map();
 let timer=null,inFlight=null;
 async function locked(companyId,action){
  const db=await pool.getConnection(),key='contabilitat-backup:'+companyId;let acquired=false;
  try{const [[row]]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[key]);acquired=Number(row.acquired)===1;if(!acquired)fail('BACKUP_BUSY',409);return await action(db);}
  finally{try{if(acquired)await db.execute('SELECT RELEASE_LOCK(?)',[key]);}finally{db.release();}}
 }
 async function transaction(db,action){await db.beginTransaction();try{const result=await action();await db.commit();return result;}catch(error){await db.rollback();throw error;}}
 async function companyFolder(companyId,create=false){
  if(create)await fs.mkdir(directory,{recursive:true});
  const root=await fs.realpath(directory),folder=path.join(root,String(companyId));
  if(create)await fs.mkdir(folder,{recursive:true});
  if(await fs.realpath(folder)!==folder)fail('BACKUP_STORAGE_ERROR',503);
  return folder;
 }
 async function archivePath(companyId,copyId){
  const folder=await companyFolder(companyId),target=path.join(folder,uuid(copyId)+'.json.gz'),stat=await fs.lstat(target);
  if(!stat.isFile()||stat.isSymbolicLink())fail('BACKUP_STORAGE_ERROR',503);
  return target;
 }
 async function schedules(db,companyId){const [rows]=await db.execute('SELECT * FROM backup_schedules WHERE company_id=?',[companyId]);return defaultBackupSchedules().map(item=>({...item,...rows.find(row=>row.frequency===item.frequency)}));}
 async function settings(companyId){return {timezone:backupTimezone,directory,worker_running:!!timer,schedules:(await schedules(pool,companyId)).map(row=>({frequency:row.frequency,enabled:!!row.enabled,run_time:row.run_time,weekday:row.weekday,month_day:row.month_day,next_run_at:iso(row.next_run_at),last_success_at:iso(row.last_success_at),last_error_code:row.last_error_code}))};}
 async function readyRows(db,companyId,filter){const where=deleteWhere(filter);return (await db.execute('SELECT * FROM backup_copies WHERE company_id=? AND status=\'ready\' AND '+where.sql+' ORDER BY created_at,id',[companyId,...where.params]))[0];}
 async function erasePending(db,companyId){
  const [rows]=await db.execute('SELECT id FROM backup_copies WHERE company_id=? AND status=\'deleting\'',[companyId]);let deleted=0,pending=0;
  for(const row of rows){try{
   try{await fs.unlink(await archivePath(companyId,row.id));}catch(error){if(error.code!=='ENOENT')throw error;}
   await db.execute('UPDATE backup_copies SET status=\'deleted\',deleted_at=?,deletion_error_code=NULL WHERE company_id=? AND id=?',[stamp(now()),companyId,row.id]);deleted++;
  }catch(error){pending++;await db.execute('UPDATE backup_copies SET deletion_error_code=? WHERE company_id=? AND id=?',[storageCode(error),companyId,row.id]);}}
  return {deleted,pending};
 }
 async function makeCopy(db,companyId,type,trigger,scheduledFor=null,requestId=null){
  const [existing]=await db.execute('SELECT * FROM backup_copies WHERE company_id=? AND '+(requestId?'request_id=?':'frequency=? AND scheduled_for=?'),requestId?[companyId,requestId]:[companyId,type,stamp(scheduledFor)]);
  if(existing.length){if(existing[0].frequency!==type)fail('BACKUP_REQUEST_CONFLICT',409);if(requestId&&existing[0].status!=='ready')fail(existing[0].status==='deleted'?'BACKUP_COPY_NOT_FOUND':'BACKUP_COPY_PENDING',409);return publicCopy(existing[0]);}
  const backup=await transaction(db,async()=>options.exporter?options.exporter(companyId,db):createDataBackupService(pool,companyId).export('all',{db}));
  if(!Buffer.isBuffer(backup.file)||backup.file.length>MAX_BACKUP_FILE)fail('BACKUP_TOO_LARGE');
  const copyId=randomUUID(),created=now(),day=localBackupDate(created),fileName='copia-empresa-'+companyId+'-'+type+'-'+day+'-'+copyId.slice(0,8)+'.json.gz';
  const summary={company_name:backup.data.tables.companies[0].name,exercises:backup.data.tables.accounting_exercises.map(row=>row.name),entry_count:backup.data.tables.journal_entries.length,invoice_count:backup.data.tables.trade_invoices.length};
  let partial,final,ownedPartial=false,ownedFinal=false,metadataAttempted=false;
  try{
   const folder=await companyFolder(companyId,true);partial=path.join(folder,copyId+'.partial');final=path.join(folder,copyId+'.json.gz');
   const handle=await fs.open(partial,'wx',0o600);ownedPartial=true;try{await handle.writeFile(backup.file);await handle.sync();}finally{await handle.close();}
   await fs.rename(partial,final);ownedPartial=false;ownedFinal=true;
   metadataAttempted=true;
   await db.execute('INSERT INTO backup_copies (id,company_id,frequency,trigger_kind,scheduled_for,request_id,file_name,size_bytes,file_sha256,backup_checksum,summary,created_at,created_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[copyId,companyId,type,trigger,scheduledFor?stamp(scheduledFor):null,requestId,fileName,backup.file.length,sha(backup.file),backup.data.checksum,JSON.stringify(summary),stamp(created),day]);
   const [[row]]=await db.execute('SELECT * FROM backup_copies WHERE company_id=? AND id=?',[companyId,copyId]);return publicCopy(row);
  }catch(error){
   if(ownedPartial)await fs.unlink(partial).catch(()=>{});
   // Keep the archive if the database reply was lost after a possible commit.
   if(ownedFinal&&!metadataAttempted)await fs.unlink(final).catch(()=>{});
   if(error.status)throw error;fail(storageCode(error),503);
  }
 }
 async function processCompany(companyId){return locked(companyId,async db=>{
  await erasePending(db,companyId);
  for(const schedule of await schedules(db,companyId)){
   if(!schedule.enabled||!schedule.next_run_at||iso(schedule.next_run_at)>now().toISOString()||schedule.retry_after&&iso(schedule.retry_after)>now().toISOString())continue;
   try{
    const at=latestBackupDue(schedule,now());await makeCopy(db,companyId,schedule.frequency,'scheduled',at);
    await db.execute('UPDATE backup_schedules SET next_run_at=?,last_success_at=?,last_error_code=NULL,retry_after=NULL WHERE company_id=? AND frequency=?',[stamp(nextBackupRun(schedule,now())),stamp(now()),companyId,schedule.frequency]);
   }catch(error){await db.execute('UPDATE backup_schedules SET last_error_code=?,retry_after=? WHERE company_id=? AND frequency=?',[error.status?error.code:storageCode(error),stamp(new Date(now().getTime()+300000)),companyId,schedule.frequency]);}
  }
 });}
 async function tick(){
  if(inFlight)return inFlight;
  inFlight=(async()=>{const [rows]=await pool.execute('SELECT company_id FROM backup_schedules WHERE enabled=1 AND next_run_at<=? AND (retry_after IS NULL OR retry_after<=?) UNION SELECT company_id FROM backup_copies WHERE status=\'deleting\'',[stamp(now()),stamp(now())]);for(const row of rows)try{await processCompany(row.company_id);}catch(error){if(error.code!=='BACKUP_BUSY')console.error('Automatic backup:',error.code||'SERVICE_UNAVAILABLE');}})();
  try{return await inFlight;}finally{inFlight=null;}
 }
 return {
  directory,tick,
  start(){if(timer)return;const run=()=>tick().catch(error=>console.error('Automatic backup:',error.code||'SERVICE_UNAVAILABLE'));timer=setInterval(run,60000);timer.unref();run();},
  async stop(){if(timer)clearInterval(timer);timer=null;await inFlight;},
  forCompany(value){const companyId=id(value);return {
   settings:()=>settings(companyId),
   async saveSettings(body){const wanted=validateBackupSchedules(body);await locked(companyId,async db=>{
    const current=await schedules(db,companyId);
    await transaction(db,async()=>{for(const row of wanted){const old=current.find(item=>item.frequency===row.frequency),same=['enabled','run_time','weekday','month_day'].every(key=>key==='enabled'?!!old[key]===row[key]:old[key]===row[key]),next=row.enabled?(same&&old.next_run_at?old.next_run_at:stamp(nextBackupRun(row,now()))):null;
     await db.execute('INSERT INTO backup_schedules (company_id,frequency,enabled,run_time,weekday,month_day,next_run_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),run_time=VALUES(run_time),weekday=VALUES(weekday),month_day=VALUES(month_day),next_run_at=VALUES(next_run_at),updated_at=VALUES(updated_at),last_error_code=NULL,retry_after=NULL',[companyId,row.frequency,row.enabled?1:0,row.run_time,row.weekday,row.month_day,next,stamp(now())]);
    }});
   });return settings(companyId);},
   async list(query={}){
    const selected=query.types===undefined?backupFrequencies:types(query.types),from=query.from?validDate(query.from):null,to=query.to?validDate(query.to):null,page=Number(query.page??1);
    if(from&&to&&from>to||!Number.isSafeInteger(page)||page<1||page>100000)fail('BACKUP_INVALID_FILTER');
    const where='company_id=? AND status<>\'deleted\' AND frequency IN ('+marks(selected)+')'+(from?' AND created_date>=?':'')+(to?' AND created_date<=?':''),params=[companyId,...selected,...(from?[from]:[]),...(to?[to]:[])];
    const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM backup_copies WHERE '+where,params);
    const [rows]=await pool.query('SELECT * FROM backup_copies WHERE '+where+' ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?', [...params,(page-1)*25]);
    return {copies:rows.map(publicCopy),total:Number(count.n),page,page_size:25};
   },
   async run(body){const type=frequency(body?.frequency),requestId=uuid(body?.request_id);return locked(companyId,db=>makeCopy(db,companyId,type,'manual',null,requestId));},
   async download(value){const copyId=uuid(value);return locked(companyId,async db=>{
    const [[row]]=await db.execute('SELECT * FROM backup_copies WHERE company_id=? AND id=? AND status<>\'deleted\'',[companyId,copyId]);if(!row)fail('BACKUP_COPY_NOT_FOUND',404);if(row.status!=='ready')fail('BACKUP_COPY_PENDING',409);
    let file;try{file=await fs.readFile(await archivePath(companyId,copyId));}catch(error){if(error.status)throw error;fail('BACKUP_STORAGE_ERROR',503);}
    if(file.length!==Number(row.size_bytes)||sha(file)!==row.file_sha256)fail('BACKUP_CHECKSUM',409);
    return {file,name:row.file_name};
   });},
   async previewDelete(body){const filter=deletionFilter(body);for(const [key,item]of previews)if(item.expires<=now().getTime())previews.delete(key);if(previews.size>=100)fail('BACKUP_PREVIEW_BUSY',409);
    const rows=await readyRows(pool,companyId,filter),token=randomUUID();previews.set(token,{companyId,filter,hash:fingerprint(rows),expires:now().getTime()+900000});
    return {token,count:rows.length,total_bytes:rows.reduce((total,row)=>total+Number(row.size_bytes),0),filter,copies:rows.slice(0,20).map(publicCopy),oldest_date:rows[0]?.created_date||null,newest_date:rows.at(-1)?.created_date||null};
   },
   async delete(body){if(body?.confirm!==true)fail('BACKUP_CONFIRM_REQUIRED');const token=uuid(body.token),preview=previews.get(token);if(!preview||preview.companyId!==companyId||preview.expires<=now().getTime())fail('BACKUP_PREVIEW_EXPIRED',409);
    return locked(companyId,async db=>{
     const rows=await readyRows(db,companyId,preview.filter);if(fingerprint(rows)!==preview.hash)fail('BACKUP_ARCHIVE_CHANGED',409);
     await transaction(db,async()=>{for(const row of rows)await db.execute('UPDATE backup_copies SET status=\'deleting\' WHERE company_id=? AND id=? AND status=\'ready\'',[companyId,row.id]);});previews.delete(token);
     // Only explicitly confirmed copies enter this durable deletion queue.
     await erasePending(db,companyId);
     const ids=rows.map(row=>row.id);if(!ids.length)return {deleted:0,pending:0};
     const [[count]]=await db.execute('SELECT COUNT(*) AS n FROM backup_copies WHERE company_id=? AND status=\'deleted\' AND id IN ('+marks(ids)+')',[companyId,...ids]);return {deleted:Number(count.n),pending:rows.length-Number(count.n)};
    });
   },
  };},
 };
}
