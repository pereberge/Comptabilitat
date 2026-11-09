import {createHash} from 'node:crypto';
import {withTransaction} from '../db/transaction.js';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {lockCompany} from './subaccounts.js';
import {payrollMonth,emptyPayrollInput,normalizePayrollInput,calculatePayroll,payrollCanonical} from '../../../shared/payroll.js';
import {payrollAgreement} from '../../../shared/payroll-agreements.js';
const fail=(code,status=400)=>{throw new HttpError(status,code);};
const hash=value=>createHash('sha256').update(payrollCanonical(value)).digest('hex');
const json=value=>typeof value==='string'?JSON.parse(value):value;
function parameters(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['exercise_id','year','month','kind','employee_ids','request_id','preview_hash'].includes(key)))fail('INVALID_PAYROLL_BATCH');
 const year=Number(body.year),month=Number(body.month),period=payrollMonth(year,month),kind=body.kind||'monthly';
 if(!['monthly','extra'].includes(kind)||!Array.isArray(body.employee_ids)||!body.employee_ids.length||body.employee_ids.length>500)fail('INVALID_PAYROLL_BATCH');
 const employeeIds=body.employee_ids.map(id).sort((a,b)=>a-b);if(new Set(employeeIds).size!==employeeIds.length)fail('INVALID_PAYROLL_BATCH');
 return {exercise_id:id(body.exercise_id),year,month,kind,employee_ids:employeeIds,period};
}
function childRequest(companyId,requestId,p,employeeId){const value=hash({companyId,requestId,parameters:p,employeeId}).slice(0,32);return value.slice(0,8)+'-'+value.slice(8,12)+'-5'+value.slice(13,16)+'-a'+value.slice(17,20)+'-'+value.slice(20);}
export function createPayrollBatchService(pool,companyId,{employer,exercise,enabled}){
 async function plan(db,body){
  const p=parameters(body),agreement=await enabled(db),year=await exercise(db,p.exercise_id),issuer=await employer(db);
  if(p.period.to<year.start_date||p.period.from>year.end_date)fail('DATE_OUTSIDE_EXERCISE');
  const placeholders=p.employee_ids.map(()=>'?').join(','),[people]=await db.execute('SELECT id,profile,version FROM payroll_employees WHERE company_id=? AND id IN ('+placeholders+') ORDER BY id',[companyId,...p.employee_ids]);
  if(people.length!==p.employee_ids.length)fail('PAYROLL_EMPLOYEE_NOT_FOUND',404);
  const [existing]=await db.execute("SELECT id,employee_id,exercise_id,status,version,request_id,period_from,period_to FROM payroll_slips WHERE company_id=? AND employee_id IN ("+placeholders+") AND kind=? AND status<>'voided' AND period_from<=? AND period_to>=? ORDER BY id",[companyId,...p.employee_ids,p.kind,p.period.to,p.period.from]);
  const rows=people.map(person=>{
   const profile=json(person.profile),matches=existing.filter(row=>row.employee_id===person.id),base={employee_id:person.id,code:profile.code,name:profile.name,person:{...person,profile},existing:matches};
   if(matches.length)return {...base,status:'exists'};
   if(!profile.active)return {...base,status:'inactive'};
   if(profile.batch_excluded)return {...base,status:'excluded'};
   if((profile.agreement_code||payrollAgreement.code)!==agreement.code)return {...base,status:'agreement_changed'};
   const from=[p.period.from,year.start_date,profile.employment_start].sort().at(-1),to=[p.period.to,year.end_date,...(profile.employment_end?[profile.employment_end]:[])].sort()[0];
   if(from>to)return {...base,status:'outside_period'};
   const input=emptyPayrollInput(profile,p.year,p.month,p.kind);input.period_from=from;input.period_to=to;
   if(from!==p.period.from||to!==p.period.to){const days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;input.units=profile.salary_unit==='daily'?days:Math.min(days,30);input.special_case=true;}
   const normalized=normalizePayrollInput(input),calculation=calculatePayroll(profile,normalized,issuer);
   return {...base,status:'create',input:normalized,calculation,issues:calculation.issues.filter(code=>code!=='PAYROLL_REVIEW_REQUIRED')};
  });
  return {parameters:p,exercise:year,employer:issuer,rows,hash:hash({parameters:p,exercise:year,employer:issuer,people:people.map(row=>({...row,profile:json(row.profile)})),existing})};
 }
 function preview(result){const summary={create:0,exists:0,omitted:0,pending_review:0};const rows=result.rows.map(row=>{
  if(row.status==='create'){summary.create++;if(row.issues.length)summary.pending_review++;}else if(row.status==='exists')summary.exists++;else summary.omitted++;
  return {employee_id:row.employee_id,code:row.code,name:row.name,status:row.status,existing_ids:row.existing.map(slip=>slip.id),period_from:row.input?.period_from||null,period_to:row.input?.period_to||null,issues:row.issues||[],net_estimate:row.calculation&&!row.issues.length?row.calculation.totals.net:null};
 });return {year:result.parameters.year,month:result.parameters.month,kind:result.parameters.kind,rows,summary,hash:result.hash,ready:result.exercise.status==='open'&&summary.create>0};}
 function response(created,skipped,replayed=false){return {created,skipped,created_count:created.length,skipped_count:skipped.length,replayed};}
 return {
  preview:body=>withTransaction(pool,async db=>preview(await plan(db,body))),
  create:body=>withTransaction(pool,async db=>{
   if(typeof body?.request_id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.request_id)||typeof body.preview_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.preview_hash))fail('INVALID_PAYROLL_BATCH');
   await lockCompany(db,companyId);const result=await plan(db,body),requestId=body.request_id.toLowerCase(),owned=[];
   for(const row of result.rows){const previous=row.existing.find(slip=>slip.request_id===childRequest(companyId,requestId,result.parameters,row.employee_id));if(previous)owned.push({id:previous.id,employee_id:row.employee_id,code:row.code,name:row.name});}
   const skipped=result.rows.filter(row=>row.status!=='create').map(row=>({employee_id:row.employee_id,code:row.code,status:row.status,existing_ids:row.existing.map(slip=>slip.id)}));
   if(owned.length&&!result.rows.some(row=>row.status==='create'))return response(owned,skipped.filter(row=>!owned.some(item=>item.employee_id===row.employee_id)),true);
   if(result.exercise.status!=='open')fail('EXERCISE_CLOSED');if(result.hash!==body.preview_hash)fail('PAYROLL_BATCH_CHANGED',409);
   const candidates=result.rows.filter(row=>row.status==='create');if(!candidates.length)fail('PAYROLL_BATCH_EMPTY');const created=[];
   for(const row of candidates){const person=row.person,input=row.input,[saved]=await db.execute('INSERT INTO payroll_slips(company_id,exercise_id,employee_id,request_id,period_from,period_to,kind,input,employee_snapshot,employer_snapshot,calculation) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[companyId,result.parameters.exercise_id,person.id,childRequest(companyId,requestId,result.parameters,person.id),input.period_from,input.period_to,input.kind,JSON.stringify(input),JSON.stringify({profile:person.profile,version:person.version}),JSON.stringify(result.employer),JSON.stringify(row.calculation)]);created.push({id:saved.insertId,employee_id:person.id,code:row.code,name:row.name});}
   return response(created,skipped);
  }),
 };
}
