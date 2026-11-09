import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createSupplierGmailService} from '../src/services/supplier-invoices/gmail.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
test('Gmail OAuth company/actor binding, encrypted grants, date filters, duplicate attachments and safe import errors',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[];
 const keys=['GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REDIRECT_URI','GMAIL_ENCRYPTION_KEY'],previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 Object.assign(process.env,{GMAIL_CLIENT_ID:'test-client',GMAIL_CLIENT_SECRET:'test-secret',GMAIL_REDIRECT_URI:'http://127.0.0.1:5180/facturas-proveedores',GMAIL_ENCRYPTION_KEY:randomBytes(32).toString('base64')});
 try{
  const company=await context.createCompany({name:'Gmail synthetic '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);
  const other=await context.createCompany({name:'Gmail foreign '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(other.id);
  const exercise=(await context.getContext(company.id)).exercises[0],bytes=await invoicePdf('generic');let seenQuery,pkce,refreshGrant;
  const transport=async(value,options)=>{
   const url=new URL(value);let body;
   if(url.hostname==='oauth2.googleapis.com'){pkce||=options.body.get('code_verifier');refreshGrant||=options.body.get('refresh_token');body={refresh_token:'synthetic-refresh-token',access_token:'synthetic-access',scope:'https://www.googleapis.com/auth/gmail.readonly'};}
   else if(url.pathname.endsWith('/profile'))body={emailAddress:'test@example.invalid'};
   else if(url.pathname.endsWith('/messages')){seenQuery=url.searchParams.get('q');body={messages:[{id:'synthetic-message'}]};}
   else if(url.pathname.endsWith('/messages/synthetic-message'))body={payload:{headers:[{name:'Subject',value:'Synthetic invoice'}],parts:[{partId:'1',filename:'one.pdf',body:{data:bytes.toString('base64url')}},{partId:'2',filename:'copy.pdf',body:{data:bytes.toString('base64url')}},{partId:'3',filename:'corrupt.pdf',body:{data:Buffer.from('invalid PDF').toString('base64url')}}]}};
   else throw new Error('Unexpected Google request');
   return new Response(JSON.stringify(body),{status:200});
  };
  const options={actor:'test-user',transport},gmail=createSupplierGmailService(pool,company.id,options);
  await gmail.save({email:'test@example.invalid',startDate:'2026-11-01'});await gmail.save({email:'second@example.invalid',startDate:'2026-01-01'});const [box]=await gmail.list();assert.equal((await gmail.list()).length,2);
  const auth=await gmail.authorize(box.id),state=new URL(auth.url).searchParams.get('state');assert.equal(new URL(auth.url).searchParams.get('code_challenge_method'),'S256');
  await assert.rejects(createSupplierGmailService(pool,other.id,options).complete({state,code:'fake'}),{code:'GMAIL_STATE_INVALID'});
  await assert.rejects(createSupplierGmailService(pool,company.id,{...options,actor:'other-user'}).complete({state,code:'fake'}),{code:'GMAIL_STATE_INVALID'});
  await gmail.complete({state,code:'fake'});assert.ok(pkce);await assert.rejects(gmail.complete({state,code:'fake'}),{code:'GMAIL_STATE_INVALID'});
  const [[stored]]=await pool.execute('SELECT encrypted_token FROM supplier_gmail_mailboxes WHERE company_id=? AND id=?',[company.id,box.id]);assert.ok(!stored.encrypted_token.includes('synthetic-refresh-token'));assert.equal((await gmail.list())[0].connected,1);
  const result=await gmail.sync(box.id,exercise.id);assert.deepEqual(result,{imported:1,duplicates:1,errors:1});assert.equal(refreshGrant,'synthetic-refresh-token');assert.match(seenQuery,/has:attachment filename:pdf after:/);
  const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM invoice_documents WHERE company_id=?',[company.id]);assert.equal(count.n,1);
  await assert.rejects(gmail.sync(box.id,exercise.id),{code:'GMAIL_BUSY'});await pool.execute('UPDATE supplier_gmail_mailboxes SET next_sync_at=NULL WHERE company_id=?',[company.id]);
  assert.deepEqual(await gmail.sync(box.id,exercise.id),{imported:0,duplicates:2,errors:1});const [errors]=await pool.execute('SELECT error_code FROM supplier_invoice_import_errors WHERE company_id=?',[company.id]);assert.ok(errors.some(e=>e.error_code==='INVOICE_PDF_INVALID'));
  await gmail.disconnect(box.id);assert.equal((await gmail.list())[0].connected,0);
 }finally{
  for(const companyId of ids){for(const table of ['supplier_invoice_revisions','supplier_invoice_import_errors','supplier_gmail_mailboxes','gmail_imports','invoice_documents','integration_events','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}await pool.end();
  for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
 }
});
