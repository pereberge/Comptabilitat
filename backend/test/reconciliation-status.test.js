import test from 'node:test';
import assert from 'node:assert/strict';
import {reconciliationStatus} from '../../shared/reconciliation-status.js';
const current=difference=>({difference_book_minus_bank:difference,ledger_changed:false});
test('green requires all movements reconciled and the current balance within the existing tolerance',()=>{
 for(const difference of ['0.00','0.03','-0.03'])assert.equal(reconciliationStatus([{done:true}],current(difference)).balanced,true);
 for(const difference of ['0.04','-0.04'])assert.equal(reconciliationStatus([{done:true}],current(difference)).balanced,false);
 assert.equal(reconciliationStatus([],current('0.00')).balanced,true);
});
test('red counts bank movements once, including modified entries and pending movements whose amounts cancel',()=>{
 const result=reconciliationStatus([{done:false,amount:'10.00'},{done:false,amount:'-10.00'},{done:true},{done:true,modified:true}],current('0.00'));
 assert.equal(result.pending,3);assert.equal(result.balanced,false);
});
test('a changed ledger, missing current balances or an unresolved gap cannot produce a green light',()=>{
 assert.equal(reconciliationStatus([],{...current('0.00'),ledger_changed:true}).balanced,false);
 assert.equal(reconciliationStatus([],undefined).balanced,false);
 assert.equal(reconciliationStatus([],current(undefined)).balanced,false);
 const gap=reconciliationStatus([],current('14.00'));assert.equal(gap.pending,0);assert.equal(gap.balanced,false);assert.equal(gap.difference,'14.00');
});
