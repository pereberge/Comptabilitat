import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {integrationRouter} from '../src/integrations/router.js';
import {createApp} from '../src/app.js';
import {sample} from '../test-support/integrations/invoice.js';
test('database outages return a safe, traceable 503 without invoking user sessions',async()=>{
 const token=randomBytes(32).toString('base64url'),clients=[{clientId:'test',sourceSystem:'gestio',enabled:true,scopes:['invoices:received:write'],tokenSha256:createHash('sha256').update(token).digest('hex')}];
 const audit=[],db={execute:async(sql,args)=>{if(sql.startsWith('INSERT INTO integration_events')){audit.push(args);return [{}];}throw Object.assign(new Error('private database details'),{code:'ECONNREFUSED'});}};
 const app=createApp({},{},null,null,{router:integrationRouter(db,{clients,production:false})}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/v1/integrations/invoices/received',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(sample())});
  assert.equal(response.status,503);const result=await response.json();assert.equal(result.error.code,'INTEGRATION_DATABASE_UNAVAILABLE');assert.equal(result.requestId,response.headers.get('x-request-id'));assert.ok(!JSON.stringify(result).includes('private'));assert.ok(!JSON.stringify(result).includes(token));
  await new Promise(resolve=>setImmediate(resolve));assert.ok(audit.some(row=>row.includes('INTEGRATION_DATABASE_UNAVAILABLE')));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
