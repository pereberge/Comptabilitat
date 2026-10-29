import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {emptyPartyPaymentProfile,normalizePartyPaymentProfile,partyPaymentReceipts} from '../../shared/party-payments.js';
import {validateInvoice} from '../src/services/invoice-validation.js';
const profile=overrides=>({...emptyPartyPaymentProfile(),...overrides});
test('party payment conditions validate method, integer bounds and normalized IBAN',()=>{
 assert.deepEqual(normalizePartyPaymentProfile({}),emptyPartyPaymentProfile());
 assert.equal(normalizePartyPaymentProfile({iban:'es91 2100 0418 4502 0005 1332'}).iban,'ES9121000418450200051332');
 for(const value of [{due_days:-1},{due_days:3651},{installments:0},{installments:61},{interval_months:0},{interval_months:13},{payment_day:32},{installments:1.5},{due_days:'30'},{payment_method:'unknown'},{iban:'ES00000000'},{unexpected:1},[]])assert.throws(()=>normalizePartyPaymentProfile(value));
});
test('automatic receipts preserve all cents and calendar month ends, including leap years',()=>{
 assert.deepEqual(partyPaymentReceipts('100.00','2026-01-01',profile({installments:3})),[{due_date:'2026-01-31',amount:'33.33'},{due_date:'2026-02-28',amount:'33.33'},{due_date:'2026-03-31',amount:'33.34'}]);
 assert.deepEqual(partyPaymentReceipts('100','2024-01-31',profile({due_days:0,installments:3,payment_day:31})).map(row=>row.due_date),['2024-01-31','2024-02-29','2024-03-31']);
 assert.deepEqual(partyPaymentReceipts('100','2026-02-28',profile({due_days:0,installments:3,payment_day:31})).map(row=>row.due_date),['2026-02-28','2026-03-31','2026-04-30']);
 assert.equal(partyPaymentReceipts('100','2026-10-29',profile({due_days:0}))[0].due_date,'2026-10-29');
});
test('fixed payment days roll forward and installment intervals remain anchored across years',()=>{
 assert.deepEqual(partyPaymentReceipts('100','2026-01-31',profile({due_days:10,installments:2,interval_months:2,payment_day:15})),[{due_date:'2026-02-15',amount:'50.00'},{due_date:'2026-04-15',amount:'50.00'}]);
 assert.deepEqual(partyPaymentReceipts('100','2026-11-25',profile({due_days:0,installments:2,payment_day:20})).map(row=>row.due_date),['2026-12-20','2027-01-20']);
 for(const [total,date,settings]of [['0.01','2026-01-01',{installments:2}],['1','9999-12-31',{}],['1','2026-02-30',{}]])assert.throws(()=>partyPaymentReceipts(total,date,profile(settings)));
});
test('automatic invoice requests can omit receipts, while manual requests still require a balanced schedule',()=>{
 const body={exercise_id:1,direction:'issued',reference:'AUTO-1',invoice_date:'2026-01-31',party:{name:'Customer'},request_id:randomUUID(),lines:[{description:'Service',base:'100',tax_rate:'0'}],automatic_receipts:true};
 assert.equal(validateInvoice(body).automatic_receipts,true);assert.deepEqual(validateInvoice(body).receipts,[]);
 assert.throws(()=>validateInvoice({...body,automatic_receipts:false}),error=>error.code==='INVALID_INSTALLMENTS');
 assert.throws(()=>validateInvoice({...body,automatic_receipts:'yes'}),error=>error.code==='INVALID_PARTY_PAYMENT');
 assert.throws(()=>validateInvoice({...body,receipts:[{due_date:'2026-02-01',amount:'99'}]}),error=>error.code==='INSTALLMENT_TOTAL_MISMATCH');
});
