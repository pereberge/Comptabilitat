import test from 'node:test';
import assert from 'node:assert/strict';
import {invoiceOffsetSuggestion as suggest} from '../../frontend/src/services/invoice-offset-suggestion.js';
import {createInvoiceService} from '../src/services/invoices.js';

const accounts=[{id:10,code:'70000001',description:'Ventas',kind:'subaccount'},{id:11,code:'62900001',description:'Servicios',kind:'subaccount'},{id:12,code:'21700001',description:'Equipos',kind:'subaccount'}];
const party=(direction,offset)=>({account_id:1,direction,last_offset_account_id:offset,last_invoice_reference:'F-123'});

test('invoice recalls the last revenue, expense or asset account for the chosen party and direction',()=>{
 for(const [direction,id]of [['issued',10],['received',11],['received',12]]){
  const result=suggest(accounts,[party(direction,id)],direction,'1');assert.equal(result.account.id,id);assert.equal(result.reference,'F-123');
 }
});

test('invoice never proposes missing, wrong-direction, parent or unavailable company accounts',()=>{
 assert.equal(suggest(accounts,[party('received',11)],'issued',1),null);
 assert.equal(suggest(accounts,[party('issued',11)],'issued',1),null);
 assert.equal(suggest(accounts,[party('received',10)],'received',1),null);
 assert.equal(suggest(accounts,[party('received',999)],'received',1),null);
 assert.equal(suggest(accounts,[party('received',11)],'received',2),null);
 assert.equal(suggest(accounts,[],'received',1),null);
 assert.equal(suggest([{...accounts[1],kind:'account'}],[party('received',11)],'received',1),null);
});

test('party suggestions extend the existing fiscal profile without mixing metadata into it',async()=>{
 const pool={async execute(sql,params){
  assert.deepEqual(params,[583]);assert.match(sql,/x.company_id=a.company_id/);assert.match(sql,/x.status<>'void'/);assert.match(sql,/x.direction=IF/);
  return [[{account_id:1,direction:'received',description:'Proveedor',party_profile:{name:'Proveedor fiscal',tax_id:'B12345674'},last_offset_account_id:11,last_invoice_reference:'F-123'}]];
 }};
 const [result]=await createInvoiceService(pool,583).parties();assert.equal(result.name,'Proveedor fiscal');assert.equal(result.tax_id,'B12345674');assert.equal(result.last_offset_account_id,11);assert.equal(result.last_invoice_reference,'F-123');
});
