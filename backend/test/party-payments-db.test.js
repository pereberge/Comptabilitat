import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createPortfolioService} from '../src/services/portfolio.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {packBackup,sealBackup} from '../src/services/backup-format.js';
import {emptyPartyPaymentProfile,partyPaymentReceipts} from '../../shared/party-payments.js';
test('MySQL party payment profiles: automatic receipts, scoped settings, historical snapshots and backup compatibility',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[],name='Party payment test '+randomUUID();
 const create=async()=>{const company=await context.createCompany({name,payment_method:'cash',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);return company;};
 try{
  const source=await create(),target=await create(),accounting=createAccountingService(pool,source.id),invoices=createInvoiceService(pool,source.id),exercise=(await context.getContext(source.id)).exercises[0];
  const terms={...emptyPartyPaymentProfile(),payment_method:'direct_debit',due_days:0,installments:3,payment_day:31,iban:'ES9121000418450200051332'};
  const customer=await accounting.createAccount({code:'4300.0001',description:'Customer',party_profile:{name:'Customer SL',tax_id:'B12345674'},payment_profile:terms});
  const supplier=await accounting.createAccount({code:'4000.0001',description:'Supplier',payment_profile:{...emptyPartyPaymentProfile(),payment_method:'transfer',due_days:10,installments:2,interval_months:2,payment_day:15}});
  const body=(direction='issued')=>({exercise_id:exercise.id,direction,reference:'AUTO-'+randomUUID(),invoice_date:'2026-01-31',party:{name:direction==='issued'?'Customer SL':'Supplier SL'},party_account_id:direction==='issued'?customer.id:supplier.id,automatic_receipts:true,request_id:randomUUID(),lines:[{description:'Service',base:'100',tax_rate:'0'}]});
  await t.test('payment profiles are validated and isolated by company',async()=>{
   assert.equal(customer.payment_profile.installments,3);assert.equal((await invoices.parties()).find(row=>row.account_id===customer.id).payment_profile.iban,terms.iban);
   await assert.rejects(createAccountingService(pool,target.id).updateAccount(customer.id,{payment_profile:terms}),error=>error.code==='ACCOUNT_NOT_FOUND');
   await assert.rejects(accounting.createAccount({code:'5720.0001',description:'Bank',payment_profile:terms}),error=>error.code==='INVALID_PARTY_ACCOUNT');
   await assert.rejects(accounting.updateAccount(customer.id,{description:'Must roll back',payment_profile:{...terms,iban:'invalid'}}),error=>error.code==='INVALID_IBAN');assert.equal((await accounting.getAccount(customer.id)).description,'Customer');
  });
  const request=body(),created=await invoices.create(request);
  await t.test('issued and received invoices generate exact receipts and use the selected third party payment method',async()=>{
   assert.deepEqual(created.receipts.map(row=>({due_date:row.due_date,amount:row.amount})),partyPaymentReceipts('100','2026-01-31',terms));
   assert.ok(created.receipts.every(row=>row.payment_method==='direct_debit'));assert.equal(created.payment_snapshot.iban,terms.iban);assert.equal(created.payment_method,'direct_debit');
   assert.equal((await createPortfolioService(pool,source.id).get(created.receipts[0].id)).payment_snapshot.iban,terms.iban);
   const received=await invoices.create(body('received'));assert.deepEqual(received.receipts.map(row=>row.due_date),['2026-02-15','2026-04-15']);assert.equal(received.payment_method,'transfer');
   const replay=await Promise.all([invoices.create(request),invoices.create(request)]);assert.ok(replay.every(row=>row.id===created.id&&row.replayed));
  });
  await t.test('manual schedules remain available and missing settings fall back to one receipt and the company method',async()=>{
   const manual=await invoices.create({...body(),automatic_receipts:false,payment_method:'card',receipts:[{due_date:'2026-06-01',amount:'100'}]});assert.equal(manual.receipts.length,1);assert.equal(manual.payment_method,'card');assert.equal(manual.payment_snapshot,null);
   const fresh=await invoices.create({...body(),party_account_id:null,party:{name:'New customer'}});assert.equal(fresh.receipts[0].due_date,'2026-03-02');assert.equal(fresh.payment_method,'cash');assert.equal(fresh.receipts.length,1);
  });
  await t.test('changes after preview are rejected atomically and existing receipts keep their original conditions',async()=>{
   await accounting.updateAccount(customer.id,{payment_profile:{...terms,iban:''}});
   await assert.rejects(invoices.create({...body(),payment_profile:terms}),error=>error.code==='PARTY_PAYMENT_CHANGED');
   const updated={...terms,due_days:30,installments:2};await accounting.updateAccount(customer.id,{payment_profile:updated});
   const [[before]]=await pool.execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=?',[source.id]);
   await assert.rejects(invoices.create({...body(),receipts:partyPaymentReceipts('100','2026-01-31',terms)}),error=>error.code==='PARTY_PAYMENT_CHANGED');
   const [[after]]=await pool.execute('SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=?',[source.id]);assert.equal(after.count,before.count);
   const saved=await invoices.get(created.id);assert.equal(saved.payment_snapshot.due_days,0);assert.equal(saved.payment_snapshot.installments,3);assert.equal(saved.receipts[0].due_date,'2026-01-31');assert.equal((await invoices.create(request)).id,created.id);
  });
  await t.test('backups include payment profiles and snapshots and accept archives from before the new fields',async()=>{
   const backup=await createDataBackupService(pool,source.id).export('all'),restore=createDataBackupService(pool,target.id),preview=await restore.preview(backup.file,'all');assert.equal(preview.ready,true);await restore.restore({token:preview.token,request_id:randomUUID(),confirm:true});
   const restored=(await createAccountingService(pool,target.id).listAccounts()).find(row=>row.code===customer.code);assert.equal(restored.payment_profile.installments,2);
   const restoredInvoices=createInvoiceService(pool,target.id),list=await restoredInvoices.list(),copy=await restoredInvoices.get(list.find(row=>row.reference===created.reference).id);assert.equal(copy.payment_snapshot.installments,3);
   const old=structuredClone(backup.data);delete old.checksum;for(const [table,field]of [['accounts','payment_profile'],['trade_invoices','payment_snapshot']]){old.schema[table]=old.schema[table].filter(key=>key!==field);for(const row of [...old.tables[table],...old.references[table]])delete row[field];}
   const legacy=await create(),legacyService=createDataBackupService(pool,legacy.id),legacyPreview=await legacyService.preview(packBackup(sealBackup(old)),'all');assert.equal(legacyPreview.ready,true);await legacyService.restore({token:legacyPreview.token,request_id:randomUUID(),confirm:true});assert.equal((await createAccountingService(pool,legacy.id).listAccounts()).find(row=>row.code===customer.code).payment_profile,null);
  });
 }finally{
  try{for(const companyId of ids){for(const table of ['data_restores','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}}finally{await pool.end();}
 }
});
