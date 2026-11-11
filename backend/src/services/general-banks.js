import {HttpError} from '../middleware/errors.js';
import {id,fail} from './validation.js';

export function validateGeneralBank(body){
 if(!body||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>160)fail('INVALID_BANK_NAME');
 const bic=typeof body.bic==='string'?body.bic.replace(/\s/g,'').toUpperCase():'';
 if(!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/.test(bic))fail('INVALID_BIC');
 return {name:body.name.trim(),bic};
}

// Shared catalog: always use the central pool, never a company's database.
export function createGeneralBankService(central){
 async function get(bankId){const [[row]]=await central.execute('SELECT id,name,bic,version FROM general_banks WHERE id=?',[bankId]);if(!row)throw new HttpError(404,'BANK_NOT_FOUND');return row;}
 return {
  get:bankId=>get(id(bankId)),
  async list(){const [rows]=await central.execute('SELECT id,name,bic,version FROM general_banks ORDER BY name,id');return rows;},
  async save(body,bankId){
   const data=validateGeneralBank(body);
   try{
    if(bankId!==undefined){
     bankId=id(bankId);const version=id(body.version);
     const [result]=await central.execute('UPDATE general_banks SET name=?,bic=?,version=version+1 WHERE id=? AND version=?',[data.name,data.bic,bankId,version]);
     if(!result.affectedRows){await get(bankId);throw new HttpError(409,'BANK_CHANGED');}
    }else{const [result]=await central.execute('INSERT INTO general_banks (name,bic) VALUES (?,?)',[data.name,data.bic]);bankId=result.insertId;}
    return await get(bankId);
   }catch(error){if(error.code==='ER_DUP_ENTRY')throw new HttpError(409,'BANK_BIC_EXISTS');throw error;}
  },
 };
}
