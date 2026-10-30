import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createIntegrationReceptionService,createImportedInvoiceService} from '../src/integrations/received-invoices.js';
import {integrationRouter} from '../src/integrations/router.js';
import {createApp} from '../src/app.js';
import {sample} from '../test-support/integrations/invoice.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
const rejects=code=>error=>error.code===code;
test('MySQL integration: reception, concurrent replay, conflicts, suppliers, posting, authorization and rollback',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],requestIds=[],client={clientId:'gestio-test-'+randomUUID(),sourceSystem:'gestio',scopes:['invoices:received:write']},reception=createIntegrationReceptionService(pool);let server;
 try{
  for(let n=0;n<2;n++){const company=await createCompanyService(pool).createCompany({name:'Integration test '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);}
  const [company,foreign]=ids;
  await reception.linkCompany({...client,externalCompanyId:'piensos-arb',companyId:company});
  const imported=createImportedInvoiceService(pool,company),foreignImported=createImportedInvoiceService(pool,foreign);let invoice,expenseAccountId;
  await t.test('receive is transactional and repeated or concurrent operations have one identity and no journal',async()=>{
   const results=await Promise.all(Array.from({length:8},()=>reception.receive(client,sample(),randomUUID())));invoice=results[0];assert.ok(results.every(row=>row.id===invoice.id));assert.equal(results.filter(row=>!row.replayed).length,1);assert.equal(invoice.status,'pending');
   for(const table of ['trade_invoices','journal_entries','suppliers','accounts']){const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[company]);assert.equal(count.n,0);}
   const row=await imported.get(invoice.id);assert.equal(row.payload.documentExternalId,'DOC-456');assert.ok(row.issues.includes('SUPPLIER_REVIEW_REQUIRED'));assert.equal(row.can_post,true);
   await assert.rejects(reception.receive(client,{...sample(),description:'changed'},randomUUID()),rejects('INTEGRATION_IDEMPOTENCY_CONFLICT'));
   await assert.rejects(foreignImported.get(invoice.id),rejects('INTEGRATION_INVOICE_NOT_FOUND'));
  });
  await t.test('a distinct external ID with a fiscal duplicate is preserved and blocks posting until reviewed',async()=>{
   const other=await reception.receive(client,{...sample(),externalId:'DUP-1'},randomUUID());assert.equal(other.status,'issues');assert.equal(other.possibleDuplicate,true);assert.equal((await imported.get(invoice.id)).can_post,false);
   const row=await imported.get(other.id);await imported.cancel(other.id,{version:row.version},'master');assert.equal((await imported.get(invoice.id)).can_post,true);
  });
  await t.test('without a saved CIF, a slightly different account name is proposed and reused',async()=>{
   const {createAccountingService}=await import('../src/services/accounting.js');
   const account=await createAccountingService(pool,company).createAccount({code:'4000.0001',description:'Supplier, S.L.U.'});
   const row=await imported.get(invoice.id);assert.equal(row.form.party_account_id,account.id);assert.ok(!row.issues.includes('SUPPLIER_REVIEW_REQUIRED'));
  });
  await t.test('authorized explicit posting reuses the invoice service, and subsequent supplier imports reuse its NIF',async()=>{
   const row=await imported.get(invoice.id);await assert.rejects(imported.post(row.id,{version:row.version,form:row.form},'master'),rejects('INTEGRATION_EXPENSE_ACCOUNT_REQUIRED'));const [[before]]=await pool.execute('SELECT COUNT(*) AS n FROM journal_entries WHERE company_id=?',[company]);assert.equal(before.n,0);
   const {createAccountingService}=await import('../src/services/accounting.js');const expense=await createAccountingService(pool,company).createAccount({code:'6020.0001',description:'Compras de materiales'});expenseAccountId=expense.id;row.form.offset_account_id=expense.id;
   const posted=await imported.post(row.id,{version:row.version,form:row.form},'master');assert.ok(posted.id);assert.equal((await imported.get(row.id)).accounting_status,'posted');assert.equal((await imported.post(row.id,{version:row.version,form:row.form},'master')).id,posted.id);
   assert.equal((await reception.receive(client,sample(),randomUUID())).status,'posted');
   const next=sample();next.externalId='FAC-2';next.invoiceNumber='2026-126';next.supplier.name='Completely different commercial name';next.supplier.taxId='b-12345678';const received=await reception.receive(client,next,randomUUID());const known=await imported.get(received.id);assert.ok(known.form.party_account_id);assert.ok(!known.issues.includes('SUPPLIER_REVIEW_REQUIRED'));await imported.post(known.id,{version:known.version,form:{...known.form,offset_account_id:expenseAccountId}},'master');
   assert.equal(known.form.offset_account_id,expenseAccountId);assert.equal(known.expense_suggestion.account_id,expenseAccountId);assert.equal((await foreignImported.list()).total,0);
   const [[count]]=await pool.execute("SELECT COUNT(*) AS n FROM accounts WHERE company_id=? AND kind='subaccount' AND code LIKE '400%'",[company]);assert.equal(count.n,1);
  });
  await t.test('the program corrects expense accounts atomically and remembers only the user-selected account',async()=>{
   const {createAccountingService}=await import('../src/services/accounting.js');
   const replacement=await createAccountingService(pool,company).createAccount({code:'6220.0001',description:'Reparaciones elegidas por el usuario'});
   const original=await imported.get(invoice.id),[[before]]=await pool.execute('SELECT total_amount,entry_id FROM trade_invoices WHERE company_id=? AND id=?',[company,original.invoice_id]);
   const [[receiptsBefore]]=await pool.execute('SELECT COUNT(*) AS n,SUM(amount) AS amount FROM portfolio_receipts WHERE company_id=? AND invoice_id=?',[company,original.invoice_id]);
   await assert.rejects(foreignImported.changeExpense(original.id,{version:original.version,account_id:replacement.id},'master'),rejects('INTEGRATION_INVOICE_NOT_FOUND'));
   const saved=await imported.changeExpense(original.id,{version:original.version,account_id:replacement.id,remember:true},'master');assert.equal(saved.current_expense_account.account_id,replacement.id);assert.equal(saved.expense_suggestion.account_id,replacement.id);
   const [[after]]=await pool.execute('SELECT total_amount,entry_id,offset_account_id FROM trade_invoices WHERE company_id=? AND id=?',[company,original.invoice_id]);assert.equal(after.total_amount,before.total_amount);assert.equal(after.entry_id,before.entry_id);assert.equal(after.offset_account_id,replacement.id);
   const [[line]]=await pool.execute('SELECT COUNT(*) AS n FROM journal_lines WHERE company_id=? AND entry_id=? AND account_id=?',[company,before.entry_id,replacement.id]);assert.equal(line.n,1);
   const [[receiptsAfter]]=await pool.execute('SELECT COUNT(*) AS n,SUM(amount) AS amount FROM portfolio_receipts WHERE company_id=? AND invoice_id=?',[company,original.invoice_id]);assert.deepEqual(receiptsAfter,receiptsBefore);
   await assert.rejects(imported.changeExpense(original.id,{version:original.version,account_id:expenseAccountId},'master'),rejects('INTEGRATION_INVOICE_CHANGED'));
   const next={...sample(),externalId:'REMEMBERED',invoiceNumber:'REMEMBERED'};const received=await reception.receive(client,next,randomUUID());assert.equal((await imported.get(received.id)).form.offset_account_id,replacement.id);
   const [[audit]]=await pool.execute("SELECT detail FROM integration_events WHERE company_id=? AND action='expense_account_changed' ORDER BY id DESC LIMIT 1",[company]);assert.ok(audit.detail);
   const failing={execute:pool.execute.bind(pool),getConnection:async()=>{const db=await pool.getConnection();return {execute:(sql,args)=>{if(sql.startsWith('UPDATE trade_invoices SET offset_account_id'))throw new Error('Injected expense correction failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   await assert.rejects(createImportedInvoiceService(failing,company).changeExpense(original.id,{version:saved.version,account_id:expenseAccountId,remember:true},'master'),/Injected expense correction failure/);const preserved=await imported.get(original.id);assert.equal(preserved.current_expense_account.account_id,replacement.id);assert.equal(preserved.expense_suggestion.account_id,replacement.id);assert.equal(preserved.version,saved.version);
   const once=await imported.changeExpense(original.id,{version:saved.version,account_id:expenseAccountId,remember:false},'master');assert.equal(once.current_expense_account.account_id,expenseAccountId);assert.equal(once.expense_suggestion.account_id,replacement.id);
   await pool.execute("UPDATE accounting_exercises SET is_default=0,status='closed' WHERE company_id=? AND id=?",[company,once.exercise_id]);
   try{await assert.rejects(imported.changeExpense(original.id,{version:once.version,account_id:replacement.id},'master'),rejects('INTEGRATION_EXPENSE_CHANGE_BLOCKED'));}finally{await pool.execute("UPDATE accounting_exercises SET status='open',is_default=1 WHERE company_id=? AND id=?",[company,once.exercise_id]);}
  });
  await t.test('multiple VAT, exemptions and credit notes are retained with exact source totals',async()=>{
   const multiple=sample();multiple.externalId='VAT-2';multiple.invoiceNumber='VAT-2';multiple.taxBreakdown=[{taxRate:21,taxableBase:100,taxAmount:21},{taxRate:10,taxableBase:100,taxAmount:10},{taxType:'exempt',taxRate:0,taxableBase:100,taxAmount:0,exemptionReason:'Exento según emisor'}];multiple.total=331;
   const saved=await reception.receive(client,multiple,randomUUID()),row=await imported.get(saved.id);assert.equal(row.total_amount,'331.00');assert.equal(row.payload.taxBreakdown.length,3);await imported.post(row.id,{version:row.version,form:{...row.form,offset_account_id:expenseAccountId}},'master');
   const credit=sample();credit.externalId='CREDIT';credit.invoiceNumber='CREDIT';credit.invoiceType='credit_note';credit.rectification={reason:'Devolución',originalInvoiceNumber:'2026-125'};credit.taxBreakdown=[{taxRate:21,taxableBase:-100,taxAmount:-21}];credit.total=-121;const result=await reception.receive(client,credit,randomUUID());assert.equal(result.status,'issues');assert.equal((await imported.get(result.id)).can_post,false);
  });
  await t.test('failed transactions leave no partial reception and reject unauthorized companies or sources',async()=>{
   const failing={execute:pool.execute.bind(pool),getConnection:async()=>{const db=await pool.getConnection();return {execute:(sql,args)=>{if(sql.startsWith('INSERT INTO integration_events'))throw new Error('Injected failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   const body={...sample(),externalId:'ROLLBACK',invoiceNumber:'ROLLBACK'};await assert.rejects(createIntegrationReceptionService(failing).receive(client,body,randomUUID()));
   const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM integration_received_invoices WHERE company_id=? AND external_id=?',[company,'ROLLBACK']);assert.equal(count.n,0);
   await assert.rejects(reception.receive(client,{...sample(),companyExternalId:'foreign'},randomUUID()),rejects('INTEGRATION_COMPANY_FORBIDDEN'));
   await assert.rejects(reception.receive(client,{...sample(),sourceSystem:'spoofed'},randomUUID()),rejects('INTEGRATION_SOURCE_FORBIDDEN'));
   await reception.linkCompany({...client,externalCompanyId:'piensos-arb',companyId:company,enabled:false});await assert.rejects(reception.receive(client,sample(),randomUUID()),rejects('INTEGRATION_COMPANY_FORBIDDEN'));await reception.linkCompany({...client,externalCompanyId:'piensos-arb',companyId:company});
  });
  await t.test('HTTP integration ignores frontend sessions and company headers; logs safe response codes',async()=>{
   const token=randomBytes(32).toString('base64url'),credential={...client,enabled:true,tokenSha256:createHash('sha256').update(token).digest('hex')};
   const application=createApp({},{},()=>{throw new Error('Frontend scope must not be used');},{middleware:()=>{throw new Error('Frontend session must not be used');},router:(req,res,next)=>next()},{router:integrationRouter(pool,{clients:[credential],production:false})});
   server=application.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port+'/api/v1/integrations/invoices/received';
   const request=async(body,auth=token)=>{const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth,'X-Company-Id':String(foreign),Cookie:'accounting_session=not-used'},body:JSON.stringify(body)});requestIds.push(response.headers.get('x-request-id'));return response;};
   assert.equal((await request(sample(),'invalid')).status,401);assert.equal((await request({...sample(),companyExternalId:'not-authorized'})).status,403);
   const body={...sample(),externalId:'HTTP',invoiceNumber:'HTTP'};const response=await request(body);assert.equal(response.status,201);assert.equal((await response.json()).data.companyId,company);assert.equal((await request(body)).status,200);
   assert.equal((await request({...body,description:'different'})).status,409);assert.equal((await request({...body,total:1})).status,422);
   await new Promise(resolve=>setTimeout(resolve,30));const [events]=await pool.execute('SELECT * FROM integration_events WHERE client_id=?',[client.clientId]);assert.ok(events.some(event=>event.http_status===403));assert.ok(!JSON.stringify(events).includes(token));
  });
  await t.test('existing accounting backups preserve pending receptions, original references and posted links',async()=>{
   const source=await createCompanyService(pool).getCompany(company),target=await createCompanyService(pool).createCompany({name:source.name,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(target.id);
   const copy=await createDataBackupService(pool,company).export('all'),data=readBackup(copy.file);assert.ok(data.tables.integration_received_invoices.length>=5);
   const changed=structuredClone(data);changed.tables.integration_received_invoices[0].payload.description='Tampered';const {checksum,...unsigned}=changed;assert.throws(()=>readBackup(packBackup(sealBackup(unsigned))),rejects('BACKUP_CHECKSUM'));
   const restore=createDataBackupService(pool,target.id),preview=await restore.preview(copy.file,'all');assert.equal(preview.ready,true,JSON.stringify(preview.blockers));await restore.restore({confirm:true,token:preview.token,request_id:randomUUID()});
   const rows=await createImportedInvoiceService(pool,target.id).list();assert.equal(rows.total,data.tables.integration_received_invoices.length);
   const restored=rows.rows.find(row=>row.external_id==='FAC-987');assert.equal(restored.accounting_status,'posted');assert.equal(restored.document_external_id,'DOC-456');
   const [[linked]]=await pool.execute('SELECT company_id FROM trade_invoices WHERE id=?',[restored.invoice_id]);assert.equal(linked.company_id,target.id);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const requestId of requestIds)await pool.execute('DELETE FROM integration_events WHERE request_id=?',[requestId]);
  await pool.execute('DELETE FROM integration_events WHERE client_id=?',[client.clientId]);
  for(const company of ids){for(const table of ['integration_events','integration_received_invoices','integration_company_links','supplier_expense_preferences','data_restores','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[company]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[company]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[company,account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[company]);}
  await pool.end();
 }
});
