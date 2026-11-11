import {createHash,randomUUID} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {requestId} from './invoice-validation.js';
import {createDocumentationService} from './documentation.js';
import {createPurchaseService} from './purchases.js';
import {purchaseDocumentMime,readPurchaseDocument} from './purchase-document-reader.js';
import {findPartyAccount} from './party-identification.js';
const active=new Set();const normalize=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const uuid=seed=>{const digest=createHash('sha256').update(seed).digest('hex');return [digest.slice(0,8),digest.slice(8,12),digest.slice(12,16),digest.slice(16,20),digest.slice(20,32)].join('-');};
export const purchaseOcrLockName=(companyId,target)=>'contabilitat:purchase-ocr:'+id(companyId)+':'+id(target);
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
   if(!row)throw new HttpError(404,'PURCHASE_NOT_FOUND');if(['queued','running'].includes(row.status))void service.process(row.id);
   return {...row,result:row.result?parse(row.result):null};
  },
  async retry(target){await service.get(target);await pool.execute("UPDATE document_extraction_jobs SET status='queued',error_code=NULL,finished_at=NULL,created_at=NOW() WHERE company_id=? AND id=? AND status='error'",[companyId,id(target)]);void service.process(Number(target));return service.get(target);},
  async process(target){
   const key=companyId+':'+target;if(active.size>=1||active.has(key))return;active.add(key);
   let owner,locked=false,claimed=false;const lockName=purchaseOcrLockName(companyId,target);
   try{
    // A session lock survives all awaited OCR work and is released by MySQL if
    // Node restarts. A running row can then be reclaimed without an age guess.
    owner=await pool.getConnection();const [[lock]]=await owner.execute('SELECT GET_LOCK(?,0) AS acquired',[lockName]);if(lock.acquired!==1)return;locked=true;
    const [updatedJob]=await owner.execute("UPDATE document_extraction_jobs SET status='running',error_code=NULL,finished_at=NULL,created_at=NOW() WHERE company_id=? AND id=? AND status IN ('queued','running')",[companyId,id(target)]);if(!updatedJob.affectedRows)return;claimed=true;
    const [[job]]=await owner.execute('SELECT j.*,s.content FROM document_extraction_jobs j JOIN company_documents s ON s.company_id=j.company_id AND s.id=j.original_document_id WHERE j.company_id=? AND j.id=?',[companyId,target]);
    const result=await readPurchaseDocument(job.content,{forceOcr:job.engine==='tesseract-requested'}),purchases=createPurchaseService(pool,companyId,job.created_by),catalog=await purchases.catalog();
    const [[ownership]]=await owner.execute('SELECT IS_USED_LOCK(?)=CONNECTION_ID() AS owned',[lockName]);if(ownership.owned!==1)return;
    if(result.multiple_invoices&&!result.invoices?.length)throw new HttpError(400,'PURCHASE_MULTIPLE_INVOICES');
    const documents=result.invoices?.length?result.invoices:[result],proposals=[];
    const [existing]=await pool.execute('SELECT id,request_id,extraction FROM purchase_invoices WHERE company_id=? AND original_document_id=? ORDER BY id',[companyId,job.original_document_id]);
    for(const [index,part] of documents.entries()){
    const extracted={...part,engine:result.engine,confidence:result.confidence,field_source:result.field_source,source_segment:index,source_request_id:job.request_id};
    let vendors=catalog.suppliers.filter(row=>normalize(parse(row.party_profile)?.tax_id).replace(/^ES/,'')&&normalize(parse(row.party_profile)?.tax_id).replace(/^ES/,'')===normalize(extracted.supplier?.tax_id).replace(/^ES/,''));
    let ambiguous=vendors.length>1;
    if(!vendors.length&&extracted.supplier?.tax_id){const known=await findPartyAccount(pool,companyId,'received',extracted.supplier.tax_id,extracted.supplier.name);ambiguous=known.ambiguous;if(known.accountId)vendors=catalog.suppliers.filter(row=>row.id===known.accountId);}
    if(!vendors.length&&!ambiguous&&extracted.supplier?.name)vendors=catalog.suppliers.filter(row=>normalize(parse(row.party_profile)?.name||row.description)===normalize(extracted.supplier.name));
    const vendor=vendors.length===1?vendors[0]:null;
    const raw=extracted.commercial_lines.length?extracted.commercial_lines:extracted.lines?.length?extracted.lines.map(line=>({description:line.description,quantity:'1',unit_price:line.base,discount_rate:'0',tax_rate:line.tax_rate,summary_only:true})):[{description:'Pendent de completar amb el document',quantity:'1',unit_price:null,tax_rate:'0'}];
    const lines=[];
    for(const line of raw){
     let match=null;
     if(vendor&&line.supplier_code){const [[known]]=await pool.execute('SELECT item_id FROM purchase_supplier_items WHERE company_id=? AND supplier_account_id=? AND supplier_code=?',[companyId,vendor.id,line.supplier_code]);match=known?catalog.items.find(item=>item.id===known.item_id):null;}
     if(!match){const candidates=catalog.items.filter(item=>normalize(item.code)===normalize(line.supplier_code)||normalize(item.description)===normalize(line.item_description||line.description));if(candidates.length===1)match=candidates[0];}
     lines.push({...line,item_id:match?.id||null,links:[]});
    }
    // Keep the original key for the first invoice; later segments have their
    // own stable key, so recovery cannot create another copy of either draft.
    const draftKey=uuid('ocr-draft:'+companyId+':'+job.request_id+(index?':invoice:'+index:''));
    const prior=existing.find(row=>row.request_id===draftKey||(parse(row.extraction)?.source_request_id===job.request_id&&parse(row.extraction)?.source_segment===index))||(!index&&existing.length===1&&parse(existing[0].extraction)?.source_segment==null?existing[0]:null);
    const body={supplier_account_id:vendor?.id||null,reference:extracted.reference||'',document_date:extracted.invoice_date||null,due_date:extracted.due_date||null,original_document_id:job.original_document_id,notes:'Dades reconegudes pendents de revisió. '+(extracted.warnings||[]).join(' ').slice(0,800),lines,request_id:draftKey};
    let draft=prior?await purchases.get('invoices',prior.id):await purchases.save('invoices',null,body);
    if(prior&&(!draft.reference||draft.reference===extracted.reference)&&(!draft.document_date||draft.document_date===extracted.invoice_date)&&draft.lines.length===1&&draft.lines[0].unit_price===null&&!draft.lines[0].item_id&&draft.lines[0].quantity==='1.000000'&&draft.lines[0].tax_rate==='0.00'&&draft.lines[0].discount_rate==='0.00000'&&draft.lines[0].description==='Pendent de completar amb el document'&&extracted.reference){
     draft=await purchases.save('invoices',draft.id,{...body,supplier_account_id:draft.supplier_account_id||body.supplier_account_id,reference:draft.reference||body.reference,document_date:draft.document_date||body.document_date,due_date:draft.due_date||body.due_date,notes:draft.notes&&!draft.notes.startsWith('Dades reconegudes pendents de revisió.')?draft.notes:body.notes,version:draft.version,request_id:uuid('ocr-fill:'+companyId+':'+job.request_id+':'+index)});
    }
    const [updated]=await pool.execute("UPDATE purchase_invoices SET extraction=? WHERE company_id=? AND id=? AND status='draft'",[JSON.stringify(extracted),companyId,draft.id]);if(!updated.affectedRows)throw new HttpError(409,'PURCHASE_NOT_DRAFT');
    proposals.push({id:draft.id,reference:draft.reference||extracted.reference,source_pages:extracted.source_pages||[]});
    }
    const completed={...result,proposals};
    await owner.execute("UPDATE document_extraction_jobs SET status='done',purchase_invoice_id=?,engine=?,confidence=?,recognized_text=?,result=?,finished_at=NOW() WHERE company_id=? AND id=?",[proposals[0].id,result.engine,result.confidence===null?null:result.confidence.toFixed(2),result.recognized_text,JSON.stringify(completed),companyId,target]);
   }catch(error){console.error('Purchase recognition failed:',error.code||error.name, error.stack?.split('\n').slice(1).join('\n'));if(claimed&&locked)await owner.execute("UPDATE document_extraction_jobs SET status='error',error_code=?,finished_at=NOW() WHERE company_id=? AND id=?",[error.code||'PURCHASE_OCR_FAILED',companyId,target]).catch(()=>{});}
   finally{if(owner){if(locked)await owner.execute('SELECT RELEASE_LOCK(?)',[lockName]).catch(()=>{});owner.release();}active.delete(key);}
  },
 };
 return service;
}
