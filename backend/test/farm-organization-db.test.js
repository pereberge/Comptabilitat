import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createFarmOrganizationService} from '../src/services/farm-organization.js';
import {createSupplierInvoiceService} from '../src/services/supplier-invoices/service.js';
import {createImportedInvoiceService} from '../src/integrations/received-invoices.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup} from '../src/services/backup-format.js';
test('farm organization shares existing farms and classifies invoices independently of accounting',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[];
 try{
  const name='Organization '+randomUUID();const company=await context.createCompany({name,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);const other=await context.createCompany({name,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(other.id);
  const service=createFarmOrganizationService(pool,company.id,{actor:'farm-test'}),foreign=createFarmOrganizationService(pool,other.id),year=(await context.getContext(company.id)).exercises[0];
  const f1=await service.saveFarm({code:'A',name:'Granja A'}),f2=await service.saveFarm({code:'B',name:'Granja B'}),g1=await service.saveGroup(f1.id,{name:'Alimentació'}),g2=await service.saveGroup(f2.id,{name:'Veterinari'});
  const supplier=createSupplierInvoiceService(pool,company.id,{reader:async()=>({text:'',pages:1})}),document=await supplier.import(Buffer.from('%PDF-1.4\norganization synthetic'),year.id,'expense.pdf');let doc=await supplier.get(document.id),assignment;
  const counts=async()=>{const values={};for(const table of ['journal_entries','trade_invoices','portfolio_receipts'])values[table]=Number((await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[company.id]))[0][0].n);return values;};
  await t.test('generic companies create farms and independent groups; rejects duplicates and foreign IDs',async()=>{
   assert.equal((await service.catalog()).farms.length,2);assert.equal((await foreign.catalog()).farms.length,0);await assert.rejects(service.saveFarm({code:'A',name:'Duplicate'}),{code:'FARM_DUPLICATE_CODE'});await assert.rejects(service.saveGroup(f1.id,{name:'Alimentació'}),{code:'FARM_DUPLICATE_GROUP'});await assert.rejects(foreign.saveGroup(f1.id,{name:'Foreign'}),{code:'FARM_NOT_FOUND'});
   await assert.rejects(service.assign('document',doc.id,{farm_id:f1.id,group_id:g2.id}),{code:'FARM_GROUP_NOT_FOUND'});await assert.rejects(foreign.getAssignment('document',doc.id),{code:'INVOICE_DOCUMENT_NOT_FOUND'});
  });
  await t.test('draft classification and later changes create no invoice, receipt or journal',async()=>{
   const before=await counts();assignment=await service.assign('document',doc.id,{farm_id:f1.id,group_id:g1.id});assert.deepEqual(await counts(),before);assert.equal((await service.expenses({farm_id:f1.id,group_id:g1.id})).length,1);assert.equal((await service.expenses({farm_id:f2.id})).length,0);
   await assert.rejects(service.assign('document',doc.id,{farm_id:f2.id,group_id:g2.id,version:999}),{code:'FARM_CHANGED'});
   assignment=await service.assign('document',doc.id,{farm_id:f2.id,group_id:g2.id,version:assignment.version});assert.equal(assignment.farm_id,f2.id);assert.deepEqual(await counts(),before);
  });
  await t.test('classification follows the same document through validation and posting; can change after posting',async()=>{
   doc=await supplier.save(doc.id,{version:doc.version,draft:{supplier:{name:'Materials SL',taxId:'B12345678'},invoiceNumber:'ORG-1/2026',invoiceDate:'2026-11-06',dueDate:'2026-12-06',currency:'EUR',description:'Materials',invoiceType:'standard',taxBreakdown:[{taxType:'vat',taxableBase:'100.00',taxRate:'21.00',taxAmount:'21.00'}],withholdings:[],lines:[],total:'121.00'}});const receipt=await supplier.validate(doc.id,{version:doc.version});assert.equal((await service.getAssignment('integration',receipt.id)).id,assignment.id);
   const imported=createImportedInvoiceService(pool,company.id),row=await imported.get(receipt.id),expense=await createAccountingService(pool,company.id).createAccount({code:'6000.0001',description:'Material'});const invoice=await imported.post(row.id,{version:row.version,form:{...row.form,offset_account_id:expense.id}},'test');
   assert.equal((await service.getAssignment('invoice',invoice.id)).id,assignment.id);const before=await counts();assignment=await service.assign('invoice',invoice.id,{farm_id:f1.id,group_id:g1.id,version:assignment.version});assert.equal(assignment.document_id,doc.id);assert.deepEqual(await counts(),before);const rows=await service.expenses();assert.equal(rows.length,1);assert.equal(rows[0].total_amount,'121.00');
   await service.saveGroup(f1.id,{name:'Materials i alimentació',version:1},g1.id);assert.equal((await service.expenses())[0].group_name,'Materials i alimentació');
  });
  await t.test('backup restores farms, groups and original invoice links; classification can be cleared independently',async()=>{
   const backup=await createDataBackupService(pool,company.id).export('all'),data=readBackup(backup.file);assert.equal(data.tables.farm_expense_groups.length,2);assert.equal(data.tables.farm_expense_assignments.length,1);
   const restore=createDataBackupService(pool,other.id),preview=await restore.preview(backup.file,'all');assert.equal(preview.ready,true,JSON.stringify(preview.blockers));await restore.restore({confirm:true,token:preview.token,request_id:randomUUID()});const rows=await foreign.expenses();assert.equal(rows.length,1);assert.equal(rows[0].farm_name,'Granja A');assert.equal(rows[0].group_name,'Materials i alimentació');
   const before=await counts();await service.assign('document',doc.id,{farm_id:null,version:assignment.version});assert.equal((await service.expenses()).length,0);assert.deepEqual(await counts(),before);
  });
 }finally{
  for(const companyId of ids){for(const table of ['farm_expense_assignments','farm_expense_groups','pig_farms','supplier_invoice_revisions','invoice_documents','integration_events','integration_received_invoices','supplier_expense_preferences','data_restores','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}await pool.end();
 }
});
