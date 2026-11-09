import test from 'node:test';
import assert from 'node:assert/strict';
import {purchaseAmountDifferences} from '../../shared/purchases.js';
import {createPurchaseService} from '../src/services/purchases.js';
import {randomUUID} from 'node:crypto';
const line={quantity:'1',unit_price:'100',discount_rate:'0',tax_rate:'21'};
const extraction={base_total:'100.00',tax_total:'21.00',total_amount:'121.00',currency:'EUR'};
test('matching original totals and manually entered documents have no amount differences',()=>{
 assert.deepEqual(purchaseAmountDifferences([line],extraction),[]);assert.deepEqual(purchaseAmountDifferences([line],null),[]);
 assert.deepEqual(purchaseAmountDifferences([{...line,quantity:'2',unit_price:'100',discount_rate:'50'}],extraction),[]);
});
test('each cent difference is reported exactly with its sign and original/calculated values',()=>{
 assert.deepEqual(purchaseAmountDifferences([line],{...extraction,total_amount:'121.01'}),[{kind:'amount',field:'total_amount',recognized_amount:'121.01',calculated_amount:'121.00',difference:'-0.01'}]);
 const differences=purchaseAmountDifferences([line],{base_total:'99,99',tax_total:'20.99',total_amount:'120.98'});
 assert.deepEqual(differences.map(row=>[row.field,row.difference]),[['base_total','0.01'],['tax_total','0.01'],['total_amount','0.02']]);
});
test('withholding uses the selected rate and the same cent rounding as accounting',()=>{
 assert.deepEqual(purchaseAmountDifferences([line],{...extraction,total_amount:'106.00',withholding_rate:'15'}),[]);
 const changed=purchaseAmountDifferences([line],extraction,{withholdingRate:'15'});assert.equal(changed[0].calculated_amount,'106.00');assert.equal(changed[0].difference,'-15.00');
});
test('missing, malformed, unpriced and foreign-currency values require review without false matches',()=>{
 assert.equal(purchaseAmountDifferences([line],{...extraction,total_amount:null})[0].reason,'missing');
 assert.equal(purchaseAmountDifferences([line],{...extraction,total_amount:'1e2'})[0].reason,'invalid');
 assert.ok(purchaseAmountDifferences([{...line,unit_price:null}],extraction).every(row=>row.reason==='incomplete'));
 assert.ok(purchaseAmountDifferences([line],{...extraction,currency:'USD'}).every(row=>row.reason==='currency'));
});
test('server confirmation requires explicit amount review using the submitted withholding rate',async()=>{
 for(const [recognized,withholding] of [[{...extraction,total_amount:'121.01'},'0'],[extraction,'15'],[{...extraction,total_amount:'106.00',withholding_rate:'15'},'0']]){
  let writes=0,rolledBack=false;
  const db={async beginTransaction(){},async commit(){throw Error('Unexpected commit');},async rollback(){rolledBack=true;},release(){},async execute(sql){
   if(/^(INSERT|UPDATE|DELETE)/.test(sql))writes++;
   if(sql.startsWith('SELECT id, subaccount_length'))return [[{id:85}]];
   if(sql.startsWith('SELECT request_hash,response'))return [[]];
   if(sql.startsWith('SELECT d.*'))return [[{id:7,version:1,status:'draft',reference:'INV-7',document_date:'2026-11-09',supplier_account_id:20,extraction:recognized}]];
   if(sql.startsWith('SELECT l.*'))return [[{...line,id:101,item_id:1,description:'Material'}]];
   if(sql.startsWith('SELECT receipt_line_id,order_line_id'))return [[{receipt_line_id:null,order_line_id:9,quantity:'1.000000'}]];
   if(sql.startsWith('SELECT l.unit_price'))return [[]];
   if(sql.startsWith('SELECT quantity,unit_price'))return [[line]];
   throw Error('Unexpected query: '+sql);
  }};
  await assert.rejects(createPurchaseService({getConnection:async()=>db},85).confirm('invoices',7,{version:1,request_id:randomUUID(),reviewed:true,accept_differences:false,withholding_rate:withholding}),error=>error.code==='PURCHASE_DIFFERENCES_REVIEW');
  assert.equal(writes,0);assert.equal(rolledBack,true);
 }
});
