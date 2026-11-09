import {createHash,randomUUID} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {requestId} from './invoice-validation.js';
import {createDocumentationService} from './documentation.js';
import {createPurchaseService} from './purchases.js';
import {purchaseDocumentMime,readPurchaseDocument} from './purchase-document-reader.js';
const active=new Set();const normalize=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function createPurchaseOcrService(pool,companyId,actor='local'){
 async function reuse(target,forceOcr){
  if(forceOcr){
   const [[prior]]=await pool.execute('SELECT engine,status FROM document_extraction_jobs WHERE company_id=? AND id=?',[companyId,target]);
   if(prior&&prior.engine!=='tesseract-local'&&prior.engine!=='tesseract-requested'){
    const [queued]=await pool.execute("UPDATE document_extraction_jobs j SET status='queued',engine='tesseract-requested',error_code=NULL,finished_at=NULL,created_at=NOW() WHERE company_id=? AND id=? AND status IN ('done','error') AND (purchase_invoice_id IS NULL OR EXISTS (SELECT 1 FROM purchase_invoices d WHERE d.company_id=j.company_id AND d.id=j.purchase_invoice_id AND d.status='draft'))",[companyId,target]);
    if(!queued.affectedRows)throw new HttpError(409,['queued','running'].includes(prior.status)?'PURCHASE_OCR_PENDING':'PURCHASE_NOT_DRAFT');
   }
  }
  return service.get(target);
 }
 const service={
  async start(buffer,filename,key,{forceOcr=false}={}){
   requestId(key);const mime=purchaseDocumentMime(buffer),sha=createHash('sha256').update(buffer).digest('hex');
   const [[prior]]=await pool.execute('SELECT id,source_sha256 FROM document_extraction_jobs WHERE company_id=? AND request_id=?',[companyId,key]);
   if(prior){if(prior.source_sha256!==sha)throw new HttpError(409,'REQUEST_CONFLICT');return reuse(prior.id,forceOcr);}
   const [[duplicate]]=await pool.execute('SELECT id FROM document_extraction_jobs WHERE company_id=? AND source_sha256=? ORDER BY id DESC LIMIT 1',[companyId,sha]);if(duplicate)return {...await reuse(duplicate.id,forceOcr),possible_duplicate:true};
   const source=await createDocumentationService(pool,companyId).upload(buffer,{title:String(filename).slice(0,200),description:'Original de compres pendent de revisar',folder:'general',auto_detect:false,source_name:filename,source_mime:mime,request_id:key});
   const [row]=await pool.execute("INSERT INTO document_extraction_jobs(company_id,original_document_id,created_by,request_id,source_sha256,engine) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",[companyId,source.id,actor,key,sha,forceOcr?'tesseract-requested':null]);
   void service.process(row.insertId);return service.get(row.insertId);
  },
  async get(target){
   const [[row]]=await pool.execute('SELECT j.*,s.source_name,s.source_mime FROM document_extraction_jobs j JOIN company_documents s ON s.company_id=j.company_id AND s.id=j.original_document_id WHERE j.company_id=? AND j.id=?',[companyId,id(target)]);
   if(!row)throw new HttpError(404,'PURCHASE_NOT_FOUND');if(row.status==='queued'||row.status==='running'&&Date.now()-new Date(row.created_at).getTime()>300000)void service.process(row.id);
   return {...row,result:row.result?parse(row.result):null};
  },
  async retry(target){await service.get(target);await pool.execute("UPDATE document_extraction_jobs SET status='queued',error_code=NULL,finished_at=NULL,created_at=NOW() WHERE company_id=? AND id=? AND status='error'",[companyId,id(target)]);void service.process(Number(target));return service.get(target);},
  async process(target){
   const key=companyId+':'+target;if(active.size>=1||active.has(key))return;active.add(key);
   try{
    const [claimed]=await pool.execute("UPDATE document_extraction_jobs SET status='running',error_code=NULL WHERE company_id=? AND id=? AND (status='queued' OR (status='running' AND created_at<DATE_SUB(NOW(),INTERVAL 5 MINUTE)))",[companyId,id(target)]);if(!claimed.affectedRows)return;
    const [[job]]=await pool.execute('SELECT j.*,s.content FROM document_extraction_jobs j JOIN company_documents s ON s.company_id=j.company_id AND s.id=j.original_document_id WHERE j.company_id=? AND j.id=?',[companyId,target]);
    const result=await readPurchaseDocument(job.content,{forceOcr:job.engine==='tesseract-requested'}),purchases=createPurchaseService(pool,companyId,job.created_by),catalog=await purchases.catalog();
    let vendors=catalog.suppliers.filter(row=>normalize(parse(row.party_profile)?.tax_id)&&normalize(parse(row.party_profile)?.tax_id)===normalize(result.supplier?.tax_id));
    if(!vendors.length&&result.supplier?.name)vendors=catalog.suppliers.filter(row=>normalize(parse(row.party_profile)?.name||row.description)===normalize(result.supplier.name));
    const vendor=vendors.length===1?vendors[0]:null;
    const raw=result.commercial_lines.length?result.commercial_lines:result.lines?.length?result.lines.map(line=>({description:line.description,quantity:'1',unit_price:line.base,discount_rate:'0',tax_rate:line.tax_rate,summary_only:true})):[{description:'Pendent de completar amb el document',quantity:'1',unit_price:null,tax_rate:'0'}];
    const lines=[];
    for(const line of raw){
     let match=null;
     if(vendor&&line.supplier_code){const [[known]]=await pool.execute('SELECT item_id FROM purchase_supplier_items WHERE company_id=? AND supplier_account_id=? AND supplier_code=?',[companyId,vendor.id,line.supplier_code]);match=known?catalog.items.find(item=>item.id===known.item_id):null;}
     if(!match){const candidates=catalog.items.filter(item=>normalize(item.code)===normalize(line.supplier_code)||normalize(item.description)===normalize(line.description));if(candidates.length===1)match=candidates[0];}
     lines.push({...line,item_id:match?.id||null,links:[]});
    }
    // One deterministic request per extraction: a retry cannot create a second draft.
    const digest=createHash('sha256').update('ocr-draft:'+companyId+':'+job.request_id).digest('hex'),draftKey=[digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-');
    const [[existingDraft]]=await pool.execute('SELECT id FROM purchase_invoices WHERE company_id=? AND original_document_id=? ORDER BY id LIMIT 1',[companyId,job.original_document_id]);
    const draft=existingDraft||await purchases.save('invoices',null,{supplier_account_id:vendor?.id||null,reference:result.reference||'',document_date:result.invoice_date||null,due_date:result.due_date||null,original_document_id:job.original_document_id,notes:'Dades reconegudes pendents de revisió. '+(result.warnings||[]).join(' ').slice(0,800),lines,request_id:draftKey});
    const [updated]=await pool.execute("UPDATE purchase_invoices SET extraction=? WHERE company_id=? AND id=? AND status='draft'",[JSON.stringify(result),companyId,draft.id]);if(!updated.affectedRows)throw new HttpError(409,'PURCHASE_NOT_DRAFT');
    await pool.execute("UPDATE document_extraction_jobs SET status='done',purchase_invoice_id=?,engine=?,confidence=?,recognized_text=?,result=?,finished_at=NOW() WHERE company_id=? AND id=?",[draft.id,result.engine,result.confidence===null?null:result.confidence.toFixed(2),result.recognized_text,JSON.stringify(result),companyId,target]);
   }catch(error){console.error('Purchase recognition failed:',error.code||error.name, error.stack?.split('\n').slice(1).join('\n'));await pool.execute("UPDATE document_extraction_jobs SET status='error',error_code=?,finished_at=NOW() WHERE company_id=? AND id=?",[error.code||'PURCHASE_OCR_FAILED',companyId,target]).catch(()=>{});}
   finally{active.delete(key);}
  },
 };
 return service;
}
