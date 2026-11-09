import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createPurchaseService} from '../src/services/purchases.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createContextService} from '../src/services/context.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
const error=code=>cause=>cause.code===code;

test('MySQL purchases: partial receipts, multi-document invoices, exact posting, isolation, permissions and backup',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[];let server;
 const cleanup=['document_extraction_jobs','purchase_invoice_links','purchase_invoice_lines','purchase_invoices','purchase_order_receipts','purchase_receipt_lines','purchase_receipts','purchase_order_lines','purchase_orders','purchase_supplier_items','purchase_items','purchase_units','management_audit_events','management_requests','invoice_documents','company_documents','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','data_restores','company_details','accounting_exercises'];
 try{
  const companies=createCompanyService(pool),company=await companies.createCompany({name:'Purchase tests '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);
  const foreign=await companies.createCompany({name:'Foreign purchase tests '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(foreign.id);
  const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);
  const accounting=createAccountingService(pool,company.id),service=createPurchaseService(pool,company.id,'test-user');
  const vendor=await accounting.createAccount({code:'4000.0001',description:'Supplier',party_profile:{name:'Supplier',tax_id:'B12345674'}});
  const unit=await service.createUnit({code:'kg',name:'Quilograms',dimension:'mass',request_id:randomUUID()});
  const item=await service.createItem({code:'MAT-1',description:'Material',unit_id:unit.id,supplier_account_id:vendor.id,supplier_code:'SUP-1',request_id:randomUUID()});
  const line=(quantity,links=[])=>({item_id:item.id,description:'Material',quantity,unit_price:'2.50',discount_rate:'0',tax_rate:'21',links});
  const body=(reference,lines)=>({supplier_account_id:vendor.id,reference,document_date:'2026-11-01',due_date:'2026-11-30',lines,request_id:randomUUID()});
  const confirm=(kind,doc)=>service.confirm(kind,doc.id,{version:doc.version,request_id:randomUUID(),reviewed:true,accept_differences:true,exercise_id:year.id,posting_date:'2026-11-01'});
  let order,receiptA,receiptB,invoiceA,invoiceB;
  await t.test('drafts are not posted and company scope rejects foreign items and suppliers',async()=>{
   order=await service.save('orders',null,body('ORDER-1',[line('10')]));
   assert.equal(order.status,'draft');assert.equal((await pool.execute('SELECT COUNT(*) AS n FROM trade_invoices WHERE company_id=?',[company.id]))[0][0].n,0);
   await assert.rejects(createPurchaseService(pool,foreign.id).get('orders',order.id),error('PURCHASE_NOT_FOUND'));
   await assert.rejects(createPurchaseService(pool,foreign.id).save('orders',null,body('FOREIGN',[line('1')])),error('PURCHASE_INVALID_SUPPLIER'));
   await assert.rejects(service.confirm('orders',order.id,{version:order.version,request_id:randomUUID()}),error('PURCHASE_REVIEW_REQUIRED'));
   order=await confirm('orders',order);
  });
  await t.test('one order receives two partial deliveries, without duplicate quantities',async()=>{
   receiptA=await service.save('receipts',null,body('DELIVERY-A',[line('4',[{kind:'order',line_id:order.lines[0].id,quantity:'4'}])]));receiptA=await confirm('receipts',receiptA);
   assert.equal((await service.list('orders'))[0].progress,'partial');
   receiptB=await service.save('receipts',null,body('DELIVERY-B',[line('6',[{kind:'order',line_id:order.lines[0].id,quantity:'6'}])]));receiptB=await confirm('receipts',receiptB);
   assert.equal((await service.list('orders'))[0].progress,'complete');
   await assert.rejects(service.save('receipts',null,body('OVER',[line('1',[{kind:'order',line_id:order.lines[0].id,quantity:'1'}])])),error('PURCHASE_QUANTITY_EXCEEDED'));
   await assert.rejects(service.cancel('orders',order.id,{version:order.version,request_id:randomUUID()}),error('PURCHASE_HAS_DEPENDENCIES'));
  });
  await t.test('a delivery is invoiced partially and another invoice includes multiple deliveries',async()=>{
   invoiceA=await service.save('invoices',null,body('INVOICE-A',[line('3',[{kind:'receipt',line_id:receiptA.lines[0].id,quantity:'3'}])]));
   const key=randomUUID(),request={version:invoiceA.version,request_id:key,reviewed:true,accept_differences:true,exercise_id:year.id,posting_date:'2026-11-01'};
   invoiceA=await service.confirm('invoices',invoiceA.id,request);assert.ok(invoiceA.invoice_id);assert.equal(invoiceA.totals.total,'9.08');
   assert.equal((await service.confirm('invoices',invoiceA.id,request)).invoice_id,invoiceA.invoice_id);
   invoiceB=await service.save('invoices',null,body('INVOICE-B',[line('7',[{kind:'receipt',line_id:receiptA.lines[0].id,quantity:'1'},{kind:'receipt',line_id:receiptB.lines[0].id,quantity:'6'}])]));invoiceB=await confirm('invoices',invoiceB);
   assert.equal(invoiceB.lines[0].links.length,2);assert.equal((await service.prices(item.id)).length,2);
   assert.equal((await pool.execute('SELECT COUNT(*) AS n FROM portfolio_receipts WHERE company_id=?',[company.id]))[0][0].n,2);
   await assert.rejects(service.save('invoices',null,body('OVER-BILL',[line('1',[{kind:'receipt',line_id:receiptA.lines[0].id,quantity:'1'}])])),error('PURCHASE_QUANTITY_EXCEEDED'));
   await assert.rejects(service.save('invoices',null,body('OVER-ORDER',[line('1',[{kind:'order',line_id:order.lines[0].id,quantity:'1'}])])),error('PURCHASE_QUANTITY_EXCEEDED'));
   const duplicate=await service.save('invoices',null,body('INVOICE-A',[line('1')]));await assert.rejects(confirm('invoices',duplicate),error('PURCHASE_DUPLICATE'));
   assert.ok((await service.audit('invoices',invoiceA.id)).every(row=>row.actor==='test-user'));
  });
  await t.test('stale drafts and permission bypasses cannot confirm an invoice',async()=>{
   const doc=await service.save('orders',null,body('EDIT-ME',[line('1')]));
   await service.save('orders',doc.id,{...body('EDITED',[line('2')]),version:doc.version});
   await assert.rejects(confirm('orders',doc),error('PURCHASE_CHANGED'));
   let permissions={purchases_read:true,purchases_write:false,purchases_confirm:false};
   const access=accessControl({current:async()=>({key:'test-user',role:'master',permissions})});
   server=createApp(createContextService(pool,company.id),accounting,companyScope(pool,company.id),access).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port+'/api/purchases';
   assert.equal((await fetch(base+'/catalog',{headers:{'X-Company-Id':String(company.id)}})).status,200);
   assert.equal((await fetch(base+'/units',{method:'POST',headers:{'Content-Type':'application/json','X-Company-Id':String(company.id)},body:JSON.stringify({code:'x',name:'x',dimension:'unit',request_id:randomUUID()})})).status,403);
   permissions={purchases_read:false,purchases_write:true,purchases_confirm:true};assert.equal((await fetch(base+'/catalog',{headers:{'X-Company-Id':String(company.id)}})).status,403);
  });
  await t.test('company backup contains purchase lines, partial links and immutable audit',async()=>{
   const exported=await createDataBackupService(pool,company.id).export('all');
   assert.equal(exported.data.tables.purchase_orders.length,2);assert.equal(exported.data.tables.purchase_invoice_links.length,3);assert.ok(exported.data.tables.management_audit_events.length>0);
   const target=await companies.createCompany({name:company.name,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(target.id);
   const restore=createDataBackupService(pool,target.id),preview=await restore.preview(exported.file,'all');assert.equal(preview.ready,true);
   await restore.restore({token:preview.token,request_id:randomUUID(),confirm:true});
   const restored=createPurchaseService(pool,target.id),invoices=await restored.list('invoices'),confirmed=invoices.filter(row=>row.status==='confirmed');assert.equal(confirmed.length,2);
   const restoredInvoice=await restored.get('invoices',confirmed.find(row=>row.reference==='INVOICE-B').id);assert.equal(restoredInvoice.lines[0].links.length,2);
  });
  await t.test('concurrent receipts and invoices cannot consume the same pending quantity twice',async()=>{
   const concurrentOrder=await confirm('orders',await service.save('orders',null,body('CONCURRENT-ORDER',[line('1')])));
   const receipts=[];
   for(const reference of ['CONCURRENT-RECEIPT-A','CONCURRENT-RECEIPT-B'])receipts.push(await service.save('receipts',null,body(reference,[line('1',[{kind:'order',line_id:concurrentOrder.lines[0].id,quantity:'1'}])])));
   const received=await Promise.allSettled(receipts.map(receipt=>confirm('receipts',receipt)));
   assert.equal(received.filter(result=>result.status==='fulfilled').length,1);assert.equal(received.filter(result=>result.status==='rejected'&&result.reason.code==='PURCHASE_QUANTITY_EXCEEDED').length,1);
   const current=await service.get('orders',concurrentOrder.id);assert.equal(current.lines[0].received_quantity,'1.000000');assert.equal(current.lines[0].pending_quantity,'0.000000');
   const receipt=received.find(result=>result.status==='fulfilled').value,invoices=[];
   for(const reference of ['CONCURRENT-INVOICE-A','CONCURRENT-INVOICE-B'])invoices.push(await service.save('invoices',null,body(reference,[line('1',[{kind:'receipt',line_id:receipt.lines[0].id,quantity:'1'}])])));
   const billed=await Promise.allSettled(invoices.map(invoice=>confirm('invoices',invoice)));
   assert.equal(billed.filter(result=>result.status==='fulfilled').length,1);assert.equal(billed.filter(result=>result.status==='rejected'&&result.reason.code==='PURCHASE_QUANTITY_EXCEEDED').length,1);
   const currentReceipt=await service.get('receipts',receipt.id);assert.equal(currentReceipt.lines[0].invoiced_quantity,'1.000000');assert.equal(currentReceipt.lines[0].pending_invoice_quantity,'0.000000');
   const [[posted]]=await pool.execute("SELECT COUNT(*) AS n FROM trade_invoices WHERE company_id=? AND reference LIKE 'CONCURRENT-INVOICE-%'",[company.id]);assert.equal(posted.n,1);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){for(const table of cleanup)await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE id=?',[account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
