import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createGeneralBankService,validateGeneralBank} from '../src/services/general-banks.js';
import {centralTables} from '../src/services/company-database-provision.js';
import {requiredPermission} from '../src/middleware/access.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {createApp} from '../src/app.js';

test('bank catalog validates and normalizes names and BIC without storing a presenter ID',()=>{
 const migration=readFileSync(new URL('../../database/migrations/050_general_banks.sql',import.meta.url),'utf8');
 assert.equal([...migration.matchAll(/\('[^']+','[A-Z0-9]{11}'\)/g)].length,28);assert.doesNotMatch(migration,/initiator|presenter|presentador/i);
 assert.deepEqual(validateGeneralBank({name:' BBVA ',bic:'bbva esmm xxx',initiator_id:'ES63000B22299945'}),{name:'BBVA',bic:'BBVAESMMXXX'});
 assert.equal(validateGeneralBank({name:'BBVA',bic:'BBVAESMM'}).bic,'BBVAESMM');
 for(const bic of ['','BBVA','1234ESMMXXX','BBVA12MMXXX','BBVAESMMXXXX'])assert.throws(()=>validateGeneralBank({name:'Bank',bic}),{code:'INVALID_BIC'});
 assert.throws(()=>validateGeneralBank({name:' ',bic:'BBVAESMMXXX'}),{code:'INVALID_BANK_NAME'});
 assert.ok(centralTables.has('general_banks'));
 assert.equal(requiredPermission('PUT','/general-tables/banks/1'),'users_manage');
});

test('general catalog reads the central pool even with an invalid company header',async()=>{
 const central={async execute(){return [[{id:1,name:'BBVA',bic:'BBVAESMMXXX',version:1}]];}};
 const req={path:'/general-tables/banks',get(){throw Error('Company header must not be consulted');}};
 await companyScope(central,1,{automaticBackups:{},companyDatabases:{forCompany(){throw Error('Company database must not be used');}}})(req,{},()=>{});
 assert.equal((await req.generalBanks.list())[0].bic,'BBVAESMMXXX');
});

test('MySQL bank catalog: supplied seed, CRUD, duplicates, optimistic edits and master-only HTTP writes',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 // All test writes use one transaction and are rolled back. No schema privileges
 // or modifications of real catalog rows are needed.
 const db=await mysql.createConnection(config.database);let server;
 try{
  await db.beginTransaction();
  const service=createGeneralBankService(db),rows=await service.list();assert.ok(rows.every(row=>!Object.hasOwn(row,'initiator_id')));
  const bank=await service.save({name:'Test bank',bic:'TESTESMMXXX'});assert.equal(bank.version,1);
  const updated=await service.save({...bank,name:'Edited bank'},bank.id);assert.equal(updated.version,2);
  await assert.rejects(service.save({...bank,name:'Stale edit'},bank.id),{code:'BANK_CHANGED'});
  await assert.rejects(service.save({name:'Duplicate',bic:updated.bic}),{code:'BANK_BIC_EXISTS'});
  await assert.rejects(service.save({name:'Missing',bic:'MISS ESMM',version:1},4294967295),{code:'BANK_NOT_FOUND'});
  const middleware=companyScope(db,1,{automaticBackups:{}});
  const app=createApp({},null,async(req,res,next)=>{req.user={role:req.get('X-Test-Role')==='master'?'master':'user'};return middleware(req,res,next);});
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/api/general-tables/banks';
  assert.equal((await fetch(url)).status,200);
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Denied',bic:'DENIESMMXXX'})})).status,403);
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Test-Role':'master'},body:JSON.stringify({name:'Allowed',bic:'ALLOWWMMXXX'})});assert.equal(response.status,201);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.rollback();await db.end();}
});
