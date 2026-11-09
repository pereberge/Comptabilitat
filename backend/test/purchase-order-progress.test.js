import test from 'node:test';
import assert from 'node:assert/strict';
import {createPurchaseService} from '../src/services/purchases.js';
test('receipt list distinguishes pending, partial and complete invoicing without mixing units',async()=>{
 const calls=[];
 const pool={async execute(sql,params){
  calls.push({sql,params});
  if(sql.startsWith('SELECT d.*'))return [[{id:1,status:'confirmed'},{id:2,status:'confirmed'},{id:3,status:'confirmed'},{id:4,status:'draft'},{id:5,status:'cancelled'}]];
  if(sql.startsWith('SELECT r.document_id'))return [[
   {document_id:1,quantity:'2.500001',invoiced_quantity:'0'},
   {document_id:2,quantity:'2.500001',invoiced_quantity:'1.000001'},
   {document_id:2,quantity:'1',invoiced_quantity:'1'},
   {document_id:3,quantity:'3',invoiced_quantity:'3'},
   {document_id:4,quantity:'1',invoiced_quantity:'0'},
   {document_id:5,quantity:'1',invoiced_quantity:'0'}
  ]];
  throw new Error('Unexpected query');
 }};
 const rows=await createPurchaseService(pool,85).list('receipts');
 assert.deepEqual(rows.map(row=>[row.invoice_progress,row.pending_invoice_lines]),[['pending',1],['partial',1],['complete',0],['draft',1],['cancelled',1]]);
 assert.equal(calls.length,2);assert.deepEqual(calls[1].params,[85,1,2,3,4,5]);assert.match(calls[1].sql,/d.status='confirmed'/);assert.match(calls[1].sql,/a.company_id=r.company_id/);
});

test('order detail reports exact received and pending quantities per line using a simulated database',async()=>{
 const calls=[];
 const lines=[['101','2.500001'],['102','4'],['103','1'],['104','0.5']].map(([id,quantity])=>({id,quantity,item_id:1,unit_price:'10',discount_rate:'0',tax_rate:'21'}));
 const pool={async execute(sql,params){
  calls.push({sql,params});
  if(sql.startsWith('SELECT d.*'))return [[{id:7,status:'confirmed'}]];
  if(sql.startsWith('SELECT l.*'))return [lines];
  if(sql.startsWith('SELECT a.order_line_id'))return [[{order_line_id:101,purchase_receipt_id:62,receipt_line_id:52,reference:'REC-62',received_quantity:'0.400001'},{order_line_id:101,purchase_receipt_id:63,receipt_line_id:53,reference:'REC-63',received_quantity:'0.600000'},{order_line_id:103,purchase_receipt_id:63,receipt_line_id:54,reference:'REC-63',received_quantity:'1.000000'},{order_line_id:104,purchase_receipt_id:64,receipt_line_id:55,reference:'REC-64',received_quantity:'0.500000'}]];
  throw new Error('Unexpected query: '+sql);
 }};
 const result=await createPurchaseService(pool,85).get('orders',7);
 assert.deepEqual(result.lines.map(line=>[line.received_quantity,line.pending_quantity]),[['1.000001','1.500000'],['0.000000','4.000000'],['1.000000','0.000000'],['0.500000','0.000000']]);
 assert.deepEqual(result.receipt_allocations.map(row=>[row.purchase_receipt_id,row.order_line_id,row.quantity]),[[62,101,'0.400001'],[63,101,'0.600000'],[63,103,'1.000000'],[64,104,'0.500000']]);
 assert.equal(calls.length,3,'Reception totals use one aggregate query for the whole order');
 assert.deepEqual(calls[2].params,[85,7]);
 assert.match(calls[2].sql,/d.status='confirmed'/);
 assert.match(calls[2].sql,/o.company_id=a.company_id/);
});
test('receipt detail counts only confirmed invoice allocations, including split links, using a simulated database',async()=>{
 const calls=[];
 const lines=[['51','2.500001'],['52','4'],['53','1']].map(([id,quantity])=>({id,quantity,item_id:1,unit_price:'10',discount_rate:'0',tax_rate:'21'}));
 const pool={async execute(sql,params){
  calls.push({sql,params});
  if(sql.startsWith('SELECT d.*'))return [[{id:8,status:'confirmed'}]];
  if(sql.startsWith('SELECT l.*'))return [lines];
  if(sql.startsWith('SELECT a.receipt_line_id'))return [[{receipt_line_id:51,purchase_invoice_id:71,reference:'INV-71',invoice_line_id:201,invoiced_quantity:'0.400000'},{receipt_line_id:51,purchase_invoice_id:72,reference:'INV-72',invoice_line_id:202,invoiced_quantity:'0.600001'},{receipt_line_id:53,purchase_invoice_id:72,reference:'INV-72',invoice_line_id:203,invoiced_quantity:'1.000000'}]];
  if(sql.startsWith('SELECT order_line_id AS line_id'))return [[]];
  throw new Error('Unexpected query: '+sql);
 }};
 const result=await createPurchaseService(pool,85).get('receipts',8);
 assert.deepEqual(result.lines.map(line=>[line.invoiced_quantity,line.pending_invoice_quantity]),[['1.000001','1.500000'],['0.000000','4.000000'],['1.000000','0.000000']]);
 assert.deepEqual(result.invoice_allocations.map(row=>[row.purchase_invoice_id,row.receipt_line_id,row.quantity]),[[71,51,'0.400000'],[72,51,'0.600001'],[72,53,'1.000000']]);
 const aggregate=calls.find(call=>call.sql.startsWith('SELECT a.receipt_line_id'));
 assert.deepEqual(aggregate.params,[85,8]);assert.match(aggregate.sql,/d.status='confirmed'/);assert.match(aggregate.sql,/SUM\(a.quantity\)/);assert.match(aggregate.sql,/r.company_id=a.company_id/);
});
