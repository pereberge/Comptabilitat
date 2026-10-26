import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import express from 'express';
import {createAccessService,mysqlAccessStore,passwordHash,passwordMatches} from '../src/services/access.js';
import {accessControl,requiredPermission} from '../src/middleware/access.js';
import {errorHandler,HttpError} from '../src/middleware/errors.js';
import {createApp} from '../src/app.js';
import {editablePermissions,permissionsFor} from '../../shared/access-permissions.js';
const defaults=()=>Object.fromEntries(editablePermissions.map(item=>[item.key,true]));
function memoryStore(){
 const rows=new Map([['master',{user_key:'master',name:'Máster',role:'master',password_hash:null,permissions:{}}],['user',{user_key:'user',name:'Usuario',role:'user',password_hash:null,permissions:defaults()}]]),sessions=new Map();
 return {rows,sessions,users:async()=>[...rows.values()],user:async key=>rows.get(key),session:async hash=>{const item=sessions.get(hash);return item&&item.expires>Date.now()?rows.get(item.key):null;},saveSession:async(hash,key,expires)=>sessions.set(hash,{key,expires:Date.parse(expires.replace(' ','T')+'Z')}),removeSession:async hash=>sessions.delete(hash),setup:async hash=>{if(rows.get('master').password_hash)return false;rows.get('master').password_hash=hash;return true;},update:async(key,name,permissions)=>Object.assign(rows.get(key),{name,permissions}),changePassword:async(previous,next)=>{if(rows.get('master').password_hash!==previous)return false;rows.get('master').password_hash=next;for(const [hash,item]of sessions)if(item.key==='master')sessions.delete(hash);return true;}};
}
const rejects=code=>error=>error.code===code;
test('passwords are salted and checked without returning credentials',async()=>{
 const a=await passwordHash('sample-password'),b=await passwordHash('sample-password');assert.notEqual(a,b);assert.ok(await passwordMatches('sample-password',a));assert.equal(await passwordMatches('wrong',a),false);assert.equal(await passwordMatches(null,a),false);
 await assert.rejects(passwordHash('short'),rejects('ACCESS_PASSWORD_LENGTH'));
});
test('two users, master setup once, protected switching and immediate permission changes',async()=>{
 const store=memoryStore(),access=createAccessService(store),initial=await access.state();assert.equal(initial.user.key,'user');assert.equal(initial.master_setup_required,true);assert.equal(initial.users.length,2);assert.equal(initial.user.permissions.exercise_clear,false);
 await assert.rejects(access.switchTo('master','sample-password'),rejects('ACCESS_SETUP_REQUIRED'));
 const master=await access.setup('sample-password');assert.equal(master.state.user.role,'master');assert.equal(master.state.user.permissions.exercise_clear,true);assert.equal(master.state.master_setup_required,false);assert.equal(JSON.stringify(master.state).includes('scrypt:'),false);assert.equal(JSON.stringify(master.state).includes('password_hash'),false);
 await assert.rejects(access.setup('replacement-password'),rejects('ACCESS_ALREADY_CONFIGURED'));
 const hash=createHash('sha256').update(master.token).digest('hex');assert.ok(store.sessions.has(hash));assert.equal(store.sessions.has(master.token),false);
 await assert.rejects(access.switchTo('master','wrong',master.token),rejects('ACCESS_BAD_PASSWORD'));assert.equal((await access.current(master.token)).key,'master');
 const permissions={...defaults(),exercise_create:false,accounting_write:false};await access.update(master.state.user,'user',{name:'Auxiliar',permissions});assert.equal((await access.current()).permissions.accounting_write,false);
 await assert.rejects(access.update(initial.user,'user',{name:'Hacker',permissions:defaults()}),rejects('PERMISSION_DENIED'));
 await assert.rejects(access.update(master.state.user,'user',{name:'Auxiliar',permissions:{...permissions,exercise_clear:true}}),rejects('ACCESS_INVALID_PERMISSIONS'));
 await assert.rejects(access.update(master.state.user,'master',{name:'Máster',permissions:{}}),rejects('ACCESS_INVALID_PERMISSIONS'));
 const user=await access.switchTo('user',null,master.token);assert.equal(user.state.user.name,'Auxiliar');assert.equal((await access.current(master.token)).key,'user');assert.equal((await access.current('a'.repeat(64))).key,'user');
 const signed=await access.switchTo('master','sample-password',user.token);const changed=await access.changePassword(signed.state.user,'sample-password','new-password',signed.token,'password-change');
 assert.equal((await access.current(signed.token)).key,'user');assert.equal((await access.current(changed.token)).key,'master');await assert.rejects(access.switchTo('master','sample-password',null,'other'),rejects('ACCESS_BAD_PASSWORD'));
});
test('master login rejects repeated incorrect password attempts',async()=>{
 const access=createAccessService(memoryStore());await access.setup('sample-password');for(let i=0;i<5;i++)await assert.rejects(access.switchTo('master','bad',null,'client'),rejects('ACCESS_BAD_PASSWORD'));await assert.rejects(access.switchTo('master','sample-password',null,'client'),rejects('ACCESS_TOO_MANY_ATTEMPTS'));
});
test('role keys, body values and spoofed permissions cannot grant master rights',()=>{
 assert.equal(permissionsFor({role:'user',permissions:{exercise_clear:true,users_manage:true}}).exercise_clear,false);
 assert.equal(requiredPermission('GET','/master/company-evolution'),'users_manage');
 assert.equal(requiredPermission('HEAD','/MASTER/COMPANY-EVOLUTION/'),'users_manage');
 for(const [method,path,permission]of [['GET','/accounting/ledger',null],['POST','/entries','accounting_write'],['POST','/exercises','exercise_create'],['POST','/EXERCISES/','exercise_create'],['POST','/EXERCISES/123/CLEAR/','exercise_clear'],['POST','/exercises/123/clear','exercise_clear'],['GET','/exercises/123/clear/preview','exercise_clear'],['POST','/exercises/123/operations/closing','exercise_operations'],['POST','/data-backups/restore','data_import'],['POST','/journal-import/commit','data_import'],['POST','/invoices/5/email-draft',null]])assert.equal(requiredPermission(method,path),permission);
});

test('company evolution is master-only, including direct URLs, spoofed headers and revoked sessions',async()=>{
 const access=createAccessService(memoryStore());let calls=0;
 const app=createApp({},{},(req,res,next)=>{req.companyEvolution={get:async()=>{calls++;return {companies:[{id:85,years:[]}]};}};next();},accessControl(access));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';
 const get=(path,cookie)=>fetch(base+path,{headers:{'X-Role':'master','X-User-Id':'master',...(cookie?{Cookie:cookie}:{})}});
 try{
  for(const path of ['/master/company-evolution','/MASTER/COMPANY-EVOLUTION/'])assert.equal((await get(path)).status,403);
  assert.equal(calls,0);
  const login=await fetch(base+'/access/setup-master',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:'temporary-evolution-password'})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.deepEqual(await(await get('/master/company-evolution',cookie)).json(),{companies:[{id:85,years:[]}]});assert.equal(calls,1);
  await fetch(base+'/access/switch',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({key:'user'})});
  assert.equal((await get('/master/company-evolution',cookie)).status,403);assert.equal(calls,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('HTTP sessions enforce permissions, cookie flags, password setup and switching',async()=>{
 const service=createAccessService(memoryStore()),control=accessControl(service),app=express();app.use('/api/access',control.router);app.use(express.json());app.use('/api',control.middleware);
 app.get('/api/accounting/ledger',(req,res)=>res.json({read:true}));app.post('/api/exercises/:id/clear',(req,res)=>res.json({master:true}));app.get('/api/exercises/:id/clear/preview',(req,res)=>res.json({preview:true}));app.post('/api/entries',(req,res)=>res.json({written:true}));app.post('/api/data-backups/preview',(req,res)=>res.json({preview:true}));app.post('/api/exercises',(req,res)=>res.json({created:true}));app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const request=(url,body,cookie,method=body===undefined?'GET':'POST',extra={})=>fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
 try{
  assert.equal((await request('/api/accounting/ledger')).status,200);
  assert.equal((await request('/api/exercises/1/clear',{role:'master',permissions:{exercise_clear:true}},null,'POST',{'X-User-Id':'master','X-Role':'master'})).status,403);
  assert.equal((await request('/api/exercises/1/clear/preview')).status,403);
  assert.equal((await request('/api/EXERCISES/1/CLEAR/',{})).status,403);
  assert.equal((await request('/api/access/users')).status,403);
  const setup=await request('/api/access/setup-master',{password:'sample-password'});assert.equal(setup.status,200);const header=setup.headers.get('set-cookie'),masterCookie=header.split(';')[0];assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);assert.match(header,/Path=\/api/);
  assert.equal((await request('/api/exercises/1/clear',{},masterCookie)).status,200);
  assert.equal((await request('/api/access/switch',{key:'master',password:'wrong'},masterCookie)).status,401);
  const permissions={...defaults(),accounting_write:false};assert.equal((await request('/api/access/users/user',{name:'Operator',permissions},masterCookie,'PATCH')).status,200);
  const switched=await request('/api/access/switch',{key:'user'},masterCookie);assert.equal(switched.status,200);const userCookie=switched.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/exercises/1/clear',{},masterCookie)).status,403);
  assert.equal((await request('/api/entries',{},userCookie)).status,403);
  assert.equal((await request('/api/data-backups/preview?replace_existing=1',{},userCookie)).status,403);
  assert.equal((await request('/api/exercises',{opening_from_exercise_id:1},userCookie)).status,200);
  assert.equal((await request('/api/access/setup-master',{password:'other-password'},userCookie)).status,409);
  assert.equal((await request('/api/access/switch',{key:'user'},null,'POST',{'Sec-Fetch-Site':'cross-site'})).status,403);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('all code 96 actions require master even when the user can edit accounting',async()=>{
 const store=memoryStore(),service=createAccessService(store),calls={invoice:0,exercise:0,preview:0,entry:0};
 store.rows.get('user').permissions.invoice_delete=true; // Stored data cannot override master-only permissions.
 assert.equal((await service.state()).user.permissions.invoice_delete,false);
 const app=createApp({},{},(req,res,next)=>{
  req.invoiceDeletion={preview:async()=>{calls.preview++;return {ready:true};},remove:async(id,body)=>{assert.equal(body.confirmation,'96');calls.invoice++;return {removed:true};}};
  req.exerciseClear={preview:async()=>{calls.preview++;return {ready:true};},clear:async()=>{calls.exercise++;return {cleared:true};}};
  req.dataBackup={preview:async()=>{calls.preview++;return {ready:true};},restore:async(body,{canReplace})=>{if(!canReplace)throw new HttpError(403,'PERMISSION_DENIED');return {replaced:true};}};
  req.accounting={createEntry:async()=>{calls.entry++;return {id:1};}};
  next();
 },accessControl(service));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 const request=(url,body,cookie,method=body===undefined?'GET':'POST')=>fetch(base+'/api'+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),'X-Role':'master'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const confirmation={confirmation:'96',preview_hash:'a'.repeat(64),request_id:crypto.randomUUID(),role:'master',permissions:{invoice_delete:true,exercise_clear:true}};
 try{
  for(const url of ['/invoices/1/delete','/INVOICES/1/DELETE/','/exercises/1/clear'])assert.equal((await request(url,confirmation)).status,403,url);
  for(const url of ['/invoices/1/delete-preview','/exercises/1/clear/preview'])assert.equal((await request(url)).status,403,url);
  assert.equal((await request('/invoices/1/delete-preview',undefined,undefined,'HEAD')).status,403);
  assert.equal((await request('/data-backups/preview?replace_existing=1',{})).status,403);
  assert.equal((await request('/data-backups/restore',{...confirmation,canReplace:true})).status,403);
  assert.deepEqual(calls,{invoice:0,exercise:0,preview:0,entry:0});
  assert.equal((await request('/entries',{})).status,201);assert.equal(calls.entry,1);
  const login=await request('/access/setup-master',{password:'temporary-test-password'});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await login.json()).user.permissions.invoice_delete,true);
  assert.equal((await request('/invoices/1/delete-preview',undefined,cookie)).status,200);
  assert.equal((await request('/invoices/1/delete',confirmation,cookie)).status,200);
  assert.equal((await request('/exercises/1/clear',confirmation,cookie)).status,200);
  assert.equal((await request('/data-backups/restore',confirmation,cookie)).status,200);
  assert.equal((await request('/access/switch',{key:'user'},cookie)).status,200);
  assert.equal((await request('/invoices/1/delete',confirmation,cookie)).status,403);
  assert.equal(calls.invoice,1);assert.equal(calls.exercise,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
