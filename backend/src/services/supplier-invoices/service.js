import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
import {HttpError} from '../../middleware/errors.js';
import {id} from '../validation.js';
import {withTransaction} from '../../db/transaction.js';
import {lockCompany} from '../subaccounts.js';
import {createInvoiceDocumentService} from '../invoice-documents.js';
import {createIntegrationReceptionService} from '../../integrations/received-invoices.js';
import {normalizeReceivedInvoice} from '../../integrations/invoice-contract.js';
import {parseLocalInvoice} from './local-extraction.js';
import {learnSupplierTemplate,applySupplierTemplate,supplierMatches} from './supplier-templates.js';

const json=value=>typeof value==='string'?JSON.parse(value):value;
const fail=(code,status=400)=>{throw new HttpError(status,code);};
export function readSupplierPdf(buffer){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./pdf-text-worker.js',import.meta.url),{workerData:buffer,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
 let done=false;const timer=setTimeout(()=>finish(new HttpError(400,'INVOICE_PDF_TIMEOUT')),30000);
 function finish(error,result){if(done)return;done=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);}
 worker.once('message',result=>finish(result.error?new HttpError(400,result.error):null,result));worker.once('error',()=>finish(new HttpError(400,'INVOICE_PDF_INVALID')));worker.once('exit',()=>{if(!done)finish(new HttpError(400,'INVOICE_PDF_INVALID'));});
});}
export function supplierPayload(draft,companyId,documentId,sourceId=documentId){
 if(!draft||typeof draft!=='object'||Array.isArray(draft))fail('INVALID_INVOICE');
 return normalizeReceivedInvoice({...draft,description:typeof draft.description==='string'&&draft.description.trim()?draft.description:draft.invoiceNumber,sourceSystem:'comptabilitat',externalId:'document:'+sourceId,companyExternalId:String(companyId),documentExternalId:String(documentId)}).payload;
}
export function checkDraft(draft){
 if(!draft||typeof draft!=='object'||Array.isArray(draft)||Buffer.byteLength(JSON.stringify(draft))>128*1024)fail('INVALID_INVOICE');
 const keys=['supplier','invoiceNumber','invoiceDate','dueDate','currency','description','invoiceType','rectification','taxBreakdown','withholdings','total','lines'];
 if(Object.keys(draft).some(key=>!keys.includes(key)))fail('INVALID_INVOICE');
 if(draft.supplier!==undefined&&(!draft.supplier||typeof draft.supplier!=='object'||Array.isArray(draft.supplier)))fail('INVALID_INVOICE');
 for(const [key,limit] of [['taxBreakdown',40],['withholdings',10],['lines',200]])if(draft[key]!==undefined&&(!Array.isArray(draft[key])||draft[key].length>limit||draft[key].some(row=>!row||typeof row!=='object'||Array.isArray(row))))fail('INVALID_INVOICE');
 for(const key of ['invoiceNumber','invoiceDate','dueDate','currency','description','invoiceType','total'])if(draft[key]!==undefined&&typeof draft[key]!=='string')fail('INVALID_INVOICE');
 return structuredClone(draft);
}
export function createSupplierInvoiceService(pool,companyId,{actor='local',reader=readSupplierPdf}={}){
 const documents=createInvoiceDocumentService(pool,companyId);
 async function find(db,documentId){
  const [[row]]=await db.execute("SELECT d.id,d.exercise_id,d.source_name,d.source_sha256,d.extraction,d.form,d.supplier_draft,d.review_kind,d.reception_id,d.status,d.invoice_id,d.entry_id,d.version,d.validated_by,d.validated_at,CASE WHEN r.status='posted' AND accounted.id IS NULL THEN 'issues' WHEN r.status='posted' AND accounted.status='void' THEN 'cancelled' ELSE r.status END AS reception_status,r.invoice_id AS received_invoice_id,r.entry_id AS received_entry_id FROM invoice_documents d LEFT JOIN integration_received_invoices r ON r.company_id=d.company_id AND r.id=d.reception_id LEFT JOIN trade_invoices accounted ON accounted.company_id=r.company_id AND accounted.id=r.invoice_id WHERE d.company_id=? AND d.id=? AND d.direction='received'",[companyId,id(documentId)]);
  if(!row)fail('INVOICE_DOCUMENT_NOT_FOUND',404);
  row.extraction=json(row.extraction);row.form=json(row.form);row.supplier_draft=json(row.supplier_draft);
  if(!row.supplier_draft){const f=row.form;row.supplier_draft={supplier:{name:f.party?.name||'',taxId:f.party?.tax_id||'',address:f.party?.address||'',email:f.party?.email||''},invoiceNumber:f.reference||'',invoiceDate:f.invoice_date||'',dueDate:f.receipts?.[0]?.due_date||'',currency:row.extraction.currency==='EUR'?'EUR':'',description:'',invoiceType:'standard',taxBreakdown:[],withholdings:[],lines:[],total:row.extraction.total_amount||''};}
  return row;
 }
 async function audit(db,documentId,action,data){await db.execute('INSERT INTO supplier_invoice_revisions(company_id,document_id,actor,action,data) VALUES (?,?,?,?,?)',[companyId,documentId,actor,action,JSON.stringify(data)]);}
 function editable(row,body){if(row.reception_id||row.status!=='draft'||row.invoice_id)fail('SUPPLIER_DOCUMENT_LOCKED',409);if(row.version!==body?.version)fail('INVOICE_DOCUMENT_CHANGED',409);}
 return {
  async list(query={}){
   const kind=query.kind||'invoice';if(!['invoice','not_invoice'].includes(kind))fail('INVALID_INVOICE');
   const search=String(query.search||'');if(search.length>200)fail('INVALID_SEARCH');
   const page=Number(query.page||1);if(!Number.isSafeInteger(page)||page<1||page>100000)fail('INVALID_SEARCH');
   const [rows]=await pool.execute(`SELECT d.id,d.source_name,d.reference,d.party_name,d.party_tax_id,d.invoice_date,d.total_amount,d.status,d.review_kind,d.reception_id,d.invoice_id,d.version,d.validated_by,d.validated_at,CASE WHEN r.status='posted' AND accounted.id IS NULL THEN 'issues' WHEN r.status='posted' AND accounted.status='void' THEN 'cancelled' ELSE r.status END AS reception_status,r.invoice_id AS received_invoice_id FROM invoice_documents d LEFT JOIN integration_received_invoices r ON r.company_id=d.company_id AND r.id=d.reception_id LEFT JOIN trade_invoices accounted ON accounted.company_id=r.company_id AND accounted.id=r.invoice_id WHERE d.company_id=? AND d.direction='received' AND d.review_kind=? AND (LOCATE(?,d.source_name)>0 OR LOCATE(?,d.reference)>0 OR LOCATE(?,d.party_name)>0) ORDER BY d.id DESC LIMIT 50 OFFSET ${(page-1)*50}`,[companyId,kind,search,search,search]);
   return rows;
  },
  async get(documentId){const row=await find(pool,documentId);const [history]=await pool.execute('SELECT actor,action,data,created_at FROM supplier_invoice_revisions WHERE company_id=? AND document_id=? ORDER BY id DESC LIMIT 50',[companyId,row.id]);return {...row,history:history.map(h=>({...h,data:json(h.data)}))};},
  source:documents.source,
  async import(buffer,exerciseId,filename,context={}){
   try{
    if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>10*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-')fail('INVOICE_PDF_INVALID');
    const hash=createHash('sha256').update(buffer).digest('hex');
    const [[existing]]=await pool.execute('SELECT id,exercise_id FROM invoice_documents WHERE company_id=? AND source_sha256=? LIMIT 1',[companyId,hash]);if(existing)return {...existing,replayed:true};
    const reading=await reader(buffer);let result=parseLocalInvoice(reading.text,context);
    const [rows]=await pool.execute('SELECT definition FROM supplier_invoice_templates WHERE company_id=?',[companyId]);
    const templates=rows.map(r=>json(r.definition)).filter(t=>supplierMatches(reading.text,t.supplier));
    if(templates.length===1&&result.classification!=='delivery_note'&&!result.warnings.some(w=>w.startsWith('Hi ha diversos números')))result=applySupplierTemplate(reading.text,templates[0],result);
    if(templates.length>1)result.warnings.push('Diversos proveïdors coneguts al PDF. Revisa la identitat.');
    if(!reading.text)result.warnings.push('PDF sense text. Entrada manual; no s’ha utilitzat OCR ni IA.');
    else if(reading.partial)result.warnings.push('Hi ha pàgines amb poc text. Revisa el PDF complet.');
    const extraction={parser:'local-rules-v1',pages:reading.pages,supplier:{name:'',tax_id:'',address:''},customer:{name:'',tax_id:'',address:''},lines:[],warnings:result.warnings,currency:result.draft.currency||'unknown',...result,text:reading.text};
    // Do not force uncertain dates or identities into the legacy posting proposal.
    return await withTransaction(pool,async db=>{
     const saved=await documents.importStored(buffer,extraction,exerciseId,String(filename||'factura.pdf').split(/[\\/]/).at(-1).replace(/[\x00-\x1f]/g,'').slice(0,255),{db});
     if(!saved.replayed){await db.execute('UPDATE invoice_documents SET supplier_draft=?,reference=?,party_name=?,party_tax_id=? WHERE company_id=? AND id=?',[JSON.stringify(result.draft),result.draft.invoiceNumber||'',result.draft.supplier.name||'',result.draft.supplier.taxId||'',companyId,saved.id]);await audit(db,saved.id,'imported',{source:context.source||'manual',sha256:hash});}
     return saved;
    });
   }catch(error){await pool.execute('INSERT INTO supplier_invoice_import_errors(company_id,source_id,error_code) VALUES (?,?,?)',[companyId,String(filename||'manual').slice(0,255),error.code||'IMPORT_FAILED']);throw error;}
  },
  async classify(documentId,body){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await find(db,documentId);editable(row,body);
   if(!['invoice','not_invoice'].includes(body.kind))fail('INVALID_INVOICE');
   await db.execute('UPDATE invoice_documents SET review_kind=?,supplier_draft=COALESCE(supplier_draft,?),version=version+1 WHERE company_id=? AND id=?',[body.kind,JSON.stringify(row.supplier_draft),companyId,row.id]);await audit(db,row.id,'classified',{kind:body.kind});return find(db,row.id);
  });},
  async save(documentId,body){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await find(db,documentId);editable(row,body);const draft=checkDraft(body.draft);
   let templateWarning=null,template;
   if(body.rememberSupplier===true)try{template=learnSupplierTemplate(row.extraction.text||'',draft);}catch{templateWarning='Completa les dades i identifica els camps al PDF per recordar el format.';}
   await db.execute('UPDATE invoice_documents SET supplier_draft=?,reference=?,party_name=?,party_tax_id=?,version=version+1 WHERE company_id=? AND id=?',[JSON.stringify(draft),typeof draft.invoiceNumber==='string'?draft.invoiceNumber.slice(0,60):'',typeof draft.supplier?.name==='string'?draft.supplier.name.slice(0,200):'',typeof draft.supplier?.taxId==='string'?draft.supplier.taxId.slice(0,32):'',companyId,row.id]);
   if(template){await db.execute('INSERT INTO supplier_invoice_templates(company_id,tax_id,definition,updated_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE definition=VALUES(definition),updated_by=VALUES(updated_by)',[companyId,template.supplier.taxId.toUpperCase().replace(/[^A-Z0-9]/g,''),JSON.stringify(template),actor]);await audit(db,row.id,'format_remembered',{fields:template.fields});}
   await audit(db,row.id,'draft_saved',{draft});return {...await find(db,row.id),templateWarning};
  });},
  async validate(documentId,body){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await find(db,documentId);
   if(row.reception_id)return {id:row.reception_id,replayed:true};
   editable(row,body);if(row.review_kind!=='invoice')fail('SUPPLIER_NOT_INVOICE');
   const payload=supplierPayload(row.supplier_draft,companyId,row.id,row.source_sha256);
   const receipt=await createIntegrationReceptionService(pool).receiveInternal(companyId,payload,db);
   await db.execute('UPDATE invoice_documents SET reception_id=?,validated_by=?,validated_at=UTC_TIMESTAMP(),version=version+1 WHERE company_id=? AND id=?',[receipt.id,actor,companyId,row.id]);
   await audit(db,row.id,'validated',{reception_id:receipt.id,payload});return receipt;
  });},
  async errors(){const [rows]=await pool.execute('SELECT id,mailbox_id,source_id,error_code,created_at FROM supplier_invoice_import_errors WHERE company_id=? ORDER BY id DESC LIMIT 100',[companyId]);return rows;},
 };
}
