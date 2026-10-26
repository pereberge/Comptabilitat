import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalances,calculateClosing,calculateCarry,lineTotals } from '../src/services/year-end-calculation.js';
const result={id:129,code:'12900000',description:'Resultado'};
const fixed=value=>value.includes('.')?value:value+'.00';
const row=(id,code,debit,credit='0.00',entry_id=1)=>({account_id:id,code,account_name:code,debit:fixed(debit),credit:fixed(credit),entry_id});
const rows=[row(572,'57200000','960.00'),row(430,'43000000','100.00'),row(100,'10000000','0.00','1000.00'),row(600,'60000000','40.00'),row(700,'70000000','0.00','100.00')];
test('annual closing regularizes profit and carries patrimonial balances with their original sign',()=>{
 const plan=calculateClosing(rows,result);
 assert.equal(plan.result_transfer,'60.00');
 assert.equal(plan.regularization.find(row=>row.account_id===129).credit,'60.00');
 assert.equal(plan.closing_totals.debit,'1060.00');
 assert.equal(plan.closing.find(row=>row.account_id===572).credit,'960.00');
 assert.equal(plan.carry.find(row=>row.account_id===129).credit,'60.00');
});
test('annual closing handles losses and zero net results without dummy zero lines',()=>{
 const loss=calculateClosing([row(572,'57200000','10'),row(600,'60000000','40'),row(700,'70000000','0','20'),row(100,'10000000','0','30')],result);
 assert.equal(loss.result_transfer,'-20.00');assert.equal(loss.regularization.find(row=>row.account_id===129).debit,'20.00');
 const zero=calculateClosing([row(600,'60000000','40'),row(700,'70000000','0','40'),row(572,'57200000','30'),row(100,'10000000','0','30')],result);
 assert.equal(zero.result_transfer,'0.00');assert.equal(zero.regularization.length,2);assert.equal(zero.closing.length,2);
});
test('annual closing adds only the unregularized residual to an existing result account',()=>{
 const plan=calculateClosing([...rows,row(129,'12900000','0','25'),row(572,'57200000','25')],result);
 assert.equal(plan.carry.find(row=>row.account_id===129).credit,'85.00');assert.equal(plan.result_transfer,'60.00');
 const already=calculateClosing([row(572,'57200000','60'),row(129,'12900000','0','60')],result);
 assert.equal(already.regularization.length,0);
});
test('signed imported movements cancel exactly before regularization',()=>{
 const plan=calculateClosing([...rows,row(600,'60000000','-10'),row(572,'57200000','10'),row(999,'40000000','0','0')],result);
 assert.equal(plan.result_transfer,'70.00');assert.ok(plan.carry.every(row=>row.debit!=='0.00'||row.credit!=='0.00'));
});
test('annual totals remain exact beyond Number precision and allow more than 100 accounts',()=>{
 const big=[];for(let i=0;i<110;i++)big.push(row(i+1,'5720'+String(i).padStart(4,'0'),'9999999999999.99'),row(i+200,'1000'+String(i).padStart(4,'0'),'0','9999999999999.99'));
 const plan=calculateClosing(big,result);assert.equal(plan.closing_totals.debit,'1099999999999998.90');assert.equal(plan.closing.length,220);
});
test('annual closing blocks unbalanced, oversized and unallocated equity balances',()=>{
 assert.throws(()=>calculateClosing([row(572,'57200000','1')],result),e=>e.code==='ANNUAL_UNBALANCED_JOURNAL');
 assert.throws(()=>calculateClosing([row(800,'80000000','1'),row(572,'57200000','0','1')],result),e=>e.code==='ANNUAL_EQUITY_ALLOCATION_REQUIRED');
 assert.throws(()=>calculateClosing([row(572,'57200000','10000000000000'),row(100,'10000000','0','10000000000000')],result),e=>e.code==='ANNUAL_ACCOUNT_BALANCE_TOO_LARGE');
 assert.throws(()=>lineTotals(Array(10001).fill({debit:'0.00',credit:'0.00'})),e=>e.code==='ANNUAL_TOO_MANY_LINES');
});
test('carry forward requires one valid closing on the final date and fully salded accounts',()=>{
 const closing=calculateClosing([row(572,'57200000','100'),row(100,'10000000','0','100')],result);
 const original=[row(572,'57200000','100'),row(100,'10000000','0','100')];
 const closed=[...original,...closing.closing.map(line=>({...line,account_name:line.account_name,entry_id:2}))];
 const entries=[{id:2,number:9,status:'posted',entry_type:'closing',entry_date:'2025-12-31'}];
 assert.equal(accountBalances(closed).length,0);assert.equal(calculateCarry(closed,entries,'2025-12-31').totals.debit,'100.00');
 assert.throws(()=>calculateCarry(original,entries,'2025-12-31'),e=>e.code==='ANNUAL_SOURCE_CLOSING_INVALID');
 assert.throws(()=>calculateCarry(closed,[...entries,{...entries[0],id:3}],'2025-12-31'),e=>e.code==='ANNUAL_SOURCE_CLOSING_INVALID');
 assert.throws(()=>calculateCarry(closed,entries,'2025-12-30'),e=>e.code==='ANNUAL_SOURCE_CLOSING_INVALID');
});

