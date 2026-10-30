import {withTransaction} from '../db/transaction.js';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {corporatePeriod,calculateCorporateTax} from '../../../shared/corporate-tax.js';
import {corporateHash,readCorporateTaxSources} from './corporate-tax-sources.js';
import {readCorporateTaxSettlement} from './corporate-tax-settlement.js';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const action=async run=>{try{return await run();}catch(error){if(error instanceof HttpError)throw error;if(/^(INVALID_CORPORATE_TAX|CORPORATE_TAX_)/.test(error.code||''))throw new HttpError(error.code==='CORPORATE_TAX_DRAFT_CONFLICT'||error.code==='CORPORATE_TAX_SOURCE_CHANGED'?409:400,error.code);throw error;}};
export function createCorporateTaxService(pool,companyId){
 async function read(db,query,input,strict=false){
  const [[exercise]]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,id(query.exercise_id)]);if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
  const period=corporatePeriod(exercise),[[company]]=await db.execute('SELECT c.id,c.name,d.tax_id,d.iban FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);
  const [[draft]]=await db.execute('SELECT payload,version,updated_at FROM corporate_tax_drafts WHERE company_id=? AND exercise_id=?',[companyId,exercise.id]);
  const source=await readCorporateTaxSources(db,company,exercise,period),model=calculateCorporateTax(source,input??(draft?parse(draft.payload):{}),period,{strict});
  const result={...model,company,exercise,source,source_hash:source.source_hash,draft:{version:draft?.version||0,updated_at:draft?.updated_at||null}};
  return {...result,model_hash:corporateHash({company,period,source_hash:source.source_hash,input:model.input,summary:model.summary}),settlement_proposal:await readCorporateTaxSettlement(db,companyId,result)};
 }
 return {
  get:query=>action(()=>withTransaction(pool,db=>read(db,query))),
  preview:(query,input)=>action(()=>withTransaction(pool,db=>read(db,query,input,true))),
  save:(query,body)=>action(()=>withTransaction(pool,async db=>{
   if(!Number.isSafeInteger(body?.version)||body.version<0||!body.input)throw new HttpError(400,'INVALID_CORPORATE_TAX_INPUT');
   await db.execute('SELECT id FROM companies WHERE id=? FOR UPDATE',[companyId]);const result=await read(db,query,body.input,true);
   if(result.draft.version!==body.version)throw new HttpError(409,'CORPORATE_TAX_DRAFT_CONFLICT');
   await db.execute('INSERT INTO corporate_tax_drafts(company_id,exercise_id,payload) VALUES (?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),version=version+1',[companyId,result.exercise.id,JSON.stringify(result.input)]);
   return {...result,draft:{version:body.version+1,updated_at:new Date().toISOString()}};
  })),
 };
}
