import test from 'node:test';
import assert from 'node:assert/strict';
import {randomInt,randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createContextService} from '../src/services/context.js';
import {createDocumentationService} from '../src/services/documentation.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {createAccessService} from '../src/services/access.js';
import {memoryAccessStore,defaultPermissions} from '../test-support/access-memory-store.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
const error=expected=>cause=>cause.code===expected;
test('MySQL document company checks route originals with reviewed ownership, permissions, retries and atomic moves',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),companies=createCompanyService(pool),ids=[],nonce=randomUUID(),tax=String(randomInt(1000000,9999999));let server;
 const create=async(label,suffix)=>{const company=await companies.createCompany({name:label+' '+nonce,tax_id:'B'+tax+suffix,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);return company;};
 const body=()=>({title:'Factura de prueba',description:'Comprobar empresa',folder:'pending_invoices',source_name:'invoice.pdf',source_mime:'application/pdf',request_id:randomUUID()});
 const count=async(table,companyId)=>(await pool.execute('SELECT COUNT(*) AS count FROM '+table+' WHERE company_id=?',[companyId]))[0][0].count;
 try{
  const source=await create('Origen','1'),target=await create('Destino','2'),hidden=await create('Sin acceso','3'),options={companyIds:[source.id,target.id],actorKey:'routing-test'};
  const docs=createDocumentationService(pool,source.id,options),destination=createDocumentationService(pool,target.id),restricted=createDocumentationService(pool,source.id);
  const pdf=(company,reference)=>invoicePdf(company.name,reference,{customerTaxId:company.tax_id,supplierTaxId:'J'+tax+'8'});
  const preview=buffer=>docs.previewEncoded({content_base64:buffer.toString('base64')});
  const reviewed=(check,targetId=target.id)=>({target_company_id:targetId,company_preview_hash:check.preview_hash,company_preview_token:check.token});
  const forceSource=async(buffer,title='Antigua factura mal archivada')=>{const check=await preview(buffer);return docs.upload(buffer,{...body(),title,...reviewed(check,source.id),confirm_company_mismatch:true});};
  const firstPdf=pdf(target,'ROUTE-1'),firstCheck=await preview(firstPdf);let routed;
  await t.test('preview is read-only, warns before writing, and saves a single original in the reviewed group company',async()=>{
   assert.equal(firstCheck.status,'other');assert.equal(firstCheck.suggested_company_id,target.id);assert.equal(await count('company_documents',source.id),0);assert.equal(await count('company_documents',target.id),0);
   await assert.rejects(docs.upload(firstPdf,body()),error('DOCUMENTATION_COMPANY_REVIEW_REQUIRED'));
   await assert.rejects(docs.upload(firstPdf,{...body(),...reviewed(firstCheck,hidden.id)}),error('ACCESS_COMPANY_DENIED'));
   const request={...body(),...reviewed(firstCheck)},results=await Promise.all([docs.upload(firstPdf,request),docs.upload(firstPdf,request)]);routed=results[0];assert.equal(results[0].id,results[1].id);assert.equal(results.filter(row=>row.replayed).length,1);
   assert.equal(routed.company_id,target.id);assert.equal(routed.reassigned,true);assert.equal(routed.destination_company.id,target.id);assert.deepEqual((await destination.source(routed.id)).content,firstPdf);assert.equal((await destination.get(routed.id)).company_check.status,'current');
   assert.equal(await count('company_documents',source.id),0);assert.equal(await count('trade_invoices',target.id),0);assert.equal(await count('journal_entries',target.id),0);
  });
  await t.test('stale company profiles, foreign destinations, mismatched files and duplicate originals never silently route',async()=>{
   const buffer=pdf(target,'STALE-ROUTING'),check=await preview(buffer);
   await companies.updateCompany(target.id,{name:target.name,tax_id:'C'+tax+'2'});
   await assert.rejects(docs.upload(buffer,{...body(),...reviewed(check)}),error('DOCUMENTATION_COMPANY_CHANGED'));
   await companies.updateCompany(target.id,{name:target.name,tax_id:target.tax_id});
   await assert.rejects(docs.upload(pdf(target,'DIFFERENT'),{...body(),...reviewed(firstCheck)}),error('DOCUMENTATION_COMPANY_CHANGED'));
   await assert.rejects(docs.upload(firstPdf,{...body(),...reviewed(firstCheck)}),error('DOCUMENTATION_COMPANY_DUPLICATE'));
   const noAccess=await restricted.previewEncoded({content_base64:pdf(hidden,'PRIVATE').toString('base64')});assert.equal(noAccess.matches.length,0);
   await assert.rejects(restricted.upload(firstPdf,{...body(),...reviewed(firstCheck)}),error('ACCESS_COMPANY_DENIED'));assert.equal(await count('company_documents',target.id),1);
  });
  await t.test('old pending originals can move atomically with metadata, stable IDs and idempotent retries',async()=>{
   const buffer=pdf(target,'OLD-MOVE'),old=await forceSource(buffer),check=await docs.checkCompany(old.id,{version:old.version});assert.equal((await docs.get(old.id)).company_check.status,'other');
   const request={title:'Trasladada',description:'Original conservado',folder:'pending_invoices',version:old.version,...reviewed(check)},results=await Promise.all([docs.update(old.id,request),docs.update(old.id,request)]);
   assert.equal(results[0].id,old.id);assert.equal(results[1].id,old.id);assert.equal(results.filter(row=>row.replayed).length,1);assert.equal(results[0].company_id,target.id);
   await assert.rejects(docs.get(old.id),error('DOCUMENTATION_NOT_FOUND'));assert.deepEqual((await destination.source(old.id)).content,buffer);assert.equal((await destination.get(old.id)).description,'Original conservado');
  });
  await t.test('a failed move, stale version or destination duplicate leaves the source original intact',async()=>{
   const buffer=pdf(target,'ROLLBACK-MOVE'),old=await forceSource(buffer),check=await docs.checkCompany(old.id,{version:old.version}),request={title:old.title,description:old.description,folder:'pending_invoices',version:old.version,...reviewed(check)};
   const failing={execute:(...args)=>pool.execute(...args),async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('UPDATE company_documents SET company_id='))throw new Error('Injected transfer failure');return db.execute(sql,args);},query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   await assert.rejects(createDocumentationService(failing,source.id,options).update(old.id,request),/Injected transfer failure/);assert.deepEqual((await docs.source(old.id)).content,buffer);assert.equal((await docs.get(old.id)).version,old.version);
   await docs.update(old.id,{...request,target_company_id:source.id,confirm_company_mismatch:true,description:'Updated source'});await assert.rejects(docs.update(old.id,request),error('DOCUMENTATION_CHANGED'));
   const duplicate=await forceSource(firstPdf),duplicateCheck=await docs.checkCompany(duplicate.id,{version:duplicate.version});await assert.rejects(docs.update(duplicate.id,{title:duplicate.title,description:duplicate.description,folder:'pending_invoices',version:duplicate.version,...reviewed(duplicateCheck)}),error('DOCUMENTATION_COMPANY_DUPLICATE'));assert.deepEqual((await docs.source(duplicate.id)).content,firstPdf);
  });
  await t.test('documents already passed to invoice drafts cannot be relocated behind their accounting links',async()=>{
   const buffer=invoicePdf(target.name,'LINKED',{customerTaxId:target.tax_id,supplierName:source.name,supplierTaxId:source.tax_id}),document=await docs.upload(buffer,body()),year=(await createContextService(pool,source.id).getContext()).exercises[0];
   await docs.toInvoices(document.id,{version:document.version,exercise_id:year.id});let current=await docs.get(document.id);current=await docs.manage(document.id,{version:current.version,managed:false});const check=await docs.checkCompany(document.id,{version:current.version});
   await assert.rejects(docs.update(document.id,{title:current.title,description:current.description,folder:'pending_invoices',version:current.version,...reviewed(check)}),error('DOCUMENTATION_COMPANY_LINKED'));assert.equal((await docs.get(document.id)).company_id,source.id);
  });
  await t.test('HTTP previews and routing enforce current membership and write permission on every request',async()=>{
   const store=memoryAccessStore({companyIds:ids}),access=createAccessService(store),actor={role:'master'};
   let profile=await access.create(actor,{username:'routing',name:'Routing user',password:'Temporary1',active:true,permissions:defaultPermissions(),company_ids:[source.id,target.id]});const signed=await access.login(profile.username,'Temporary1');
   server=createApp(createContextService(pool,source.id),{},companyScope(pool,source.id),accessControl(access)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';
   const request=(path,data)=>fetch(base+path,{method:'POST',headers:{Cookie:'accounting_session='+signed.token,'X-Company-Id':String(source.id),'Content-Type':'application/json'},body:JSON.stringify(data)}),buffer=pdf(target,'HTTP-CHECK');
   const before=await request('/documentation/preview',{content_base64:buffer.toString('base64')});assert.equal(before.status,200);const check=await before.json();assert.equal(check.suggested_company_id,target.id);
   const saved=await request('/documentation',{...body(),...reviewed(check),content_base64:buffer.toString('base64')});assert.equal(saved.status,201);assert.equal((await saved.json()).company_id,target.id);
   profile=await access.update(actor,profile.key,{version:profile.version,company_ids:[source.id]});const denied=await request('/documentation',{...body(),...reviewed(check),content_base64:buffer.toString('base64')});assert.equal(denied.status,403);
   const privateCheck=await(await request('/documentation/preview',{content_base64:buffer.toString('base64')})).json();assert.equal(privateCheck.matches.length,0);
   await access.update(actor,profile.key,{version:profile.version,permissions:{...defaultPermissions(),accounting_write:false}});assert.equal((await request('/documentation/preview',{content_base64:buffer.toString('base64')})).status,403);
  });
  await t.test('routed originals remain in the destination company backup and restore byte for byte',async()=>{
   const backup=await createDataBackupService(pool,target.id).export('all'),copy=await companies.createCompany({name:target.name,tax_id:target.tax_id,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(copy.id);
   const restore=createDataBackupService(pool,copy.id),check=await restore.preview(backup.file,'all');assert.equal(check.ready,true);await restore.restore({token:check.token,request_id:randomUUID(),confirm:true});
   const restored=(await createDocumentationService(pool,copy.id).list()).find(row=>row.source_sha256===routed.source_sha256);assert.ok(restored);assert.deepEqual((await createDocumentationService(pool,copy.id).source(restored.id)).content,firstPdf);
  });
 }finally{
  if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
  try{for(const companyId of ids){for(const table of ['data_restores','invoice_documents','company_documents','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}}finally{await pool.end();}
 }
});
