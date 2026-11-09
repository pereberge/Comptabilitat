import {createHash} from 'node:crypto';
import {withTransaction} from '../db/transaction.js';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {lockCompany} from './subaccounts.js';
import {payrollCanonical} from '../../../shared/payroll.js';
const fail=(code,status=400)=>{throw new HttpError(status,code);};
const json=value=>typeof value==='string'?JSON.parse(value):value;
export function createPayrollBatchDeleteService(pool,companyId,{exercise,enabled}){
 async function plan(db,body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['exercise_id','slips','preview_hash'].includes(key))||!Array.isArray(body.slips)||!body.slips.length||body.slips.length>1000)fail('INVALID_PAYROLL_DELETE_BATCH');
  const selected=body.slips.map(row=>{if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).some(key=>!['id','version'].includes(key))||!Number.isSafeInteger(row.version)||row.version<1)fail('INVALID_PAYROLL_DELETE_BATCH');return {id:id(row.id),version:row.version};}).sort((a,b)=>a.id-b.id);
  if(new Set(selected.map(row=>row.id)).size!==selected.length)fail('INVALID_PAYROLL_DELETE_BATCH');await enabled(db);const year=await exercise(db,id(body.exercise_id)),marks=selected.map(()=>'?').join(',');
  const [rows]=await db.execute('SELECT id,exercise_id,status,version,entry_id,reversal_entry_id,period_from,period_to,employee_snapshot,calculation FROM payroll_slips WHERE company_id=? AND exercise_id=? AND id IN ('+marks+') ORDER BY id',[companyId,year.id,...selected.map(row=>row.id)]);
  if(rows.length!==selected.length)fail('PAYROLL_DELETE_BATCH_CHANGED',409);
  for(let index=0;index<rows.length;index++){const row=rows[index];if(row.status!=='draft'||row.entry_id||row.reversal_entry_id)fail('PAYROLL_READ_ONLY',409);if(row.version!==selected[index].version)fail('PAYROLL_DELETE_BATCH_CHANGED',409);}
  const hash=createHash('sha256').update(payrollCanonical({company_id:companyId,exercise:year,selected,rows})).digest('hex');
  return {exercise:year,hash,rows:rows.map(row=>({id:row.id,version:row.version,code:json(row.employee_snapshot).profile.code,name:json(row.employee_snapshot).profile.name,period_from:row.period_from,period_to:row.period_to,totals:json(row.calculation).totals})),ready:year.status==='open'};
 }
 return {
  preview:body=>withTransaction(pool,db=>plan(db,body)),
  remove:body=>withTransaction(pool,async db=>{
   if(typeof body?.preview_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.preview_hash))fail('INVALID_PAYROLL_DELETE_BATCH');await lockCompany(db,companyId);const result=await plan(db,body);
   if(!result.ready)fail('EXERCISE_CLOSED');if(result.hash!==body.preview_hash)fail('PAYROLL_DELETE_BATCH_CHANGED',409);const ids=result.rows.map(row=>row.id);
   const [deleted]=await db.execute("DELETE FROM payroll_slips WHERE company_id=? AND exercise_id=? AND status='draft' AND id IN ("+ids.map(()=>'?').join(',')+')',[companyId,result.exercise.id,...ids]);if(deleted.affectedRows!==ids.length)fail('PAYROLL_DELETE_BATCH_CHANGED',409);
   return {deleted_count:ids.length,deleted_ids:ids};
  }),
 };
}
