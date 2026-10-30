import {withTransaction} from '../db/transaction.js';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {installmentPeriod,normalizeInstallmentTaxInput,calculateInstallmentTax} from '../../../shared/installment-tax.js';
import {corporateHash,readCorporateTaxSources} from './corporate-tax-sources.js';
import {corporateAmount} from '../../../shared/corporate-tax.js';
const json=value=>typeof value==='string'?JSON.parse(value):value;
const action=async run=>{try{return await run();}catch(error){if(error instanceof HttpError)throw error;if(/^(INVALID_(?:CORPORATE|INSTALLMENT)_TAX|(?:CORPORATE|INSTALLMENT)_TAX_)/.test(error.code||''))throw new HttpError(/(?:SOURCE_CHANGED|DRAFT_CONFLICT)$/.test(error.code)?409:400,error.code);throw error;}};
export function createInstallmentTaxService(pool,companyId){
 async function read(db,query,value,strict=false){
  const [[exercise]]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,id(query.exercise_id)]);if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
  const period=installmentPeriod(exercise,query),[[company]]=await db.execute('SELECT c.id,c.name,d.tax_id FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);
  const [[draft]]=await db.execute('SELECT payload,version,updated_at FROM installment_tax_drafts WHERE company_id=? AND exercise_id=? AND tax_year=? AND period=?',[companyId,exercise.id,period.year,period.period]);
  const input=normalizeInstallmentTaxInput(value??(draft?json(draft.payload):{}));
  const source=input.method==='40.3'?await readCorporateTaxSources(db,company,exercise,period):{today:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date()),records:[],complete:true,net_result:'0.00',income_tax_expense:'0.00',credits_473:'0.00'};
  source.source_hash=corporateHash({tax_id:company.tax_id,from:period.from,to:period.to,method:input.method,ledger:source.source_hash||null});
  const model=calculateInstallmentTax(source,input,period,{strict});
  const [previous]=await db.execute('SELECT tax_year,period,payload,version FROM installment_tax_drafts WHERE company_id=? AND exercise_id=? AND (tax_year<? OR (tax_year=? AND period<?)) ORDER BY tax_year,period',[companyId,exercise.id,period.year,period.year,period.period]);
  const priorDrafts=previous.map(row=>({year:row.tax_year,period:row.period,method:json(row.payload).method,version:row.version}));
  const [references]=await db.execute('SELECT id,name,start_date,end_date FROM accounting_exercises WHERE company_id=? AND end_date<? ORDER BY end_date DESC LIMIT 4',[companyId,period.filing_from]);
  const [accounts]=await db.execute("SELECT a.id,a.code,a.description,p.code AS parent_code FROM accounts a JOIN accounts p ON p.company_id=a.company_id AND p.id=a.parent_id WHERE a.company_id=? AND a.kind='subaccount' AND (p.code LIKE '473%' OR p.code LIKE '572%') ORDER BY a.code",[companyId]);
  const creditAccounts=accounts.filter(row=>row.parent_code.startsWith('473')),bankAccounts=accounts.filter(row=>row.parent_code.startsWith('572'));
  const proposal={date:period.filing_from,amount:model.result,ready:!model.provisional&&exercise.status==='open'&&corporateAmount(model.result)>0n&&creditAccounts.length===1&&bankAccounts.length===1,credit_accounts:creditAccounts,bank_accounts:bankAccounts,lines:corporateAmount(model.result)>0n?[{code:creditAccounts.length===1?creditAccounts[0].code:'473',description:creditAccounts.length===1?creditAccounts[0].description:'Retenciones y pagos a cuenta',debit:model.result,credit:'0.00'},{code:bankAccounts.length===1?bankAccounts[0].code:'572',description:bankAccounts.length===1?bankAccounts[0].description:'Banco del pago',debit:'0.00',credit:model.result}]:[]};
  return {...model,company,exercise,source,source_hash:source.source_hash,draft:{version:draft?.version||0,updated_at:draft?.updated_at||null},previous_drafts:priorDrafts,reference_exercises:references,settlement_proposal:proposal};
 }
 return {
  get:query=>action(()=>withTransaction(pool,db=>read(db,query))),
  preview:(query,input)=>action(()=>withTransaction(pool,db=>read(db,query,input,true))),
  save:(query,body)=>action(()=>withTransaction(pool,async db=>{
   if(!Number.isSafeInteger(body?.version)||body.version<0||!body.input)throw new HttpError(400,'INVALID_INSTALLMENT_TAX_INPUT');
   await db.execute('SELECT id FROM companies WHERE id=? FOR UPDATE',[companyId]);const model=await read(db,query,body.input,true);if(model.draft.version!==body.version)throw new HttpError(409,'INSTALLMENT_TAX_DRAFT_CONFLICT');
   await db.execute('INSERT INTO installment_tax_drafts(company_id,exercise_id,tax_year,period,payload) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),version=version+1',[companyId,model.exercise.id,model.period.year,model.period.period,JSON.stringify(model.input)]);
   return {...model,draft:{version:body.version+1,updated_at:new Date().toISOString()}};
  })),
 };
}
