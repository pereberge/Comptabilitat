import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { id,fail } from './validation.js';
import { requestId,hash } from './invoice-validation.js';
import { lockCompany } from './subaccounts.js';
import { withTransaction } from '../db/transaction.js';
import {isDocumentFolder} from '../../../shared/document-folders.js';
import {readDocumentInvoice} from './document-invoice-data.js';
import {createInvoiceDocumentService} from './invoice-documents.js';
import {createDocumentCompanyChecker} from './document-company.js';

const fields='id,company_id,title,description,folder,invoice_extraction,source_name,source_mime,source_sha256,source_size,version,created_at,updated_at';
function folder(value,fallback='general'){const selected=value===undefined?fallback:value;if(!isDocumentFolder(selected))fail('DOCUMENTATION_INVALID_FOLDER');return selected;}
function metadata(body){
 if(!body||typeof body.title!=='string'||!body.title.trim()||body.title.trim().length>200||typeof body.description!=='string'||body.description.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.title+body.description))fail('DOCUMENTATION_INVALID_METADATA');
 return {title:body.title.trim(),description:body.description.trim()};
}
function encodedBuffer(body){
 const content=body?.content_base64;
 if(typeof content!=='string'||!content.length||content.length>13981016||content.length%4!==0||/[^A-Za-z0-9+/=]/.test(content))fail('DOCUMENTATION_INVALID_FILE');
 const buffer=Buffer.from(content,'base64');if(buffer.toString('base64')!==content||buffer.length>10*1024*1024)fail('DOCUMENTATION_INVALID_FILE');return buffer;
}
export function createDocumentationService(pool,companyId,options={}){
 const checker=createDocumentCompanyChecker(pool,companyId,options);
 const table=async(target,name)=>options.companyDatabases?options.companyDatabases.table(target,name):name;
 async function find(db,documentId,source=false,target=companyId){const [[row]]=await db.execute('SELECT '+fields+(source?',content':'')+' FROM '+await table(target,'company_documents')+' WHERE company_id=? AND id=?',[target,id(documentId)]);if(!row)throw new HttpError(404,'DOCUMENTATION_NOT_FOUND');return row;}
 const targetId=body=>{const target=body?.target_company_id==null?companyId:id(body.target_company_id);checker.allow(target);return target;};
 async function lockBoth(db,target){for(const value of [...new Set([companyId,target])].sort((a,b)=>a-b)){
  if(options.companyDatabases){const [[row]]=await db.execute('SELECT id FROM '+await table(value,'companies')+' WHERE id=? FOR UPDATE',[value]);if(!row)throw new HttpError(404,'COMPANY_NOT_FOUND');}
  else await lockCompany(db,value);
 }}
 async function described(row,db=pool,visible){if(row.folder!=='pending_invoices')return row;return {...row,company_check:checker.assess(row.invoice_extraction,row.source_sha256,visible||await checker.companies(db))};}
 function routed(row,visible,target,replayed=false){return {...row,destination_company:visible.find(item=>item.id===target),reassigned:target!==companyId,replayed};}
 async function duplicate(db,target,sha,except=0){const [[row]]=await db.execute('SELECT id FROM '+await table(target,'company_documents')+' WHERE company_id=? AND source_sha256=? AND id<>? LIMIT 1',[target,sha,except]);if(row)throw new HttpError(409,'DOCUMENTATION_COMPANY_DUPLICATE');}
 async function movedReplay(db,documentId,body,data,target){
  const row=await find(db,documentId,false,target),selected=folder(body.folder,'pending_invoices');
  if(row.version!==body.version+1||row.title!==data.title||row.description!==data.description||row.folder!==selected)throw new HttpError(409,'DOCUMENTATION_CHANGED');
  return routed(row,await checker.companies(db),target,true);
 }
 return {
  async list(query={}){
   const search=typeof query.search==='string'?query.search.trim():'';if(search.length>200)fail('INVALID_SEARCH');
   const selected=query.folder===undefined?null:folder(query.folder);
   const pattern='%'+search.replace(/[!%_]/g,value=>'!'+value)+'%';
   const [rows]=await pool.execute('SELECT '+fields+' FROM company_documents WHERE company_id=?'+(selected?' AND folder=?':'')+(search?" AND (title COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR description COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!' OR source_name COLLATE utf8mb4_0900_ai_ci LIKE ? ESCAPE '!')":'')+' ORDER BY updated_at DESC,id DESC',[companyId,...(selected?[selected]:[]),...(search?[pattern,pattern,pattern]:[])]);
   const visible=rows.some(row=>row.folder==='pending_invoices')?await checker.companies():[];return Promise.all(rows.map(row=>described(row,pool,visible)));
  },
  get:async documentId=>described(await find(pool,documentId)),
  source:documentId=>find(pool,documentId,true),
  previewEncoded:body=>checker.preview(encodedBuffer(body)),
  async checkCompany(documentId,body){const row=await find(pool,documentId,true);if(body?.version!==row.version)throw new HttpError(409,'DOCUMENTATION_CHANGED');return checker.preview(row.content,row.invoice_extraction);},
  async uploadEncoded(body){
   return this.upload(encodedBuffer(body),body);
  },
  async upload(buffer,body){
   const data=metadata(body),selected=folder(body.folder),request=requestId(body.request_id);
   if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>10*1024*1024)fail('DOCUMENTATION_INVALID_FILE');
   if(typeof body.source_name!=='string')fail('DOCUMENTATION_INVALID_FILE');
   const name=body.source_name.split(/[\\/]/).at(-1).replace(/[\u0000-\u001f\u007f]/g,'').trim();if(!name||name.length>255)fail('DOCUMENTATION_INVALID_FILE');
   // Originals remain unchanged; pending PDFs are read only to suggest invoice data.
   const mime=typeof body.source_mime==='string'&&/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(body.source_mime)&&body.source_mime.length<=100?body.source_mime:'application/octet-stream';
   const sha=createHash('sha256').update(buffer).digest('hex'),digest=hash({...data,name,mime,sha,...(selected==='general'?{}:{folder:selected})});
   const target=targetId(body);
   if(target!==companyId&&selected!=='pending_invoices')fail('DOCUMENTATION_ROUTING_PENDING_ONLY');
   const extraction=selected==='pending_invoices'?(await checker.read(buffer,body.company_preview_token)).extraction:null;
   return withTransaction(pool,async db=>{
    await lockBoth(db,target);
    const visible=await checker.companies(db),requestHash=target===companyId?digest:hash({digest,source_company_id:companyId,target_company_id:target});
    const [[replay]]=await db.execute('SELECT id,request_hash FROM '+await table(target,'company_documents')+' WHERE company_id=? AND request_id=?',[target,request]);
    if(replay){if(replay.request_hash!==requestHash)throw new HttpError(409,'REQUEST_CONFLICT');return routed(await find(db,replay.id,false,target),visible,target,true);}
    if(selected==='pending_invoices')checker.destination(body,checker.assess(extraction,sha,visible));
    if(target!==companyId)await duplicate(db,target,sha);
    const [saved]=await db.execute('INSERT INTO '+await table(target,'company_documents')+'(company_id,title,description,folder,invoice_extraction,source_name,source_mime,source_sha256,source_size,content,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[target,data.title,data.description,selected,extraction?JSON.stringify(extraction):null,name,mime,sha,buffer.length,buffer,request,requestHash]);
    return routed(await find(db,saved.insertId,false,target),visible,target);
   });
  },
  async update(documentId,body){
   const data=metadata(body),target=targetId(body);let original;
   try{original=await find(pool,documentId,true);}catch(cause){if(cause.code==='DOCUMENTATION_NOT_FOUND'&&target!==companyId)return movedReplay(pool,documentId,body,data,target);throw cause;}
   const selected=folder(body.folder,original.folder);
   if(target!==companyId&&selected!=='pending_invoices')fail('DOCUMENTATION_ROUTING_PENDING_ONLY');
   const extraction=selected==='pending_invoices'?(await checker.read(original.content,body.company_preview_token,original.invoice_extraction)).extraction:null;
   return withTransaction(pool,async db=>{
    await lockBoth(db,target);let row;
    try{row=await find(db,documentId);}catch(cause){if(cause.code==='DOCUMENTATION_NOT_FOUND'&&target!==companyId)return movedReplay(db,documentId,body,data,target);throw cause;}
    if(row.version!==body.version)throw new HttpError(409,'DOCUMENTATION_CHANGED');
    const visible=await checker.companies(db);
    if(selected==='pending_invoices')checker.destination(body,checker.assess(extraction,row.source_sha256,visible));
    if(target!==companyId){
     const [[linked]]=await db.execute('SELECT id FROM invoice_documents WHERE company_id=? AND source_sha256=? LIMIT 1',[companyId,row.source_sha256]);
     if(linked)throw new HttpError(409,'DOCUMENTATION_COMPANY_LINKED');
     await duplicate(db,target,row.source_sha256,row.id);
    }
    if(options.companyDatabases&&target!==companyId){
     const columns='id,company_id,title,description,folder,invoice_extraction,source_name,source_mime,source_sha256,source_size,content,request_id,request_hash,version,created_at,updated_at';
     const selection=columns.split(',').map(column=>column==='company_id'?'?':column).join(',');
     await db.execute('INSERT INTO '+await table(target,'company_documents')+' ('+columns+') SELECT '+selection+' FROM '+await table(companyId,'company_documents')+' WHERE company_id=? AND id=?',[target,companyId,row.id]);
     await db.execute('DELETE FROM '+await table(companyId,'company_documents')+' WHERE company_id=? AND id=?',[companyId,row.id]);
    }
    await db.execute('UPDATE '+await table(target,'company_documents')+' SET company_id=?,title=?,description=?,folder=?,invoice_extraction=COALESCE(?,invoice_extraction),version=version+1 WHERE company_id=? AND id=?',[target,data.title,data.description,selected,extraction?JSON.stringify(extraction):null,options.companyDatabases?target:companyId,row.id]);
    return routed(await find(db,row.id,false,target),visible,target);
   });
  },
  async manage(documentId,body){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await find(db,documentId);
   if(row.version!==body?.version)throw new HttpError(409,'DOCUMENTATION_CHANGED');
   if(typeof body.managed!=='boolean'||row.folder==='general')fail('DOCUMENTATION_INVALID_FOLDER');
   const selected=body.managed?'managed_invoices':'pending_invoices';
   if(row.folder!==selected)await db.execute('UPDATE company_documents SET folder=?,version=version+1 WHERE company_id=? AND id=?',[selected,companyId,row.id]);
   return find(db,row.id);
  });},
  async toInvoices(documentId,body){
   const original=await find(pool,documentId,true);
   if(original.folder==='general')fail('DOCUMENTATION_INVALID_FOLDER');
   if(original.content.subarray(0,5).toString()!=='%PDF-')fail('DOCUMENTATION_INVOICE_PDF_REQUIRED');
   const extraction=(typeof original.invoice_extraction==='string'?JSON.parse(original.invoice_extraction):original.invoice_extraction)||await readDocumentInvoice(original.content);
   if(!extraction||extraction.error)fail(extraction?.error||'INVOICE_PDF_INVALID');
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);const row=await find(db,documentId);
    if(row.folder==='general')fail('DOCUMENTATION_INVALID_FOLDER');
    const [[existing]]=await db.execute('SELECT id,exercise_id FROM invoice_documents WHERE company_id=? AND source_sha256=? ORDER BY id LIMIT 1',[companyId,row.source_sha256]);
    if(row.folder==='managed_invoices'&&existing)return {...existing,replayed:true};
    if(row.version!==body?.version)throw new HttpError(409,'DOCUMENTATION_CHANGED');
    const saved=await createInvoiceDocumentService(pool,companyId).importStored(original.content,extraction,body.exercise_id,original.source_name,{db});
    await db.execute("UPDATE company_documents SET folder='managed_invoices',invoice_extraction=?,version=version+1 WHERE company_id=? AND id=?",[JSON.stringify(extraction),companyId,row.id]);
    return saved;
   });
  },
  async remove(documentId,body){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await find(db,documentId);if(row.version!==body?.version)throw new HttpError(409,'DOCUMENTATION_CHANGED');
   await db.execute('DELETE FROM company_documents WHERE company_id=? AND id=?',[companyId,row.id]);return {id:row.id,deleted:true};
  });},
 };
}
