import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createDocumentationService} from '../src/services/documentation.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {requiredPermission} from '../src/middleware/access.js';
const error=code=>cause=>cause.code===code;
test('MySQL pending invoice inbox: originals, folders, versions, isolation and backup compatibility',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),companies=createCompanyService(pool),ids=[],tokens=[],name='Documentation inbox '+randomUUID();let server;
 const create=async(format='general',companyName=name)=>{const row=await companies.createCompany({name:companyName,business_format:format,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(row.id);return row;};
 try{
  const source=await create(),target=await create(),legacyTarget=await create(),foreign=await create('pig_production','Foreign '+name);
  const docs=createDocumentationService(pool,source.id),other=createDocumentationService(pool,foreign.id),bytes=Buffer.from('%PDF-1.7\nOriginal factura pendent\n');
  const body={title:'Factura octubre',description:'Pendent de revisar. Referència 123.',source_name:'factura-123.pdf',source_mime:'application/pdf',folder:'pending_invoices',request_id:randomUUID()};let pending,general;
  await t.test('pending uploads preserve originals and retries while all company formats can use the inbox',async()=>{
   const both=await Promise.all([docs.upload(bytes,body),docs.upload(bytes,body)]);pending=both[0];assert.equal(pending.id,both[1].id);assert.equal(pending.folder,'pending_invoices');
   general=await docs.upload(bytes,{...body,folder:'general',request_id:randomUUID()});
   assert.equal((await docs.list({folder:'pending_invoices'})).length,1);assert.equal((await docs.list({folder:'general'})).length,1);
   assert.equal((await docs.list({folder:'pending_invoices',search:'referencia 123'})).length,1);
   assert.deepEqual((await docs.source(pending.id)).content,bytes);
   assert.equal((await other.list({folder:'pending_invoices'})).length,0);
   assert.equal((await other.upload(bytes,{...body,request_id:randomUUID()})).folder,'pending_invoices');
   await assert.rejects(docs.upload(bytes,{...body,folder:'general'}),error('REQUEST_CONFLICT'));
   await assert.rejects(docs.list({folder:'invalid'}),error('DOCUMENTATION_INVALID_FOLDER'));
   await assert.rejects(docs.upload(bytes,{...body,folder:'invalid',request_id:randomUUID()}),error('DOCUMENTATION_INVALID_FOLDER'));
  });
  await t.test('marking as managed and reopening preserve the original and require the current company and version',async()=>{
   await assert.rejects(other.manage(pending.id,{version:pending.version,managed:true}),error('DOCUMENTATION_NOT_FOUND'));
   await assert.rejects(docs.manage(general.id,{version:general.version,managed:true}),error('DOCUMENTATION_INVALID_FOLDER'));
   await assert.rejects(docs.manage(pending.id,{version:pending.version,managed:'yes'}),error('DOCUMENTATION_INVALID_FOLDER'));
   const oldVersion=pending.version;pending=await docs.manage(pending.id,{version:pending.version,managed:true});assert.equal(pending.folder,'managed_invoices');
   assert.equal((await docs.list({folder:'pending_invoices'})).length,0);assert.equal((await docs.list({folder:'managed_invoices'})).length,1);
   await assert.rejects(docs.manage(pending.id,{version:oldVersion,managed:false}),error('DOCUMENTATION_CHANGED'));
   pending=await docs.update(pending.id,{title:pending.title,description:'Gestió revisada',version:pending.version});assert.equal(pending.folder,'managed_invoices');
   pending=await docs.manage(pending.id,{version:pending.version,managed:false});assert.equal(pending.folder,'pending_invoices');
   assert.deepEqual((await docs.source(pending.id)).content,bytes);
   assert.equal((await docs.upload(bytes,body)).id,pending.id);
   const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM journal_entries WHERE company_id=?',[source.id]);assert.equal(count.n,0);
  });
  await t.test('existing general documents can be moved to pending, and the HTTP action keeps company scope',async()=>{
   general=await docs.update(general.id,{title:general.title,description:general.description,version:general.version,folder:'pending_invoices'});
   assert.equal((await docs.list({folder:'general'})).length,0);assert.equal((await docs.list({folder:'pending_invoices'})).length,2);
   const context=createContextService(pool,source.id);
   server=createApp(context,createAccountingService(pool,source.id),companyScope(pool,source.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port+'/api',action=(companyId,version)=>fetch(base+'/documentation/'+general.id+'/manage',{method:'POST',headers:{'Content-Type':'application/json','X-Company-Id':String(companyId)},body:JSON.stringify({version,managed:true})});
   assert.equal((await action(foreign.id,general.version)).status,404);
   const response=await action(source.id,general.version);assert.equal(response.status,200);general=await response.json();assert.equal(general.folder,'managed_invoices');
   assert.equal((await action(source.id,1)).status,409);
   assert.equal(requiredPermission('POST','/documentation/'+general.id+'/manage'),'accounting_write');
  });
  await t.test('backups preserve pending and managed folders, and older copies restore to general documents',async()=>{
   const backup=await createDataBackupService(pool,source.id).export(),data=readBackup(backup.file),restore=createDataBackupService(pool,target.id);
   assert.deepEqual(data.tables.company_documents.map(row=>row.folder).sort(),['managed_invoices','pending_invoices']);
   const ready=await restore.preview(backup.file);tokens.push([restore,ready.token]);assert.equal(ready.ready,true);
   await restore.restore({token:ready.token,confirm:true,request_id:randomUUID()});
   const restored=createDocumentationService(pool,target.id);assert.equal((await restored.list({folder:'pending_invoices'})).length,1);assert.equal((await restored.list({folder:'managed_invoices'})).length,1);
   assert.deepEqual((await restored.source((await restored.list())[0].id)).content,bytes);
   const old=structuredClone(data);delete old.checksum;old.schema.company_documents=old.schema.company_documents.filter(field=>!['folder','invoice_extraction'].includes(field));for(const row of [...old.tables.company_documents,...old.references.company_documents]){delete row.folder;delete row.invoice_extraction;}
   const legacy=createDataBackupService(pool,legacyTarget.id),oldReady=await legacy.preview(packBackup(sealBackup(old)));tokens.push([legacy,oldReady.token]);assert.equal(oldReady.ready,true);
   await legacy.restore({token:oldReady.token,confirm:true,request_id:randomUUID()});
   assert.equal((await createDocumentationService(pool,legacyTarget.id).list({folder:'general'})).length,2);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const [owner,token]of tokens)await owner.discard(token);
  for(const companyId of ids){for(const table of ['data_restores','company_documents','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
