import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAccountCode, displayAccountCode } from '../../shared/account-codes.js';
test('notación cuenta.subcuenta conserva ceros y deduce el padre',()=>{
 assert.deepEqual(parseAccountCode('4300.0001',8),{code:'43000001',kind:'subaccount',parentCode:'4300'});
 assert.equal(parseAccountCode('400.00001',8).code,'40000001');
 assert.equal(parseAccountCode('4300',8).kind,'account');
 assert.equal(parseAccountCode('4300.000001',10).code,'4300000001');
 assert.equal(displayAccountCode({code:'43000001',parent_code:'4300',kind:'subaccount'}),'4300.0001');
 for(const value of ['4300..0001','4300.001','43.000001','4300.00001','4300.','0430.0001','4300.-001','4300,0001','430000001',43000001])assert.throws(()=>parseAccountCode(value,8));
});
test('catálogo del BOE: nueve grupos, códigos únicos y jerarquía completa',()=>{
 const data=JSON.parse(readFileSync(new URL('../../database/reference/pgc.json',import.meta.url),'utf8'));
 const map=new Map(data.accounts.map(a=>[a.code,a]));
 assert.equal(map.size,911);assert.equal(data.accounts.length,map.size);
 for(let i=1;i<=9;i++)assert.ok(map.has(String(i)));
 for(const row of data.accounts){assert.match(row.code,/^[1-9]\d{0,4}$/);assert.ok(row.description.length>0&&row.description.length<=200);if(row.code.length>1)assert.ok(map.has(row.code.slice(0,-1)));}
 assert.equal(map.get('4300').description,'Clientes (euros)');
});
