import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createPurchaseOcrService,purchaseOcrLockName} from '../src/services/purchase-ocr.js';
import {createPurchaseService} from '../src/services/purchases.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
test('MySQL document extraction preserves originals, creates only a draft and detects repeated uploads',{skip:process.env.TEST_MYSQL!=='1',timeout:60000},async()=>{
 const pool=mysql.createPool(config.database);let company;
 try{
  company=await createCompanyService(pool).createCompany({name:'OCR isolation '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});
  const service=createPurchaseOcrService(pool,company.id,'ocr-reviewer'),buffer=invoicePdf(company.name,'LOCAL-OCR-1'),key=randomUUID();
  let job=await service.start(buffer,'digital.pdf',key);
  for(let attempt=0;attempt<100&&['queued','running'].includes(job.status);attempt++){await new Promise(resolve=>setTimeout(resolve,100));job=await service.get(job.id);}
  assert.equal(job.status,'done',job.error_code);assert.equal(job.engine,'pdf-text');assert.ok(job.purchase_invoice_id);
  const [[source]]=await pool.execute('SELECT content FROM company_documents WHERE company_id=? AND id=?',[company.id,job.original_document_id]);assert.deepEqual(source.content,buffer);
  const draft=await createPurchaseService(pool,company.id).get('invoices',job.purchase_invoice_id);assert.equal(draft.status,'draft');assert.equal(draft.created_by,'ocr-reviewer');assert.equal(draft.original_document_id,job.original_document_id);
  const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM trade_invoices WHERE company_id=?',[company.id]);assert.equal(count.n,0);
  assert.equal((await service.start(buffer,'digital.pdf',key)).id,job.id);
  const duplicate=await service.start(buffer,'renamed.pdf',randomUUID());assert.equal(duplicate.id,job.id);assert.equal(duplicate.possible_duplicate,true);
  const edited=await createPurchaseService(pool,company.id).save('invoices',draft.id,{...draft,reference:'MANUAL-REFERENCE',version:draft.version,request_id:randomUUID()});
  job=await service.start(buffer,'digital.pdf',randomUUID(),{forceOcr:true});
  for(let attempt=0;attempt<300&&['queued','running'].includes(job.status);attempt++){await new Promise(resolve=>setTimeout(resolve,100));job=await service.get(job.id);}
  assert.equal(job.status,'done',job.error_code);assert.equal(job.engine,'tesseract-local');assert.equal(job.purchase_invoice_id,draft.id);
  const reread=await createPurchaseService(pool,company.id).get('invoices',draft.id);assert.equal(reread.reference,'MANUAL-REFERENCE');assert.equal(reread.version,edited.version);assert.deepEqual(reread.lines,edited.lines);
  const [[originals]]=await pool.execute('SELECT COUNT(*) AS n FROM company_documents WHERE company_id=?',[company.id]);assert.equal(originals.n,1);
  const [[proposals]]=await pool.execute('SELECT COUNT(*) AS n FROM purchase_invoices WHERE company_id=?',[company.id]);assert.equal(proposals.n,1);
  // Simulate a newly interrupted worker. A live owner must block recovery;
  // disconnecting it releases the MySQL lock, with no five-minute delay.
  const blocker=await pool.getConnection();const [[locked]]=await blocker.execute('SELECT GET_LOCK(?,5) AS acquired',[purchaseOcrLockName(company.id,job.id)]);assert.equal(locked.acquired,1);
  await pool.execute("UPDATE document_extraction_jobs SET status='running',engine='tesseract-requested',created_at=NOW() WHERE company_id=? AND id=?",[company.id,job.id]);
  await service.process(job.id);const [[stillRunning]]=await pool.execute('SELECT status FROM document_extraction_jobs WHERE company_id=? AND id=?',[company.id,job.id]);assert.equal(stillRunning.status,'running');blocker.destroy();
  job=await service.get(job.id);for(let attempt=0;attempt<300&&['queued','running'].includes(job.status);attempt++){await new Promise(resolve=>setTimeout(resolve,100));job=await service.get(job.id);}
  assert.equal(job.status,'done',job.error_code);assert.equal(job.purchase_invoice_id,draft.id);const recovered=await createPurchaseService(pool,company.id).get('invoices',draft.id);assert.equal(recovered.reference,'MANUAL-REFERENCE');assert.equal(recovered.version,edited.version);
  const [[afterRecovery]]=await pool.execute('SELECT COUNT(*) AS n FROM purchase_invoices WHERE company_id=?',[company.id]);assert.equal(afterRecovery.n,1);
  await assert.rejects(createPurchaseOcrService(pool,company.id+100000).get(job.id),error=>error.code==='PURCHASE_NOT_FOUND');
 }finally{
  if(company){for(const table of ['document_extraction_jobs','purchase_invoice_links','purchase_invoice_lines','purchase_invoices','management_audit_events','management_requests','company_documents','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[company.id]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[company.id]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE id=?',[account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[company.id]);}await pool.end();
 }
});
