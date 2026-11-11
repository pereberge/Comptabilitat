import test from 'node:test';import assert from 'node:assert/strict';
import {createPurchaseOcrService} from '../src/services/purchase-ocr.js';
test('a fresh running job is checked for recovery but a live database lock prevents a second reader',async()=>{
 const calls=[];let released;const done=new Promise(resolve=>{released=resolve;});
 const owner={async execute(sql){calls.push(sql);assert.match(sql,/GET_LOCK/);return [[{acquired:0}]];},release(){released();}};
 const pool={async execute(sql){assert.match(sql,/SELECT j\.\*/);return [[{id:7,status:'running',created_at:new Date().toISOString(),result:null}]];},getConnection:async()=>owner};
 const result=await createPurchaseOcrService(pool,85).get(7);await done;assert.equal(result.status,'running');assert.equal(calls.length,1);
});
test('a completed or unclaimable job releases its session lock without reading the source',async()=>{
 const calls=[];let released=false;const owner={async execute(sql){calls.push(sql);if(sql.includes('GET_LOCK'))return [[{acquired:1}]];if(sql.startsWith('UPDATE'))return [{affectedRows:0}];assert.match(sql,/RELEASE_LOCK/);return [[{released:1}]];},release(){released=true;}};
 await createPurchaseOcrService({getConnection:async()=>owner},85).process(7);assert.equal(released,true);assert.equal(calls.length,3);
});
test('a read failure updates only the claimed job through the owner and always releases the lock',async()=>{
 const calls=[];let released=false;const owner={async execute(sql){calls.push(sql);if(sql.includes('GET_LOCK'))return [[{acquired:1}]];if(sql.startsWith('SELECT j.'))throw Object.assign(Error('Synthetic source read failure'),{code:'TEST_SOURCE_FAILURE'});return [{affectedRows:1}];},release(){released=true;}};
 const previous=console.error;console.error=()=>{};try{await createPurchaseOcrService({getConnection:async()=>owner},85).process(7);}finally{console.error=previous;}
 assert.equal(released,true);assert.ok(calls.some(sql=>sql.includes("status='error'")));assert.match(calls.at(-1),/RELEASE_LOCK/);
});
