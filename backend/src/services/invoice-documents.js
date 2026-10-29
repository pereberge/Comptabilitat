import { Worker } from 'node:worker_threads';
import { createHash,randomUUID } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { id } from './validation.js';
import { withTransaction } from '../db/transaction.js';
import { lockCompany } from './subaccounts.js';
import { buildInvoiceProposal } from './invoice-proposal.js';
import { validateInvoice } from './invoice-validation.js';
import { createInvoiceService } from './invoices.js';
import {invoiceCompanyMatches} from './document-company.js';

const previews=new Map(),lifetime=15*60*1000;let active=0;
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const fail=(code,status=400)=>{throw new HttpError(status,code);};
export function extractInvoiceDocument(buffer){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./invoice-pdf-worker.js',import.meta.url),{workerData:buffer,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
 let done=false;const timer=setTimeout(()=>finish(new HttpError(400,'INVOICE_PDF_TIMEOUT')),30000);
 function finish(error,data){if(done)return;done=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(data);}
 worker.on('message',message=>{if(message?.type==='invoice-pdf')finish(message.error?new HttpError(400,message.error):null,message.data);});
 worker.once('error',()=>finish(new HttpError(400,'INVOICE_PDF_INVALID')));worker.once('exit',()=>{if(!done)finish(new HttpError(400,'INVOICE_PDF_INVALID'));});
});}
export function createInvoiceDocumentService(pool,companyId){
 async function context(db,exerciseId){
  const [[company]]=await db.execute('SELECT c.id,c.name,d.tax_id FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);
  const [[exercise]]=await db.execute('SELECT id,name,start_date,end_date,status FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,id(exerciseId)]);
  if(!exercise)fail('EXERCISE_NOT_FOUND',404);
  const [accounts]=await db.execute('SELECT id,code,description,kind,party_profile,payment_profile FROM accounts WHERE company_id=? ORDER BY code',[companyId]);
  const [journal]=await db.execute(`SELECT e.id AS entry_id,e.number,e.entry_date,e.description AS entry_description,e.status,e.entry_type,l.account_id,a.code,l.debit,l.credit
   FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
   WHERE e.company_id=? AND e.exercise_id=? ORDER BY e.entry_date,e.number,l.position`,[companyId,exercise.id]);
  const [invoices]=await db.execute('SELECT id,entry_id,direction,reference,party_account_id,party_tax_id,invoice_date,posting_date,base_total,tax_total,withholding_total,total_amount,status FROM trade_invoices WHERE company_id=? AND exercise_id=?',[companyId,exercise.id]);
  return {company,exercise,accounts,journal,invoices};
 }
 function owner(extraction,company){
  const match=party=>!!invoiceCompanyMatches(party,company);
  if(match(extraction.supplier))return 'issued';if(match(extraction.customer))return 'received';
  if(extraction.customer?.name&&extraction.supplier?.name)fail('INVOICE_DOCUMENT_COMPANY_MISMATCH',409);return 'received';
 }
 function initialForm(extraction,meta){
  const direction=owner(extraction,meta.company),party=direction==='received'?extraction.supplier:extraction.customer;
  return {exercise_id:meta.exercise.id,direction,reference:(extraction.reference||'').slice(0,60),invoice_date:extraction.invoice_date||'',posting_date:extraction.invoice_date||'',party:{name:(party.name||'').slice(0,200),tax_id:(party.tax_id||'').slice(0,32),address:(party.address||'').slice(0,250),email:''},party_parent:direction==='received'?'4100':'4300',
   party_account_id:'',offset_account_id:'',vat_account_id:'',withholding_account_id:'',withholding_rate:extraction.withholding_rate||'0',payment_method:extraction.payment_method||'transfer',notes:'Documento PDF conservado con la propuesta. Revisar los datos con el original.',
   lines:extraction.lines.length?extraction.lines:[{description:'',base:'',tax_rate:'21'}],receipts:[{due_date:extraction.due_date||extraction.invoice_date||'',amount:extraction.total_amount||'0.00'}],request_id:randomUUID()};
 }
 async function find(db,documentId){
  const [[row]]=await db.execute('SELECT id,company_id,exercise_id,source_name,source_sha256,pages,extraction,form,proposal,status,invoice_id,entry_id,version,created_at,updated_at FROM invoice_documents WHERE company_id=? AND id=?',[companyId,id(documentId)]);
  if(!row)fail('INVOICE_DOCUMENT_NOT_FOUND',404);return {...row,extraction:parse(row.extraction),form:parse(row.form),proposal:parse(row.proposal)};
 }
 async function proposal(db,row){const meta=await context(db,row.exercise_id);return {meta,proposal:buildInvoiceProposal({...meta,form:row.form,extraction:row.extraction})};}
 async function stored(db,documentId){const row=await find(db,documentId),result=await proposal(db,row);return {...row,form:result.proposal.form,proposal:result.proposal,exercise:result.meta.exercise};}
 async function snapshot(action){const db=await pool.getConnection();try{await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');const result=await action(db);await db.commit();return result;}catch(error){await db.rollback();throw error;}finally{db.release();}}
 function preview(token){const row=typeof token==='string'?previews.get(token):null;if(!row||row.companyId!==companyId||row.expires<Date.now())fail('INVOICE_DOCUMENT_PREVIEW_EXPIRED',409);return row;}
 return {
  async list(query){
   const exerciseId=id(query.exercise_id);const [[exercise]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,exerciseId]);if(!exercise)fail('EXERCISE_NOT_FOUND',404);
   const search=typeof query.search==='string'?query.search.trim():'';if(search.length>200)fail('INVALID_SEARCH');
   let where='company_id=? AND exercise_id=?';const params=[companyId,exerciseId];
   if(query.direction&&query.direction!=='all'){if(!['issued','received'].includes(query.direction))fail('INVALID_INVOICE');where+=' AND direction=?';params.push(query.direction);}
   if(search){where+=' AND (LOCATE(?,reference)>0 OR LOCATE(?,party_name)>0 OR LOCATE(?,party_tax_id)>0 OR LOCATE(?,source_name)>0 OR LOCATE(?,CAST(total_amount AS CHAR))>0)';params.push(search,search,search,search,search.replace(',','.'));}
   const [rows]=await pool.execute('SELECT id,source_name,direction,reference,party_name,party_tax_id,invoice_date,total_amount,status,invoice_id,entry_id,version FROM invoice_documents WHERE '+where+' ORDER BY created_at DESC,id DESC',params);return rows;
  },
  get:documentId=>snapshot(db=>stored(db,documentId)),
  async importStored(buffer,extraction,exerciseId,sourceName,{db}={}){
   if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>10*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-'||!extraction||extraction.error)fail('INVOICE_PDF_INVALID');
   const write=async connection=>{
    await lockCompany(connection,companyId);
    let meta=await context(connection,exerciseId);
    const sourceHash=createHash('sha256').update(buffer).digest('hex');
    const [[existing]]=await connection.execute('SELECT id,exercise_id FROM invoice_documents WHERE company_id=? AND source_sha256=? ORDER BY id LIMIT 1',[companyId,sourceHash]);
    if(existing)return {...existing,replayed:true};
    if(extraction.invoice_date){
     const [[period]]=await connection.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND start_date<=? AND end_date>=?',[companyId,extraction.invoice_date,extraction.invoice_date]);
     if(!period)fail('DOCUMENTATION_INVOICE_EXERCISE_REQUIRED',409);
     if(period.id!==meta.exercise.id)meta=await context(connection,period.id);
    }
    const form=initialForm(extraction,meta),proposed=buildInvoiceProposal({...meta,form,extraction}),savedForm=proposed.form;
    const [saved]=await connection.execute(`INSERT INTO invoice_documents(company_id,exercise_id,source_name,source_sha256,source_pdf,pages,extraction,form,proposal,direction,reference,party_name,party_tax_id,invoice_date,total_amount)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[companyId,meta.exercise.id,sourceName,sourceHash,buffer,extraction.pages,JSON.stringify(extraction),JSON.stringify(savedForm),JSON.stringify(proposed),savedForm.direction,savedForm.reference,savedForm.party.name,savedForm.party.tax_id,savedForm.invoice_date||null,proposed.totals?.total_amount??null]);
    return {id:saved.insertId,exercise_id:meta.exercise.id,replayed:false};
   };
   return db?write(db):withTransaction(pool,write);
  },
  async remove(documentId,body){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await find(db,documentId);
   if(row.status!=='draft'||row.invoice_id||row.entry_id)fail('INVOICE_DOCUMENT_ALREADY_POSTED',409);
   if(row.version!==body?.version)fail('INVOICE_DOCUMENT_CHANGED',409);
   await db.execute('DELETE FROM invoice_documents WHERE company_id=? AND id=?',[companyId,row.id]);return {id:row.id,deleted:true};
  });},
  async source(documentId){const [[row]]=await pool.execute('SELECT source_name,source_pdf FROM invoice_documents WHERE company_id=? AND id=?',[companyId,id(documentId)]);if(!row)fail('INVOICE_DOCUMENT_NOT_FOUND',404);return row;},
  async preview(buffer,exerciseId,filename){
   if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>5*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-')fail('INVOICE_PDF_INVALID');
   for(const [token,row]of previews)if(row.expires<Date.now())previews.delete(token);
   if(active>=3||[...previews.values()].filter(row=>!row.result).length>=10)fail('INVOICE_PDF_BUSY',429);active++;
   try{
    const extraction=await extractInvoiceDocument(buffer);
    const data=await snapshot(async db=>{const meta=await context(db,exerciseId),form=initialForm(extraction,meta);return {meta,proposal:buildInvoiceProposal({...meta,form,extraction})};});
    const token=randomUUID(),sourceHash=createHash('sha256').update(buffer).digest('hex'),sourceName=String(filename||'factura.pdf').split(/[\\/]/).at(-1).replace(/[\x00-\x1f]/g,'').slice(0,255)||'factura.pdf';
    const [[existing]]=await pool.execute('SELECT id FROM invoice_documents WHERE company_id=? AND exercise_id=? AND source_sha256=?',[companyId,data.meta.exercise.id,sourceHash]);
    previews.set(token,{companyId,exerciseId:data.meta.exercise.id,buffer:Buffer.from(buffer),sourceName,sourceHash,extraction,form:data.proposal.form,expires:Date.now()+lifetime});
    return {token,source_name:sourceName,pages:extraction.pages,company:{id:companyId,name:data.meta.company.name},exercise:data.meta.exercise,extraction,proposal:data.proposal,existing_document_id:existing?.id??null};
   }finally{active--;}
  },
  async discard(body){const row=preview(body?.token);if(!row.result)previews.delete(body.token);return {discarded:true};},
  async archive(body){
   const cached=preview(body?.token);if(cached.result)return {...cached.result,replayed:true};
   const result=await withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    const [[existing]]=await db.execute('SELECT id FROM invoice_documents WHERE company_id=? AND exercise_id=? AND source_sha256=?',[companyId,cached.exerciseId,cached.sourceHash]);if(existing)return {id:existing.id,replayed:true};
    const meta=await context(db,cached.exerciseId);owner(cached.extraction,meta.company);
    const proposed=buildInvoiceProposal({...meta,form:cached.form,extraction:cached.extraction}),form=proposed.form;
    const [saved]=await db.execute(`INSERT INTO invoice_documents(company_id,exercise_id,source_name,source_sha256,source_pdf,pages,extraction,form,proposal,direction,reference,party_name,party_tax_id,invoice_date,total_amount)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[companyId,cached.exerciseId,cached.sourceName,cached.sourceHash,cached.buffer,cached.extraction.pages,JSON.stringify(cached.extraction),JSON.stringify(form),JSON.stringify(proposed),form.direction,form.reference,form.party.name,form.party.tax_id,form.invoice_date||null,proposed.totals?.total_amount??null]);
    return {id:saved.insertId,replayed:false};
   });
   previews.set(body.token,{companyId,expires:cached.expires,result});const completed=[...previews].filter(([,value])=>value.result);for(const [token]of completed.slice(0,Math.max(0,completed.length-100)))previews.delete(token);return result;
  },
  async update(documentId,body){
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);const row=await find(db,documentId);if(row.status!=='draft')fail('INVOICE_DOCUMENT_ALREADY_POSTED',409);if(row.version!==body?.version)fail('INVOICE_DOCUMENT_CHANGED',409);
    const data=validateInvoice(body.form);if(data.exercise_id!==row.exercise_id||data.direction!==row.form.direction)fail('INVOICE_DOCUMENT_CONTEXT_MISMATCH');
    const meta=await context(db,row.exercise_id),proposed=buildInvoiceProposal({...meta,extraction:row.extraction,form:data});
    for(const field of ['party_account_id','offset_account_id','vat_account_id','withholding_account_id'])if(data[field]&&!meta.accounts.some(account=>account.id===data[field]&&account.kind==='subaccount'))fail('ACCOUNT_NOT_FOUND',404);
    await db.execute('UPDATE invoice_documents SET form=?,proposal=?,reference=?,party_name=?,party_tax_id=?,invoice_date=?,total_amount=?,version=version+1 WHERE company_id=? AND id=?',[JSON.stringify(proposed.form),JSON.stringify(proposed),data.reference,data.party.name,data.party.tax_id,data.invoice_date,proposed.totals.total_amount,companyId,row.id]);
    return stored(db,row.id);
   });
  },
  async post(documentId,body){
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);const row=await find(db,documentId);if(row.invoice_id)return {id:row.invoice_id,document_id:row.id,replayed:true};
    if(body?.confirm!==true)fail('INVOICE_DOCUMENT_CONFIRM_REQUIRED');if(row.version!==body.version)fail('INVOICE_DOCUMENT_CHANGED',409);
    await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,row.exercise_id]);
    const result=await proposal(db,row),current=result.proposal;if(!current.ready)fail('INVOICE_DOCUMENT_INCOMPLETE');
    if(result.meta.exercise.status!=='open')fail('EXERCISE_CLOSED');
    const form={...validateInvoice(current.form),request_id:'00000000-0000-4000-8000-'+String(row.id).padStart(12,'0')};
    let invoice,status='posted';
    if(current.existing_invoice){
     const saved=result.meta.invoices.find(invoice=>invoice.id===current.existing_invoice.id);
     if(body.action!=='attach'||['invoice_date','posting_date','base_total','tax_total','withholding_total','total_amount'].some(field=>saved[field]!==form[field]))fail('INVOICE_DOCUMENT_EXISTING_INVOICE',409);
     invoice=current.existing_invoice;status='linked';
    }else{
     let existingEntryId;
     if(current.candidates.length){
      if(body.action!=='link'||!current.candidates.some(candidate=>candidate.entry_id===Number(body.entry_id)))fail('INVOICE_DOCUMENT_DUPLICATE_CANDIDATE',409);
      existingEntryId=id(body.entry_id);status='linked';
     }else if(body.action!=='create')fail('INVOICE_DOCUMENT_ENTRY_CHANGED',409);
     invoice=await createInvoiceService(pool,companyId).create(form,{db,existing_entry_id:existingEntryId,accounting_only:true});
    }
    await db.execute('UPDATE invoice_documents SET status=?,invoice_id=?,entry_id=?,proposal=?,version=version+1 WHERE company_id=? AND id=?',[status,invoice.id,invoice.entry_id,JSON.stringify(current),companyId,row.id]);
    return {id:invoice.id,document_id:row.id,replayed:false,linked_existing:status==='linked'};
   });
  },
 };
}
