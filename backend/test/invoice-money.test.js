import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { calculateInvoice,splitInstallments } from '../../shared/invoice-money.js';
import { validateInvoice } from '../src/services/invoice-validation.js';

test('invoice totals use exact cents, line-level tax rounding and withholding',()=>{
 const result=calculateInvoice([{description:'A',base:'1000',tax_rate:'21'},{description:'B',base:'500',tax_rate:'10'}],'10');
 assert.deepEqual([result.base_total,result.tax_total,result.withholding_total,result.total_amount],['1500.00','260.00','150.00','1610.00']);
 assert.equal(calculateInvoice([{base:'0.03',tax_rate:'21'}]).tax_total,'0.01');
 assert.equal(calculateInvoice([{base:'0.01',tax_rate:'50'}]).tax_total,'0.01');
 assert.throws(()=>calculateInvoice([{base:'1',tax_rate:'101'}]),/INVALID_TAX_RATE/);
 assert.throws(()=>calculateInvoice([{base:'-1',tax_rate:'21'}]),/INVALID_AMOUNT/);
 assert.throws(()=>calculateInvoice([{base:'1',tax_rate:'0'}],'100'),/INVALID_INVOICE_AMOUNT/);
});
test('installment distribution preserves cents and anchors month-end dates',()=>{
 assert.deepEqual(splitInstallments('100',3,'2026-01-31'),[{due_date:'2026-01-31',amount:'33.33'},{due_date:'2026-02-28',amount:'33.33'},{due_date:'2026-03-31',amount:'33.34'}]);
 assert.equal(splitInstallments('100',2,'2024-01-31')[1].due_date,'2024-02-29');
 assert.throws(()=>splitInstallments('0.01',2,'2026-01-01'),/INVALID_INSTALLMENTS/);
 assert.throws(()=>splitInstallments('100',2,'2026-02-30'),/INVALID_DATE/);
 assert.throws(()=>splitInstallments('100',2,'9999-12-31'),/INVALID_DATE/);
});
test('invoice validation requires matching receipts and dates before any writes',()=>{
 const body={exercise_id:1,direction:'issued',reference:'F-1',invoice_date:'2026-01-01',party:{name:'Customer',tax_id:'b 123'},request_id:randomUUID(),lines:[{description:'Service',base:'100',tax_rate:'21'}],receipts:[{due_date:'2026-02-01',amount:'121'}]};
 const value=validateInvoice(body);assert.equal(value.party.tax_id,'B123');assert.equal(value.total_amount,'121.00');assert.equal(value.receipts[0].amount,'121.00');
 for(const [change,code]of [[{receipts:[{due_date:'2026-02-01',amount:'120'}]},'INSTALLMENT_TOTAL_MISMATCH'],[{receipts:[{due_date:'2025-12-31',amount:'121'}]},'INVALID_DUE_DATE'],[{posting_date:'2025-12-31'},'INVALID_INVOICE_DATE'],[{request_id:'bad'},'INVALID_REQUEST'],[{party_parent:'4000'},'INVALID_PARTY_ACCOUNT']])assert.throws(()=>validateInvoice({...body,...change}),error=>error.code===code);
});
