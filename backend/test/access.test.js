import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAccessService,passwordHash,passwordMatches} from '../src/services/access.js';
import {accessControl,requiredPermission} from '../src/middleware/access.js';
import {HttpError} from '../src/middleware/errors.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {createContextService} from '../src/services/context.js';
import {permissionsFor} from '../../shared/access-permissions.js';
import {memoryAccessStore,defaultPermissions,legacyPasswordHash} from '../test-support/access-memory-store.js';
const rejects=code=>error=>error.code===code;
const newUser=(overrides={})=>({username:'auxiliar',name:'Auxiliar',password:'temporary-user-password',active:true,permissions:defaultPermissions(),company_ids:[1],...overrides});
async function fixture(){const store=memoryAccessStore(),service=createAccessService(store),signed=await service.setup('temporary-master-password');return {store,service,master:signed.state.user,token:signed.token};}
async function serve(app){const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';return {close:()=>new Promise(resolve=>server.close(resolve)),request:(path,body,cookie,method=body===undefined?'GET':'POST',headers={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})})};}
const cookieOf=response=>response.headers.get('set-cookie').split(';')[0];

test('passwords use salted hashes and anonymous sessions never receive a user',async()=>{
 const a=await passwordHash('sample-password'),b=await passwordHash('sample-password');assert.notEqual(a,b);assert.ok(await passwordMatches('sample-password',a));assert.equal(await passwordMatches('wrong',a),false);assert.equal(await passwordMatches(null,a),false);await assert.rejects(passwordHash(''),rejects('ACCESS_PASSWORD_LENGTH'));
 const access=createAccessService(memoryAccessStore());assert.deepEqual(await access.state(),{user:null,users:[],master_setup_required:true});assert.equal(await access.current('a'.repeat(64)),null);
 await assert.rejects(access.login('user'),rejects('ACCESS_BAD_PASSWORD'));await assert.rejects(access.switchTo('user'),rejects('ACCESS_BAD_PASSWORD'));
});

test('one-character passwords work for setup, creation, changes and resets while empty passwords stay invalid',async()=>{
 const store=memoryAccessStore(),service=createAccessService(store),setup=await service.setup('A'),master=setup.state.user;assert.equal((await service.login('administrador','a')).state.user.role,'master');
 let profile=await service.create(master,newUser({password:'7'}));const signed=await service.login(profile.username,'7');assert.equal(signed.state.user.key,profile.key);
 const changed=await service.changePassword(signed.state.user,'7','B',signed.token);assert.equal((await service.login(profile.username,'b')).state.user.key,profile.key);assert.equal(await service.current(signed.token),null);
 profile=await service.update(master,profile.key,{version:changed.state.user.version,password:'9'});assert.equal((await service.login(profile.username,'9')).state.user.key,profile.key);assert.equal(await service.current(changed.token),null);
 await assert.rejects(service.login(profile.username,''),rejects('ACCESS_BAD_PASSWORD'));await assert.rejects(service.create(master,newUser({username:'empty-password',password:''})),rejects('ACCESS_PASSWORD_LENGTH'));await assert.rejects(passwordHash('a'.repeat(129)),rejects('ACCESS_PASSWORD_LENGTH'));
});

test('password case is ignored while spaces, accents, symbols and incorrect characters remain significant',async()=>{
 const password=' Ab\u00c7d-Pass9! ',hash=await passwordHash(password);assert.match(hash,/^scrypt-ci:/);
 for(const variant of [password,password.toLowerCase(),password.toUpperCase()])assert.equal(await passwordMatches(variant,hash),true);
 for(const wrong of [password.trim(),password.replace('!','?'),password.replace('\u00c7','C'),'different-password',null,{}])assert.equal(await passwordMatches(wrong,hash),false);
 const {service,master}=await fixture(),created=await service.create(master,newUser({password:'New-MiXeD-Password9!'}));
 const login=await service.login(created.username.toUpperCase(),'new-mixed-password9!');assert.equal(login.state.user.key,created.key);
 const changed=await service.changePassword(login.state.user,'NEW-MIXED-PASSWORD9!','Replacement-MiXeD9!',login.token);assert.equal((await service.login(created.username,'REPLACEMENT-MIXED9!')).state.user.key,created.key);assert.equal(await service.current(login.token),null);assert.ok(await service.current(changed.token));
});

test('existing password hashes upgrade after an original-case login and preserve existing sessions',async()=>{
 const store=memoryAccessStore(),service=createAccessService(store),original='Legacy-MiXeD-Password9!',legacy=legacyPasswordHash(original),existingToken='a'.repeat(64);
 store.rows.get('master').password_hash=legacy;
 await store.saveSession(createHash('sha256').update(existingToken).digest('hex'),'master','2099-01-01 00:00:00',legacy);
 await assert.rejects(service.login('administrador',original.toLowerCase()),rejects('ACCESS_BAD_PASSWORD'));assert.equal(store.rows.get('master').password_hash,legacy);
 const signed=await Promise.all([service.login('administrador',original),service.login('ADMINISTRADOR',original)]);
 assert.match(store.rows.get('master').password_hash,/^scrypt-ci:/);assert.equal(store.rows.get('master').version,1);
 for(const result of signed){assert.equal(result.state.user.role,'master');assert.equal((await service.current(result.token)).permissions.entries_delete,true);}
 assert.equal((await service.current(existingToken)).username,'administrador');
 for(const variant of [original.toLowerCase(),original.toUpperCase()])assert.equal((await service.login('administrador',variant)).state.user.role,'master');
});

test('a concurrent password reset or deactivation cannot be bypassed by a legacy password upgrade',async()=>{
 for(const deactivate of [false,true]){
  const store=memoryAccessStore(),service=createAccessService(store),original='Legacy-MiXeD-Password9!';store.rows.get('master').password_hash=legacyPasswordHash(original);
  store.upgradePassword=async()=>{store.rows.get('master').password_hash=await passwordHash('Different-Password9!');if(deactivate)store.rows.get('master').active=0;return false;};
  await assert.rejects(service.login('administrador',original),rejects('ACCESS_PASSWORD_CHANGED'));assert.equal(store.sessions.size,0);
  if(!deactivate)assert.equal((await service.login('administrador','DIFFERENT-PASSWORD9!')).state.user.role,'master');
 }
});

test('master is preserved, users have unique logins, company assignments, versions and no elevated roles',async()=>{
 const {store,service,master,token}=await fixture();const original=(await store.user('master')).password_hash;
 await assert.rejects(service.setup('replacement-password'),rejects('ACCESS_ALREADY_CONFIGURED'));
 assert.equal((await store.user('master')).password_hash,original);
 const digest=createHash('sha256').update(token).digest('hex');assert.ok(store.sessions.has(digest));assert.equal(store.sessions.has(token),false);
 const profile=await service.create(master,newUser({username:' Auxiliar '}));assert.equal(profile.username,'auxiliar');assert.equal(profile.role,'user');assert.deepEqual(profile.company_ids,[1]);assert.equal(profile.permissions.entries_delete,false);assert.equal(JSON.stringify(profile).includes('password_hash'),false);
 const signed=await service.login('AUXILIAR','temporary-user-password');assert.equal(signed.state.user.key,profile.key);assert.deepEqual(signed.state.users,[]);
 await assert.rejects(service.create(master,newUser()),rejects('ACCESS_USERNAME_TAKEN'));
 await assert.rejects(service.create(master,newUser({role:'master'})),rejects('ACCESS_INVALID_USER'));
 await assert.rejects(service.create(master,newUser({username:'bad user'})),rejects('ACCESS_INVALID_USERNAME'));
 await assert.rejects(service.create(master,newUser({username:'invalid-company',company_ids:[999]})),rejects('ACCESS_INVALID_COMPANIES'));
 await assert.rejects(service.update(signed.state.user,profile.key,{name:'Hacker',version:profile.version}),rejects('PERMISSION_DENIED'));
 await assert.rejects(service.users(signed.state.user),rejects('PERMISSION_DENIED'));
 await assert.rejects(service.create(null,newUser()),rejects('ACCESS_LOGIN_REQUIRED'));
 await assert.rejects(service.update(master,profile.key,{version:profile.version,permissions:{...defaultPermissions(),entries_delete:true}}),rejects('ACCESS_INVALID_PERMISSIONS'));
 const saved=await service.update(master,profile.key,{version:profile.version,company_ids:[2],permissions:{...defaultPermissions(),accounting_write:false}});assert.equal(saved.version,profile.version+1);assert.deepEqual((await service.current(signed.token)).company_ids,[2]);assert.equal((await service.current(signed.token)).permissions.accounting_write,false);
 await assert.rejects(service.update(master,profile.key,{version:profile.version,name:'Stale'}),rejects('ACCESS_USER_CHANGED'));
 await assert.rejects(service.remove(master,profile.key,{version:profile.version}),rejects('ACCESS_USER_CHANGED'));
 await assert.rejects(service.remove(master,'master',{version:master.version}),rejects('ACCESS_MASTER_PROTECTED'));
 for(const change of [{active:false},{username:'other-master'},{password:'replacement-password'},{company_ids:[1]}])await assert.rejects(service.update(master,'master',{version:master.version,...change}),rejects('ACCESS_MASTER_PROTECTED'));
 const renamed=await service.update(master,'master',{version:master.version,name:'Administrator'});assert.equal(renamed.username,'administrador');assert.equal((await store.user('master')).password_hash,original);
});

test('password resets, disable, expiry, logout and deletion invalidate sessions without a fallback',async()=>{
 const {store,service,master}=await fixture();let profile=await service.create(master,newUser());
 const first=await service.login(profile.username,'temporary-user-password');const second=await service.login(profile.username,'temporary-user-password');
 profile=await service.update(master,profile.key,{version:profile.version,password:'replacement-password'});assert.equal(await service.current(first.token),null);assert.equal(await service.current(second.token),null);
 await assert.rejects(service.login(profile.username,'temporary-user-password'),rejects('ACCESS_BAD_PASSWORD'));
 const third=await service.login(profile.username,'replacement-password');profile=await service.update(master,profile.key,{version:profile.version,active:false});assert.equal(await service.current(third.token),null);await assert.rejects(service.login(profile.username,'replacement-password'),rejects('ACCESS_BAD_PASSWORD'));
 profile=await service.update(master,profile.key,{version:profile.version,active:true});const fourth=await service.login(profile.username,'replacement-password');for(const item of store.sessions.values())if(item.key===profile.key)item.expires=0;assert.equal(await service.current(fourth.token),null);
 const fifth=await service.login(profile.username,'replacement-password');assert.equal((await service.logout(fifth.token)).user,null);assert.equal(await service.current(fifth.token),null);
 const sixth=await service.login(profile.username,'replacement-password');const changed=await service.changePassword(sixth.state.user,'replacement-password','self-changed-password',sixth.token);assert.equal(await service.current(sixth.token),null);assert.ok(await service.current(changed.token));
 profile=await service.users(master).then(users=>users.find(row=>row.key===profile.key));await service.remove(master,profile.key,{version:profile.version});assert.equal(await service.current(changed.token),null);assert.equal(await store.user(profile.key),null);
 await assert.rejects(service.login(profile.username,'self-changed-password'),rejects('ACCESS_BAD_PASSWORD'));
});

test('editing a user preserves credentials and also permits editing an unconfigured account',async()=>{
 const {store,service,master}=await fixture();let profile=await service.create(master,newUser()),signed=await service.login(profile.username,'temporary-user-password');const hash=(await store.user(profile.key)).password_hash;
 profile=await service.update(master,profile.key,{version:profile.version,name:'Edited without password',email:'edited@example.test',company_ids:[2]});assert.equal((await store.user(profile.key)).password_hash,hash);assert.equal((await service.current(signed.token)).name,profile.name);
 await service.update(master,profile.key,{version:profile.version,password:'',name:'Still preserves password'});assert.equal((await store.user(profile.key)).password_hash,hash);assert.ok(await service.current(signed.token));
 const unconfigured=await store.user('user');const edited=await service.update(master,'user',{version:unconfigured.version,name:'Edited legacy account',email:'legacy@example.test',company_ids:[1]});assert.equal(edited.password_set,false);assert.equal((await store.user('user')).password_hash,null);
 await assert.rejects(service.login('user',''),rejects('ACCESS_BAD_PASSWORD'));await assert.rejects(service.create(master,newUser({username:'missing-password',password:undefined})),rejects('ACCESS_PASSWORD_LENGTH'));
});

test('login attempts are limited and wrong passwords preserve an existing session',async()=>{
 const {service,token}=await fixture();for(let i=0;i<5;i++)await assert.rejects(service.login('administrador','wrong',token,'client'),rejects('ACCESS_BAD_PASSWORD'));await assert.rejects(service.login('administrador','temporary-master-password',token,'client'),rejects('ACCESS_TOO_MANY_ATTEMPTS'));assert.equal((await service.current(token)).role,'master');
});

test('administrator login retains master permissions, password changes and protected profile edits',async()=>{
 const {store,service,master,token}=await fixture();assert.equal(master.username,'administrador');assert.equal(master.key,'master');assert.equal(master.role,'master');assert.equal(master.permissions.entries_delete,true);
 await assert.rejects(service.login('master','temporary-master-password'),rejects('ACCESS_BAD_PASSWORD'));
 const login=await service.login('ADMINISTRADOR','temporary-master-password');assert.equal(login.state.user.username,'administrador');assert.equal(login.state.user.permissions.users_manage,true);
 const hash=(await store.user('master')).password_hash;
 const edited=await service.update(master,'master',{version:master.version,name:'Administrator display name'});assert.equal(edited.username,'administrador');assert.equal((await store.user('master')).password_hash,hash);assert.equal((await service.current(token)).username,'administrador');
 const changed=await service.changePassword(edited,'temporary-master-password','replacement-master-password',login.token);assert.equal(changed.state.user.username,'administrador');assert.equal(changed.state.user.permissions.entries_delete,true);assert.equal(await service.current(token),null);
});

test('contact email is optional, validated and editable only by master without changing credentials',async()=>{
 const {store,service,master,token}=await fixture(),hash=(await store.user('master')).password_hash;
 let edited=await service.update(master,'master',{version:master.version,email:' Admin@Example.test '});assert.equal(edited.email,'admin@example.test');assert.equal(edited.username,'administrador');assert.equal(edited.name,master.name);assert.equal((await service.current(token)).email,edited.email);assert.equal((await store.user('master')).password_hash,hash);
 for(const invalid of ['invalid-email','user@example.test\r\nBcc: somebody@example.test',42,'a'.repeat(245)+'@example.test'])await assert.rejects(service.update(master,'master',{version:edited.version,email:invalid}),rejects('ACCESS_INVALID_EMAIL'));
 const unchanged=await store.user('master');assert.equal(unchanged.version,edited.version);assert.equal(unchanged.email,edited.email);
 let profile=await service.create(master,newUser({email:' User@Example.test '}));assert.equal(profile.email,'user@example.test');const normal=await service.login(profile.username,'temporary-user-password');assert.equal(normal.state.user.email,profile.email);
 await assert.rejects(service.update(normal.state.user,'master',{version:edited.version,email:'other@example.test'}),rejects('PERMISSION_DENIED'));
 profile=await service.update(master,profile.key,{version:profile.version,email:''});assert.equal(profile.email,'');assert.equal((await service.current(normal.token)).email,'');
 edited=await service.update(master,'master',{version:edited.version,name:'New display name'});assert.equal(edited.email,'admin@example.test');assert.equal((await store.user('master')).password_hash,hash);
});

test('HTTP login, user CRUD and all accounting deletion paths enforce master rights',async()=>{
 const {service,master}=await fixture();let writes=0,deleted=0;const app=createApp({health:async()=>({ok:true})},{},(req,res,next)=>{
  req.accounting={createEntry:async()=>{writes++;return {id:1};},updateEntry:async(id,body,options)=>{assert.equal(options.canRemoveLines,req.user.role==='master');return {id};}};
  req.invoiceDeletion={preview:async()=>({ok:true}),remove:async()=>{deleted++;return {ok:true};}};
  req.exerciseClear={preview:async()=>({ok:true}),clear:async()=>{deleted++;return {ok:true};}};
  req.dataBackup={restore:async(body,{canReplace})=>{if(!canReplace)throw new HttpError(403,'PERMISSION_DENIED');return {ok:true};}};
  req.companyEvolution={get:async()=>({companies:[]})};next();
 },accessControl(service));const http=await serve(app),r=http.request;
 try{
  assert.equal((await r('/health')).status,200);assert.equal((await r('/access/session')).status,200);
  assert.equal((await r('/entries',{},null,'POST',{'X-Role':'master','X-User-Id':'master'})).status,401);assert.equal((await r('/access/users')).status,401);
  assert.equal((await r('/access/switch',{key:'user'})).status,401);
  const login=await r('/access/login',{username:'administrador',password:'temporary-master-password'});assert.equal(login.status,200);const header=login.headers.get('set-cookie'),masterCookie=cookieOf(login);assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);assert.match(header,/Path=\/api/);
  assert.equal((await r('/access/setup-master',{password:'another-password'})).status,409);
  const created=await r('/access/users',newUser(),masterCookie);assert.equal(created.status,201);let profile=await created.json();
  const normal=await r('/access/login',{username:profile.username,password:'temporary-user-password'}),normalCookie=cookieOf(normal);assert.equal(normal.status,200);
  assert.equal((await r('/entries',{},normalCookie)).status,201);assert.equal(writes,1);assert.equal((await r('/entries/1',{},normalCookie,'PATCH')).status,200);
  for(const path of ['/invoices/1/delete','/INVOICES/1/DELETE/','/exercises/1/clear','/EXERCISES/1/CLEAR/'])assert.equal((await r(path,{confirmation:'96',role:'master',permissions:{exercise_clear:true}},normalCookie,'POST',{'X-Role':'master'})).status,403,path);
  for(const path of ['/invoices/1/delete-preview','/exercises/1/clear/preview','/master/company-evolution','/MASTER/COMPANY-EVOLUTION/'])assert.equal((await r(path,undefined,normalCookie)).status,403,path);
  assert.equal((await r('/data-backups/restore',{replacement:true,canReplace:true},normalCookie)).status,403);
  assert.equal((await r('/companies',{name:'Forbidden'},normalCookie)).status,403);
  assert.equal((await r('/entries/1',{},normalCookie,'DELETE')).status,403);assert.equal((await r('/access/users',undefined,normalCookie)).status,403);
  assert.equal((await r('/access/users',newUser({username:'hacker'}),normalCookie)).status,403);assert.equal((await r('/access/users/master',{version:master.version},normalCookie,'DELETE')).status,403);
  assert.equal(deleted,0);assert.equal((await r('/invoices/1/delete',{},masterCookie)).status,200);assert.equal((await r('/exercises/1/clear',{},masterCookie)).status,200);assert.equal(deleted,2);
  const patched=await r('/access/users/'+profile.key,{version:profile.version,company_ids:[2],active:false},masterCookie,'PATCH');assert.equal(patched.status,200);profile=await patched.json();assert.equal((await r('/entries',{},normalCookie)).status,401);
  assert.equal((await r('/access/users/'+profile.key,{version:profile.version},masterCookie,'DELETE')).status,200);
  assert.equal((await r('/access/users/master',{version:master.version},masterCookie,'DELETE')).status,409);
  assert.equal((await r('/access/login',{username:'administrador',password:'temporary-master-password'},null,'POST',{'Sec-Fetch-Site':'cross-site'})).status,403);
  const logout=await r('/access/logout',{},masterCookie);assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Expires=Thu, 01 Jan 1970/);assert.equal((await r('/entries',{},masterCookie)).status,401);
 }finally{await http.close();}
});

test('company membership scopes defaults, concurrent requests, URLs, logos and unassigned users',async()=>{
 const {service,master}=await fixture();let profile=await service.create(master,newUser({company_ids:[2]})),signed=await service.login(profile.username,'temporary-user-password');
 const companies=[{id:1,name:'Private'},{id:2,name:'Assigned'}];
 const db={async execute(sql,args=[]){if(sql.includes('FROM companies'))return [args.length?companies.filter(row=>row.id===args[0]):companies];if(sql.includes('FROM accounting_exercises'))return [[{id:args[0]*10,name:'2026'}]];if(sql.includes('FROM accounts'))return [[{id:args[0]*100,company_id:args[0]}]];throw Error('Unexpected query '+sql);}};
 const app=createApp(createContextService(db,1),{},companyScope(db,1),accessControl(service)),http=await serve(app),r=http.request,cookie='accounting_session='+signed.token;
 try{
  assert.deepEqual((await(await r('/companies',undefined,cookie)).json()).map(row=>row.id),[2]);assert.equal((await(await r('/context',undefined,cookie)).json()).company.id,2);
  assert.equal((await(await r('/accounts',undefined,cookie)).json())[0].company_id,2);
  for(const path of ['/context','/accounts','/documentation','/invoices','/entries','/data-backups/automatic'])assert.equal((await r(path,undefined,cookie,'GET',{'X-Company-Id':'1'})).status,403,path);
  for(const path of ['/companies/1','/COMPANIES/1/','/companies/%31','/companies/1/logo','/companies/%31/logo'])assert.equal((await r(path,undefined,cookie)).status,403,path);
  assert.equal((await r('/companies/1',{name:'Hacked'},cookie,'PATCH')).status,403);
  assert.equal((await r('/companies/2',undefined,cookie)).status,200);
  const parallel=await Promise.all([1,2,1,2].map(id=>r('/accounts',undefined,cookie,'GET',{'X-Company-Id':String(id)})));assert.deepEqual(parallel.map(row=>row.status),[403,200,403,200]);
  profile=await service.update(master,profile.key,{version:profile.version,company_ids:[1]});assert.equal((await r('/accounts',undefined,cookie,'GET',{'X-Company-Id':'2'})).status,403);assert.equal((await(await r('/context',undefined,cookie)).json()).company.id,1);
  await service.update(master,profile.key,{version:profile.version,company_ids:[]});assert.deepEqual(await(await r('/companies',undefined,cookie)).json(),[]);assert.equal((await r('/context',undefined,cookie)).status,403);assert.equal((await r('/companies/1',undefined,cookie)).status,403);
 }finally{await http.close();}
});

test('stored permissions and path encodings cannot grant master rights',()=>{
 assert.equal(permissionsFor({role:'user',permissions:{entries_delete:true,invoice_delete:true,exercise_clear:true,users_manage:true}}).entries_delete,false);
 for(const [method,path,permission]of [['GET','/accounting/ledger',null],['POST','/companies','companies_manage'],['DELETE','/entries/1','entries_delete'],['GET','/master/company-evolution','users_manage'],['HEAD','/MASTER/COMPANY-EVOLUTION/','users_manage'],['POST','/entries','accounting_write'],['POST','/exercises','exercise_create'],['POST','/EXERCISES/123/CLEAR/','exercise_clear'],['POST','/exercises/123/%63lear','exercise_clear'],['GET','/exercises/123/clear/preview','exercise_clear'],['POST','/exercises/123/operations/closing','exercise_operations'],['POST','/data-backups/restore','data_import'],['POST','/journal-import/commit','data_import'],['POST','/invoices/5/email-draft',null]])assert.equal(requiredPermission(method,path),permission);
});
