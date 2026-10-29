import { withTransaction } from '../db/transaction.js';
import { HttpError } from '../middleware/errors.js';
import { vatPeriod, calculateVatModel } from '../../../shared/vat-model.js';
import { readVatSources } from './vat-sources.js';
import { id } from './validation.js';
import { buildVatFiling,vatFilingAvailability,vatModelHash } from './vat-filing.js';
import { readVatSettlement } from './vat-settlement.js';

const parse=value=>typeof value==='string'?JSON.parse(value):value;
async function taxAction(action){try{return await action();}catch(error){if(error instanceof HttpError)throw error;if(/^INVALID_VAT_|^VAT_/.test(error.code||''))throw new HttpError(error.code==='VAT_DRAFT_CONFLICT'?409:400,error.code);throw error;}}
export function createVatService(pool,companyId){
 async function read(db,query,input,strict=false,settlementAccounts={}){
  const period=vatPeriod(query);
  const [[company]]=await db.execute('SELECT c.id,c.name,d.tax_id,d.iban FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);
  if(!company)throw new HttpError(404,'COMPANY_NOT_FOUND');
  const [[draft]]=await db.execute('SELECT version,payload,updated_at FROM vat_drafts WHERE company_id=? AND tax_year=? AND frequency=? AND period=?',[companyId,period.year,period.frequency,period.period]);
  const {sources,settlements}=await readVatSources(db,companyId,period);
  const model=calculateVatModel(sources,input??(draft?parse(draft.payload):{}),period,{strict});
  const result={...model,company,period,settlements,draft:{version:draft?.version??0,updated_at:draft?.updated_at??null}};
  return {...result,model_hash:vatModelHash(result),filing:vatFilingAvailability(result),settlement_proposal:await readVatSettlement(db,companyId,result,settlementAccounts)};
 }
 return {
  async source(entryId){
   const [[source]]=await pool.execute('SELECT j.source_name,j.source_pdf FROM journal_entries e JOIN journal_imports j ON j.company_id=e.company_id AND j.id=e.import_id AND j.exercise_id=e.exercise_id WHERE e.company_id=? AND e.id=?',[companyId,id(entryId)]);
   if(!source)throw new HttpError(404,'VAT_SOURCE_NOT_FOUND');
   return source;
  },
  get:query=>taxAction(()=>withTransaction(pool,db=>read(db,query))),
  preview:(query,body)=>taxAction(()=>withTransaction(pool,db=>read(db,query,body,true))),
  settlementPreview:(query,body)=>taxAction(()=>withTransaction(pool,async db=>{
   if(!body?.input||typeof body.model_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.model_hash)||body.accounts!==undefined&&(!body.accounts||typeof body.accounts!=='object'||Array.isArray(body.accounts)))throw new HttpError(400,'INVALID_VAT_INPUT');
   const model=await read(db,query,body.input,true,body.accounts||{});
   if(model.model_hash!==body.model_hash)throw new HttpError(409,'VAT_SOURCE_CHANGED');
   return model.settlement_proposal;
  })),
  filing:(query,body)=>taxAction(()=>withTransaction(pool,async db=>{
   if(!body?.input||typeof body.model_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.model_hash))throw new HttpError(400,'INVALID_VAT_FILING');
   const model=await read(db,query,body.input,true);
   if(model.model_hash!==body.model_hash)throw new HttpError(409,'VAT_SOURCE_CHANGED');
   return buildVatFiling(model,body.filing);
  })),
  save:(query,body)=>taxAction(()=>withTransaction(pool,async db=>{
   if(!Number.isSafeInteger(body?.version)||body.version<0||!body.input||typeof body.input!=='object'||Array.isArray(body.input))throw new HttpError(400,'INVALID_VAT_INPUT');
   // Serializes creation and updates, including the first draft for a period.
   await db.execute('SELECT id FROM companies WHERE id=? FOR UPDATE',[companyId]);
   const result=await read(db,query,body.input,true);
   if(result.draft.version!==body.version)throw new HttpError(409,'VAT_DRAFT_CONFLICT');
   const params=[companyId,result.period.year,result.period.frequency,result.period.period,JSON.stringify(result.input)];
   await db.execute('INSERT INTO vat_drafts(company_id,tax_year,frequency,period,payload) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),version=version+1',params);
   return {...result,draft:{version:body.version+1,updated_at:new Date().toISOString()}};
  })),
 };
}
