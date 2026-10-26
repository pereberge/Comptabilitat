import { createHash,randomUUID } from 'node:crypto';
import { withTransaction } from '../db/transaction.js';
import { HttpError } from '../middleware/errors.js';
import { lockCompany } from './subaccounts.js';
import { ensureAccount } from './account-hierarchy.js';
import { id,description,fail } from './validation.js';
import { previousExerciseEnd } from './balance-comparison.js';
import { accountBalances,calculateCarry,calculateClosing,lineTotals } from './year-end-calculation.js';

export const operationHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function operationRequest(value){if(typeof value!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))fail('INVALID_REQUEST');return value.toLowerCase();}
const conflict=code=>{throw new HttpError(409,code);};
const json=value=>typeof value==='string'?JSON.parse(value):value;
export async function operationReplay(db,companyId,requestId,digest){
 const [[row]]=await db.execute('SELECT request_hash,result FROM exercise_operations WHERE company_id=? AND request_id=?',[companyId,requestId]);
 if(!row)return null;if(row.request_hash!==digest)fail('REQUEST_CONFLICT');return {...json(row.result),replayed:true};
}
export async function recordExerciseOperation(db,companyId,exerciseId,kind,data,snapshot,sourceId=null){
 const [row]=await db.execute('INSERT INTO exercise_operations(company_id,exercise_id,source_exercise_id,kind,request_id,request_hash,preview_hash,reason,snapshot) VALUES (?,?,?,?,?,?,?,?,?)',[companyId,exerciseId,sourceId,kind,data.request_id,data.digest,data.preview_hash || null,data.reason || '',JSON.stringify(snapshot)]);return row.insertId;
}
export async function finishExerciseOperation(db,companyId,operationId,result){
 await db.execute('UPDATE exercise_operations SET result=? WHERE company_id=? AND id=?',[JSON.stringify(result),companyId,operationId]);return result;
}
async function state(db,companyId,exerciseId){
 const [[exercise]]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,id(exerciseId)]);
 if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
 const [entries]=await db.execute('SELECT id,number,entry_date,description,status,entry_type,import_id,exercise_operation_id,cancelled_by_operation_id FROM journal_entries WHERE company_id=? AND exercise_id=? ORDER BY id',[companyId,exercise.id]);
 const [lines]=await db.execute(`SELECT l.id,l.entry_id,l.position,l.account_id,l.description,l.debit,l.credit,a.code,a.description AS account_name FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' ORDER BY e.id,l.position`,[companyId,exercise.id]);
 return {exercise,entries,lines};
}
const summary=exercise=>({id:exercise.id,name:exercise.name,start_date:exercise.start_date,end_date:exercise.end_date,status:exercise.status});
function planHash(plan,states){return operationHash({plan,states});}
async function sourceCarry(db,companyId,sourceId){
 const source=await state(db,companyId,sourceId);
 if(source.exercise.status!=='closed')conflict('ANNUAL_SOURCE_NOT_CLOSED');
 const carry=calculateCarry(source.lines,source.entries,source.exercise.end_date);
 const plan={kind:'carry',source:summary(source.exercise),date:source.exercise.end_date,...carry};
 return {...plan,preview_hash:planHash(plan,[source])};
}
async function chooseResult(db,companyId,settings,accountId,needed){
 const [accounts]=await db.execute("SELECT id,code,description FROM accounts WHERE company_id=? AND kind='subaccount' AND LEFT(code,3)='129' ORDER BY code",[companyId]);
 if(accountId){const selected=accounts.find(row=>row.id===id(accountId));if(!selected)conflict('ANNUAL_INVALID_RESULT_ACCOUNT');return selected;}
 const code='1290'.padEnd(settings.subaccount_length,'0'),exact=accounts.find(row=>row.code===code);
 if(exact)return exact;if(accounts.length===1)return accounts[0];if(accounts.length>1&&needed)conflict('ANNUAL_RESULT_ACCOUNT_REQUIRED');
 return {id:null,code,description:'Resultado del ejercicio'};
}
async function previewPlan(db,companyId,settings,exerciseId,kind,options={}){
 const target=await state(db,companyId,exerciseId),period=target.exercise,posted=target.entries.filter(row=>row.status==='posted');
 if(kind==='opening'){
  if(period.status!=='open')conflict('ANNUAL_TARGET_CLOSED');if(posted.some(row=>row.entry_type==='opening'))conflict('ANNUAL_OPENING_EXISTS');
  let sourceId=options.source_exercise_id;
  if(!sourceId){const [[source]]=await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND end_date=?',[companyId,previousExerciseEnd(period.start_date)]);sourceId=source?.id;}
  if(!sourceId)conflict('ANNUAL_PREVIOUS_NOT_FOUND');if(id(sourceId)===period.id)conflict('ANNUAL_INVALID_SOURCE');
  const carry=await sourceCarry(db,companyId,sourceId);
  if(carry.source.end_date!==previousExerciseEnd(period.start_date))conflict('ANNUAL_INVALID_SOURCE');
  const plan={kind,exercise:summary(period),source:carry.source,date:period.start_date,entries:[{entry_type:'opening',description:'ASIENTO DE APERTURA · '+period.name,lines:carry.lines,totals:carry.totals}],cancel_entries:[]};
  return {...plan,preview_hash:planHash(plan,[target,carry.preview_hash])};
 }
 if(kind==='closing'){
  if(posted.some(row=>row.entry_type==='closing'))conflict('ANNUAL_CLOSING_EXISTS');
  if(!posted.length)conflict('ANNUAL_NO_MOVEMENTS');
  const [[previous]]=await db.execute('SELECT id,status FROM accounting_exercises WHERE company_id=? AND end_date=?',[companyId,previousExerciseEnd(period.start_date)]);
  if(previous){
   const [[activity]]=await db.execute("SELECT COUNT(*) AS total FROM journal_entries WHERE company_id=? AND exercise_id=? AND status='posted'",[companyId,previous.id]);
   if(activity.total&&previous.status!=='closed')conflict('ANNUAL_PREVIOUS_NOT_CLOSED');
   if(activity.total&&!posted.some(row=>row.entry_type==='opening'))conflict('ANNUAL_OPENING_REQUIRED');
  }
  const income=accountBalances(target.lines).some(row=>/^[67]/.test(row.code)),resultAccount=await chooseResult(db,companyId,settings,options.result_account_id,income);
  const calculated=calculateClosing(target.lines,resultAccount),entries=[];
  if(calculated.regularization.length)entries.push({entry_type:'regularization',description:'ASIENTO DE REGULARIZACIÓN · '+period.name,lines:calculated.regularization,totals:calculated.regularization_totals});
  if(calculated.closing.length)entries.push({entry_type:'closing',description:'ASIENTO DE CIERRE · '+period.name,lines:calculated.closing,totals:calculated.closing_totals});
  if(!entries.length)conflict('ANNUAL_NO_BALANCES');
  const plan={kind,exercise:summary(period),date:period.end_date,result_account:resultAccount,result_transfer:calculated.result_transfer,entries,cancel_entries:[]};
  return {...plan,preview_hash:planHash(plan,[target,previous])};
 }
 if(kind==='cancel_opening'){
  if(period.status!=='open')conflict('ANNUAL_TARGET_CLOSED');
  const cancel=posted.filter(row=>row.entry_type==='opening');if(!cancel.length)conflict('ANNUAL_OPENING_NOT_FOUND');
  const plan={kind,exercise:summary(period),date:period.start_date,entries:[],cancel_entries:cancel.map(row=>({...row,exercise_id:period.id,exercise_name:period.name})),affected_exercises:[summary(period)]};
  return {...plan,preview_hash:planHash(plan,[target])};
 }
 if(kind==='cancel_closing'){
  const closings=posted.filter(row=>row.entry_type==='closing');
  if(!closings.length&&period.status!=='closed')conflict('ANNUAL_CLOSING_NOT_FOUND');
  const cancel=posted.filter(row=>row.entry_type==='closing'||(row.entry_type==='regularization'&&row.entry_date===period.end_date));
  const [[following]]=await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND start_date=DATE_ADD(?,INTERVAL 1 DAY)',[companyId,period.end_date]);
  const next=following?await state(db,companyId,following.id):null;
  const openings=next?.entries.filter(row=>row.status==='posted'&&row.entry_type==='opening') || [];
  if(openings.length&&next.exercise.status!=='open')conflict('ANNUAL_DEPENDENT_EXERCISE_CLOSED');
  const plan={kind,exercise:summary(period),date:period.end_date,entries:[],cancel_entries:[...cancel.map(row=>({...row,exercise_id:period.id,exercise_name:period.name})),...openings.map(row=>({...row,exercise_id:next.exercise.id,exercise_name:next.exercise.name}))],affected_exercises:[summary(period),...(openings.length?[summary(next.exercise)]:[])]};
  return {...plan,preview_hash:planHash(plan,[target,next])};
 }
 fail('INVALID_EXERCISE_OPERATION');
}
async function annualEntry(db,companyId,exerciseId,operationId,day,entry,resultAccount){
 let lines=entry.lines;
 if(lines.some(row=>row.account_id===null)){
  const parent=await ensureAccount(db,companyId,resultAccount.code.slice(0,4));
  let [[account]]=await db.execute('SELECT id,kind FROM accounts WHERE company_id=? AND code=?',[companyId,resultAccount.code]);
  if(account&&account.kind!=='subaccount')conflict('ANNUAL_INVALID_RESULT_ACCOUNT');
  if(!account){const [created]=await db.execute("INSERT INTO accounts(company_id,code,description,kind,parent_id) VALUES (?,?,?,'subaccount',?)",[companyId,resultAccount.code,resultAccount.description,parent.id]);account={id:created.insertId};}
  lines=lines.map(row=>row.account_id===null?{...row,account_id:account.id}:row);
 }
 lineTotals(lines);if(lines.length<2)conflict('ANNUAL_UNBALANCED_JOURNAL');
 const [[last]]=await db.execute('SELECT COALESCE(MAX(number),0) AS number FROM journal_entries WHERE company_id=? AND exercise_id=?',[companyId,exerciseId]);
 if(last.number>=4294967295)fail('INVALID_ID');
 const number=last.number+1;
 const [created]=await db.execute(`INSERT INTO journal_entries(company_id,exercise_id,number,entry_date,description,request_id,request_hash,status,entry_type,exercise_operation_id) VALUES (?,?,?,?,?,?,?,'posted',?,?)`,[companyId,exerciseId,number,day,entry.description,randomUUID(),operationHash(entry),entry.entry_type,operationId]);
 for(const [position,line]of lines.entries())await db.execute('INSERT INTO journal_lines(company_id,entry_id,account_id,position,description,debit,credit) VALUES (?,?,?,?,?,?,?)',[companyId,created.insertId,line.account_id,position+1,entry.description,line.debit,line.credit]);
 return {id:created.insertId,number,entry_type:entry.entry_type,entry_date:day,...entry.totals};
}
export async function openingWithNewExercise(db,companyId,settings,exerciseId,sourceId,expectedHash){
 const carry=await sourceCarry(db,companyId,sourceId);if(carry.preview_hash!==expectedHash)conflict('ANNUAL_PREVIEW_STALE');
 const plan=await previewPlan(db,companyId,settings,exerciseId,'opening',{source_exercise_id:sourceId});
 const request_id=randomUUID(),data={request_id,digest:operationHash({exerciseId,sourceId,request_id}),preview_hash:plan.preview_hash};
 return applyPlan(db,companyId,plan,data);
}
async function applyPlan(db,companyId,plan,data){
 const operationId=await recordExerciseOperation(db,companyId,plan.exercise.id,plan.kind,data,plan,plan.source?.id || null),created=[];
 for(const entry of plan.entries)created.push(await annualEntry(db,companyId,plan.exercise.id,operationId,plan.date,entry,plan.result_account));
 for(const entry of plan.cancel_entries)await db.execute("UPDATE journal_entries SET status='cancelled',cancelled_by_operation_id=? WHERE company_id=? AND exercise_id=? AND id=? AND status='posted'",[operationId,companyId,entry.exercise_id,entry.id]);
 if(plan.kind==='closing')await db.execute("UPDATE accounting_exercises SET is_default=0,status='closed' WHERE company_id=? AND id=?",[companyId,plan.exercise.id]);
 if(plan.kind==='cancel_closing')await db.execute("UPDATE accounting_exercises SET status='open' WHERE company_id=? AND id=?",[companyId,plan.exercise.id]);
 const result={operation_id:operationId,kind:plan.kind,exercise_id:plan.exercise.id,entries:created,cancelled_entries:plan.cancel_entries.map(row=>({id:row.id,number:row.number,exercise_id:row.exercise_id,entry_type:row.entry_type})),status:plan.kind==='closing'?'closed':'open',replayed:false};
 return finishExerciseOperation(db,companyId,operationId,result);
}
export function createExerciseOperationService(pool,companyId){
 return {
  carry:sourceId=>withTransaction(pool,async db=>{await lockCompany(db,companyId);return sourceCarry(db,companyId,sourceId);}),
  preview:(exerciseId,kind,options={})=>withTransaction(pool,async db=>{const settings=await lockCompany(db,companyId);return previewPlan(db,companyId,settings,id(exerciseId),kind,options);}),
  async execute(exerciseId,kind,body){
   if(!['opening','closing','cancel_opening','cancel_closing'].includes(kind))fail('INVALID_EXERCISE_OPERATION');
   const target=id(exerciseId),data={request_id:operationRequest(body?.request_id),preview_hash:body?.preview_hash,reason:kind.startsWith('cancel_')?description(body?.reason):'',source_exercise_id:body?.source_exercise_id?id(body.source_exercise_id):null,result_account_id:body?.result_account_id?id(body.result_account_id):null};
   if(typeof data.preview_hash!=='string'||!/^[a-f0-9]{64}$/.test(data.preview_hash))fail('ANNUAL_PREVIEW_REQUIRED');
   data.digest=operationHash({exercise_id:target,kind,...data});
   return withTransaction(pool,async db=>{
    const settings=await lockCompany(db,companyId),replay=await operationReplay(db,companyId,data.request_id,data.digest);if(replay)return replay;
    const plan=await previewPlan(db,companyId,settings,target,kind,data);
    if(plan.preview_hash!==data.preview_hash)conflict('ANNUAL_PREVIEW_STALE');
    return applyPlan(db,companyId,plan,data);
   });
  },
 };
}
