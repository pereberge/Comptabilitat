import { HttpError } from '../middleware/errors.js';
import { id,fail } from './validation.js';
import { hash,requestId } from './invoice-validation.js';
import { lockCompany } from './subaccounts.js';
import { withTransaction } from '../db/transaction.js';

const json=value=>typeof value==='string'?JSON.parse(value):value;
const conflict=code=>{throw new HttpError(409,code);};
const placeholders=rows=>rows.map(()=>'?').join(',');

export function createInvoiceDeletionService(pool,companyId){
 async function state(db,invoiceId){
  const [[invoice]]=await db.execute('SELECT * FROM trade_invoices WHERE company_id=? AND id=?',[companyId,id(invoiceId)]);
  if(!invoice)throw new HttpError(404,'INVOICE_NOT_FOUND');
  const [lines]=await db.execute('SELECT * FROM trade_invoice_lines WHERE company_id=? AND invoice_id=? ORDER BY id',[companyId,invoice.id]);
  const [receipts]=await db.execute('SELECT * FROM portfolio_receipts WHERE company_id=? AND invoice_id=? ORDER BY id',[companyId,invoice.id]);
  const [settlements]=await db.execute(`SELECT s.* FROM portfolio_settlements s JOIN portfolio_receipts r ON r.company_id=s.company_id AND r.id=s.receipt_id WHERE s.company_id=? AND r.invoice_id=? ORDER BY s.id`,[companyId,invoice.id]);
  const entryIds=[...new Set([invoice.entry_id,invoice.void_entry_id,...settlements.flatMap(row=>[row.entry_id,row.reversal_entry_id])].filter(Boolean))].sort((a,b)=>a-b);
  const [entries]=await db.execute('SELECT * FROM journal_entries WHERE company_id=? AND id IN ('+placeholders(entryIds)+') ORDER BY id',[companyId,...entryIds]);
  const [journalLines]=await db.execute('SELECT * FROM journal_lines WHERE company_id=? AND entry_id IN ('+placeholders(entryIds)+') ORDER BY id',[companyId,...entryIds]);
  const [documents]=await db.execute('SELECT id,company_id,exercise_id,source_name,source_sha256,status,invoice_id,entry_id,version,updated_at FROM invoice_documents WHERE company_id=? AND invoice_id=? ORDER BY id',[companyId,invoice.id]);
  const exerciseIds=[...new Set([invoice.exercise_id,...entries.map(row=>row.exercise_id)])].sort((a,b)=>a-b);
  const [exercises]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id IN ('+placeholders(exerciseIds)+') ORDER BY id FOR UPDATE',[companyId,...exerciseIds]);
  const [[company]]=await db.execute('SELECT id,name FROM companies WHERE id=?',[companyId]);
  const blockers=[];
  const [[fiscal]]=await db.execute('SELECT id FROM verifactu_records WHERE company_id=? AND invoice_id=? LIMIT 1',[companyId,invoice.id]);
  if(fiscal)blockers.push({code:'verifactu',message:'Esta factura tiene un registro VERI*FACTU. Se conserva con su trazabilidad; utiliza la anulación cuando corresponda.'});
  for(const exercise of exercises)if(exercise.status!=='open')blockers.push({message:'El ejercicio '+exercise.name+' está cerrado. Ábrelo antes de borrar.',exercise_id:exercise.id});
  if(entries.length!==entryIds.length||entries.some(row=>row.entry_type!=='normal'||row.status!=='posted'||row.exercise_operation_id||row.cancelled_by_operation_id))blockers.push({message:'Hay asientos de apertura, cierre o anulados. Revisa primero las operaciones del ejercicio.'});
  const [openings]=await db.execute(`SELECT DISTINCT e.name FROM journal_entries j JOIN accounting_exercises e ON e.company_id=j.company_id AND e.id=j.exercise_id
   LEFT JOIN exercise_operations o ON o.company_id=j.company_id AND o.id=j.exercise_operation_id
   WHERE j.company_id=? AND j.status='posted' AND j.entry_type='opening'
   AND (o.source_exercise_id IN (${placeholders(exerciseIds)}) OR EXISTS (SELECT 1 FROM accounting_exercises s WHERE s.company_id=j.company_id AND s.id IN (${placeholders(exerciseIds)}) AND e.start_date=DATE_ADD(s.end_date,INTERVAL 1 DAY))) ORDER BY e.name`,[companyId,...exerciseIds,...exerciseIds]);
  for(const row of openings)blockers.push({message:'Anula primero la apertura dependiente del ejercicio '+row.name+'.'});
  const [externalInvoices]=await db.execute(`SELECT id FROM trade_invoices WHERE company_id=? AND id<>? AND (entry_id IN (${placeholders(entryIds)}) OR void_entry_id IN (${placeholders(entryIds)})) LIMIT 1`,[companyId,invoice.id,...entryIds,...entryIds]);
  const [externalSettlements]=await db.execute(`SELECT s.id FROM portfolio_settlements s JOIN portfolio_receipts r ON r.company_id=s.company_id AND r.id=s.receipt_id WHERE s.company_id=? AND r.invoice_id<>? AND (s.entry_id IN (${placeholders(entryIds)}) OR s.reversal_entry_id IN (${placeholders(entryIds)})) LIMIT 1`,[companyId,invoice.id,...entryIds,...entryIds]);
  const [externalDocuments]=await db.execute(`SELECT id FROM invoice_documents WHERE company_id=? AND (invoice_id IS NULL OR invoice_id<>?) AND entry_id IN (${placeholders(entryIds)}) LIMIT 1`,[companyId,invoice.id,...entryIds]);
  if(externalInvoices.length||externalSettlements.length||externalDocuments.length)blockers.push({message:'Un asiento está vinculado a otra factura, recibo o documento. Revisa esos vínculos antes de borrar.'});
  const sets=[
   {table:'portfolio_settlements',rows:settlements},
   {table:'portfolio_receipts',rows:receipts},
   {table:'trade_invoice_lines',rows:lines},
   {table:'trade_invoices',rows:[invoice]},
   {table:'journal_lines',rows:journalLines},
   {table:'journal_entries',rows:entries},
   {table:'invoice_documents',rows:documents,action:'update'},
  ];
  const counts={invoices:1,receipts:receipts.length,settlements:settlements.length,entries:entries.length,lines:journalLines.length,documents:documents.length};
  const preview_hash=hash({company,sets,exercises,blockers});
  return {company,invoice,exercises,sets,counts,preview_hash,blockers,ready:!blockers.length};
 }
 function summary(data){const {company,invoice,exercises,counts,preview_hash,blockers,ready}=data;return {company,invoice:{id:invoice.id,reference:invoice.reference,party_name:invoice.party_name,total_amount:invoice.total_amount,direction:invoice.direction,status:invoice.status},exercises:exercises.map(row=>({id:row.id,name:row.name,status:row.status})),counts,preview_hash,blockers,ready};}
 return {
  preview:invoiceId=>withTransaction(pool,async db=>{await lockCompany(db,companyId);return summary(await state(db,invoiceId));}),
  async remove(invoiceId,body){
   const target=id(invoiceId);if(body?.confirmation!=='96')fail('INVOICE_DELETE_CODE');
   const request=requestId(body.request_id);if(typeof body.preview_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.preview_hash))fail('INVOICE_DELETE_PREVIEW_REQUIRED');
   const digest=hash({target,request,preview_hash:body.preview_hash});
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    const [[replay]]=await db.execute('SELECT request_hash,result FROM invoice_deletions WHERE company_id=? AND request_id=?',[companyId,request]);
    if(replay){if(replay.request_hash!==digest)conflict('REQUEST_CONFLICT');return {...json(replay.result),replayed:true};}
    const data=await state(db,target);
    if(body.preview_hash!==data.preview_hash)conflict('INVOICE_DELETE_STALE');
    if(!data.ready)conflict('INVOICE_DELETE_DEPENDENCIES');
    const result={invoice_id:target,reference:data.invoice.reference,counts:data.counts,replayed:false};
    // Store only the request result so retries cannot repeat a deletion.
    await db.execute('INSERT INTO invoice_deletions(company_id,invoice_id,reference,request_id,request_hash,result) VALUES (?,?,?,?,?,?)',[companyId,target,data.invoice.reference,request,digest,JSON.stringify(result)]);
    // Keep each original PDF, ready for review and posting again.
    await db.execute("UPDATE invoice_documents SET status='draft',invoice_id=NULL,entry_id=NULL,version=version+1 WHERE company_id=? AND invoice_id=?",[companyId,target]);
    for(const set of data.sets.filter(set=>!set.action)){
     if(!set.rows.length)continue;
     const [removed]=await db.execute('DELETE FROM '+set.table+' WHERE company_id=? AND id IN ('+placeholders(set.rows)+')',[companyId,...set.rows.map(row=>row.id)]);
     if(removed.affectedRows!==set.rows.length)conflict('INVOICE_DELETE_STALE');
    }
    return result;
   });
  },
  async history(){const [rows]=await pool.execute('SELECT d.id,d.invoice_id,d.reference,d.created_at,d.result FROM invoice_deletions d WHERE d.company_id=? AND EXISTS (SELECT 1 FROM invoice_deletion_rows r WHERE r.company_id=d.company_id AND r.deletion_id=d.id) ORDER BY d.id DESC LIMIT 100',[companyId]);return rows.map(row=>({...row,result:json(row.result)}));},
  async backup(deletionId){
   const [[record]]=await pool.execute('SELECT * FROM invoice_deletions WHERE company_id=? AND id=?',[companyId,id(deletionId)]);
   if(!record)throw new HttpError(404,'INVOICE_DELETE_BACKUP_NOT_FOUND');
   const [rows]=await pool.execute('SELECT table_name,row_id,record_action,row_data FROM invoice_deletion_rows WHERE company_id=? AND deletion_id=? ORDER BY id',[companyId,record.id]);
   if(!rows.length)throw new HttpError(404,'INVOICE_DELETE_BACKUP_NOT_FOUND');
   return {format:'contabilitat-invoice-deletion',version:1,record:{...record,result:json(record.result)},rows:rows.map(row=>({...row,row_data:json(row.row_data)}))};
  },
 };
}
