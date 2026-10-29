import {createHash,randomUUID} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {invoiceIdentity} from './invoice-pdf.js';
import {readDocumentInvoice} from './document-invoice-data.js';
const cache=new Map(),lifetime=15*60*1000;let activeReads=0;
const json=value=>typeof value==='string'?JSON.parse(value):value;
export function invoiceTaxIdentity(value){const normalized=invoiceIdentity(value);return /^ES[A-Z0-9]{9}$/.test(normalized)?normalized.slice(2):normalized;}
export function invoiceCompanyMatches(party,company){
 const tax=invoiceTaxIdentity(party?.tax_id),ownTax=invoiceTaxIdentity(company.tax_id);
 if(tax&&ownTax)return tax===ownTax?'tax_id':null;
 const name=invoiceIdentity(party?.name);
 return name&&[company.name,company.trade_name,company.journal_source_name].some(value=>value&&invoiceIdentity(value)===name)?'name':null;
}
export function assessInvoiceCompany(extraction,companies,companyId){
 const current=companies.find(row=>row.id===companyId),publicCompany=row=>({id:row.id,name:row.name,tax_id:row.tax_id||''});
 if(!current)throw new HttpError(404,'COMPANY_NOT_FOUND');
 const base={current_company:publicCompany(current),matches:[],suggested_company_id:companyId,parties:{supplier:{name:extraction?.supplier?.name||'',tax_id:extraction?.supplier?.tax_id||''},customer:{name:extraction?.customer?.name||'',tax_id:extraction?.customer?.tax_id||''}}};
 if(!extraction||extraction.error||extraction.multiple_invoices)return {...base,status:'unknown',reason:extraction?.multiple_invoices?'multiple_invoices':extraction?.error?'unreadable':'no_identity'};
 const rawTaxes=new Set((extraction.company_tax_ids||[]).map(invoiceTaxIdentity));
 const matches=[];
 for(const company of companies){
  const roles=['customer','supplier'].map(role=>({role,basis:invoiceCompanyMatches(extraction[role],company)})).filter(row=>row.basis);
  if(!roles.length&&company.tax_id&&rawTaxes.has(invoiceTaxIdentity(company.tax_id)))roles.push({role:'unclassified',basis:'tax_id'});
  if(roles.length)matches.push({...publicCompany(company),roles});
 }
 const currentMatch=matches.find(row=>row.id===companyId),identified=party=>!!(party?.tax_id||party?.name);
 const conflictingTax=currentMatch?.roles.some(role=>role.basis==='name'&&matches.some(row=>row.id!==companyId&&row.roles.some(other=>other.role===role.role&&other.basis==='tax_id')));
 const status=currentMatch&&!conflictingTax?'current':matches.length===1?'other':matches.length>1?'ambiguous':identified(extraction.customer)&&identified(extraction.supplier)?'mismatch':'unknown';
 return {...base,matches,status,suggested_company_id:status==='other'?matches[0].id:status==='ambiguous'?null:companyId,reason:status==='unknown'?'no_identity':null};
}
export function createDocumentCompanyChecker(pool,companyId,{companyIds=[companyId],actorKey=''}={}){
 const allowed=companyIds===null?null:[...new Set([...companyIds.map(id),companyId])];
 function allow(target){if(allowed&&!allowed.includes(target))throw new HttpError(403,'ACCESS_COMPANY_DENIED');}
 async function companies(db=pool){const [rows]=await db.execute('SELECT c.id,c.name,d.tax_id,d.trade_name,d.journal_source_name FROM companies c LEFT JOIN company_details d ON d.company_id=c.id'+(allowed?' WHERE c.id IN ('+allowed.map(()=>'?').join(',')+')':'')+' ORDER BY c.id',allowed||[]);return rows;}
 function assess(extraction,sourceHash,visible){const result=assessInvoiceCompany(json(extraction),visible,companyId);return {...result,preview_hash:createHash('sha256').update(JSON.stringify({sourceHash,result})).digest('hex')};}
 async function read(buffer,token,stored){
  const sourceHash=createHash('sha256').update(buffer).digest('hex'),cached=cache.get(token);
  if(cached&&cached.companyId===companyId&&cached.actorKey===actorKey&&cached.sourceHash===sourceHash&&cached.expires>Date.now())return {extraction:cached.extraction,sourceHash};
  const previous=json(stored);if(previous&&!previous.error)return {extraction:previous,sourceHash};
  if(activeReads>=3)throw new HttpError(429,'DOCUMENTATION_COMPANY_BUSY');activeReads++;
  try{return {extraction:await readDocumentInvoice(buffer),sourceHash};}finally{activeReads--;}
 }
 return {allow,companies,assess,read,
  async preview(buffer,stored){
   const {extraction,sourceHash}=await read(buffer,null,stored),result=assess(extraction,sourceHash,await companies());
   for(const [key,value]of cache)if(value.expires<Date.now())cache.delete(key);
   const token=randomUUID();cache.set(token,{companyId,actorKey,sourceHash,extraction,expires:Date.now()+lifetime});while(cache.size>100)cache.delete(cache.keys().next().value);
   return {...result,token};
  },
  destination(body,check){
   const target=body.target_company_id==null?companyId:id(body.target_company_id);allow(target);
   const proof=body.company_preview_hash===check.preview_hash;
   if(body.company_preview_hash!==undefined&&!proof)throw new HttpError(409,'DOCUMENTATION_COMPANY_CHANGED');
   if(target!==companyId&&(!proof||!check.matches.some(row=>row.id===target)))throw new HttpError(409,'DOCUMENTATION_COMPANY_REVIEW_REQUIRED');
   if(target===companyId&&['other','ambiguous','mismatch'].includes(check.status)&&(!proof||body.confirm_company_mismatch!==true))throw new HttpError(409,'DOCUMENTATION_COMPANY_REVIEW_REQUIRED');
   return target;
  },
 };
}
