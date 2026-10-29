import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createPortfolioService} from '../src/services/portfolio.js';
import {createBankRemittanceService} from '../src/services/bank-remittances.js';
import {createInvoiceDeletionService} from '../src/services/invoice-deletion.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {packBackup,readBackup,sealBackup} from '../src/services/backup-format.js';
import {emptyPartyPaymentProfile} from '../../shared/party-payments.js';
import {cents} from '../../shared/money.js';
const code=expected=>error=>error.code===expected;
test('MySQL portfolio splits and bank remittances preserve money, history, scope and exported orders',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),companyIds=[],name='Remittance test '+randomUUID();
 const create=async()=>{const company=await context.createCompany({name,iban:'ES9121000418450200051332',bic:'CAIXESBBXXX',sepa_creditor_id:'DE98ZZZ09999999999',bank_initiator_id:'B12345674000',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});companyIds.push(company.id);return company;};
 try{
  const own=await create(),foreign=await create(),accounting=createAccountingService(pool,own.id),invoices=createInvoiceService(pool,own.id),portfolio=createPortfolioService(pool,own.id),remittances=createBankRemittanceService(pool,own.id),exercise=(await context.getContext(own.id)).exercises[0];
  const terms={...emptyPartyPaymentProfile(),payment_method:'direct_debit',due_days:0,iban:'DE89370400440532013000'};
  const customer=await accounting.createAccount({code:'4300.0001',description:'Client test',party_profile:{name:'Client Test SL',tax_id:'B12345674'},payment_profile:terms,sepa_mandate:{reference:'MAND-001',signed_on:'2025-01-01',sequence:'RCUR'}});
  const supplier=await accounting.createAccount({code:'4000.0001',description:'Supplier',payment_profile:{...terms,payment_method:'transfer'}}),bank=await accounting.createAccount({code:'5720.0001',description:'Bank'});
  const invoiceBody=(direction='issued')=>({exercise_id:exercise.id,direction,reference:'TEST-'+randomUUID(),invoice_date:'2026-01-31',party:{name:'Client Test SL',tax_id:direction==='issued'?'B12345674':''},party_account_id:direction==='issued'?customer.id:supplier.id,automatic_receipts:true,request_id:randomUUID(),lines:[{description:'Test service',base:'100.01',tax_rate:'0'}]});
  const initial=await invoices.create(invoiceBody()),target=initial.receipts[0].id;
  await t.test('due dates remain editable and splits preserve invoice totals without new journal entries',async()=>{
   const before=(await pool.execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=?',[own.id]))[0][0].count;
   const edited=await portfolio.update(target,{due_date:'2026-02-15',payment_method:'direct_debit',notes:'Keep this note',revision:initial.receipts[0].revision});assert.equal(edited.original_due_date,'2026-01-31');
   const body={request_id:randomUUID(),revision:edited.revision,parts:[{due_date:'2026-02-28',amount:'33.33'},{due_date:'2026-03-31',amount:'66.68'}]};
   const results=await Promise.all([portfolio.split(target,body),portfolio.split(target,body)]);assert.deepEqual(results[0].split_receipt_ids,results[1].split_receipt_ids);assert.equal(results.filter(row=>row.replayed).length,1);
   const saved=await invoices.get(initial.id);assert.deepEqual(saved.receipts.map(row=>row.amount),['33.33','66.68']);assert.ok(saved.receipts.every(row=>row.notes==='Keep this note'));assert.equal(saved.total_amount,'100.01');
   assert.equal((await pool.execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=?',[own.id]))[0][0].count,before);
   await assert.rejects(portfolio.split(target,{...body,request_id:randomUUID()}),code('RECEIPT_CHANGED'));
   await assert.rejects(portfolio.split(target,{...body,parts:[{due_date:'2026-02-28',amount:'33.34'},{due_date:'2026-03-31',amount:'66.67'}]}),code('REQUEST_CONFLICT'));
   await assert.rejects(createPortfolioService(pool,foreign.id).split(target,{...body,request_id:randomUUID()}),code('RECEIPT_NOT_FOUND'));
   await assert.rejects(portfolio.split(target,{request_id:randomUUID(),parts:[{due_date:'2026-02-28',amount:'0.01'},{due_date:'2026-03-31',amount:'0.01'}]}),code('SPLIT_TOTAL_MISMATCH'));
  });
  await t.test('partial payments and reversals keep their receipt and journal links after a split',async()=>{
   const invoice=await invoices.create(invoiceBody()),receipt=invoice.receipts[0];
   const paid=await portfolio.settle(receipt.id,{request_id:randomUUID(),exercise_id:exercise.id,payment_date:'2026-02-01',amount:'20.01',bank_account_id:bank.id,payment_method:'transfer'});
   const split=await portfolio.split(receipt.id,{request_id:randomUUID(),revision:paid.revision,parts:[{due_date:'2026-02-28',amount:'40.00'},{due_date:'2026-03-31',amount:'40.00'}]});assert.equal(split.amount,'60.01');assert.equal(split.paid_amount,'20.01');assert.equal(split.remaining_amount,'40.00');assert.equal(split.settlements[0].id,paid.settlement_id);
   const reversed=await portfolio.reverse(paid.settlement_id,{request_id:randomUUID(),exercise_id:exercise.id,date:'2026-02-02',reason:'Test reversal'});assert.equal(reversed.remaining_amount,'60.01');assert.equal(reversed.settlements[0].receipt_id,receipt.id);assert.equal((await invoices.get(invoice.id)).receipts.reduce((sum,row)=>sum+cents(row.remaining_amount),0n),10001n);
  });
  const received=await invoices.create(invoiceBody('received'));
  const bankBody=(receiptIds,direction='issued')=>({direction,receipt_ids:receiptIds,requested_date:'2099-12-31',iban:own.iban,bic:own.bic,creditor_id:own.sepa_creditor_id,initiator_id:own.bank_initiator_id});
  const ids=(await invoices.get(initial.id)).receipts.map(row=>row.id),candidate=bankBody(ids);
  let prepared,firstFile;
  await t.test('collection previews use client IBAN and mandates, and reject missing or stale information',async()=>{
   const preview=await remittances.preview(candidate);assert.equal(preview.ready,true);assert.equal(preview.total,'100.01');assert.equal(preview.items[0].iban,terms.iban);
   await accounting.updateAccount(customer.id,{sepa_mandate:{reference:'MAND-002',signed_on:'2025-01-01',sequence:'RCUR'}});
   await assert.rejects(remittances.create({...candidate,preview_hash:preview.preview_hash,request_id:randomUUID()}),code('REMITTANCE_CHANGED'));
   await accounting.updateAccount(customer.id,{payment_profile:{...terms,iban:''}});assert.equal((await remittances.preview(candidate)).ready,false);
   await accounting.updateAccount(customer.id,{payment_profile:terms,sepa_mandate:{reference:'MAND-001',signed_on:'2025-01-01',sequence:'RCUR'}});
   await assert.rejects(async()=>remittances.preview({...candidate,receipt_ids:[ids[0],ids[0]]}),code('INVALID_REMITTANCE_RECEIPTS'));
   await assert.rejects(createBankRemittanceService(pool,foreign.id).preview(candidate),code('REMITTANCE_RECEIPT_UNAVAILABLE'));
   assert.equal((await remittances.preview({...candidate,creditor_id:'bad'})).ready,false);
   const fresh=await remittances.preview(candidate),request={...candidate,preview_hash:fresh.preview_hash,request_id:randomUUID()};
   const before=(await pool.execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=?',[own.id]))[0][0].count;
   const saved=await Promise.all([remittances.create(request),remittances.create(request)]);prepared=saved[0];assert.equal(saved[0].id,saved[1].id);assert.equal(saved.filter(row=>row.replayed).length,1);
   assert.equal((await pool.execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=?',[own.id]))[0][0].count,before);assert.equal((await portfolio.get(ids[0])).remaining_amount,'33.33');
   firstFile=await remittances.file(prepared.id);assert.match(firstFile.file.toString(),/pain\.008\.001\.08/);
  });
  await t.test('active files reserve receipts and prevent changes, invoice deletion and exercise clearing',async()=>{
   assert.equal((await portfolio.get(ids[0])).remittance_id,prepared.id);
   await assert.rejects(portfolio.update(ids[0],{due_date:'2026-05-01',payment_method:'direct_debit'}),code('RECEIPT_IN_REMITTANCE'));
   await assert.rejects(portfolio.split(ids[0],{request_id:randomUUID(),parts:[{due_date:'2026-05-01',amount:'10'},{due_date:'2026-06-01',amount:'23.33'}]}),code('RECEIPT_IN_REMITTANCE'));
   assert.equal((await remittances.preview(candidate)).ready,false);
   assert.ok((await createInvoiceDeletionService(pool,own.id).preview(initial.id)).blockers.some(row=>row.code==='bank_remittance'));
   assert.ok((await createExerciseClearService(pool,own.id).preview(exercise.id)).blockers.some(row=>row.code==='bank_remittance'));
   await assert.rejects(invoices.void(initial.id,{request_id:randomUUID(),exercise_id:exercise.id,date:'2026-10-01',reason:'Test'}),code('RECEIPT_IN_REMITTANCE'));
   await assert.rejects(createBankRemittanceService(pool,foreign.id).file(prepared.id),code('REMITTANCE_NOT_FOUND'));
   await assert.rejects(createBankRemittanceService(pool,foreign.id).cancel(prepared.id),code('REMITTANCE_NOT_FOUND'));
  });
  await t.test('download is immutable after profile edits, and cancelling releases only the local reservation',async()=>{
   await accounting.updateAccount(customer.id,{payment_profile:{...terms,iban:'FR1420041010050500013M02606'}});
   assert.deepEqual((await remittances.file(prepared.id)).file,firstFile.file);
   const [[saved]]=await pool.execute('SELECT xml_sha256 FROM bank_remittances WHERE company_id=? AND id=?',[own.id,prepared.id]);assert.equal(saved.xml_sha256,createHash('sha256').update(firstFile.file).digest('hex'));
   await remittances.cancel(prepared.id);await remittances.cancel(prepared.id);assert.equal((await portfolio.get(ids[0])).remittance_id,null);
   assert.equal((await remittances.preview(candidate)).ready,true);assert.deepEqual((await remittances.file(prepared.id)).file,firstFile.file);
  });
  await t.test('payment files use suppliers and one-off mandates cannot be duplicated',async()=>{
   const body=bankBody([received.receipts[0].id],'received'),preview=await remittances.preview(body);assert.equal(preview.ready,true);const saved=await remittances.create({...body,preview_hash:preview.preview_hash,request_id:randomUUID()});assert.match((await remittances.file(saved.id)).file.toString(),/pain\.001\.001\.09/);
   await accounting.updateAccount(customer.id,{sepa_mandate:{reference:'UNIQUE',signed_on:'2025-01-01',sequence:'OOFF'}});assert.equal((await remittances.preview(candidate)).ready,false);
   const one=bankBody([ids[0]]),review=await remittances.preview(one);assert.equal(review.ready,true);await remittances.create({...one,preview_hash:review.preview_hash,request_id:randomUUID()});
   const customerHistory=await remittances.list({direction:'issued'}),supplierHistory=await remittances.list({direction:'received'});
   assert.ok(customerHistory.length>0);assert.ok(customerHistory.every(row=>row.direction==='issued'));assert.equal(supplierHistory.length,1);assert.equal(supplierHistory[0].id,saved.id);
   assert.deepEqual(await createBankRemittanceService(pool,foreign.id).list({direction:'received'}),[]);
   await assert.rejects(remittances.list({direction:'other'}),code('INVALID_REMITTANCE'));
   const other=await remittances.preview(bankBody([ids[1]]));assert.ok(other.items[0].issues.includes('REMITTANCE_MANDATE_REUSED'));
   await accounting.updateAccount(customer.id,{sepa_mandate:{reference:'MAND-001',signed_on:'2025-01-01',sequence:'RCUR'}});
  });
  await t.test('backups restore split history, mandate profiles, immutable files and remapped reservations',async()=>{
   const backup=await createDataBackupService(pool,own.id).export('all'),target=await create(),restore=createDataBackupService(pool,target.id),preview=await restore.preview(backup.file,'all');assert.equal(preview.ready,true);await restore.restore({token:preview.token,request_id:randomUUID(),confirm:true});
   const copied=(await createInvoiceService(pool,target.id).list()).find(row=>row.reference===initial.reference),copy=await createInvoiceService(pool,target.id).get(copied.id),history=copy.receipts.find(row=>row.split_history)?.split_history;
   assert.deepEqual(history[0].parts.map(row=>row.receipt_id).sort((a,b)=>a-b),copy.receipts.map(row=>row.id).sort((a,b)=>a-b));
   assert.equal((await createAccountingService(pool,target.id).getAccount(copy.party_account_id)).sepa_mandate.reference,'MAND-001');
   const list=await createBankRemittanceService(pool,target.id).list(),archived=list.find(row=>row.message_id===prepared.message_id);assert.deepEqual((await createBankRemittanceService(pool,target.id).file(archived.id)).file,firstFile.file);
   const rebackup=await createDataBackupService(pool,target.id).export('all');readBackup(rebackup.file);
   const old=structuredClone(backup.data);delete old.checksum;for(const section of ['tables','references','schema'])delete old[section].bank_remittances;
   for(const [table,fields]of [['accounts',['sepa_mandate']],['portfolio_receipts',['split_history']],['company_details',['sepa_creditor_id','bank_initiator_id']]]){old.schema[table]=old.schema[table].filter(key=>!fields.includes(key));for(const row of [...old.tables[table],...old.references[table]])for(const field of fields)delete row[field];}
   const legacy=await create(),legacyService=createDataBackupService(pool,legacy.id),legacyPreview=await legacyService.preview(packBackup(sealBackup(old)),'all');assert.equal(legacyPreview.ready,true);await legacyService.restore({token:legacyPreview.token,request_id:randomUUID(),confirm:true});assert.deepEqual(await createBankRemittanceService(pool,legacy.id).list(),[]);
  });
  await t.test('two competing exports cannot reserve the same receipt twice and amount changes invalidate review',async()=>{
   const invoice=await invoices.create(invoiceBody()),body=bankBody([invoice.receipts[0].id]),preview=await remittances.preview(body);
   await portfolio.settle(invoice.receipts[0].id,{request_id:randomUUID(),exercise_id:exercise.id,payment_date:'2026-02-01',amount:'20.01',bank_account_id:bank.id,payment_method:'transfer'});
   await assert.rejects(remittances.create({...body,preview_hash:preview.preview_hash,request_id:randomUUID()}),code('REMITTANCE_CHANGED'));
   const fresh=await remittances.preview(body);assert.equal(fresh.total,'80.00');const results=await Promise.allSettled([remittances.create({...body,preview_hash:fresh.preview_hash,request_id:randomUUID()}),remittances.create({...body,preview_hash:fresh.preview_hash,request_id:randomUUID()})]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.find(row=>row.status==='rejected').reason.code,'REMITTANCE_CHANGED');
  });
  await t.test('restoring one year archives a mixed-year bank file without reserving unrelated receipt IDs',async()=>{
   const [period]=await pool.execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date,status,is_default) VALUES (?,'2027','2027-01-01','2027-12-31','open',0)",[own.id]);
   const first=await invoices.create(invoiceBody()),second=await invoices.create({...invoiceBody(),exercise_id:period.insertId,invoice_date:'2027-01-31'}),body=bankBody([first.receipts[0].id,second.receipts[0].id]),preview=await remittances.preview(body),mixed=await remittances.create({...body,preview_hash:preview.preview_hash,request_id:randomUUID()});
   const backup=await createDataBackupService(pool,own.id).export(exercise.id),target=await create(),restore=createDataBackupService(pool,target.id),review=await restore.preview(backup.file,'all');assert.equal(review.ready,true);await restore.restore({token:review.token,request_id:randomUUID(),confirm:true});
   const restored=(await createBankRemittanceService(pool,target.id).list()).find(row=>row.message_id===mixed.message_id);assert.equal(restored.status,'archived');
   const copy=(await createInvoiceService(pool,target.id).list()).find(row=>row.reference===first.reference),detail=await createInvoiceService(pool,target.id).get(copy.id);assert.equal(detail.receipts[0].remittance_id,null);
   assert.deepEqual((await createBankRemittanceService(pool,target.id).file(restored.id)).file,(await remittances.file(mixed.id)).file);readBackup((await createDataBackupService(pool,target.id).export('all')).file);
  });
  await t.test('future installments keep their due dates while overdue receipts use the presentation date',async()=>{
   const invoice=await invoices.create(invoiceBody()),receipt=invoice.receipts[0];await portfolio.update(receipt.id,{due_date:'2099-12-31',payment_method:'direct_debit'});
   const body={...bankBody([receipt.id]),requested_date:'2099-01-01'},preview=await remittances.preview(body);assert.equal(preview.items[0].execution_date,'2099-12-31');
   const prepared=await remittances.create({...body,preview_hash:preview.preview_hash,request_id:randomUUID()}),file=await remittances.file(prepared.id);assert.match(file.file.toString(),/<ReqdColltnDt>2099-12-31<\/ReqdColltnDt>/);
  });
 }finally{
  try{for(const companyId of companyIds){for(const table of ['bank_remittances','data_restores','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}}finally{await pool.end();}
 }
});
