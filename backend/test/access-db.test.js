import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {HttpError} from '../src/middleware/errors.js';
import {pool as applicationPool} from '../src/db/pool.js';
import {config} from '../src/config.js';
import {createAccessService,mysqlAccessStore} from '../src/services/access.js';
import {createApp} from '../src/app.js';
import {accessControl} from '../src/middleware/access.js';
const initial={accounting_write:true,exercise_create:true,exercise_operations:true,data_import:true};
test('MySQL access store uses isolated test tables: sessions, permissions, expiry and revocation',{skip:process.env.TEST_MYSQL!=='1'||!process.env.TEST_MYSQL_ADMIN_FILE},async()=>{
 const admin=process.env.TEST_MYSQL_ADMIN_FILE?parseEnv(readFileSync(process.env.TEST_MYSQL_ADMIN_FILE,'utf8')):null;
 const connection=await mysql.createConnection({...config.database,...(admin?{host:admin.DB_HOST,port:Number(admin.DB_PORT),user:admin.DB_USER,password:admin.DB_PASSWORD}:{})}),suffix=crypto.randomUUID().replaceAll('-','');
 const names={app_users:'access_test_users_'+suffix,app_sessions:'access_test_sessions_'+suffix};
 const db={execute:(sql,args)=>connection.execute(sql.replaceAll('app_sessions',names.app_sessions).replaceAll('app_users',names.app_users),args)};let server;
 try{
  await db.execute('CREATE TABLE app_users(user_key VARCHAR(16) PRIMARY KEY,name VARCHAR(60),role VARCHAR(16),password_hash VARCHAR(255),permissions JSON)');
  await db.execute('CREATE TABLE app_sessions(token_hash CHAR(64) PRIMARY KEY,user_key VARCHAR(16),expires_at DATETIME)');
  await db.execute('INSERT INTO app_users(user_key,name,role,permissions) VALUES (?,?,?,?),(?,?,?,?)',['master','Máster','master','{}','user','Usuario','user',JSON.stringify(initial)]);
  const store=mysqlAccessStore(db),service=createAccessService(store),password='temporary-password-'+crypto.randomUUID();
  assert.equal((await service.state()).user.permissions.accounting_write,true);
  const first=await service.setup(password);assert.equal((await service.current(first.token)).role,'master');
  const [[session]]=await db.execute('SELECT token_hash FROM app_sessions');assert.notEqual(session.token_hash,first.token);
  const originalMaster=await store.user('master'),master=first.state.user;
  await service.update(master,'user',{name:'Consulta',permissions:{...initial,accounting_write:false}});
  assert.equal((await service.current()).permissions.accounting_write,false);
  await db.execute('UPDATE app_sessions SET expires_at=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND)');
  assert.equal((await service.current(first.token)).role,'user');
  const second=await service.switchTo('master',password);
  const changed=await service.changePassword(second.state.user,password,password+'-new',second.token,'test');
  assert.equal(await store.saveSession('b'.repeat(64),'master','2099-01-01 00:00:00',originalMaster.password_hash),false);
  assert.equal((await service.current(second.token)).role,'user');assert.equal((await service.current(changed.token)).role,'master');
  const app=createApp({},null,(req,res,next)=>{req.dataBackup={restore:async(body,options)=>{assert.equal(options.canReplace,req.user.role==='master');if(body.replacement&&!options.canReplace){throw new HttpError(403,'PERMISSION_DENIED');}return {ok:true};}};next();},accessControl(service));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url='http://127.0.0.1:'+server.address().port;
  const restore=body=>fetch(url+'/api/data-backups/restore',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  // A body field cannot grant the trusted capability passed by the real API route.
  assert.equal((await restore({replacement:true,canReplace:true})).status,403);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));for(const name of Object.values(names)){assert.match(name,/^access_test_(users|sessions)_[a-f0-9]{32}$/);await connection.execute('DROP TABLE IF EXISTS '+name);}await connection.end();await applicationPool.end();}
});
