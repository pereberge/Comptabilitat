import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createContextService} from '../src/services/context.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createPortfolioService} from '../src/services/portfolio.js';
import {createDocumentationService} from '../src/services/documentation.js';
import {createBankImportService} from '../src/services/bank-import.js';
import {createBankReconciliationService} from '../src/services/bank-reconciliations.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
const error=code=>cause=>cause.code===code;

test('MySQL reconciliation lookup and receipt shortcuts preserve company scope, exact pending amounts and atomic posting',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],companies=createCompanyService(pool);let server;
 const create=async()=>{const company=await companies.createCompany({name:'Movement lookup '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);return {...company,year:year.id};};
 const count=async(table,companyId)=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[companyId]))[0][0].n;
 try{
  const company=await create(),foreign=await create(),accounting=createAccountingService(pool,company.id),portfolio=createPortfolioService(pool,company.id),service=createBankReconciliationService(pool,company.id),docs=createDocumentationService(pool,company.id);
  const prior=await createExerciseService(pool,company.id).create({name:'2025',start_date:'2025-01-01',end_date:'2025-12-31'});
  const bank=await accounting.createAccount({code:'5720.0001',description:'Statement bank'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'});
  await accounting.createEntry({exercise_id:company.year,entry_date:'2026-01-01',description:'Opening',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'1000.00',credit:'0.00'},{account_id:capital.id,description:'Capital',debit:'0.00',credit:'1000.00'}]});
  async function invoice(owner,direction,total,year=owner.year,invoiceDate='2026-01-01'){
   return createInvoiceService(pool,owner.id).create({exercise_id:year,direction,reference:randomUUID(),invoice_date:invoiceDate,party:{name:direction==='issued'?'Customer':'Supplier'},request_id:randomUUID(),payment_method:'transfer',lines:[{description:'Test',base:total,tax_rate:'0'}],receipts:[{due_date:'2026-01-12',amount:total}]});
  }
  const older=await invoice(company,'received','150.00',prior.id,'2025-12-01'),payable=await invoice(company,'received','100.00'),receivable=await invoice(company,'issued','80.00'),wrongDirection=await invoice(company,'issued','100.00'),wrong=await invoice(company,'received','100.01'),foreignInvoice=await invoice(foreign,'received','100.00');
  await portfolio.settle(older.receipts[0].id,{request_id:randomUUID(),exercise_id:prior.id,payment_date:'2025-12-20',amount:'50.00',bank_account_id:bank.id,payment_method:'transfer'});
  const pdf=invoicePdf(company.name,'MATCH-ONLY'),document=await docs.upload(pdf,{title:'Pending PDF',description:'',folder:'pending_invoices',source_name:'lookup.pdf',source_mime:'application/pdf',request_id:randomUUID()});
  const imports=createBankImportService(pool,company.id),csv=Buffer.from('Fecha;Concepto;Importe;Saldo\n10/01/2026;Opening;1000,00;1000,00\n12/01/2026;Unrelated bank text;-100,00;900,00\n20/01/2026;Collection;80,00;980,00\n15/02/2026;Unrelated text;-19,76;960,24');
  const preview=await imports.preview(csv,company.year,'matches.csv','text/csv');await imports.analyze({token:preview.token,account_id:bank.id,replace_current:true});const saved=await imports.commit({token:preview.token});await imports.discard({token:preview.token});let report=await service.get(saved.id);
  const request=(movementId,receiptId)=>({version:report.version,movement_id:movementId,receipt_id:receiptId,request_id:randomUUID(),payment_method:'transfer',reference:'Statement movement',notes:''});
  await t.test('lookup uses outstanding cents and direction across exercises without changing records',async()=>{
   const before=await count('journal_entries',company.id),matches=await service.matches(report.id,2);
   assert.deepEqual(matches.receipts.map(row=>row.id).sort((a,b)=>a-b),[older.receipts[0].id,payable.receipts[0].id].sort((a,b)=>a-b));
   assert.equal(matches.receipts.find(row=>row.id===older.receipts[0].id).paid_amount,'50.00');assert.equal(matches.receipts.find(row=>row.id===older.receipts[0].id).exercise_id,prior.id);
   assert.deepEqual((await service.matches(report.id,3)).receipts.map(row=>row.id),[receivable.receipts[0].id]);
   const pending=await service.matches(report.id,4);assert.deepEqual(pending.invoices.map(row=>row.documentation_id),[document.id]);assert.equal(report.pending_invoice_matches.length,0,'the explicit amount lookup includes distant invoices that automatic suggestions omit');
   assert.equal(await count('journal_entries',company.id),before);assert.equal((await docs.get(document.id)).folder,'pending_invoices');
   await assert.rejects(service.matches(report.id,999),error('RECONCILIATION_MOVEMENT_NOT_FOUND'));await assert.rejects(createBankReconciliationService(pool,foreign.id).matches(report.id,2),error('RECONCILIATION_NOT_FOUND'));
  });
  await t.test('HTTP lookup scopes the report to the selected company',async()=>{
   server=createApp(createContextService(pool,company.id),{},companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const url='http://127.0.0.1:'+server.address().port+'/api/bank-reconciliations/'+report.id+'/movements/2/matches';
   assert.equal((await fetch(url,{headers:{'X-Company-Id':String(company.id)}})).status,200);assert.equal((await fetch(url,{headers:{'X-Company-Id':String(foreign.id)}})).status,404);
  });
  await t.test('wrong direction, another company, changed amount and stale report cannot settle a movement',async()=>{
   const before=await count('portfolio_settlements',company.id);
   await assert.rejects(service.settleMovement(report.id,request(2,wrongDirection.receipts[0].id)),error('RECONCILIATION_RECEIPT_CHANGED'));
   await assert.rejects(service.settleMovement(report.id,request(2,wrong.receipts[0].id)),error('RECONCILIATION_RECEIPT_CHANGED'));
   await assert.rejects(service.settleMovement(report.id,request(2,foreignInvoice.receipts[0].id)),error('RECEIPT_NOT_FOUND'));
   await assert.rejects(service.settleMovement(report.id,{...request(2,older.receipts[0].id),version:report.version+1}),error('RECONCILIATION_CHANGED'));
   assert.equal(await count('portfolio_settlements',company.id),before);
  });
  await t.test('a shortcut settles the old receipt using the statement bank, date and exercise exactly once',async()=>{
   const body=request(2,older.receipts[0].id),before=await count('journal_entries',company.id),[first,second]=await Promise.all([service.settleMovement(report.id,body),service.settleMovement(report.id,body)]);
   assert.equal(first.entry_id,second.entry_id);assert.equal(second.replayed,true);assert.equal(first.remaining_amount,'0.00');assert.equal(await count('journal_entries',company.id),before+1);
   const payment=first.settlements.find(row=>row.id===first.settlement_id);assert.equal(payment.exercise_id,company.year);assert.equal(payment.payment_date,'2026-01-12');assert.equal(payment.bank_account_id,bank.id);assert.equal(payment.amount,'100.00');
   report=await service.get(report.id);assert.equal(report.snapshot.posted_movements.find(row=>row.movement_id===2).entry_id,first.entry_id);
   await assert.rejects(service.settleMovement(report.id,request(2,payable.receipts[0].id)),error('RECONCILIATION_MOVEMENT_MATCHED'));await assert.rejects(service.settleMovement(report.id,{...body,notes:'Changed request'}),error('REQUEST_CONFLICT'));
  });
  await t.test('an analysis failure rolls back the receipt, settlement and journal together',async()=>{
   const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('UPDATE bank_reconciliations SET snapshot='))throw new Error('Injected settlement analysis failure');return db.execute(sql,args);},query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   const before=await count('journal_entries',company.id),body=request(3,receivable.receipts[0].id);
   await assert.rejects(createBankReconciliationService(failing,company.id).settleMovement(report.id,body),/Injected settlement analysis failure/);
   assert.equal(await count('journal_entries',company.id),before);assert.equal((await portfolio.get(receivable.receipts[0].id)).remaining_amount,'80.00');
   const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/bank-reconciliations/'+report.id+'/settlements',{method:'POST',headers:{'Content-Type':'application/json','X-Company-Id':String(company.id)},body:JSON.stringify(body)});assert.equal(response.status,200);assert.equal((await response.json()).remaining_amount,'0.00');assert.equal((await service.get(report.id)).posted_entries.length,2);
  });
  await t.test('the invoice shortcut moves one draft and keeps its proposal available from reconciliation',async()=>{
   const first=await docs.toInvoices(document.id,{version:document.version,exercise_id:company.year}),second=await docs.toInvoices(document.id,{version:document.version,exercise_id:company.year});assert.equal(first.id,second.id);
   const matches=(await service.matches(report.id,4)).invoices;assert.equal(matches.length,1);assert.equal(matches[0].invoice_document_id,first.id);assert.equal(matches[0].documentation_id,undefined);assert.equal(await count('invoice_documents',company.id),1);
  });
  await t.test('identical bank amounts keep the settlement linked only to the selected row',async()=>{
   const source=Buffer.from('Fecha;Concepto;Importe;Saldo\n10/03/2026;Opening;1000,00;1000,00\n12/03/2026;Payment A;-100,00;900,00\n12/03/2026;Payment B;-100,00;800,00');
   const preview=await imports.preview(source,company.year,'identical.csv','text/csv');await imports.analyze({token:preview.token,account_id:bank.id,replace_current:true});const saved=await imports.commit({token:preview.token});await imports.discard({token:preview.token});
   let current=await service.get(saved.id);const result=await service.settleMovement(current.id,{...request(3,payable.receipts[0].id),version:current.version});current=await service.get(current.id);
   assert.deepEqual(current.snapshot.scope.matched_movements.filter(row=>row.entry_id===result.entry_id).map(row=>row.id),[3]);assert.ok(current.snapshot.scope.bank_pending.some(row=>row.id===2));
   const repeated=await imports.preview(source,company.year,'identical.csv','text/csv');await imports.analyze({token:repeated.token,account_id:bank.id,replace_current:true});assert.equal((await imports.commit({token:repeated.token})).id,current.id);await imports.discard({token:repeated.token});current=await service.get(current.id);
   assert.deepEqual(current.snapshot.scope.matched_movements.filter(row=>row.entry_id===result.entry_id).map(row=>row.id),[3]);assert.ok(current.snapshot.scope.bank_pending.some(row=>row.id===2));
  });
  await t.test('validated partial payments and collections keep the remainder pending and later settle the same receipt',async()=>{
   for(const direction of ['received','issued']){
    const bill=await invoice(company,direction,'100.00'),receiptId=bill.receipts[0].id,negative=direction==='received';
    const source=Buffer.from('Fecha;Concepto;Referencia;Importe;Saldo\n01/06/2026;Opening;;9000,00;9000,00\n02/06/2026;Partial;'+bill.reference+';'+(negative?'-40,00;8960,00':'40,00;9040,00')+'\n03/06/2026;Final;'+bill.reference+';'+(negative?'-60,00;8900,00':'60,00;9100,00'));
    const preview=await imports.preview(source,company.year,'partial-'+direction+'.csv','text/csv');await imports.analyze({token:preview.token,account_id:bank.id,replace_current:true});const saved=await imports.commit({token:preview.token});await imports.discard({token:preview.token});
    let current=await service.get(saved.id);const candidate=(await service.matches(current.id,2)).receipts.find(row=>row.id===receiptId);assert.equal(candidate.partial_payment,true);assert.equal(candidate.remaining_after_payment,'60.00');
    const body={version:current.version,movement_id:2,receipt_id:receiptId,request_id:randomUUID(),payment_method:'transfer',reference:'Partial validated',notes:''};
    await assert.rejects(service.settleMovement(current.id,body),error('RECONCILIATION_RECEIPT_CHANGED'));
    await assert.rejects(service.settleMovement(current.id,{...body,partial_payment:true,expected_remaining_amount:'100.01'}),error('RECONCILIATION_RECEIPT_CHANGED'));
    const partial={...body,partial_payment:true,expected_remaining_amount:'100.00'},before=await count('portfolio_settlements',company.id);
    const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('UPDATE bank_reconciliations SET snapshot='))throw Error('Partial rollback');return db.execute(sql,args);},query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
    await assert.rejects(createBankReconciliationService(failing,company.id).settleMovement(current.id,partial),/Partial rollback/);assert.equal((await portfolio.get(receiptId)).remaining_amount,'100.00');assert.equal(await count('portfolio_settlements',company.id),before);
    const [first,repeated]=await Promise.all([service.settleMovement(current.id,partial),service.settleMovement(current.id,partial)]);assert.equal(first.entry_id,repeated.entry_id);assert.equal(repeated.replayed,true);assert.equal(await count('portfolio_settlements',company.id),before+1);
    const outstanding=await portfolio.get(receiptId);assert.equal(outstanding.status,'partial');assert.equal(outstanding.remaining_amount,'60.00');assert.equal(outstanding.paid_amount,'40.00');
    await assert.rejects(service.settleMovement(current.id,{...partial,partial_payment:false}),error('REQUEST_CONFLICT'));
    current=await service.get(current.id);const finalCandidate=(await service.matches(current.id,3)).receipts.find(row=>row.id===receiptId);assert.equal(finalCandidate.partial_payment,undefined);
    const last=await service.settleMovement(current.id,{...body,request_id:randomUUID(),version:current.version,movement_id:3});assert.equal(last.remaining_amount,'0.00');assert.equal((await portfolio.get(receiptId)).status,'settled');assert.equal(await count('portfolio_settlements',company.id),before+2);
    current=await service.get(current.id);assert.equal(current.snapshot.posted_movements.filter(row=>[2,3].includes(row.movement_id)).length,2);
   }
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){for(const table of ['bank_reconciliations','bank_connections','bank_reconciliation_rules','invoice_documents','company_documents','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
