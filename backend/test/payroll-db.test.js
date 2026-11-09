import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createPayrollService} from '../src/services/payroll.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createContextService} from '../src/services/context.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {emptyPayrollEmployee,emptyPayrollInput} from '../../shared/payroll.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
test('MySQL payroll: employees, exact wages, protected ledger, reversals, backup and company permissions',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),db=await pool.getConnection();await db.beginTransaction();let server;
 const execute=db.execute.bind(db),scoped={execute,getConnection:async()=>({execute,query:async()=>[[]],beginTransaction:async()=>{},commit:async()=>{},rollback:async()=>{},release:()=>{}})};
 try{
  const [first]=await execute('INSERT INTO companies(name) VALUES (?)',['Payroll rollback factory']),companyId=first.insertId;
  const [second]=await execute('INSERT INTO companies(name) VALUES (?)',['Payroll rollback other']),otherId=second.insertId;
  for(const owner of [companyId,otherId])await execute('INSERT INTO company_details(company_id,tax_id,address,payroll_agreement) VALUES (?,?,?,?)',[owner,'B12345674','Test factory address','99000275011981']);
  const [year]=await execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'2026','2026-01-01','2026-12-31')",[companyId]),exerciseId=year.insertId;
  const payroll=createPayrollService(scoped,companyId,{render:async html=>Buffer.from('%PDF-1.7\n'+html)}),foreign=createPayrollService(scoped,otherId),accounting=createAccountingService(scoped,companyId);
  await payroll.saveSettings({version:0,payload:{contribution_account:'28123456789',notes:''}});
  let person,saved,posted,voided;
  await t.test('employee profiles are versioned and isolated, and new drafts inherit the reviewed conditions',async()=>{
   const profile={...emptyPayrollEmployee(),code:'T-001',name:'Payroll test worker',tax_id:'12345678Z',ss_number:'281234567890',job_title:'Administración',employment_start:'2020-01-01',salary_unit:'monthly',contribution_group:'7',base_salary:'1800.00',extra_annual:'7200.00',attendance_rate:'0.00',irpf_rate:'12.00',accident_rate:'1.50',agreement_reviewed:true};
   person=await payroll.saveEmployee({profile});assert.equal(person.version,1);assert.equal((await foreign.employees()).length,0);await assert.rejects(foreign.newSlip(person.id,2026,1),{code:'PAYROLL_EMPLOYEE_NOT_FOUND'});
   const draft=await payroll.newSlip(person.id,2026,1);assert.equal(draft.input.base_salary,'1800.00');assert.equal(draft.input.extra_annual,'7200.00');
   const request={employee_id:person.id,employee_version:person.version,exercise_id:exerciseId,request_id:randomUUID(),input:{...draft.input,confirmed:true}};
   saved=await payroll.save(request);assert.equal(saved.status,'draft');assert.equal(saved.calculation.totals.net,'1428.00');assert.equal(saved.calculation.ready,true);assert.equal((await payroll.save(request)).replayed,true);
   await assert.rejects(payroll.save({...request,input:{...request.input,advance:'1.00'}}),{code:'REQUEST_CONFLICT'});
   await assert.rejects(payroll.save({employee_id:person.id,employee_version:person.version,exercise_id:exerciseId,request_id:randomUUID(),input:{...draft.input,confirmed:true}}),{code:'PAYROLL_DUPLICATE'});
   await assert.rejects(payroll.saveEmployee({profile,version:0},person.id),{code:'PAYROLL_VERSION_CONFLICT'});
  });
  await t.test('proposals balance and post exactly once without an automatic bank movement',async()=>{
   await payroll.prepareAccounts();const plan=await payroll.postPreview(saved.id,{version:saved.version,accounts:{}});assert.equal(plan.ready,true);assert.equal(plan.totals.debit,'2571.60');assert.equal(plan.totals.credit,'2571.60');assert.ok(plan.lines.some(row=>row.code.startsWith('465')&&row.credit==='1428.00'));assert.ok(plan.lines.some(row=>row.code.startsWith('476')&&row.credit==='927.60'));
   const body={version:saved.version,accounts:plan.accounts,proposal_hash:plan.hash,request_id:randomUUID()};posted=await payroll.post(saved.id,body);assert.equal(posted.status,'posted');assert.ok(posted.entry_id);assert.equal((await payroll.post(saved.id,body)).replayed,true);await assert.rejects(payroll.post(saved.id,{...body,proposal_hash:'different'}),{code:'REQUEST_CONFLICT'});
   const [[bank]]=await execute("SELECT COUNT(*) AS total FROM journal_lines l JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id WHERE l.company_id=? AND l.entry_id=? AND a.code LIKE '57%'",[companyId,posted.entry_id]);assert.equal(bank.total,0);
   const entry=await accounting.getEntry(posted.entry_id);assert.equal(entry.editable,false);assert.equal(entry.edit_blocked_reason,'ENTRY_LINKED_DOCUMENT');await assert.rejects(payroll.remove(saved.id,{version:posted.version}),{code:'PAYROLL_READ_ONLY'});
  });
  await t.test('historical PDFs keep the original employee data and escape markup',async()=>{
   person=await payroll.saveEmployee({version:person.version,profile:{...person.profile,name:'<Changed employee>'}},person.id);
   await execute('UPDATE company_details SET payroll_agreement=? WHERE company_id=?',['99002415011982',companyId]);
   const model=await payroll.get(posted.id);assert.equal(model.employee_snapshot.profile.name,'Payroll test worker');assert.equal(model.employee_snapshot.profile.agreement_code,'99000275011981');const pdf=await payroll.pdf(posted.id);assert.ok(pdf.file.toString().includes('Payroll test worker'));assert.ok(!pdf.file.toString().includes('<Changed employee>'));
   await assert.rejects(payroll.newSlip(person.id,2026,2),{code:'PAYROLL_AGREEMENT_CHANGED'});
   await execute('UPDATE company_details SET payroll_agreement=? WHERE company_id=?',['99000275011981',companyId]);
  });
  await t.test('drafts cannot post after the employee or employer changed until reviewed again',async()=>{
   const draft=await payroll.newSlip(person.id,2026,2),row=await payroll.save({employee_id:person.id,employee_version:person.version,exercise_id:exerciseId,request_id:randomUUID(),input:{...draft.input,confirmed:true}});
   person=await payroll.saveEmployee({version:person.version,profile:{...person.profile,irpf_rate:'13.00'}},person.id);const plan=await payroll.postPreview(row.id,{version:row.version,accounts:{}});
   await assert.rejects(payroll.post(row.id,{version:row.version,accounts:plan.accounts,proposal_hash:plan.hash,request_id:randomUUID()}),{code:'PAYROLL_EMPLOYEE_CHANGED'});
   const refreshed=await payroll.save({employee_id:person.id,employee_version:person.version,exercise_id:exerciseId,version:row.version,input:{...row.input,irpf_rate:'13.00'}},row.id);assert.equal(refreshed.calculation.totals.net,'1410.00');
   await execute('UPDATE company_details SET address=? WHERE company_id=?',['Changed factory address',companyId]);const changedPlan=await payroll.postPreview(row.id,{version:refreshed.version,accounts:{}});
   await assert.rejects(payroll.post(row.id,{version:refreshed.version,accounts:changedPlan.accounts,proposal_hash:changedPlan.hash,request_id:randomUUID()}),{code:'PAYROLL_EMPLOYER_CHANGED'});
   await execute('UPDATE company_details SET address=? WHERE company_id=?',['Test factory address',companyId]);
  });
  await t.test('reversal retains the payslip and cancels the original wage expense exactly',async()=>{
   const body={version:posted.version,date:'2026-01-31',reason:'Test correction',request_id:randomUUID()};voided=await payroll.void(posted.id,body);assert.equal(voided.status,'voided');assert.ok(voided.reversal_entry_id);assert.equal((await payroll.void(posted.id,body)).replayed,true);
   const [[sum]]=await execute('SELECT SUM(debit-credit) AS balance FROM journal_lines WHERE company_id=? AND entry_id IN (?,?)',[companyId,posted.entry_id,voided.reversal_entry_id]);assert.equal(sum.balance,'0.00');
   const original=(await accounting.getEntry(posted.entry_id)).lines,reverse=(await accounting.getEntry(voided.reversal_entry_id)).lines;assert.deepEqual(reverse.map(row=>[row.account_id,row.debit,row.credit]),original.map(row=>[row.account_id,row.credit,row.debit]));
   const draft=await payroll.newSlip(person.id,2026,1);const replacement=await payroll.save({employee_id:person.id,employee_version:person.version,exercise_id:exerciseId,request_id:randomUUID(),input:draft.input});assert.notEqual(replacement.id,voided.id);
  });
  await t.test('portable backups preserve employee snapshots, totals and linked journals with remapped IDs',async()=>{
   const backup=await createDataBackupService(scoped,companyId).export('all'),parsed=readBackup(backup.file);assert.equal(parsed.tables.payroll_settings.length,1);assert.equal(parsed.tables.payroll_employees.length,1);assert.equal(parsed.tables.payroll_slips.length,3);assert.ok(!parsed.schema.payroll_slips.includes('active_key'));
   const restore=createDataBackupService(scoped,otherId),preview=await restore.preview(backup.file,'all');assert.equal(preview.ready,true);const result=await restore.restore({token:preview.token,confirm:true,request_id:randomUUID()});assert.equal(result.counts.payroll_slips,3);const rows=await foreign.list({exercise_id:result.exercise_ids[0]}),restored=rows.find(row=>row.status==='voided');assert.equal(restored.employee_snapshot.profile.name,'Payroll test worker');assert.equal(restored.calculation.totals.net,'1428.00');assert.ok(restored.entry_id!==posted.entry_id);
   const legacy=structuredClone(parsed);delete legacy.checksum;for(const section of ['schema','tables','references'])for(const table of ['payroll_settings','payroll_employees','payroll_slips'])delete legacy[section][table];assert.equal(readBackup(packBackup(sealBackup(legacy))).tables.payroll_slips.length,0);
  });
  await t.test('HTTP readers can consult but cannot change workers or post wages',async()=>{
   const user={key:'payroll-test',role:'user',company_ids:[companyId],permissions:{accounting_write:false}};
   server=createApp(createContextService(scoped,companyId),accounting,companyScope(scoped,companyId),accessControl({current:async()=>user})).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port,headers={'Content-Type':'application/json','X-Company-Id':String(companyId)};
   assert.equal((await fetch(base+'/api/payroll/employees',{headers})).status,200);assert.equal((await fetch(base+'/api/payroll/employees',{headers:{...headers,'X-Company-Id':String(otherId)}})).status,403);assert.equal((await fetch(base+'/api/payroll/employees',{method:'POST',headers,body:'{}'})).status,403);assert.equal((await fetch(base+'/api/payroll/slips/'+posted.id+'/post',{method:'POST',headers,body:'{}'})).status,403);
   await execute("UPDATE company_details SET payroll_agreement='' WHERE company_id=?",[companyId]);const disabled=await fetch(base+'/api/payroll/employees',{headers});assert.equal(disabled.status,403);assert.equal((await disabled.json()).error.code,'PAYROLL_NOT_ENABLED');assert.equal((await payroll.employees()).length,1);
   await execute('UPDATE company_details SET payroll_agreement=? WHERE company_id=?',['99000275011981',companyId]);
  });
  await t.test('clearing an exercise archives payslips before the journal and retains worker profiles',async()=>{
   const clear=createExerciseClearService(scoped,companyId),preview=await clear.preview(exerciseId);assert.equal(preview.counts.payroll_slips,3);const result=await clear.clear(exerciseId,{preview_hash:preview.preview_hash,confirmation:'96',request_id:randomUUID()});assert.equal(result.counts.payroll_slips,3);assert.equal((await payroll.list({exercise_id:exerciseId})).length,0);assert.equal((await payroll.employees()).length,1);const archive=await clear.backup(result.clear_id);let total=0;for await(const row of archive.rows())if(row.table==='payroll_slips')total++;assert.equal(total,3);
  });
  await t.test('documented contracts and unknown work percentages and annual extras survive storage and backup',async()=>{
   person=await payroll.saveEmployee({version:person.version,profile:{...person.profile,contract_code:'200',work_percent:null,extra_annual:null,unemployment:'excluded',agreement_reviewed:false,notes:'Imported source conditions; monthly totals pending review.'}},person.id);
   assert.equal(person.profile.work_percent,null);assert.equal(person.profile.extra_annual,null);assert.equal(person.profile.contract_code,'200');
   const next=await payroll.newSlip(person.id,2026,10);assert.equal(next.input.extra_annual,'0.00');const preview=await payroll.preview({employee_id:person.id,input:next.input});assert.equal(preview.calculation.ready,false);
   const data=readBackup((await createDataBackupService(scoped,companyId).export('all')).file);assert.equal(data.tables.payroll_employees[0].profile.work_percent,null);assert.equal(data.tables.payroll_employees[0].profile.extra_annual,null);assert.equal(data.tables.payroll_employees[0].profile.notes,person.profile.notes);
  });
 }finally{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});await db.rollback();db.release();await pool.end();}
});
