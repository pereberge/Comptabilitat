import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createPayrollService} from '../src/services/payroll.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup} from '../src/services/backup-format.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {emptyPayrollEmployee} from '../../shared/payroll.js';
test('MySQL payroll batches: preview, atomic creation, concurrent retry, exclusions, stale data and access',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 assert.equal(config.database.port,3330,'Batch fixtures require the disposable local database');
 const pool=mysql.createPool(config.database),context=createContextService(pool,1),ids=[];let server;
 try{
  for(const label of ['Batch factory','Batch other']){const company=await context.createCompany({name:label+' '+randomUUID().slice(0,8),tax_id:'B12345674',payroll_agreement:'99000275011981',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);}
  const [companyId,otherId]=ids,year=(await context.getContext(companyId)).exercises[0],payroll=createPayrollService(pool,companyId),foreign=createPayrollService(pool,otherId);
  await payroll.saveSettings({version:0,payload:{contribution_account:'28123456789',notes:''}});
  const base={...emptyPayrollEmployee(),name:'Batch worker',tax_id:'12345678Z',ss_number:'281234567890',job_title:'Administration',employment_start:'2020-01-01',salary_unit:'monthly',contribution_group:'7',base_salary:'1800.00',extra_annual:'7200.00',attendance_rate:'0.00',irpf_rate:'12.00',accident_rate:'1.50',agreement_reviewed:true};
  const people=[];for(const [code,extra]of [['A',{}],['B',{}],['PART',{employment_start:'2026-10-15'}],['INACTIVE',{active:false}],['HOLD',{batch_excluded:true}],['FUTURE',{employment_start:'2027-01-01'}]])people.push(await payroll.saveEmployee({profile:{...base,code,name:'Batch '+code,...extra}}));
  const other=await foreign.saveEmployee({profile:{...base,code:'FOREIGN'}}),parameters={exercise_id:year.id,year:2026,month:10,kind:'monthly',employee_ids:people.map(row=>row.id)};
  const old=await payroll.newSlip(people[0].id,2026,10),existing=await payroll.save({employee_id:people[0].id,employee_version:people[0].version,exercise_id:year.id,request_id:randomUUID(),input:old.input});
  let preview,body,created;
  await t.test('preview excludes existing, inactive, held and future workers and clips a partial hire',async()=>{
   preview=await payroll.batchPreview(parameters);assert.deepEqual(preview.summary,{create:2,exists:1,omitted:3,pending_review:1});assert.equal(preview.ready,true);assert.equal((await payroll.batchPreview(parameters)).hash,preview.hash);
   const partial=preview.rows.find(row=>row.code==='PART');assert.equal(partial.period_from,'2026-10-15');assert.equal(partial.period_to,'2026-10-31');assert.ok(partial.issues.includes('PAYROLL_AUTOMATIC_SCOPE'));assert.equal(partial.net_estimate,null);
   assert.equal(preview.rows.find(row=>row.code==='HOLD').status,'excluded');assert.equal((await payroll.list({exercise_id:year.id})).length,1);
   await assert.rejects(payroll.batchPreview({...parameters,employee_ids:[other.id]}),{code:'PAYROLL_EMPLOYEE_NOT_FOUND'});await assert.rejects(payroll.batchPreview({...parameters,employee_ids:[people[0].id,people[0].id]}),{code:'INVALID_PAYROLL_BATCH'});await assert.rejects(payroll.batchPreview({...parameters,year:2027}),{code:'DATE_OUTSIDE_EXERCISE'});
  });
  await t.test('changed employee conditions invalidate the reviewed group before any writes',async()=>{
   people[1]=await payroll.saveEmployee({profile:{...people[1].profile,base_salary:'1900.00',extra_annual:'7600.00'},version:people[1].version},people[1].id);
   await assert.rejects(payroll.batchCreate({...parameters,request_id:randomUUID(),preview_hash:preview.hash}),{code:'PAYROLL_BATCH_CHANGED'});assert.equal((await payroll.list({exercise_id:year.id})).length,1);preview=await payroll.batchPreview(parameters);
  });
  await t.test('a failure on the second insert rolls back the complete group',async()=>{
   let inserts=0;const failing={getConnection:async()=>{const db=await pool.getConnection();return {beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release(),execute:async(sql,args)=>{if(sql.startsWith('INSERT INTO payroll_slips')&&++inserts===2)throw Object.assign(new Error('Injected batch failure'),{code:'TEST_BATCH_FAILURE'});return db.execute(sql,args);}};}};
   await assert.rejects(createPayrollService(failing,companyId).batchCreate({...parameters,request_id:randomUUID(),preview_hash:preview.hash}),{code:'TEST_BATCH_FAILURE'});assert.equal((await payroll.list({exercise_id:year.id})).length,1);
  });
  await t.test('concurrent retries return the same drafts and never post a journal',async()=>{
   body={...parameters,request_id:randomUUID(),preview_hash:preview.hash};const results=await Promise.all([payroll.batchCreate(body),payroll.batchCreate(body)]);assert.deepEqual(results.map(row=>row.replayed).sort(),[false,true]);created=results[0];assert.equal(created.created_count,2);assert.equal(created.skipped_count,4);assert.deepEqual(results[0].created.map(row=>row.id),results[1].created.map(row=>row.id));
   const rows=await payroll.list({exercise_id:year.id});assert.equal(rows.length,3);assert.ok(rows.every(row=>row.status==='draft'&&!row.entry_id));assert.equal((await payroll.get(existing.id)).version,existing.version);
   const partial=await payroll.get(created.created.find(row=>row.code==='PART').id);assert.equal(partial.input.units,17);assert.equal(partial.input.confirmed,false);
   const [[journal]]=await pool.execute('SELECT COUNT(*) AS total FROM journal_entries WHERE company_id=?',[companyId]);assert.equal(journal.total,0);
   await assert.rejects(payroll.batchCreate({...body,request_id:randomUUID()}),{code:'PAYROLL_BATCH_CHANGED'});
   const next=await payroll.batchPreview(parameters);assert.equal(next.ready,false);assert.equal(next.summary.exists,3);await assert.rejects(payroll.batchCreate({...parameters,request_id:randomUUID(),preview_hash:next.hash}),{code:'PAYROLL_BATCH_EMPTY'});
   const exported=readBackup((await createDataBackupService(pool,companyId).export('all')).file);assert.equal(exported.tables.payroll_slips.length,3);
  });
  await t.test('extra payments are separate from the ordinary month and closed years reject new groups',async()=>{
   const extra={...parameters,kind:'extra',employee_ids:[people[0].id]},review=await payroll.batchPreview(extra);assert.equal(review.summary.create,1);await payroll.batchCreate({...extra,preview_hash:review.hash,request_id:randomUUID()});
   await pool.execute("UPDATE accounting_exercises SET status='closed',is_default=0 WHERE company_id=? AND id=?",[companyId,year.id]);const next={...parameters,month:11,employee_ids:[people[0].id]},closed=await payroll.batchPreview(next);assert.equal(closed.ready,false);await assert.rejects(payroll.batchCreate({...next,request_id:randomUUID(),preview_hash:closed.hash}),{code:'EXERCISE_CLOSED'});assert.equal((await payroll.batchCreate(body)).replayed,true);
   await pool.execute("UPDATE accounting_exercises SET status='open',is_default=1 WHERE company_id=? AND id=?",[companyId,year.id]);
  });
  await t.test('readers can preview only their company and cannot create a group',async()=>{
   const user={key:'batch-reader',role:'user',company_ids:[companyId],permissions:{accounting_write:false}};server=createApp(context,createAccountingService(pool,companyId),companyScope(pool,companyId),accessControl({current:async()=>user})).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const baseUrl='http://127.0.0.1:'+server.address().port,headers={'Content-Type':'application/json','X-Company-Id':String(companyId)};
   assert.equal((await fetch(baseUrl+'/api/payroll/batch/preview',{method:'POST',headers,body:JSON.stringify(parameters)})).status,200);assert.equal((await fetch(baseUrl+'/api/payroll/batch',{method:'POST',headers,body:JSON.stringify(body)})).status,403);assert.equal((await fetch(baseUrl+'/api/payroll/batch/preview',{method:'POST',headers:{...headers,'X-Company-Id':String(otherId)},body:JSON.stringify(parameters)})).status,403);
   const selected={exercise_id:year.id,slips:[{id:existing.id,version:existing.version}]};assert.equal((await fetch(baseUrl+'/api/payroll/batch/delete-preview',{method:'POST',headers,body:JSON.stringify(selected)})).status,200);assert.equal((await fetch(baseUrl+'/api/payroll/batch/delete',{method:'POST',headers,body:JSON.stringify(selected)})).status,403);
  });
  await t.test('group deletion checks versions, company, period and posted status before removing any draft',async()=>{
   const targets=created.created.map(row=>({id:row.id,version:1})),selection={exercise_id:year.id,slips:targets};const review=await payroll.batchDeletePreview(selection);assert.equal(review.ready,true);assert.equal(review.rows.length,2);
   await assert.rejects(payroll.batchDeletePreview({...selection,slips:[targets[0],targets[0]]}),{code:'INVALID_PAYROLL_DELETE_BATCH'});await assert.rejects(foreign.batchDeletePreview(selection),{code:'EXERCISE_NOT_FOUND'});
   const first=await payroll.get(targets[0].id),changed=await payroll.save({exercise_id:year.id,employee_id:first.employee_id,employee_version:first.employee_snapshot.version,version:first.version,input:{...first.input,notes:'Reviewed variable concept'}},first.id);
   await assert.rejects(payroll.batchDelete({...selection,preview_hash:review.hash}),{code:'PAYROLL_DELETE_BATCH_CHANGED'});assert.equal((await payroll.list({exercise_id:year.id})).length,4);selection.slips[0].version=changed.version;
   const original=await payroll.get(existing.id),saved=await payroll.save({exercise_id:year.id,employee_id:original.employee_id,employee_version:original.employee_snapshot.version,version:original.version,input:{...original.input,confirmed:true}},original.id);await payroll.prepareAccounts();const proposal=await payroll.postPreview(saved.id,{version:saved.version});assert.equal(proposal.ready,true);const posted=await payroll.post(saved.id,{version:saved.version,accounts:proposal.accounts,proposal_hash:proposal.hash,request_id:randomUUID()});
   await assert.rejects(payroll.batchDeletePreview({...selection,slips:[...selection.slips,{id:posted.id,version:posted.version}]}),{code:'PAYROLL_READ_ONLY'});assert.equal((await payroll.list({exercise_id:year.id})).length,4);
   await pool.execute("UPDATE accounting_exercises SET status='closed',is_default=0 WHERE company_id=? AND id=?",[companyId,year.id]);const closed=await payroll.batchDeletePreview(selection);assert.equal(closed.ready,false);await assert.rejects(payroll.batchDelete({...selection,preview_hash:closed.hash}),{code:'EXERCISE_CLOSED'});await pool.execute("UPDATE accounting_exercises SET status='open',is_default=1 WHERE company_id=? AND id=?",[companyId,year.id]);
   const final=await payroll.batchDeletePreview(selection);await assert.rejects(payroll.batchDelete({...selection,preview_hash:'0'.repeat(64)}),{code:'PAYROLL_DELETE_BATCH_CHANGED'});const removed=await payroll.batchDelete({...selection,preview_hash:final.hash});assert.equal(removed.deleted_count,2);assert.deepEqual(removed.deleted_ids.sort((a,b)=>a-b),targets.map(row=>row.id).sort((a,b)=>a-b));const remaining=await payroll.list({exercise_id:year.id});assert.equal(remaining.length,2);assert.ok(remaining.some(row=>row.id===posted.id&&row.status==='posted'));assert.ok(remaining.some(row=>row.kind==='extra'));assert.equal((await payroll.get(posted.id)).entry_id,posted.entry_id);
   assert.equal(readBackup((await createDataBackupService(pool,companyId).export('all')).file).tables.payroll_slips.length,2);
  });
 }finally{if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});for(const companyId of ids){for(const table of ['payroll_slips','payroll_employees','payroll_settings','journal_lines','journal_entries'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM accounts WHERE company_id=? ORDER BY CHAR_LENGTH(code) DESC,id DESC',[companyId]);for(const table of ['company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}await pool.end();}
});
