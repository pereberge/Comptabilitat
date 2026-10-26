import {createHash} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {id,date} from './validation.js';
import {calculateFarmSale} from '../../../shared/farm-sale-money.js';
const fail=(code,status=400)=>{throw new HttpError(status,code);};
export function validateFarmSale(body){
 let amounts;try{amounts=calculateFarmSale(body);}catch(error){fail(error.code||'FARM_SALE_INVALID_NUMBER');}
 const notes=body.notes??'';if(typeof notes!=='string'||notes.length>2000)fail('FARM_SALE_INVALID_NOTES');
 return {lot_id:id(body.lot_id),sale_date:date(body.sale_date),...amounts,notes};
}
export async function saveFarmSale(db,companyId,body,saleId){
 const sale=validateFarmSale(body),selectedId=saleId?id(saleId):null;
 const [[lot]]=await db.execute('SELECT id FROM farm_lots WHERE company_id=? AND id=?',[companyId,sale.lot_id]);if(!lot)fail('FARM_LOT_NOT_FOUND',404);
 const [[period]]=await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND start_date<=? AND end_date>=?',[companyId,sale.sale_date,sale.sale_date]);if(!period)fail('FARM_SALE_EXERCISE_REQUIRED');
 const fields=['lot_id','sale_date','pigs','kg_per_pig','price_per_kg','total_kg','total_amount','notes'],values=fields.map(field=>sale[field]);
 if(selectedId){
  const [updated]=await db.execute('UPDATE farm_sales SET exercise_id=?,'+fields.map(field=>field+'=?').join(',')+',version=version+1 WHERE company_id=? AND id=? AND version=? AND voided=0',[period.id,...values,companyId,selectedId,id(body.version)]);
  if(!updated.affectedRows)fail('FARM_CHANGED',409);return {id:selectedId};
 }
 const requestId=body.request_id;if(typeof requestId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))fail('INVALID_REQUEST');
 const hash=createHash('sha256').update(JSON.stringify(sale)).digest('hex');
 const [[existing]]=await db.execute('SELECT id,request_hash,voided FROM farm_sales WHERE company_id=? AND request_id=?',[companyId,requestId]);
 if(existing){if(existing.request_hash!==hash)fail('REQUEST_CONFLICT',409);if(existing.voided)fail('FARM_SALE_VOIDED',409);return {id:existing.id,replayed:true};}
 const [created]=await db.execute('INSERT INTO farm_sales(company_id,exercise_id,'+fields.join(',')+',request_id,request_hash) VALUES ('+Array(fields.length+4).fill('?').join(',')+')',[companyId,period.id,...values,requestId,hash]);
 return {id:created.insertId,replayed:false};
}
export async function removeFarmSale(db,companyId,saleId,body){
 const [[sale]]=await db.execute('SELECT version,voided FROM farm_sales WHERE company_id=? AND id=?',[companyId,id(saleId)]);if(!sale)fail('FARM_SALE_NOT_FOUND',404);
 if(sale.voided)return {removed:true};
 if(sale.version!==id(body?.version))fail('FARM_CHANGED',409);
 await db.execute('UPDATE farm_sales SET voided=1,version=version+1 WHERE company_id=? AND id=?',[companyId,id(saleId)]);return {removed:true};
}
