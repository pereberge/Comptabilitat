import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceStore,workspacePath} from '../../frontend/src/services/workspace-state.js';
function memoryStorage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
test('working location survives a new app instance and remains separate for each user',()=>{
 const storage=memoryStorage(),first=createWorkspaceStore(()=>storage);first.activate('master');
 first.remember({company_id:'85',exercise_id:'17',route:'/facturas?company_id=85&exercise_id=17&invoice_id=464'});
 first.activate('user');assert.equal(first.read().company_id,'');first.remember({company_id:'225',exercise_id:'12',route:'/cuentas'});
 const reopened=createWorkspaceStore(()=>storage);assert.deepEqual(reopened.activate('master'),{company_id:'85',exercise_id:'17',route:'/facturas?company_id=85&exercise_id=17&invoice_id=464'});
 reopened.activate('');reopened.remember({route:'/'});assert.equal(reopened.activate('master').company_id,'85');
 assert.equal(reopened.activate('user').route,'/cuentas');
});
test('corrupt or unavailable browser storage does not prevent opening the application',()=>{
 const corrupt=createWorkspaceStore(()=>({getItem:()=>'{bad json',setItem:()=>{throw new Error();}}));assert.deepEqual(corrupt.activate('master'),{company_id:'',exercise_id:'',route:''});
 corrupt.remember({company_id:'1',exercise_id:'2',route:'/asientos'});assert.equal(corrupt.read().route,'/asientos');
 const blocked=createWorkspaceStore(()=>{throw new Error('Storage blocked');});blocked.activate('master');blocked.remember({company_id:'1',exercise_id:'2',route:'/cuentas'});assert.equal(blocked.read().company_id,'1');
});
test('saved destinations stay within the local app and do not accept invalid context identifiers',()=>{
 for(const path of ['https://example.com','//example.com','javascript:alert(1)','/\\example.com','/cuentas\n'])assert.equal(workspacePath(path),'');
 const storage=memoryStorage(),store=createWorkspaceStore(()=>storage);store.activate('master');store.remember({company_id:'invalid',exercise_id:'-1',route:'//example.com'});assert.deepEqual(store.read(),{company_id:'',exercise_id:'',route:''});
 assert.equal(workspacePath('/mayor?account_id=4&from=2026-01-01#detalle'),'/mayor?account_id=4&from=2026-01-01#detalle');
});
