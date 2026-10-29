import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {accountPartyType,emptyPartyProfile,normalizePartyProfile,invoicePartyProfile,completeFiscalProfile} from '../../shared/account-party.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createContextService} from '../src/services/context.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {invoiceHtml} from '../src/services/invoice-delivery-format.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {sealBackup,packBackup} from '../src/services/backup-format.js';

const profile=()=>({...emptyPartyProfile(),name:'Àngels & Companyia SL',tax_id:'b 12345674',address:'Carrer Major, 10',postal_code:'25001',city:'Lleida',province:'Lleida',country:'España',contact_person:'Àngels',phone:'+34 973 000 000',email:'factures@example.com'});
test('fiscal profiles accept international identifiers and reject invalid names, email and unbounded input',()=>{
 const normalized=normalizePartyProfile(profile());assert.equal(normalized.tax_id,'B12345674');
 assert.equal(normalizePartyProfile({...profile(),tax_id:'fr 12345678901'}).tax_id,'FR12345678901');
 for(const value of [{...profile(),name:''},{...profile(),email:'bad'},{...profile(),address:'x'.repeat(251)},{...profile(),city:'line\nbreak'},{...profile(),unexpected:'value'},[]])assert.throws(()=>normalizePartyProfile(value));
 for(const code of ['43000001','44000001'])assert.equal(accountPartyType({code,kind:'subaccount'}),'customer');
 for(const code of ['40000001','41000001'])assert.equal(accountPartyType({code,kind:'subaccount'}),'supplier');
 assert.equal(accountPartyType({code:'4300',kind:'account'}),null);assert.equal(accountPartyType({code:'57200001',kind:'subaccount'}),null);
});
test('fiscal display fills only missing data and never mixes different tax identities',()=>{
 const saved={name:'Nombre original',tax_id:'B12345674',address:'Domicilio original',city:''};
 const filled=completeFiscalProfile(saved,{...profile(),tax_id:'B12345674'});
 assert.equal(filled.name,'Nombre original');assert.equal(filled.address,'Domicilio original');assert.equal(filled.city,'Lleida');
 const different=completeFiscalProfile(saved,{...profile(),tax_id:'B99999999'});assert.equal(different.city,'');assert.equal(different.postal_code,'');
 assert.equal(saved.city,'');
});

test('MySQL fiscal profiles: account editing, invoice snapshots, company isolation and backup compatibility',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,config.companyId),name='Fiscal profile test '+randomUUID();
 const create=async()=>{const company=await context.createCompany({name,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);return company;};
 try{
  const company=await create(),foreign=await create(),accounting=createAccountingService(pool,company.id),invoices=createInvoiceService(pool,company.id),exercise=(await context.getContext(company.id)).exercises[0];
  const customer=await accounting.createAccount({code:'4300.0001',description:'Nombre contable',party_profile:profile()});
  const supplier=await accounting.createAccount({code:'4100.0001',description:'Proveedor contable',party_profile:{...profile(),name:'Proveedor SL',tax_id:'FR12345678901'}});
  const body=(direction='issued')=>({direction,exercise_id:exercise.id,reference:'F-'+randomUUID(),invoice_date:'2026-10-29',party_account_id:direction==='issued'?customer.id:supplier.id,party:{name:direction==='issued'?customer.party_profile.name:supplier.party_profile.name},request_id:randomUUID(),lines:[{description:'Servicio',base:'100',tax_rate:'21'}],receipts:[{due_date:'2026-11-29',amount:'121'}]});
  await t.test('profiles are stored on subaccounts, searchable and isolated by company',async()=>{
   assert.equal(customer.party_profile.tax_id,'B12345674');assert.equal((await accounting.listAccounts({search:'Àngels'}))[0].id,customer.id);
   assert.equal((await accounting.listAccounts({search:'B12345674'}))[0].id,customer.id);
   assert.equal((await invoices.parties()).find(row=>row.account_id===supplier.id).postal_code,'25001');
   await assert.rejects(createAccountingService(pool,foreign.id).updateAccount(customer.id,{party_profile:profile()}),error=>error.code==='ACCOUNT_NOT_FOUND');
   await assert.rejects(accounting.createAccount({code:'5720.0001',description:'Bank',party_profile:profile()}),error=>error.code==='INVALID_PARTY_ACCOUNT');
   await assert.rejects(accounting.updateAccount(customer.id,{description:'Should roll back',party_profile:{...profile(),email:'invalid'}}),error=>error.code==='INVALID_PARTY_EMAIL');
   assert.equal((await accounting.getAccount(customer.id)).description,'Nombre contable');
   await accounting.updateAccount(customer.id,{description:'Descripción nueva'});assert.equal((await accounting.getAccount(customer.id)).party_profile.city,'Lleida');
  });
  const request=body(),issued=await invoices.create(request),received=await invoices.create(body('received'));
  await t.test('issued and received invoices retain complete fiscal addresses and escaped printable data',async()=>{
   for(const invoice of [issued,received]){
    assert.equal(invoice.party_snapshot.postal_code,'25001');assert.equal(invoice.party_tax_id,invoice.direction==='issued'?'B12345674':'FR12345678901');
    const html=invoiceHtml(invoice);for(const text of ['25001','Lleida','España','973 000 000','factures@example.com'])assert.ok(html.includes(text),text);
   }
   assert.match(invoiceHtml(issued),/Àngels &amp; Companyia SL/);
   const updated={...customer.party_profile,name:'Nombre fiscal nuevo',city:'Barcelona',postal_code:'08001'};
   await accounting.updateAccount(customer.id,{party_profile:updated});
   assert.equal((await invoices.get(issued.id)).party_snapshot.city,'Lleida');
   assert.equal((await invoices.create(request)).id,issued.id);
   assert.equal((await invoices.parties()).find(row=>row.account_id===customer.id).city,'Barcelona');
   assert.equal(invoicePartyProfile({...issued,party_snapshot:null,party_fiscal:undefined}).postal_code,'');
   const overridden=await invoices.create({...body(),party:{...updated,city:'Girona',postal_code:'17001'}});
   assert.equal(overridden.party_snapshot.city,'Girona');assert.equal((await accounting.getAccount(customer.id)).party_profile.city,'Barcelona');
  });
  await t.test('creating a third party from an invoice saves its fiscal profile and reuses known identifiers',async()=>{
   const created=await invoices.create({...body(),party_account_id:null,party:{...profile(),name:'Cliente nuevo',tax_id:'B99999999'}});
   assert.equal((await accounting.getAccount(created.party_account_id)).party_profile.city,'Lleida');
   const reused=await invoices.create({...body(),party_account_id:null,party:{...profile(),tax_id:'B12345674'}});assert.equal(reused.party_account_id,customer.id);
   await accounting.createAccount({code:'4300.0099',description:'Same tax ID',party_profile:customer.party_profile});
   await assert.rejects(invoices.create({...body(),party_account_id:null,party:{...profile(),tax_id:'B12345674'}}),error=>error.code==='AMBIGUOUS_PARTY_ACCOUNT');
  });
  await t.test('blank invoice fields use the account profile and old copies display missing fiscal data without rewriting snapshots',async()=>{
   const blank=await invoices.create({...body(),party:{...emptyPartyProfile(),name:'Nombre fiscal nuevo'}});
   assert.equal(blank.party_tax_id,'B12345674');assert.equal(blank.party_snapshot.city,'Barcelona');
   const legacy=await invoices.create(body());
   await pool.execute('UPDATE trade_invoices SET party_tax_id=?,party_address=?,party_email=?,party_snapshot=NULL,issuer_snapshot=? WHERE company_id=? AND id=?',['','','',JSON.stringify({name:'Empresa original',tax_id:'',address:''}),company.id,legacy.id]);
   await context.updateCompany(company.id,{name:company.name,tax_id:'B12345674',address:'Domicilio fiscal del emisor',postal_code:'25002',city:'Lleida'});
   const loaded=await invoices.get(legacy.id);
   assert.equal(loaded.issuer_fiscal.tax_id,'B12345674');assert.equal(loaded.issuer_fiscal.address,'Domicilio fiscal del emisor');assert.equal(loaded.issuer_fiscal.name,'Empresa original');
   assert.equal(loaded.party_fiscal.tax_id,'B12345674');assert.equal(loaded.party_fiscal.city,'Barcelona');
   const html=invoiceHtml(loaded);assert.match(html,/Domicilio fiscal del emisor/);assert.match(html,/NIF \/ CIF: B12345674/);assert.match(html,/08001 Barcelona/);
   assert.equal(loaded.issuer_snapshot.tax_id,'');assert.equal(loaded.party_snapshot,null);assert.equal(loaded.party_tax_id,'');
   const [[stored]]=await pool.execute('SELECT party_tax_id,party_snapshot,issuer_snapshot FROM trade_invoices WHERE company_id=? AND id=?',[company.id,legacy.id]);assert.equal(stored.party_tax_id,'');assert.equal(stored.party_snapshot,null);assert.equal(stored.issuer_snapshot.tax_id,'');
  });
  await t.test('backups restore both master profiles and historical snapshots, including older archives',async()=>{
   const backup=await createDataBackupService(pool,company.id).export('all'),restore=createDataBackupService(pool,foreign.id),preview=await restore.preview(backup.file,'all');
   assert.equal(preview.blockers.length,0);await restore.restore({token:preview.token,request_id:randomUUID(),confirm:true});
   const restored=(await createAccountingService(pool,foreign.id).listAccounts()).find(row=>row.code===customer.code);assert.equal(restored.party_profile.city,'Barcelona');
   const restoredInvoices=createInvoiceService(pool,foreign.id),list=await restoredInvoices.list();
   assert.equal((await restoredInvoices.get(list.find(row=>row.reference===issued.reference).id)).party_snapshot.city,'Lleida');
   const legacy=structuredClone(backup.data);delete legacy.checksum;
   for(const [table,column]of [['accounts','party_profile'],['trade_invoices','party_snapshot']]){
    legacy.schema[table]=legacy.schema[table].filter(key=>key!==column);for(const row of [...legacy.tables[table],...legacy.references[table]])delete row[column];
   }
   const target=await create(),service=createDataBackupService(pool,target.id),old=await service.preview(packBackup(sealBackup(legacy)),'all');assert.equal(old.blockers.length,0);
   await service.restore({token:old.token,request_id:randomUUID(),confirm:true});assert.equal((await createAccountingService(pool,target.id).listAccounts()).find(row=>row.code===customer.code).party_profile,null);
  });
 }finally{
  for(const companyId of ids){
   for(const table of ['data_restores','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});
