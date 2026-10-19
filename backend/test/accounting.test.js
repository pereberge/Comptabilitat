import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cents,decimal } from '../../shared/money.js';
import { validateEntry,date } from '../src/services/validation.js';
const valid=()=>({exercise_id:1,entry_date:'2026-10-15',description:'Compra',request_id:randomUUID(),lines:[
 {account_id:1,description:'Compra',debit:'1000',credit:'0'},
 {account_id:2,description:'IVA',debit:'210',credit:'0'},
 {account_id:3,description:'Proveedor',debit:'0',credit:'1210'},
]});
test('céntimos exactos y coma decimal',()=>{
 assert.equal(cents('0.10')+cents('0,20'),cents('0.30'));
 assert.equal(decimal(cents('9999999999999.99')),'9999999999999.99');
 for(const value of ['-1','1.001','1e2','1.000,00',1,NaN,'Infinity',''])assert.throws(()=>cents(value));
});
test('compra con IVA: 1210 exactos',()=>assert.equal(validateEntry(valid()).lines[2].credit,'1210.00'));
test('rechaza líneas insuficientes, vacías, negativas, dobles y descuadres',()=>{
 for(const mutate of [
 b=>b.lines.pop(), b=>b.lines.splice(1), b=>b.lines[0].debit='-1',
 b=>b.lines[0].credit='1', b=>b.lines[0].debit='0',b=>b.lines[0].debit=1000,
 b=>b.lines[0].description='',b=>b.lines[0].account_id=0,b=>b.lines[0]=null,
 ]){const body=valid();mutate(body);assert.throws(()=>validateEntry(body));}
});
test('fecha real y año bisiesto',()=>{
 assert.equal(date('2028-02-29'),'2028-02-29');
 for(const value of ['2026-02-29','2026-04-31','2026-13-01','15/10/2026'])assert.throws(()=>date(value));
});
