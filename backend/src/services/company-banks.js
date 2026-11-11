import {HttpError} from '../middleware/errors.js';
import {id,fail} from './validation.js';
import {normalizedIban,validSepaIban,sepaIdentifier,isValidCreditorId} from '../../../shared/sepa.js';

export function validateCompanyBank(body){
 if(!body||typeof body!=='object')fail('INVALID_COMPANY_BANK');
 const bank_id=id(body.bank_id),iban=normalizedIban(body.iban),initiator_id=typeof body.initiator_id==='string'?body.initiator_id.trim():'',creditor_id=typeof body.creditor_id==='string'?body.creditor_id.replace(/\s/g,'').toUpperCase():'';
 if(!validSepaIban(iban))fail('REMITTANCE_COMPANY_IBAN');
 if(!sepaIdentifier(initiator_id))fail('INVALID_INITIATOR_ID');
 if(creditor_id&&!isValidCreditorId(creditor_id))fail('INVALID_CREDITOR_ID');
 return {bank_id,iban,initiator_id,creditor_id};
}

export function createCompanyBankService(pool,companyId,catalog){
 async function get(bankAccountId,db=pool){
  const [[row]]=await db.execute('SELECT id,company_id,bank_id,iban,initiator_id,creditor_id,version FROM company_banks WHERE company_id=? AND id=?',[companyId,id(bankAccountId)]);
  if(!row)throw new HttpError(404,'COMPANY_BANK_NOT_FOUND');
  const bank=await catalog.get(row.bank_id);return {...row,name:bank.name,bic:bank.bic,bank_version:bank.version};
 }
 return {
  get,
  async list(){const [rows]=await pool.execute('SELECT id,bank_id,iban,initiator_id,creditor_id,version FROM company_banks WHERE company_id=? ORDER BY id',[companyId]);const banks=await catalog.list(),byId=new Map(banks.map(bank=>[bank.id,bank]));return rows.map(row=>({...row,name:byId.get(row.bank_id)?.name||'Banco no disponible',bic:byId.get(row.bank_id)?.bic||''}));},
  async save(body,target){
   const value=validateCompanyBank(body);await catalog.get(value.bank_id);
   try{
    if(target!==undefined){target=id(target);const [result]=await pool.execute('UPDATE company_banks SET bank_id=?,iban=?,initiator_id=?,creditor_id=?,version=version+1 WHERE company_id=? AND id=? AND version=?',[value.bank_id,value.iban,value.initiator_id,value.creditor_id,companyId,target,id(body.version)]);if(!result.affectedRows){await get(target);throw new HttpError(409,'COMPANY_BANK_CHANGED');}}
    else{const [result]=await pool.execute('INSERT INTO company_banks (company_id,bank_id,iban,initiator_id,creditor_id) VALUES (?,?,?,?,?)',[companyId,value.bank_id,value.iban,value.initiator_id,value.creditor_id]);target=result.insertId;}
    return await get(target);
   }catch(error){if(error.code==='ER_DUP_ENTRY')throw new HttpError(409,'COMPANY_BANK_EXISTS');throw error;}
  },
 };
}
