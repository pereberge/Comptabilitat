import test from 'node:test';
import assert from 'node:assert/strict';
import {createPurchaseFilterStore} from '../../frontend/src/services/purchase-filters.js';
test('purchase filters persist separately by user, company and document kind',()=>{
 const values=new Map(),store=createPurchaseFilterStore(()=>({getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}));
 const filters={search:'Alpha',status:'confirmed',pending:true,order:'reference_asc',from:'2026-11-03',to:'2026-11-04',supplier:'20'};
 store.write('user1',85,'orders',filters);assert.deepEqual(store.read('user1',85,'orders'),filters);
 for(const scope of [['user2',85,'orders'],['user1',86,'orders'],['user1',85,'receipts']])assert.equal(store.read(...scope).search,'');
 store.write('user1',85,'orders',{status:'cancelled',pending:true,from:'2026-02-31',to:'2026-01-01',order:'invalid',supplier:'../20'});
 assert.deepEqual(store.read('user1',85,'orders'),{search:'',status:'cancelled',pending:false,order:'date_desc',from:'',to:'2026-01-01',supplier:''});
 store.write('user1',85,'orders',{from:'2026-11-10',to:'2026-11-01'});assert.equal(store.read('user1',85,'orders').from,'');
});
test('unavailable or corrupt local storage never prevents opening a list',()=>{
 const broken=createPurchaseFilterStore(()=>{throw Error('storage denied');});assert.equal(broken.read('user1',85,'orders').status,'all');assert.doesNotThrow(()=>broken.write('user1',85,'orders',{}));
 const corrupt=createPurchaseFilterStore(()=>({getItem:()=>'{invalid json'}));assert.equal(corrupt.read('user1',85,'orders').order,'date_desc');
});
