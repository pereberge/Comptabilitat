import {withTransaction} from '../db/transaction.js';
import {lockCompany} from './subaccounts.js';
import {HttpError} from '../middleware/errors.js';
import {id,date,fail} from './validation.js';
import {requestId,hash,text,positiveAmount} from './invoice-validation.js';
import {receiptDetail} from './portfolio-data.js';
import {requireAccount} from './trade-posting.js';
import {requireUnremittedReceipt} from './remittance-lock.js';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const conflict=code=>{throw new HttpError(409,code);};
export async function readTreasuryPlanning(db,companyId){
 try{
  const [assignments]=await db.execute('SELECT receipt_id,bank_account_id,version FROM treasury_receipt_accounts WHERE company_id=?',[companyId]);
  const [plans]=await db.execute('SELECT * FROM treasury_plans WHERE company_id=? ORDER BY expected_date,id',[companyId]);
  return {planning_available:true,assignments,plans};
 }catch(error){if(error.code!=='ER_NO_SUCH_TABLE')throw error;return {planning_available:false,assignments:[],plans:[]};}
}
export function createTreasuryPlanningService(pool,companyId,actor='local'){
 async function operation(action,body,payload,work){
  const key=requestId(body?.request_id),digest=hash({action,payload});
  return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const [[prior]]=await db.execute('SELECT request_hash,response FROM management_requests WHERE company_id=? AND request_id=?',[companyId,key]);
   if(prior){if(prior.request_hash!==digest)conflict('REQUEST_CONFLICT');return {...parse(prior.response),replayed:true};}
   const result=await work(db,key);await db.execute('INSERT INTO management_requests(company_id,request_id,request_hash,response) VALUES (?,?,?,?)',[companyId,key,digest,JSON.stringify(result)]);return result;
  });
 }
 const bank=async(db,value)=>{if(value===null||value==='')return null;return (await requireAccount(db,companyId,value,['572'],'INVALID_BANK_ACCOUNT')).id;};
 async function audit(db,action,entity,target,before,after){await db.execute('INSERT INTO management_audit_events(company_id,actor,action,entity_type,entity_id,before_data,after_data) VALUES (?,?,?,?,?,?,?)',[companyId,actor,action,entity,target,before?JSON.stringify(before):null,JSON.stringify(after)]);}
 async function plan(db,target){const [[row]]=await db.execute('SELECT * FROM treasury_plans WHERE company_id=? AND id=? FOR UPDATE',[companyId,id(target)]);if(!row)throw new HttpError(404,'TREASURY_PLAN_NOT_FOUND');return row;}
 const revision=(before,body)=>{if(before.version!==body.version)conflict('TREASURY_CHANGED');};
 function fields(body){if(!['issued','received'].includes(body?.direction))fail('TREASURY_INVALID_PLAN');return {direction:body.direction,description:text(body.description,200,true),expected_date:date(body.expected_date),amount:positiveAmount(body.amount),bank_account_id:body.bank_account_id===undefined?null:body.bank_account_id};}
 return {
  assign:async(receiptId,body)=>{
   const target=id(receiptId);return operation('treasury.assign',body,{target,version:body.version,bank_account_id:body.bank_account_id},async db=>{
    const receipt=await receiptDetail(db,companyId,target);if(!['pending','partial'].includes(receipt.status))conflict('RECEIPT_NOT_PENDING');await requireUnremittedReceipt(db,companyId,target);
    const [[before]]=await db.execute('SELECT * FROM treasury_receipt_accounts WHERE company_id=? AND receipt_id=? FOR UPDATE',[companyId,target]);if((before?.version||0)!==body.version)conflict('TREASURY_CHANGED');
    const account=await bank(db,body.bank_account_id);
    if(before)await db.execute('UPDATE treasury_receipt_accounts SET bank_account_id=?,version=version+1 WHERE company_id=? AND receipt_id=?',[account,companyId,target]);
    else await db.execute('INSERT INTO treasury_receipt_accounts(company_id,receipt_id,bank_account_id) VALUES (?,?,?)',[companyId,target,account]);
    const after={receipt_id:target,bank_account_id:account,version:(before?.version||0)+1};await audit(db,'assign','treasury_receipt',target,before,after);return after;
   });
  },
  save:async(target,body)=>{
   const data=fields(body);return operation('treasury.plan.save',body,{target:target? id(target):null,version:body.version??null,data},async(db,key)=>{
    const before=target?await plan(db,target):null;if(before){revision(before,body);if(before.status!=='pending')conflict('TREASURY_PLAN_CLOSED');}
    const account=await bank(db,data.bank_account_id);let planId=before?.id;
    if(before)await db.execute('UPDATE treasury_plans SET direction=?,description=?,expected_date=?,amount=?,bank_account_id=?,version=version+1 WHERE company_id=? AND id=?',[data.direction,data.description,data.expected_date,data.amount,account,companyId,planId]);
    else{const [row]=await db.execute('INSERT INTO treasury_plans(company_id,direction,description,expected_date,amount,bank_account_id,request_id) VALUES (?,?,?,?,?,?,?)',[companyId,data.direction,data.description,data.expected_date,data.amount,account,key]);planId=row.insertId;}
    const after=await plan(db,planId);await audit(db,before?'update':'create','treasury_plan',planId,before,after);return after;
   });
  },
  link:async(target,body)=>operation('treasury.plan.link',body,{target:id(target),version:body.version,receipt_id:id(body.receipt_id)},async db=>{
   const before=await plan(db,target);revision(before,body);if(before.status!=='pending')conflict('TREASURY_PLAN_CLOSED');
   const receipt=await receiptDetail(db,companyId,body.receipt_id);if(receipt.status==='void'||receipt.direction!==before.direction||receipt.amount!==before.amount)conflict('TREASURY_LINK_MISMATCH');
   const [[other]]=await db.execute('SELECT id FROM treasury_plans WHERE company_id=? AND linked_receipt_id=?',[companyId,receipt.id]);if(other)conflict('TREASURY_LINK_EXISTS');
   await db.execute("UPDATE treasury_plans SET status='linked',linked_receipt_id=?,version=version+1 WHERE company_id=? AND id=?",[receipt.id,companyId,before.id]);const after=await plan(db,before.id);await audit(db,'link','treasury_plan',before.id,before,after);return after;
  }),
  cancel:async(target,body)=>operation('treasury.plan.cancel',body,{target:id(target),version:body.version},async db=>{
   const before=await plan(db,target);revision(before,body);if(before.status==='cancelled')conflict('TREASURY_PLAN_CLOSED');
   await db.execute("UPDATE treasury_plans SET status='cancelled',linked_receipt_id=NULL,version=version+1 WHERE company_id=? AND id=?",[companyId,before.id]);const after=await plan(db,before.id);await audit(db,'cancel','treasury_plan',before.id,before,after);return after;
  }),
 };
}
