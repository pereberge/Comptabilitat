import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createCompanyDatabases} from '../src/db/company-databases.js';
import {provisionCompanyDatabase} from '../src/services/company-database-provision.js';
import {createCompanyDatabaseContext} from '../src/services/company-database-context.js';
import {createDocumentationService} from '../src/services/documentation.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {randomUUID} from 'node:crypto';
import {invoicePdf} from '../test-support/invoice-fixture.js';
import {sample} from '../test-support/integrations/invoice.js';
import {createIntegrationReceptionService} from '../src/integrations/received-invoices.js';
import {createCompanyDatabaseBackups} from '../src/services/company-database-backups.js';

test('real databases: verified split, IDs, blobs, triggers, isolated writes, HTTP selection and central identities',{skip:process.env.TEST_COMPANY_DATABASES!=='1'},async()=>{
 assert.equal(config.database.database,'company_split_test','Requires a disposable dedicated database');
 const pool=mysql.createPool(config.database),registry=createCompanyDatabases(pool,config.database);let server;
 try{
  const service=createCompanyService(pool);
  const first=await service.createCompany({name:'Isolated One',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});
  const second=await service.createCompany({name:'Isolated Two',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});
  for(const company of [first,second])await pool.execute("INSERT INTO accounts(company_id,code,description,kind) VALUES (?,'400',?,'account')",[company.id,company.name+' private']);
  await pool.execute("INSERT INTO document_company_access(company_id,user_key) VALUES (?,'user')",[first.id]);
  const original=Buffer.from('original binary document\x00\xff');
  await createDocumentationService(pool,first.id).upload(original,{title:'Private document',description:'',source_name:'private.bin',source_mime:'application/octet-stream',request_id:randomUUID()});
  const before=await pool.execute('SELECT id,company_id FROM accounts ORDER BY id');
  for(const company of [first,second]){
   const manifest=await provisionCompanyDatabase(pool,config.database.database,company.id);
   assert.ok(manifest.tables.find(table=>table.table==='accounts').sha256);
  }
  assert.deepEqual((await pool.execute('SELECT id,company_id FROM accounts ORDER BY id'))[0],before[0]);
  await assert.rejects(provisionCompanyDatabase(pool,config.database.database,first.id),/ALREADY_REGISTERED/);
  const one=await registry.forCompany(first.id),two=await registry.forCompany(second.id);
  assert.equal((await one.execute('SELECT id FROM companies'))[0].length,1);
  assert.equal((await one.execute('SELECT id FROM accounts WHERE company_id=?',[second.id]))[0].length,0);
  assert.deepEqual((await one.execute('SELECT content FROM company_documents'))[0][0].content,original);
  const [identities]=await one.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('app_users','app_sessions')");assert.equal(identities.length,0);
  await one.execute("UPDATE accounts SET description='Updated only in company one' WHERE company_id=?",[first.id]);
  assert.equal((await two.execute('SELECT description FROM accounts'))[0][0].description,'Isolated Two private');
  assert.equal((await pool.execute('SELECT description FROM accounts WHERE company_id=?',[first.id]))[0][0].description,'Isolated One private');
  await assert.rejects(one.execute("INSERT INTO accounting_exercises(company_id,name,start_date,end_date) VALUES (?,'overlap','2026-01-01','2026-12-31')",[first.id]),error=>error.message.includes('EXERCISE_PERIOD_OVERLAP'));
  const context=createCompanyDatabaseContext(pool,registry);
  assert.equal((await context.listCompanies()).length,2);
  assert.deepEqual((await context.listCompanies([second.id])).map(row=>row.id),[second.id]);
  const reception=createIntegrationReceptionService(pool,{companyDatabases:registry});
  await reception.linkCompany({clientId:'test',sourceSystem:'gestio',externalCompanyId:'piensos-arb',companyId:second.id});
  const received=await reception.receive({clientId:'test',sourceSystem:'gestio'},sample(),randomUUID());
  assert.equal(received.companyId,second.id);
  assert.equal((await two.execute('SELECT id FROM integration_received_invoices'))[0].length,1);
  assert.equal((await one.execute('SELECT id FROM integration_received_invoices'))[0].length,0);
  assert.equal((await pool.execute('SELECT id FROM integration_received_invoices'))[0].length,0);
  assert.equal((await reception.receive({clientId:'test',sourceSystem:'gestio'},sample(),randomUUID())).replayed,true);
  const docs=createDocumentationService(one,first.id,{companyDatabases:registry,companyIds:null});
  const pdf=invoicePdf('Isolated Two');
  const preview=await docs.previewEncoded({content_base64:pdf.toString('base64')});
  assert.equal(preview.suggested_company_id,second.id);
  const routed=await docs.upload(pdf,{title:'Routed document',description:'',source_name:'invoice.pdf',source_mime:'application/pdf',request_id:randomUUID(),folder:'pending_invoices',target_company_id:second.id,company_preview_hash:preview.preview_hash,company_preview_token:preview.token});
  assert.equal(routed.company_id,second.id);
  assert.deepEqual((await two.execute('SELECT content FROM company_documents'))[0][0].content,pdf);
  const otherPdf=invoicePdf('Isolated Two','MOVE-1'),otherProof=await docs.previewEncoded({content_base64:otherPdf.toString('base64')});
  const own=await docs.upload(otherPdf,{title:'Move across databases',description:'',source_name:'move.pdf',source_mime:'application/pdf',request_id:randomUUID(),folder:'pending_invoices',confirm_company_mismatch:true,company_preview_hash:otherProof.preview_hash,company_preview_token:otherProof.token});
  const moveProof=await docs.checkCompany(own.id,{version:own.version});
  // The destination already has this ID: the transaction must keep the source.
  await assert.rejects(docs.update(own.id,{title:own.title,description:'',folder:'pending_invoices',version:own.version,target_company_id:second.id,company_preview_hash:moveProof.preview_hash,company_preview_token:moveProof.token}),error=>error.code==='ER_DUP_ENTRY');
  assert.equal((await docs.get(own.id)).company_id,first.id);
  const nextPdf=invoicePdf('Isolated Two','MOVE-2'),nextProof=await docs.previewEncoded({content_base64:nextPdf.toString('base64')});
  const movable=await docs.upload(nextPdf,{title:'Successful move',description:'',source_name:'move2.pdf',source_mime:'application/pdf',request_id:randomUUID(),folder:'pending_invoices',confirm_company_mismatch:true,company_preview_hash:nextProof.preview_hash,company_preview_token:nextProof.token});
  const finalProof=await docs.checkCompany(movable.id,{version:movable.version});
  const moved=await docs.update(movable.id,{title:movable.title,description:'',folder:'pending_invoices',version:movable.version,target_company_id:second.id,company_preview_hash:finalProof.preview_hash,company_preview_token:finalProof.token});
  assert.equal(moved.company_id,second.id);assert.equal(moved.version,movable.version+1);
  await assert.rejects(docs.get(movable.id),{code:'DOCUMENTATION_NOT_FOUND'});
  const backups=createCompanyDatabaseBackups(registry);
  const [oneSettings,twoSettings]=await Promise.all([(await backups.forCompany(first.id)).settings(),(await backups.forCompany(second.id)).settings()]);
  assert.ok(oneSettings);assert.ok(twoSettings);await backups.stop();
  // Fresh companies are provisioned through the same application facade.
  const facade=createCompanyDatabaseContext(pool,registry,{provision:companyId=>provisionCompanyDatabase(pool,config.database.database,companyId)});
  const fresh=await facade.createCompany({name:'Fresh isolated',exercise:{name:'2027',start_date:'2027-01-01',end_date:'2027-12-31'}});
  assert.equal((await registry.forCompany(fresh.id)).pool.config.connectionConfig.database,config.database.database+'_company_'+fresh.id);
  const access={router:(req,res,next)=>next(),middleware(req,res,next){req.user={role:'user',company_ids:[first.id],permissions:{}};next();}};
  server=createApp(context,{},companyScope(pool,first.id,{companyDatabases:registry}),access).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/api';
  const selected=await fetch(url+'/accounts',{headers:{'X-Company-Id':String(first.id)}});assert.equal(selected.status,200);assert.equal((await selected.json())[0].description,'Updated only in company one');
  assert.equal((await fetch(url+'/accounts',{headers:{'X-Company-Id':String(second.id)}})).status,403);
  assert.equal((await fetch(url+'/context',{headers:{'X-Company-Id':String(first.id)}})).status,200);
  // A company with no route fails closed even if its old rows still exist centrally.
  const third=await service.createCompany({name:'Not provisioned',exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});
  await assert.rejects(registry.forCompany(third.id),{code:'COMPANY_DATABASE_NOT_CONFIGURED'});
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await registry.end();await pool.end();}
});
