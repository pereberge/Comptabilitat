import { createHash,randomUUID } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { id,fail } from './validation.js';
import { lockCompany } from './subaccounts.js';
import { withTransaction } from '../db/transaction.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const json=value=>typeof value==='string'?JSON.parse(value):value;
const conflict=code=>{throw new HttpError(409,code);};
const binaryTables=new Set(['invoice_documents','journal_imports','bank_reconciliations']);
const chunks=(rows,size)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,(index+1)*size));
const encodeRow=row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Buffer.isBuffer(value)?{$binary_base64:value.toString('base64')}:value]));
function datasets(exerciseId){
 const entries='SELECT e.id FROM journal_entries e WHERE e.company_id=r.company_id AND e.exercise_id=?';
 const invoices='SELECT i.id FROM trade_invoices i WHERE i.company_id=r.company_id AND i.exercise_id=?';
 const farmInvoices='SELECT i.id FROM farm_invoices i WHERE i.company_id=r.company_id AND i.exercise_id=?';
 const operations='SELECT o.id FROM exercise_operations o WHERE o.company_id=r.company_id AND o.exercise_id=?';
 return [
  ['farm_care_costs','farm_care_costs','r.exercise_id=?'],
  ['farm_deaths','farm_deaths','r.exercise_id=?'],
  ['farm_feed_transfers','farm_feed_transfers','r.exercise_id=?'],
  ['farm_sales','farm_sales','r.exercise_id=?'],
  ['farm_costs','farm_cost_lines',`r.invoice_id IN (${farmInvoices})`],
  ['farm_invoices','farm_invoices','r.exercise_id=?'],
  ['documents','invoice_documents','r.exercise_id=?'],
  ['bank_reports','bank_reconciliations','r.exercise_id=?'],
  ['settlements','portfolio_settlements','r.exercise_id=?'],
  ['receipts','portfolio_receipts',`r.invoice_id IN (${invoices})`],
  ['invoice_lines','trade_invoice_lines',`r.invoice_id IN (${invoices})`],
  ['invoices','trade_invoices','r.exercise_id=?'],
  ['lines','journal_lines',`r.entry_id IN (${entries})`],
  ['entries','journal_entries','r.exercise_id=?'],
  ['annual_operations','exercise_operations','r.exercise_id=?'],
  ['imports','journal_imports','r.exercise_id=?'],
  ['restored_settlements','portfolio_settlements',`r.exercise_id<>? AND r.reversal_entry_id IN (${entries})`,'update'],
  ['restored_invoices','trade_invoices',`r.exercise_id<>? AND r.void_entry_id IN (${entries})`,'update'],
  ['detached_cancellations','journal_entries',`r.exercise_id<>? AND r.status='cancelled' AND r.cancelled_by_operation_id IN (${operations})`,'update'],
 ].map(([name,table,where,action='delete'])=>({name,table,where,action,params:where.includes('<>')?[exerciseId,exerciseId]:[exerciseId]}));
}
export function createExerciseClearService(pool,companyId){
 const columnCache=new Map();
 async function fields(db,table){
  if(!columnCache.has(table)){
   const [columns]=await db.execute('SHOW COLUMNS FROM '+table);
   if(columns.some(row=>!/^[a-z_0-9]+$/.test(row.Field)))throw new Error('Unsupported accounting schema');
   columnCache.set(table,columns.map(row=>row.Field==='source_pdf'?'SHA2(r.source_pdf,256) AS source_pdf_sha256':'r.'+row.Field).join(','));
  }
  return columnCache.get(table);
 }
 async function blocked(db,exercise){
  const result=[];
  const [[remittance]]=await db.execute("SELECT m.id FROM bank_remittances m JOIN portfolio_receipts r ON r.company_id=m.company_id AND JSON_CONTAINS(m.receipt_ids,CAST(r.id AS JSON)) JOIN trade_invoices i ON i.company_id=r.company_id AND i.id=r.invoice_id WHERE m.company_id=? AND m.status='prepared' AND i.exercise_id=? LIMIT 1",[companyId,exercise.id]);
  if(remittance)result.push({code:'bank_remittance',message:'Cancela primero la remesa bancaria '+remittance.id+' que contiene recibos de este ejercicio.',exercise_id:exercise.id,exercise_name:exercise.name});
  const add=async(code,message,sql,params)=>{const [rows]=await db.execute(sql,params);for(const row of rows)result.push({code,message,exercise_id:row.exercise_id,exercise_name:row.exercise_name,count:row.total});};
  await add('dependent_opening','Anula primero la apertura de este ejercicio dependiente.',`SELECT e.id AS exercise_id,e.name AS exercise_name,COUNT(*) AS total
   FROM journal_entries j JOIN accounting_exercises e ON e.company_id=j.company_id AND e.id=j.exercise_id
   LEFT JOIN exercise_operations o ON o.company_id=j.company_id AND o.id=j.exercise_operation_id
   WHERE j.company_id=? AND j.exercise_id<>? AND j.status='posted' AND j.entry_type='opening'
   AND (e.start_date=DATE_ADD(?,INTERVAL 1 DAY) OR o.source_exercise_id=?) GROUP BY e.id,e.name`,[companyId,exercise.id,exercise.end_date,exercise.id]);
  await add('external_payments','Hay cobros o pagos de facturas de este período en otro ejercicio. Vacía primero ese período si también quieres eliminar sus movimientos.',`SELECT e.id AS exercise_id,e.name AS exercise_name,COUNT(*) AS total
   FROM portfolio_settlements s JOIN portfolio_receipts r ON r.company_id=s.company_id AND r.id=s.receipt_id
   JOIN trade_invoices i ON i.company_id=r.company_id AND i.id=r.invoice_id JOIN accounting_exercises e ON e.company_id=s.company_id AND e.id=s.exercise_id
   WHERE s.company_id=? AND i.exercise_id=? AND s.exercise_id<>? GROUP BY e.id,e.name`,[companyId,exercise.id,exercise.id]);
  await add('external_reversals','Hay anulaciones de cobros o pagos de este período en otro ejercicio. Vacía primero el ejercicio de la anulación.',`SELECT e.id AS exercise_id,e.name AS exercise_name,COUNT(*) AS total
   FROM portfolio_settlements s JOIN journal_entries j ON j.company_id=s.company_id AND j.id=s.reversal_entry_id
   JOIN accounting_exercises e ON e.company_id=j.company_id AND e.id=j.exercise_id
   WHERE s.company_id=? AND s.exercise_id=? AND j.exercise_id<>? GROUP BY e.id,e.name`,[companyId,exercise.id,exercise.id]);
  await add('external_voids','Hay anulaciones de facturas de este período en otro ejercicio. Vacía primero el ejercicio de la anulación.',`SELECT e.id AS exercise_id,e.name AS exercise_name,COUNT(*) AS total
   FROM trade_invoices i JOIN journal_entries j ON j.company_id=i.company_id AND j.id=i.void_entry_id
   JOIN accounting_exercises e ON e.company_id=j.company_id AND e.id=j.exercise_id
   WHERE i.company_id=? AND i.exercise_id=? AND j.exercise_id<>? GROUP BY e.id,e.name`,[companyId,exercise.id,exercise.id]);
  await add('external_documents','Un documento de otro ejercicio está vinculado a estos movimientos. Revisa ese vínculo antes de borrar.',`SELECT e.id AS exercise_id,e.name AS exercise_name,COUNT(*) AS total
   FROM invoice_documents d JOIN accounting_exercises e ON e.company_id=d.company_id AND e.id=d.exercise_id
   WHERE d.company_id=? AND d.exercise_id<>? AND (d.entry_id IN (SELECT id FROM journal_entries WHERE company_id=? AND exercise_id=?)
    OR d.invoice_id IN (SELECT id FROM trade_invoices WHERE company_id=? AND exercise_id=?)) GROUP BY e.id,e.name`,[companyId,exercise.id,companyId,exercise.id,companyId,exercise.id]);
  const [[fiscal]]=await db.execute(`SELECT COUNT(DISTINCT v.invoice_id) AS total FROM verifactu_records v JOIN trade_invoices i ON i.company_id=v.company_id AND i.id=v.invoice_id LEFT JOIN journal_entries j ON j.company_id=i.company_id AND j.id=i.void_entry_id WHERE v.company_id=? AND (i.exercise_id=? OR j.exercise_id=?)`,[companyId,exercise.id,exercise.id]);
  if(fiscal.total)result.push({code:'verifactu',message:'Este ejercicio afecta a facturas con registros VERI*FACTU y no se puede vaciar ni sustituir.',exercise_id:exercise.id,exercise_name:exercise.name,count:fiscal.total});
  return result;
 }
 async function state(db,exerciseId){
  const [[company]]=await db.execute('SELECT id,name FROM companies WHERE id=?',[companyId]);
  const [[exercise]]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,id(exerciseId)]);
  if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
  const sets=datasets(exercise.id);
  for(const set of sets){const [rows]=await db.execute('SELECT '+await fields(db,set.table)+' FROM '+set.table+' r WHERE r.company_id=? AND '+set.where+' ORDER BY r.id',[companyId,...set.params]);set.rows=rows;}
  const blockers=await blocked(db,exercise),counts=Object.fromEntries(sets.map(set=>[set.name,set.rows.length]));
  const previewHash=hash({company,exercise,records:sets.map(set=>({name:set.name,rows:set.rows})),blockers});
  return {company,exercise,sets,blockers,counts,preview_hash:previewHash,ready:!blockers.length&&(sets.some(set=>set.rows.length)||exercise.status==='closed')};
 }
 function preview(data){return {company:data.company,exercise:data.exercise,counts:data.counts,blockers:data.blockers,preview_hash:data.preview_hash,ready:data.ready};}
 async function backupRows(db,clearId,table,rows,action){
  for(const batch of chunks(rows,binaryTables.has(table)?1:100)){
   const ids=batch.map(row=>row.id),[original]=await db.execute('SELECT * FROM '+table+' WHERE company_id=? AND id IN ('+ids.map(()=>'?').join(',')+') ORDER BY id',[companyId,...ids]);
   if(original.length!==batch.length)conflict('EXERCISE_CLEAR_STALE');
   const values=original.flatMap(row=>[companyId,clearId,table,row.id,action,JSON.stringify(encodeRow(row))]);
   await db.execute('INSERT INTO exercise_clear_rows(company_id,clear_id,table_name,row_id,record_action,row_data) VALUES '+original.map(()=>'(?,?,?,?,?,?)').join(','),values);
  }
 }
 async function mutate(db,set,statement){
  for(const batch of chunks(set.rows,200)){
   const ids=batch.map(row=>row.id),[result]=await db.execute(statement+' WHERE company_id=? AND id IN ('+ids.map(()=>'?').join(',')+')',[companyId,...ids]);
   if(result.affectedRows!==ids.length)conflict('EXERCISE_CLEAR_STALE');
  }
 }
 async function saveBeforeClear(db,data,requestId,digest){
  const target=data.exercise.id;
  const [saved]=await db.execute(`INSERT INTO exercise_clears(company_id,exercise_id,request_id,request_hash,preview_hash,company_name,exercise_name,start_date,end_date,counts) VALUES (?,?,?,?,?,?,?,?,?,?)`,[companyId,target,requestId,digest,data.preview_hash,data.company.name,data.exercise.name,data.exercise.start_date,data.exercise.end_date,JSON.stringify(data.counts)]);
  await backupRows(db,saved.insertId,'accounting_exercises',[data.exercise],'update');
  for(const set of data.sets)await backupRows(db,saved.insertId,set.table,set.rows,set.action);

  return {clear_id:saved.insertId,exercise_id:target,exercise_name:data.exercise.name,status:'open',counts:data.counts,backup_available:true,replayed:false};
 }
 async function replacementState(db,exerciseIds){
  const selected=new Set(exerciseIds),states=[];
  for(const exerciseId of selected)states.push(await state(db,exerciseId));
  const blockers=[];
  for(const data of states){
   for(const blocker of data.blockers)if(['verifactu','bank_remittance'].includes(blocker.code)||!selected.has(blocker.exercise_id))blockers.push({...blocker,message:['verifactu','bank_remittance'].includes(blocker.code)?blocker.message:'Incluye también el ejercicio '+blocker.exercise_name+' en la copia para sustituir estos datos. '+blocker.message});
   for(const set of data.sets.filter(set=>set.action==='update')){
    for(const row of set.rows)if(!selected.has(row.exercise_id))blockers.push({code:'external_changes',message:'La sustitución afectaría a movimientos de otro ejercicio. Incluye también ese período en la copia.',exercise_id:row.exercise_id});
   }
  }
  return {states,blockers,state_hash:hash(states.map(data=>data.preview_hash))};
 }
 async function removeData(db,states){
  for(const data of states){
   const byName=new Map(data.sets.map(set=>[set.name,set]));
   await mutate(db,byName.get('restored_settlements'),'UPDATE portfolio_settlements SET reversal_entry_id=NULL,reversal_request_id=NULL,reversal_request_hash=NULL,reversal_date=NULL,reversal_reason=NULL');
   await mutate(db,byName.get('restored_invoices'),"UPDATE trade_invoices SET status='posted',void_entry_id=NULL,void_request_id=NULL,void_request_hash=NULL,void_date=NULL,void_reason=NULL");
   await mutate(db,byName.get('detached_cancellations'),'UPDATE journal_entries SET cancelled_by_operation_id=NULL');
  }
  // Remove dependent tables across all selected years before their parent tables.
  for(const {name}of datasets(0).filter(set=>set.action==='delete')){
   for(const data of states){const set=data.sets.find(set=>set.name===name);await mutate(db,set,'DELETE FROM '+set.table);}
  }
  for(const data of states)await db.execute("UPDATE accounting_exercises SET status='open' WHERE company_id=? AND id=?",[companyId,data.exercise.id]);
 }
 return {
  replacementPreview:replacementState,
  async replaceForRestore(db,exerciseIds,requestId,expectedHash){
   const data=await replacementState(db,exerciseIds);
   if(data.state_hash!==expectedHash)conflict('BACKUP_DESTINATION_CHANGED');
   if(data.blockers.length)conflict('BACKUP_REPLACEMENT_DEPENDENCIES');
   const backups=[];
   for(const entry of data.states){
    const result=await saveBeforeClear(db,entry,randomUUID(),hash({restore:requestId,exercise:entry.exercise.id}));
    await db.execute('UPDATE exercise_clears SET result=? WHERE company_id=? AND id=?',[JSON.stringify(result),companyId,result.clear_id]);
    backups.push(result);
   }
   await removeData(db,data.states);
   return backups;
  },
  preview:exerciseId=>withTransaction(pool,async db=>{await lockCompany(db,companyId);return preview(await state(db,exerciseId));}),
  async clear(exerciseId,body){
   const target=id(exerciseId);if(body?.confirmation!=='96')fail('EXERCISE_CLEAR_CODE');
   if(typeof body.preview_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.preview_hash))fail('EXERCISE_CLEAR_PREVIEW_REQUIRED');
   if(typeof body.request_id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.request_id))fail('INVALID_REQUEST');
   const requestId=body.request_id.toLowerCase(),digest=hash({companyId,target,preview_hash:body.preview_hash,requestId});
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    const [[exercise]]=await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,target]);if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
    const [[replay]]=await db.execute('SELECT request_hash,result FROM exercise_clears WHERE company_id=? AND request_id=?',[companyId,requestId]);
    if(replay){if(replay.request_hash!==digest)conflict('REQUEST_CONFLICT');return {...json(replay.result),replayed:true};}
    const data=await state(db,target);if(data.preview_hash!==body.preview_hash)conflict('EXERCISE_CLEAR_STALE');if(data.blockers.length)conflict('EXERCISE_CLEAR_DEPENDENCIES');if(!data.ready)conflict('EXERCISE_CLEAR_EMPTY');
    const result=await saveBeforeClear(db,data,requestId,digest);
    await removeData(db,[data]);
    await db.execute('UPDATE exercise_clears SET result=? WHERE company_id=? AND id=?',[JSON.stringify(result),companyId,result.clear_id]);return result;
   });
  },
  async backup(clearId){
   const [[record]]=await pool.execute('SELECT id,company_name,exercise_name,exercise_id,start_date,end_date,counts,created_at FROM exercise_clears WHERE company_id=? AND id=?',[companyId,id(clearId)]);if(!record)throw new HttpError(404,'EXERCISE_CLEAR_NOT_FOUND');
   return {record:{...record,counts:json(record.counts)},async *rows(){let cursor=0;for(;;){const [[row]]=await pool.execute('SELECT id,table_name,row_id,record_action,row_data FROM exercise_clear_rows WHERE company_id=? AND clear_id=? AND id>? ORDER BY id LIMIT 1',[companyId,record.id,cursor]);if(!row)return;cursor=row.id;yield {table:row.table_name,id:row.row_id,action:row.record_action,data:json(row.row_data)};}}};
  },
 };
}
