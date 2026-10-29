import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createAccessService,mysqlAccessStore} from '../src/services/access.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {defaultPermissions,legacyPasswordHash} from '../test-support/access-memory-store.js';
const rejects=code=>error=>error.code===code;

test('MySQL user lifecycle, company boundaries and master-only journal line removal',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool({...config.database,connectionLimit:6}),companies=[],users=[];let server;
 const store=mysqlAccessStore(pool),service=createAccessService(store),actor={role:'master'},suffix=randomUUID().replaceAll('-','');
 const originalMaster=await store.user('master');
 try{
  const context=createContextService(pool,config.companyId);
  for(const label of ['Assigned','Private'])companies.push(await context.createCompany({name:'Fictitious access '+label+' '+suffix,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}}));
  const [assigned,foreign]=companies;
  const body={username:'auth_test_'+suffix,name:'Fictitious user',email:'auth-fixture@example.test',password:'temporary-password-'+suffix,active:true,permissions:defaultPermissions(),company_ids:[assigned.id]};
  let profile=await service.create(actor,body);users.push(profile.key);assert.deepEqual(profile.company_ids,[assigned.id]);assert.equal(profile.role,'user');assert.equal(profile.email,'auth-fixture@example.test');assert.equal((await store.user(profile.key)).email,profile.email);
  assert.equal(await service.current(),null);assert.equal((await service.state()).user,null);
  const legacy=legacyPasswordHash(body.password);await pool.execute("UPDATE app_users SET password_hash=? WHERE user_key=? AND role='user'",[legacy,profile.key]);
  const signed=await service.login(profile.username,body.password),signedAgain=await service.login(profile.username.toUpperCase(),body.password.toUpperCase());assert.equal((await service.current(signed.token)).key,profile.key);assert.match((await store.user(profile.key)).password_hash,/^scrypt-ci:/);assert.equal((await store.user(profile.key)).version,profile.version);assert.equal(await store.upgradePassword(profile.key,legacy,legacy),false);
  const [[session]]=await pool.execute('SELECT token_hash FROM app_sessions WHERE token_hash=?',[createHash('sha256').update(signed.token).digest('hex')]);assert.ok(session);assert.notEqual(session.token_hash,signed.token);
  await assert.rejects(service.create(actor,body),rejects('ACCESS_USERNAME_TAKEN'));
  await assert.rejects(service.create(actor,{...body,username:'invalid_'+suffix,company_ids:[4294967295]}),rejects('ACCESS_INVALID_COMPANIES'));
  assert.equal(await store.byUsername('invalid_'+suffix),null);
  const before=await store.user(profile.key);
  await assert.rejects(service.update(actor,profile.key,{version:profile.version,name:'Must roll back',company_ids:[4294967295]}),rejects('ACCESS_INVALID_COMPANIES'));assert.deepEqual(await store.user(profile.key),before);
  server=createApp(context,{},companyScope(pool,config.companyId),accessControl(service)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';
  const request=(path,companyId=assigned.id)=>fetch(base+path,{headers:{Cookie:'accounting_session='+signed.token,'X-Company-Id':String(companyId)}});
  assert.deepEqual((await(await request('/companies')).json()).map(row=>row.id),[assigned.id]);assert.equal((await(await request('/context')).json()).company.id,assigned.id);
  assert.equal((await request('/context',foreign.id)).status,403);assert.equal((await request('/companies/'+foreign.id)).status,403);assert.equal((await request('/companies/'+foreign.id+'/logo')).status,403);
  const exercise=(await context.getContext(assigned.id)).exercises[0],accounting=createAccountingService(pool,assigned.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'Fictitious bank'}),cost=await accounting.createAccount({code:'6290.0001',description:'Fictitious expense'});
  let entry=await accounting.createEntry({exercise_id:exercise.id,entry_date:'2026-01-10',description:'Access fixture',request_id:randomUUID(),lines:[{account_id:cost.id,description:'First cost',debit:'5.00',credit:'0.00'},{account_id:bank.id,description:'Payment',debit:'0.00',credit:'10.00'},{account_id:cost.id,description:'Second cost',debit:'5.00',credit:'0.00'}]});entry=await accounting.getEntry(entry.id);
  const patch=entry=>({exercise_id:entry.exercise_id,revision:entry.revision,entry_date:entry.entry_date,description:entry.description,lines:entry.lines.map(({id,account_id,description,debit,credit})=>({id,account_id,description,debit,credit}))});
  const removed=patch(entry);removed.lines=removed.lines.slice(0,2);removed.lines[0].debit='10.00';
  const edit=body=>fetch(base+'/entries/'+entry.id,{method:'PATCH',headers:{Cookie:'accounting_session='+signed.token,'X-Company-Id':String(assigned.id),'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await edit(removed)).status,403);assert.equal((await accounting.getEntry(entry.id)).revision,entry.revision);
  const legitimate={...patch(entry),description:'Regular user may edit'};assert.equal((await edit(legitimate)).status,200);entry=await accounting.getEntry(entry.id);
  const byMaster=patch(entry);byMaster.lines=byMaster.lines.slice(0,2);byMaster.lines[0].debit='10.00';entry=await accounting.updateEntry(entry.id,byMaster,{canRemoveLines:true});assert.equal(entry.lines.length,2);
  const changes=await Promise.allSettled([service.update(actor,profile.key,{version:profile.version,name:'Concurrent one'}),service.update(actor,profile.key,{version:profile.version,name:'Concurrent two'})]);assert.equal(changes.filter(item=>item.status==='fulfilled').length,1);assert.equal(changes.find(item=>item.status==='rejected').reason.code,'ACCESS_USER_CHANGED');profile=await store.user(profile.key);
  profile=await service.update(actor,profile.user_key,{version:profile.version,company_ids:[foreign.id],email:'updated-auth@example.test',permissions:{...defaultPermissions(),accounting_write:false}});assert.deepEqual((await service.current(signed.token)).company_ids,[foreign.id]);assert.equal((await service.current(signed.token)).email,'updated-auth@example.test');assert.equal((await request('/context')).status,403);assert.equal((await request('/context',foreign.id)).status,200);assert.equal((await request('/entries/'+entry.id,foreign.id)).status,404);
  profile=await service.update(actor,profile.key,{version:profile.version,password:body.password+'-reset'});assert.equal(await service.current(signed.token),null);assert.equal(await service.current(signedAgain.token),null);assert.equal(await store.saveSession('b'.repeat(64),profile.key,'2099-01-01 00:00:00',before.password_hash),false);
  const reset=await service.login(profile.username,body.password+'-reset');profile=await service.update(actor,profile.key,{version:profile.version,active:false});assert.equal(await service.current(reset.token),null);await assert.rejects(service.login(profile.username,body.password+'-reset'),rejects('ACCESS_BAD_PASSWORD'));
  profile=await service.update(actor,profile.key,{version:profile.version,active:true});const enabled=await service.login(profile.username,body.password+'-reset');await pool.execute('UPDATE app_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE token_hash=?',[createHash('sha256').update(enabled.token).digest('hex')]);assert.equal(await service.current(enabled.token),null);
  const self=await service.login(profile.username,body.password+'-reset'),changed=await service.changePassword(self.state.user,body.password+'-reset',body.password+'-self',self.token);assert.equal(await service.current(self.token),null);assert.ok(await service.current(changed.token));profile=await store.user(profile.key);
  await service.remove(actor,profile.user_key,{version:profile.version});assert.equal(await service.current(changed.token),null);assert.equal(await store.user(profile.user_key),null);
  const [[links]]=await pool.execute('SELECT COUNT(*) AS total FROM app_user_companies WHERE user_key=?',[profile.user_key]);assert.equal(links.total,0);
  const masterAfter=await store.user('master');assert.deepEqual(masterAfter,originalMaster);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const key of users){await pool.execute('DELETE FROM app_sessions WHERE user_key=?',[key]);await pool.execute('DELETE FROM app_user_companies WHERE user_key=?',[key]);await pool.execute("DELETE FROM app_users WHERE user_key=? AND role='user'",[key]);}
  for(const company of companies){for(const table of ['journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[company.id]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[company.id]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[company.id,row.id]);await pool.execute('DELETE FROM company_details WHERE company_id=?',[company.id]);await pool.execute('DELETE FROM companies WHERE id=?',[company.id]);}
  await pool.end();
 }
});
