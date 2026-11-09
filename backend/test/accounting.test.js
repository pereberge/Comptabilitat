import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cents,decimal,signedCents } from '../../shared/money.js';
import {journalTotals} from '../../shared/journal-totals.js';
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
test('rechaza líneas insuficientes, vacías, dobles y descuadres',()=>{
 for(const mutate of [
 b=>b.lines.pop(), b=>b.lines.splice(1), b=>b.lines[0].debit='-1',
 b=>b.lines[0].credit='1', b=>b.lines[0].debit='0',b=>b.lines[0].debit=1000,
 b=>b.lines[0].description='',b=>b.lines[0].account_id=0,b=>b.lines[0]=null,
 ]){const body=valid();mutate(body);assert.throws(()=>validateEntry(body));}
});
test('negative journal amounts stay on their original side and balance exactly',()=>{
 const body=valid();body.lines[0].debit='-27,79';body.lines[1].debit='-5.84';body.lines[2].credit='-33.63';
 const result=validateEntry(body);assert.equal(result.lines[0].debit,'-27.79');assert.equal(result.lines[2].credit,'-33.63');
 const totals=journalTotals(body.lines);assert.equal(totals.valid,true);assert.equal(totals.balanced,true);assert.equal(totals.debit,-3363n);
 assert.equal(signedCents('-0,01'),-1n);assert.equal(signedCents('-0.00'),0n);
 for(const value of ['--1','-1.001','-1e2','-1.000,00',-1,'-'])assert.throws(()=>signedCents(value));
 body.lines[2].debit='-33.63';assert.throws(()=>validateEntry(body),cause=>cause.code==='INVALID_LINE_AMOUNTS');assert.equal(journalTotals(body.lines).balanced,false);
});
test('mixed signs and net-zero reversals are valid, but empty lines and signed total overflows are rejected',()=>{
 const body=valid();body.lines=[
  {account_id:1,description:'Original',debit:'10.00',credit:'0.00'},
  {account_id:1,description:'Correction',debit:'-10.00',credit:'0.00'},
 ];
 assert.equal(validateEntry(body).lines[1].debit,'-10.00');assert.equal(journalTotals(body.lines).balanced,true);
 assert.equal(journalTotals([{debit:'0',credit:'0'}]).balanced,false);
 body.lines=Array.from({length:4},(_,index)=>({account_id:index+1,description:'Limit',debit:index<2?'-9999999999999.99':'0.00',credit:index>=2?'-9999999999999.99':'0.00'}));
 assert.throws(()=>validateEntry(body),cause=>cause.code==='TOTAL_TOO_LARGE');assert.equal(journalTotals(body.lines).balanced,false);
});
test('fecha real y año bisiesto',()=>{
 assert.equal(date('2028-02-29'),'2028-02-29');
 for(const value of ['2026-02-29','2026-04-31','2026-13-01','15/10/2026'])assert.throws(()=>date(value));
});
