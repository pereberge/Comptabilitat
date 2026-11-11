import test from 'node:test';import assert from 'node:assert/strict';import mysql from 'mysql2/promise';import {randomUUID,createHash} from 'node:crypto';
import {config} from '../src/config.js';import {createCompanyService} from '../src/services/companies.js';import {createAccountingService} from '../src/services/accounting.js';import {createDocumentationService} from '../src/services/documentation.js';
import {createPurchaseOcrService} from '../src/services/purchase-ocr.js';import {createPurchaseService} from '../src/services/purchases.js';import {santIsidrePdf} from '../test-support/sant-isidre-fixture.js';
import {createDataBackupService} from '../src/services/data-backup.js';
test('MySQL batch recognition fills an untouched placeholder, keeps two invoices separate and preserves manual corrections on recovery',{skip:process.env.TEST_MYSQL!=='1',timeout:60000},async()=>{
 const pool=mysql.createPool(config.database),ids=[];let company;
 try{
  company=await createCompanyService(pool).createCompany({name:'Batch isolation '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});
  ids.push(company.id);
  const purchases=createPurchaseService(pool,company.id),supplierBody={party:{name:'Supplier legal title',tax_id:'F25003518',address:'TEST ADDRESS'},request_id:randomUUID()};
  const supplier=await purchases.createSupplier(supplierBody);assert.equal((await purchases.createSupplier(supplierBody)).id,supplier.id);assert.equal((await purchases.createSupplier({...supplierBody,request_id:randomUUID()})).id,supplier.id);
  const buffer=santIsidrePdf(company.name),key=randomUUID(),source=await createDocumentationService(pool,company.id).upload(buffer,{title:'Batch original',description:'',folder:'general',auto_detect:false,source_name:'batch.pdf',source_mime:'application/pdf',request_id:key});
  const placeholder=await purchases.save('invoices',null,{reference:'',document_date:null,due_date:null,original_document_id:source.id,notes:'Dades reconegudes pendents de revisió.',lines:[{description:'Pendent de completar amb el document',quantity:'1',unit_price:null,tax_rate:'0',discount_rate:'0',links:[]}],request_id:randomUUID()});
  const [inserted]=await pool.execute("INSERT INTO document_extraction_jobs(company_id,original_document_id,created_by,request_id,source_sha256,status) VALUES (?,?,?,?,?,'running')",[company.id,source.id,'batch-reviewer',key,createHash('sha256').update(buffer).digest('hex')]);
  const service=createPurchaseOcrService(pool,company.id);async function wait(){let result=await service.get(inserted.insertId);for(let n=0;n<300&&['queued','running'].includes(result.status);n++){await new Promise(resolve=>setTimeout(resolve,100));result=await service.get(result.id);}assert.equal(result.status,'done',result.error_code);return result;}
  const job=await wait();assert.equal(job.result.proposals.length,2);assert.equal(job.result.proposals[0].id,placeholder.id);
  const first=await purchases.get('invoices',job.result.proposals[0].id),second=await purchases.get('invoices',job.result.proposals[1].id);
  assert.equal(first.reference,'2026-1-TEST-A');assert.equal(second.reference,'2026-1-TEST-B');assert.equal(first.lines.length,37);assert.equal(second.lines.length,20);assert.equal(first.supplier_account_id,supplier.id);assert.equal(second.supplier_account_id,supplier.id);
  assert.equal(first.extraction.base_total,'37.00');assert.equal(first.extraction.tax_total,'3.70');assert.equal(first.extraction.total_amount,'40.70');assert.deepEqual(second.extraction.source_pages,[4,5]);assert.equal(first.original_document_id,second.original_document_id);
  const edited=await purchases.save('invoices',first.id,{...first,reference:'MANUAL-CORRECTION',lines:first.lines.map((row,index)=>({...row,description:index?row.description:'Reviewed line'})),request_id:randomUUID()});
  await pool.execute("UPDATE document_extraction_jobs SET status='running',engine=NULL,created_at=NOW() WHERE company_id=? AND id=?",[company.id,job.id]);const recovered=await wait();assert.deepEqual(recovered.result.proposals.map(row=>row.id),job.result.proposals.map(row=>row.id));
  const manual=await purchases.get('invoices',first.id);assert.equal(manual.reference,'MANUAL-CORRECTION');assert.equal(manual.lines[0].description,'Reviewed line');assert.equal(manual.version,edited.version);
  const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM purchase_invoices WHERE company_id=?',[company.id]);assert.equal(count.n,2);const [[posted]]=await pool.execute('SELECT COUNT(*) AS n FROM trade_invoices WHERE company_id=?',[company.id]);assert.equal(posted.n,0);
  const [[original]]=await pool.execute('SELECT content FROM company_documents WHERE company_id=? AND id=?',[company.id,source.id]);assert.deepEqual(original.content,buffer);
  await assert.rejects(createPurchaseService(pool,company.id+100000).get('invoices',first.id),error=>error.code==='PURCHASE_NOT_FOUND');
  const copy=await createDataBackupService(pool,company.id).export('all'),target=await createCompanyService(pool).createCompany({name:company.name,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(target.id);
  const restore=createDataBackupService(pool,target.id),preview=await restore.preview(copy.file,'all');assert.equal(preview.ready,true);await restore.restore({token:preview.token,request_id:randomUUID(),confirm:true});
  const [[restoredJob]]=await pool.execute('SELECT id FROM document_extraction_jobs WHERE company_id=?',[target.id]);const imported=await createPurchaseOcrService(pool,target.id).get(restoredJob.id);
  assert.equal(imported.result.proposals.length,2);assert.notEqual(imported.result.proposals[0].id,first.id);assert.equal(imported.purchase_invoice_id,imported.result.proposals[0].id);
  const restored=createPurchaseService(pool,target.id);assert.equal((await restored.get('invoices',imported.result.proposals[0].id)).lines.length,37);assert.equal((await restored.get('invoices',imported.result.proposals[1].id)).lines.length,20);
 }finally{
  for(const companyId of ids){for(const table of ['document_extraction_jobs','purchase_invoice_links','purchase_invoice_lines','purchase_invoices','management_audit_events','management_requests','data_restores','company_documents','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE id=?',[account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}await pool.end();
 }
});
