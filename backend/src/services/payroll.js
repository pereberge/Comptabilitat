import {createHash} from 'node:crypto';
import {withTransaction} from '../db/transaction.js';
import {HttpError} from '../middleware/errors.js';
import {id,date,description} from './validation.js';
import {lockCompany,nextSubaccountCode} from './subaccounts.js';
import {ensureAccount} from './account-hierarchy.js';
import {postJournalEntry} from './accounting.js';
import {normalizePayrollEmployee,normalizePayrollSettings,normalizePayrollInput,calculatePayroll,emptyPayrollInput,payrollCanonical} from '../../../shared/payroll.js';
import {payrollAgreement,payrollAgreementFor,payrollReferencesFor} from '../../../shared/payroll-agreements.js';
import {cents,decimal} from '../../../shared/money.js';
import {renderInvoicePdf} from './invoice-pdf-renderer.js';
import {payrollHtml,payrollFilename} from './payroll-document.js';
import {createPayrollBatchService} from './payroll-batch.js';
import {createPayrollBatchDeleteService} from './payroll-batch-delete.js';
const json=value=>typeof value==='string'?JSON.parse(value):value;
const hash=value=>createHash('sha256').update(payrollCanonical(value)).digest('hex');
const fail=(code,status=400)=>{throw new HttpError(status,code);};
const request=value=>{if(typeof value!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))fail('INVALID_REQUEST');return value.toLowerCase();};
const version=value=>{if(!Number.isSafeInteger(value)||value<0)fail('INVALID_PAYROLL_INPUT');return value;};
const execute=async run=>{try{return await run();}catch(error){if(error instanceof HttpError)throw error;if(error.code==='ER_DUP_ENTRY')fail('PAYROLL_DUPLICATE',409);if(error.code?.startsWith('PAYROLL_')||error.code==='INVALID_PAYROLL_INPUT')fail(error.code);throw error;}};
const prefixes={wages:'640',social_expense:'642',net:'465',withholding:'4751',social_payable:'476',advance:'460'};
export function createPayrollService(pool,companyId,{render=renderInvoicePdf}={}){
 async function employee(db,employeeId,lock=false){const [[row]]=await db.execute('SELECT * FROM payroll_employees WHERE company_id=? AND id=?'+(lock?' FOR UPDATE':''),[companyId,id(employeeId)]);if(!row)fail('PAYROLL_EMPLOYEE_NOT_FOUND',404);return {...row,profile:json(row.profile)};}
 async function settings(db){const [[company]]=await db.execute('SELECT c.name,d.tax_id,d.address,d.postal_code,d.city,d.province,d.payroll_agreement FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);const [[row]]=await db.execute('SELECT payload,version FROM payroll_settings WHERE company_id=?',[companyId]);return {company,payload:row?json(row.payload):normalizePayrollSettings(),version:row?.version||0,agreement:payrollAgreementFor(company?.payroll_agreement),references:payrollReferencesFor(company?.payroll_agreement)};}
 async function enabled(db){const data=await settings(db);if(!data.agreement)fail('PAYROLL_NOT_ENABLED',403);return data.agreement;}
 const matchesAgreement=(profile,agreement)=>{if((profile.agreement_code||payrollAgreement.code)!==agreement.code)fail('PAYROLL_AGREEMENT_CHANGED',409);};
 async function employer(db){const data=await settings(db);return {...data.company,contribution_account:data.payload.contribution_account};}
 async function exercise(db,exerciseId){const [[row]]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,id(exerciseId)]);if(!row)fail('EXERCISE_NOT_FOUND',404);return row;}
 async function slip(db,slipId,lock=false){const [[row]]=await db.execute('SELECT * FROM payroll_slips WHERE company_id=? AND id=?'+(lock?' FOR UPDATE':''),[companyId,id(slipId)]);if(!row)fail('PAYROLL_NOT_FOUND',404);for(const key of ['input','employee_snapshot','employer_snapshot','calculation'])row[key]=json(row[key]);delete row.active_key;return {...row,exercise:await exercise(db,row.exercise_id)};}
 async function accountOptions(db){const [rows]=await db.execute("SELECT a.id,a.code,a.description,p.code AS parent_code FROM accounts a JOIN accounts p ON p.company_id=a.company_id AND p.id=a.parent_id WHERE a.company_id=? AND a.kind='subaccount' ORDER BY a.code",[companyId]);return rows;}
 async function proposal(db,row,selected={}){
  if(!selected||typeof selected!=='object'||Array.isArray(selected)||Object.keys(selected).some(key=>![...Object.keys(prefixes),'other'].includes(key)))fail('INVALID_PAYROLL_ACCOUNT');
  const accounts=await accountOptions(db),choices={},options={};
  for(const key of [...Object.keys(prefixes),'other']){
   const candidates=accounts.filter(account=>key==='other'?/^[1-5]/.test(account.parent_code)&&!account.parent_code.startsWith('57'):account.parent_code.startsWith(prefixes[key]));options[key]=candidates;
   if(selected[key]){choices[key]=candidates.find(account=>account.id===id(selected[key]));if(!choices[key])fail('INVALID_PAYROLL_ACCOUNT');}else choices[key]=candidates.length===1?candidates[0]:null;
  }
  const calc=calculatePayroll(row.employee_snapshot.profile,row.input,row.employer_snapshot),totals=calc.totals,lines=[],missing=[];
  const add=(key,debit,credit)=>{if(debit==='0.00'&&credit==='0.00')return;if(!choices[key])missing.push(key);const account=choices[key];lines.push({account_id:account?.id||null,code:account?.code||prefixes[key]||'Pendiente',description:account?.description||key,debit,credit});};
  add('wages',totals.gross,'0.00');add('social_expense',totals.employer_ss,'0.00');add('net','0.00',totals.net.startsWith('-')?'0.00':totals.net);add('withholding','0.00',totals.irpf);add('social_payable','0.00',decimal(cents(totals.employee_ss)+cents(totals.employer_ss)));add('advance','0.00',totals.advance);add('other','0.00',totals.other_deductions);
  const debit=lines.reduce((sum,line)=>sum+cents(line.debit),0n),credit=lines.reduce((sum,line)=>sum+cents(line.credit),0n),chosen=Object.fromEntries(Object.entries(choices).map(([key,value])=>[key,value?.id||null]));
  return {date:row.period_to,description:('Nómina '+(row.kind==='extra'?'extra · ':'')+row.employee_snapshot.profile.name+' · '+row.period_from.slice(0,7)).slice(0,200),lines,options,accounts:chosen,missing,totals:{debit:decimal(debit),credit:decimal(credit)},ready:row.status==='draft'&&row.exercise.status==='open'&&calc.ready&&!missing.length&&debit===credit,hash:hash({id:row.id,version:row.version,input:row.input,employee:row.employee_snapshot,employer:row.employer_snapshot,accounts:chosen,totals:calc.totals})};
 }
 async function get(db,slipId){const row=await slip(db,slipId);return {...row,proposal:await proposal(db,row)};}
 async function validatePeriod(db,exerciseId,profile,input){const year=await exercise(db,exerciseId);if(year.status!=='open')fail('EXERCISE_CLOSED');if(input.period_from<year.start_date||input.period_to>year.end_date)fail('DATE_OUTSIDE_EXERCISE');if(input.period_from<profile.employment_start||profile.employment_end&&input.period_to>profile.employment_end)fail('PAYROLL_EMPLOYMENT_DATES');return year;}
 const batches=createPayrollBatchService(pool,companyId,{employer,exercise,enabled});
 const batchDeletion=createPayrollBatchDeleteService(pool,companyId,{exercise,enabled});
 return {
  batchDeletePreview:body=>execute(()=>batchDeletion.preview(body)),
  batchDelete:body=>execute(()=>batchDeletion.remove(body)),
  batchPreview:body=>execute(()=>batches.preview(body)),
  batchCreate:body=>execute(()=>batches.create(body)),
  requireEnabled:()=>execute(()=>enabled(pool)),
  settings:()=>execute(()=>withTransaction(pool,db=>settings(db))),
  saveSettings:body=>execute(()=>withTransaction(pool,async db=>{await lockCompany(db,companyId);const current=await settings(db);if(current.version!==version(body?.version))fail('PAYROLL_VERSION_CONFLICT',409);const payload=normalizePayrollSettings(body.payload);await db.execute('INSERT INTO payroll_settings(company_id,payload) VALUES (?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),version=version+1',[companyId,JSON.stringify(payload)]);return settings(db);})),
  employees:()=>execute(async()=>{const [rows]=await pool.execute('SELECT * FROM payroll_employees WHERE company_id=? ORDER BY name,id LIMIT 2000',[companyId]);return rows.map(row=>({...row,profile:json(row.profile)}));}),
  saveEmployee:(body,employeeId=null)=>execute(()=>withTransaction(pool,async db=>{await lockCompany(db,companyId);const agreement=await enabled(db),profile=normalizePayrollEmployee(body?.profile);matchesAgreement(profile,agreement);profile.agreement=agreement.name;if(employeeId){const current=await employee(db,employeeId,true);if(current.version!==version(body.version))fail('PAYROLL_VERSION_CONFLICT',409);await db.execute('UPDATE payroll_employees SET code=?,name=?,profile=?,version=version+1 WHERE company_id=? AND id=?',[profile.code,profile.name,JSON.stringify(profile),companyId,current.id]);return employee(db,current.id);}const [result]=await db.execute('INSERT INTO payroll_employees(company_id,code,name,profile) VALUES (?,?,?,?)',[companyId,profile.code,profile.name,JSON.stringify(profile)]);return employee(db,result.insertId);})),
  newSlip:(employeeId,year,month,kind)=>execute(()=>withTransaction(pool,async db=>{const person=await employee(db,employeeId);matchesAgreement(person.profile,await enabled(db));return {employee:person,input:emptyPayrollInput(person.profile,year,month,kind),employer:await employer(db)};})),
  preview:body=>execute(()=>withTransaction(pool,async db=>{const person=await employee(db,body?.employee_id),input=normalizePayrollInput(body?.input);return {employee:person,employer:await employer(db),calculation:calculatePayroll(person.profile,input,await employer(db))};})),
  list:query=>execute(async()=>{await exercise(pool,query?.exercise_id);const [rows]=await pool.execute('SELECT id,employee_id,employee_snapshot,period_from,period_to,kind,status,calculation,entry_id,reversal_entry_id,version FROM payroll_slips WHERE company_id=? AND exercise_id=? ORDER BY period_to DESC,id DESC LIMIT 1000',[companyId,id(query.exercise_id)]);return rows.map(row=>({...row,employee_snapshot:json(row.employee_snapshot),calculation:json(row.calculation)}));}),
  get:slipId=>execute(()=>withTransaction(pool,db=>get(db,slipId))),
  save:(body,slipId=null)=>execute(()=>withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const input=normalizePayrollInput(body?.input);
   if(!slipId){const [[previous]]=await db.execute('SELECT id,employee_id,exercise_id,input FROM payroll_slips WHERE company_id=? AND request_id=?',[companyId,request(body?.request_id)]);if(previous){if(previous.employee_id!==id(body.employee_id)||previous.exercise_id!==id(body.exercise_id)||hash(json(previous.input))!==hash(input))fail('REQUEST_CONFLICT',409);return {...await get(db,previous.id),replayed:true};}}
   const person=await employee(db,body.employee_id,true);matchesAgreement(person.profile,await enabled(db));if(person.version!==version(body.employee_version))fail('PAYROLL_EMPLOYEE_CHANGED',409);
   let current=null;if(slipId){current=await slip(db,slipId,true);if(current.status!=='draft')fail('PAYROLL_READ_ONLY',409);if(current.version!==version(body.version))fail('PAYROLL_VERSION_CONFLICT',409);if(current.employee_id!==person.id||current.exercise_id!==id(body.exercise_id))fail('INVALID_PAYROLL_INPUT');}
   await validatePeriod(db,body.exercise_id,person.profile,input);
   const [[duplicate]]=await db.execute("SELECT id FROM payroll_slips WHERE company_id=? AND employee_id=? AND kind=? AND status<>'voided' AND period_from<=? AND period_to>=? AND id<>? LIMIT 1",[companyId,person.id,input.kind,input.period_to,input.period_from,current?.id||0]);if(duplicate)fail('PAYROLL_DUPLICATE',409);
   const employerSnapshot=await employer(db),employeeSnapshot={profile:person.profile,version:person.version},calculation=calculatePayroll(person.profile,input,employerSnapshot),values=[input.period_from,input.period_to,input.kind,JSON.stringify(input),JSON.stringify(employeeSnapshot),JSON.stringify(employerSnapshot),JSON.stringify(calculation)];
   if(current)await db.execute('UPDATE payroll_slips SET period_from=?,period_to=?,kind=?,input=?,employee_snapshot=?,employer_snapshot=?,calculation=?,version=version+1 WHERE company_id=? AND id=?',[...values,companyId,current.id]);
   else{const requestId=request(body.request_id),[[previous]]=await db.execute('SELECT id FROM payroll_slips WHERE company_id=? AND request_id=?',[companyId,requestId]);if(previous)fail('PAYROLL_DUPLICATE',409);const [result]=await db.execute('INSERT INTO payroll_slips(company_id,exercise_id,employee_id,request_id,period_from,period_to,kind,input,employee_snapshot,employer_snapshot,calculation) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[companyId,id(body.exercise_id),person.id,requestId,...values]);current={id:result.insertId};}
   return get(db,current.id);
  })),
  prepareAccounts:()=>execute(()=>withTransaction(pool,async db=>{const company=await lockCompany(db,companyId);for(const prefix of Object.values(prefixes)){const [[existing]]=await db.execute("SELECT a.id FROM accounts a JOIN accounts p ON p.company_id=a.company_id AND p.id=a.parent_id WHERE a.company_id=? AND a.kind='subaccount' AND p.code LIKE ? LIMIT 1",[companyId,prefix+'%']);if(existing)continue;const parent=await ensureAccount(db,companyId,prefix),code=await nextSubaccountCode(db,companyId,parent,company.subaccount_length);await db.execute("INSERT INTO accounts(company_id,code,description,kind,parent_id) VALUES (?,?,?,'subaccount',?)",[companyId,code,parent.description,parent.id]);}return accountOptions(db);})),
  postPreview:(slipId,body)=>execute(()=>withTransaction(pool,async db=>{const row=await slip(db,slipId);if(row.version!==version(body?.version))fail('PAYROLL_VERSION_CONFLICT',409);return proposal(db,row,body.accounts);})),
  post:(slipId,body)=>execute(()=>withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await slip(db,slipId,true),requestId=request(body?.request_id);if(row.status==='posted'&&row.post_request_id===requestId){if(body.proposal_hash!==row.post_hash)fail('REQUEST_CONFLICT',409);return {...await get(db,row.id),replayed:true};}if(row.status!=='draft')fail('PAYROLL_READ_ONLY',409);if(row.version!==version(body.version))fail('PAYROLL_VERSION_CONFLICT',409);
   const person=await employee(db,row.employee_id);if(person.version!==row.employee_snapshot.version)fail('PAYROLL_EMPLOYEE_CHANGED',409);if(hash(await employer(db))!==hash(row.employer_snapshot))fail('PAYROLL_EMPLOYER_CHANGED',409);
   if(hash(calculatePayroll(row.employee_snapshot.profile,row.input,row.employer_snapshot))!==hash(row.calculation))fail('PAYROLL_PROPOSAL_CHANGED',409);
   const plan=await proposal(db,row,body.accounts);if(!plan.ready)fail('PAYROLL_NOT_READY');if(body.proposal_hash!==plan.hash)fail('PAYROLL_PROPOSAL_CHANGED',409);
   const posted=await postJournalEntry(db,companyId,{exercise_id:row.exercise_id,entry_date:plan.date,description:plan.description,request_id:requestId,lines:plan.lines.map(line=>({account_id:line.account_id,description:line.description,debit:line.debit,credit:line.credit}))});
   await db.execute("UPDATE payroll_slips SET status='posted',entry_id=?,post_request_id=?,post_hash=?,version=version+1 WHERE company_id=? AND id=?",[posted.id,requestId,plan.hash,companyId,row.id]);return get(db,row.id);
  })),
  void:(slipId,body)=>execute(()=>withTransaction(pool,async db=>{await lockCompany(db,companyId);const row=await slip(db,slipId,true),requestId=request(body?.request_id);if(row.status==='voided'&&row.void_request_id===requestId)return {...await get(db,row.id),replayed:true};if(row.status!=='posted')fail('PAYROLL_READ_ONLY',409);if(row.version!==version(body.version))fail('PAYROLL_VERSION_CONFLICT',409);const voidDate=date(body.date),reason=description(body.reason);if(row.exercise.status!=='open')fail('EXERCISE_CLOSED');if(voidDate<row.period_to||voidDate>row.exercise.end_date)fail('DATE_OUTSIDE_EXERCISE');
   const [lines]=await db.execute('SELECT account_id,description,debit,credit FROM journal_lines WHERE company_id=? AND entry_id=? ORDER BY position',[companyId,row.entry_id]);const reversal=await postJournalEntry(db,companyId,{exercise_id:row.exercise_id,entry_date:voidDate,description:('Anulación nómina '+row.employee_snapshot.profile.name+' · '+reason).slice(0,200),request_id:requestId,lines:lines.map(line=>({...line,debit:line.credit,credit:line.debit}))});await db.execute("UPDATE payroll_slips SET status='voided',reversal_entry_id=?,void_request_id=?,void_reason=?,version=version+1 WHERE company_id=? AND id=?",[reversal.id,requestId,reason,companyId,row.id]);return get(db,row.id);})),
  remove:(slipId,body)=>execute(()=>withTransaction(pool,async db=>{await lockCompany(db,companyId);const row=await slip(db,slipId,true);if(row.status!=='draft')fail('PAYROLL_READ_ONLY',409);if(row.version!==version(body?.version))fail('PAYROLL_VERSION_CONFLICT',409);if(row.exercise.status!=='open')fail('EXERCISE_CLOSED');await db.execute('DELETE FROM payroll_slips WHERE company_id=? AND id=?',[companyId,row.id]);return {deleted:true};})),
  pdf:slipId=>execute(async()=>{const row=await withTransaction(pool,db=>slip(db,slipId));return {file:await render(payrollHtml(row)),filename:payrollFilename(row)};}),
 };
}
