import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPurchaseService} from '../src/services/purchases.js';

function simulatedPurchase(kind,{childStatus=null,posted=false}={}){
 const calls=[],state={status:'confirmed',version:1,commits:0,rollbacks:0,audits:0,request:null};
 const db={async beginTransaction(){},async commit(){state.commits++;},async rollback(){state.rollbacks++;},release(){},async execute(sql,params){
  calls.push({sql,params});
  if(sql.startsWith('SELECT id, subaccount_length'))return [[{id:85,subaccount_length:8}]];
  if(sql.startsWith('SELECT request_hash,response'))return [state.request?[state.request]:[]];
  if(sql.startsWith('SELECT d.*'))return [[{id:7,status:state.status,version:state.version,invoice_id:posted?99:null}]];
  if(sql.startsWith('SELECT l.*'))return [[{id:101,item_id:null,description:'Material',quantity:'1',unit_price:'10',discount_rate:'0',tax_rate:'21'}]];
  if(sql.startsWith('SELECT a.order_line_id')||sql.startsWith('SELECT a.receipt_line_id')||sql.startsWith('SELECT order_line_id AS')||sql.startsWith('SELECT receipt_line_id,order_line_id'))return [[]];
  if(sql.startsWith('SELECT DISTINCT d.id')){
   assert.deepEqual(params,kind==='orders'?[85,101,85,101]:[85,101]);
   assert.equal((sql.match(/d.status<>'cancelled'/g)||[]).length,kind==='orders'?2:1);
   assert.match(sql,/d.company_id=l.company_id/);
   return [childStatus&&childStatus!=='cancelled'?[{id:1,kind:kind==='orders'?'receipts':'invoices',reference:'BLOCKING-1',status:childStatus,document_date:'2026-11-08'}]:[]];
  }
  if(sql.startsWith('UPDATE purchase_')){state.status='cancelled';state.version++;return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO management_audit_events')){state.audits++;assert.equal(params[2],'cancel');assert.equal(JSON.parse(params[6]).status,'cancelled');return [{}];}
  if(sql.startsWith('INSERT INTO management_requests')){state.request={request_hash:params[2],response:params[3]};return [{}];}
  throw new Error('Unexpected simulated query: '+sql);
 }};
 return {service:createPurchaseService({execute:(...args)=>db.execute(...args),async getConnection(){return db;}},85,'tester'),state,calls};
}
for(const kind of ['orders','receipts']){
 test(`${kind}: dependency detail uses the same company-scoped active-document rules`,async()=>{
  const {service,state,calls}=simulatedPurchase(kind,{childStatus:'draft'});
  assert.deepEqual(await service.dependencies(kind,7),[{id:1,kind:kind==='orders'?'receipts':'invoices',reference:'BLOCKING-1',status:'draft',document_date:'2026-11-08'}]);
  assert.equal(state.audits,0);assert.equal(calls.some(call=>/^(UPDATE|INSERT|DELETE)/.test(call.sql)),false);
 });
 for(const childStatus of ['draft','confirmed'])test(`${kind}: active ${childStatus} dependencies block cancellation without writes`,async()=>{
  const {service,state,calls}=simulatedPurchase(kind,{childStatus});
  await assert.rejects(service.cancel(kind,7,{version:1,request_id:randomUUID()}),error=>error.code==='PURCHASE_HAS_DEPENDENCIES');
  assert.equal(state.rollbacks,1);assert.equal(state.status,'confirmed');assert.equal(state.audits,0);assert.equal(calls.some(call=>/^(UPDATE|INSERT|DELETE)/.test(call.sql)),false);
 });
 test(`${kind}: cancelled dependencies permit cancellation while retaining historical links`,async()=>{
  const {service,state,calls}=simulatedPurchase(kind,{childStatus:'cancelled'}),body={version:1,request_id:randomUUID()};
  const result=await service.cancel(kind,7,body);assert.equal(result.status,'cancelled');assert.equal(result.version,2);assert.equal(state.audits,1);assert.equal(state.commits,1);
  const replay=await service.cancel(kind,7,body);assert.equal(replay.replayed,true);assert.equal(state.audits,1);assert.equal(calls.some(call=>call.sql.startsWith('DELETE')),false);
 });
}
test('posted invoices and stale versions remain protected',async()=>{
 const posted=simulatedPurchase('invoices',{posted:true});await assert.rejects(posted.service.cancel('invoices',7,{version:1,request_id:randomUUID()}),error=>error.code==='PURCHASE_INVOICE_POSTED');assert.equal(posted.state.audits,0);
 const stale=simulatedPurchase('orders');await assert.rejects(stale.service.cancel('orders',7,{version:0,request_id:randomUUID()}),error=>error.code==='PURCHASE_CHANGED');assert.equal(stale.state.status,'confirmed');assert.equal(stale.state.audits,0);
});
