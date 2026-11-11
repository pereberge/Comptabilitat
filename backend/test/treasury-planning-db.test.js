import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import mysql from 'mysql2/promise';
import {config} from '../src/config.js';import {createCompanyService} from '../src/services/companies.js';import {createAccountingService} from '../src/services/accounting.js';
import {createInvoiceService} from '../src/services/invoices.js';import {createPortfolioService} from '../src/services/portfolio.js';import {createTreasuryPlanningService} from '../src/services/treasury-planning.js';
import {readTreasuryForecast} from '../src/services/treasury-forecast.js';import {createDataBackupService} from '../src/services/data-backup.js';import {createInvoiceDeletionService} from '../src/services/invoice-deletion.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {createApp} from '../src/app.js';import {companyScope} from '../src/middleware/company-scope.js';import {accessControl} from '../src/middleware/access.js';
const error=code=>cause=>cause.code===code;
test('MySQL treasury planning preserves accounting, avoids duplicate invoice forecasts and restores company links',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[];let server;
 try{
  async function company(name='Treasury '+randomUUID()){const row=await createCompanyService(pool).createCompany({name,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(row.id);const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[row.id]);return {...row,year:year.id};}
  const source=await company(),foreign=await company(),accounting=createAccountingService(pool,source.id),planning=createTreasuryPlanningService(pool,source.id,'test-reviewer');
  const bank=await accounting.createAccount({code:'5720.0001',description:'Main bank'}),second=await accounting.createAccount({code:'5720.0002',description:'Second bank'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'});
  const foreignBank=await createAccountingService(pool,foreign.id).createAccount({code:'5720.0001',description:'Foreign bank'});
  await accounting.createEntry({exercise_id:source.year,entry_date:'2026-11-01',description:'Opening funds',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'1000.00',credit:'0.00'},{account_id:capital.id,description:'Capital',debit:'0.00',credit:'1000.00'}]});
  const bill=await createInvoiceService(pool,source.id).create({exercise_id:source.year,direction:'received',reference:'TREASURY-001',invoice_date:'2026-11-01',party:{name:'Treasury supplier'},payment_method:'transfer',lines:[{description:'Service',base:'100.00',tax_rate:'0'}],receipts:[{due_date:'2026-11-20',amount:'100.00'}],request_id:randomUUID()});
  const receiptId=bill.receipts[0].id;await createPortfolioService(pool,source.id).settle(receiptId,{request_id:randomUUID(),exercise_id:source.year,payment_date:'2026-11-12',amount:'40.00',bank_account_id:bank.id,payment_method:'transfer'});
  const forecast=()=>readTreasuryForecast(pool,source.id,source.year,{asOf:'2026-11-09'}),count=async table=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[source.id]))[0][0].n;
  const journals=await count('journal_entries'),payments=await count('portfolio_settlements');let assigned,plan;
  const draft=(extra={})=>({direction:'received',description:'Expected service',expected_date:'2026-11-21',amount:'100.00',bank_account_id:second.id,request_id:randomUUID(),...extra});
  await t.test('bank assignments are scoped, versioned, idempotent and do not change due dates or accounting',async()=>{
   const body={bank_account_id:bank.id,version:0,request_id:randomUUID()};assigned=await planning.assign(receiptId,body);assert.equal((await planning.assign(receiptId,body)).replayed,true);
   await assert.rejects(planning.assign(receiptId,{...body,request_id:randomUUID()}),error('TREASURY_CHANGED'));
   await assert.rejects(planning.assign(receiptId,{bank_account_id:foreignBank.id,version:assigned.version,request_id:randomUUID()}),error('ACCOUNT_NOT_FOUND'));
   await assert.rejects(createTreasuryPlanningService(pool,foreign.id).assign(receiptId,body),error('RECEIPT_NOT_FOUND'));
   const data=await forecast();assert.equal(data.horizons[0].projected_balance,'900.00');assert.equal(data.accounts.find(row=>row.account_id===bank.id).horizons[0].projected_balance,'900.00');assert.equal(data.unassigned_receipts,0);assert.equal(data.receipts[0].due_date,'2026-11-20');
  });
  await t.test('manual plans are separate from journals and partial invoice linking replaces rather than adds them',async()=>{
   const body=draft();plan=await planning.save(null,body);assert.equal((await planning.save(null,body)).id,plan.id);assert.equal(await count('treasury_plans'),1);
   assert.equal((await forecast()).horizons[0].projected_balance,'800.00');
   await assert.rejects(planning.save(null,draft({bank_account_id:foreignBank.id})),error('ACCOUNT_NOT_FOUND'));
   await assert.rejects(planning.save(plan.id,{...draft(),version:0}),error('TREASURY_CHANGED'));
   const link={receipt_id:receiptId,version:plan.version,request_id:randomUUID()};plan=await planning.link(plan.id,link);assert.equal((await planning.link(plan.id,link)).replayed,true);
   const data=await forecast();assert.equal(data.horizons[0].projected_balance,'900.00');assert.equal(data.horizons[0].payments,'60.00');assert.equal(data.horizons[0].known_bank_net,'-40.00');assert.equal(data.events.filter(row=>row.source==='plan').length,0);
   await assert.rejects(planning.save(plan.id,{...draft(),version:plan.version}),error('TREASURY_PLAN_CLOSED'));
  });
  await t.test('links reject wrong directions, amounts, companies and duplicate receipt replacements',async()=>{
   const mismatch=await planning.save(null,draft({amount:'99.00'}));await assert.rejects(planning.link(mismatch.id,{version:1,receipt_id:receiptId,request_id:randomUUID()}),error('TREASURY_LINK_MISMATCH'));await planning.cancel(mismatch.id,{version:1,request_id:randomUUID()});
   const other=await planning.save(null,draft());await assert.rejects(planning.link(other.id,{version:1,receipt_id:receiptId,request_id:randomUUID()}),error('TREASURY_LINK_EXISTS'));await assert.rejects(createTreasuryPlanningService(pool,foreign.id).cancel(other.id,{version:1,request_id:randomUUID()}),error('TREASURY_PLAN_NOT_FOUND'));await planning.cancel(other.id,{version:1,request_id:randomUUID()});
   const opposite=await planning.save(null,draft({direction:'issued'}));await assert.rejects(planning.link(opposite.id,{version:1,receipt_id:receiptId,request_id:randomUUID()}),error('TREASURY_LINK_MISMATCH'));await planning.cancel(opposite.id,{version:1,request_id:randomUUID()});
  });
  await t.test('audit failure rolls back a plan and a retry creates only one record',async()=>{
   const before=await count('treasury_plans'),body=draft({description:'Rollback test',amount:'25.00'});
   const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('INSERT INTO management_audit_events'))throw Error('Audit rollback');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   await assert.rejects(createTreasuryPlanningService(failing,source.id).save(null,body),/Audit rollback/);assert.equal(await count('treasury_plans'),before);
   let result=await planning.save(null,body);assert.equal(await count('treasury_plans'),before+1);
   result=await planning.save(result.id,{...draft({amount:'30.00',description:'Edited forecast',expected_date:'2026-12-05'}),version:result.version});assert.equal(result.amount,'30.00');assert.equal(result.expected_date,'2026-12-05');await planning.cancel(result.id,{version:result.version,request_id:randomUUID()});
  });
  await t.test('HTTP writes require accounting permission and company membership',async()=>{
   let user={role:'user',key:'reviewer',permissions:{},company_ids:[source.id]};const access=accessControl({current:async()=>user});
   server=createApp({},null,companyScope(pool,source.id,{automaticBackups:{forCompany:()=>({})}}),access).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const post=(companyId,body)=>fetch('http://127.0.0.1:'+server.address().port+'/api/portfolio/forecast-plans',{method:'POST',headers:{'Content-Type':'application/json','X-Company-Id':String(companyId)},body:JSON.stringify(body)});
   assert.equal((await post(source.id,draft())).status,403);user.permissions.accounting_write=true;assert.equal((await post(foreign.id,draft())).status,403);
   const response=await post(source.id,draft({amount:'10.00'}));assert.equal(response.status,201);const result=await response.json();await planning.cancel(result.id,{version:result.version,request_id:randomUUID()});
  });
  await t.test('company backup restores forecast bank and receipt links in another company',async()=>{
   const exported=await createDataBackupService(pool,source.id).export('all'),target=await company(source.name),restore=createDataBackupService(pool,target.id);
   assert.equal(exported.data.tables.treasury_receipt_accounts.length,1);assert.equal(exported.data.tables.treasury_plans.find(row=>row.id===plan.id).status,'linked');
   const preview=await restore.preview(exported.file,'all');assert.equal(preview.ready,true,JSON.stringify(preview.blockers));await restore.restore({token:preview.token,request_id:randomUUID(),confirm:true});
   const [[copied]]=await pool.execute("SELECT p.id AS plan_id,p.linked_receipt_id,a.receipt_id,a.bank_account_id FROM treasury_plans p JOIN treasury_receipt_accounts a ON a.company_id=p.company_id AND a.receipt_id=p.linked_receipt_id WHERE p.company_id=? AND p.status='linked'",[target.id]);assert.equal(copied.receipt_id,copied.linked_receipt_id);assert.notEqual(copied.receipt_id,receiptId);assert.notEqual(copied.bank_account_id,bank.id);
   const [[audit]]=await pool.execute("SELECT entity_id,after_data FROM management_audit_events WHERE company_id=? AND entity_type='treasury_plan' AND action='link'",[target.id]);const after=typeof audit.after_data==='string'?JSON.parse(audit.after_data):audit.after_data;assert.equal(audit.entity_id,copied.plan_id);assert.equal(after.id,copied.plan_id);assert.equal(after.linked_receipt_id,copied.receipt_id);
   const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[target.id]);assert.equal((await readTreasuryForecast(pool,target.id,year.id,{asOf:'2026-11-09'})).horizons[0].projected_balance,'900.00');
  });
  await t.test('linked forecasts protect invoice deletion and can be detached without restoring a duplicate plan',async()=>{
   const preview=await createInvoiceDeletionService(pool,source.id).preview(bill.id);assert.ok(preview.blockers.some(row=>row.code==='treasury_plan'));
   assert.ok(preview.blockers.some(row=>row.code==='treasury_assignment'));const clearing=await createExerciseClearService(pool,source.id).preview(source.year);assert.ok(clearing.blockers.some(row=>row.code==='treasury_plan'));assert.ok(clearing.blockers.some(row=>row.code==='treasury_assignment'));
   plan=await planning.cancel(plan.id,{version:plan.version,request_id:randomUUID()});assert.equal(plan.linked_receipt_id,null);assert.equal(plan.status,'cancelled');assert.equal((await forecast()).horizons[0].projected_balance,'900.00');
   assert.equal(await count('journal_entries'),journals);assert.equal(await count('portfolio_settlements'),payments);assert.ok(await count('management_audit_events')>0);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){for(const table of ['treasury_plans','treasury_receipt_accounts','management_audit_events','management_requests','data_restores','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE id=?',[row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
