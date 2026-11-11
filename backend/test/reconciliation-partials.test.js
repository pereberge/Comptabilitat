import test from 'node:test';import assert from 'node:assert/strict';
import {partialReceiptMatch,reconciliationReceiptPayment} from '../src/services/reconciliation-partials.js';
const receipt={status:'pending',direction:'received',remaining_amount:'100.00',invoice_date:'2026-01-01',reference:'INV-1234',party_name:'Proveïdor Proves SL'};
const movement={amount:'-40.00',date:'2026-02-01',concept:'Transferència',reference:'INV-1234'};
test('partial candidates require a matching reference or party and show the exact outstanding cents',()=>{
 const match=partialReceiptMatch(receipt,movement);assert.equal(match.partial_payment,true);assert.equal(match.payment_amount,'40.00');assert.equal(match.remaining_after_payment,'60.00');
 assert.equal(partialReceiptMatch(receipt,{...movement,reference:'',concept:'Pagament proveidor proves'}).partial_payment,true);
 for(const patch of [{reference:'',concept:'Desconegut'},{amount:'40.00'},{amount:'-100.01'},{amount:'-100.00'},{date:'2025-12-01'}])assert.equal(partialReceiptMatch(receipt,{...movement,...patch}),null);
 assert.equal(partialReceiptMatch({...receipt,remittance_id:1},movement),null);
 assert.equal(partialReceiptMatch({...receipt,status:'settled'},movement),null);
 assert.equal(partialReceiptMatch({...receipt,direction:'issued'},{...movement,amount:'40.00'}).payment_amount,'40.00');
});
test('partial payments require explicit intent, never overpay and use exact cents for either direction',()=>{
 assert.equal(reconciliationReceiptPayment('100.00','-40.00',true),'40.00');assert.equal(reconciliationReceiptPayment('100.00','40.00',true),'40.00');
 assert.equal(reconciliationReceiptPayment('0.03','-0.01',true),'0.01');assert.equal(reconciliationReceiptPayment('60.00','-60.00'),'60.00');
 for(const [remaining,payment,partial] of [['100.00','-40.00',false],['100.00','-100.01',true],['100.00','-100.00',true],['100.00','0.00',true]])assert.throws(()=>reconciliationReceiptPayment(remaining,payment,partial),/RECONCILIATION_RECEIPT_CHANGED/);
});
