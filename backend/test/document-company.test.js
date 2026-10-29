import test from 'node:test';
import assert from 'node:assert/strict';
import {assessInvoiceCompany,invoiceCompanyMatches} from '../src/services/document-company.js';
import {parseInvoicePages} from '../src/services/invoice-pdf.js';
const companies=[{id:1,name:'Empresa actual SL',tax_id:'B12345674'},{id:2,name:'Empresa del grup SL',tax_id:'B87654321',trade_name:'Comercial del Grup'}];
const invoice=(customer={},supplier={name:'Proveedor externo',tax_id:'A11111111'})=>({customer,supplier});
test('invoice company checks identify destination by NIF, aliases and both invoice roles',()=>{
 let check=assessInvoiceCompany(invoice({name:'Empresa del grup SL',tax_id:'ESB87654321'}),companies,1);assert.equal(check.status,'other');assert.equal(check.suggested_company_id,2);assert.equal(check.matches[0].roles[0].role,'customer');
 check=assessInvoiceCompany(invoice({name:'Comercial del Grup'}),companies,1);assert.equal(check.status,'other');
 check=assessInvoiceCompany(invoice({name:'Cliente externo'},companies[1]),companies,1);assert.equal(check.status,'other');assert.equal(check.matches[0].roles[0].role,'supplier');
 check=assessInvoiceCompany(invoice(companies[0],companies[1]),companies,1);assert.equal(check.status,'current');assert.equal(check.suggested_company_id,1);
});
test('equal names cannot override conflicting tax identifiers and ambiguous owners are never chosen automatically',()=>{
 assert.equal(invoiceCompanyMatches({name:companies[0].name,tax_id:companies[1].tax_id},companies[0]),null);
 assert.equal(assessInvoiceCompany(invoice({name:companies[0].name,tax_id:companies[1].tax_id}),companies,1).suggested_company_id,2);
 const duplicated=[...companies,{id:3,name:'Otra ficha del grupo',tax_id:companies[1].tax_id}],check=assessInvoiceCompany(invoice(companies[1]),duplicated,1);assert.equal(check.status,'ambiguous');assert.equal(check.suggested_company_id,null);
 const missingTax=assessInvoiceCompany(invoice({name:companies[0].name,tax_id:companies[1].tax_id}),[{...companies[0],tax_id:''},companies[1]],1);assert.equal(missingTax.status,'ambiguous');assert.equal(missingTax.suggested_company_id,null);
});
test('missing, unreadable, external or multiple-invoice data produces an explicit review state',()=>{
 assert.equal(assessInvoiceCompany(null,companies,1).status,'unknown');assert.equal(assessInvoiceCompany({...invoice(companies[1]),multiple_invoices:true},companies,1).status,'unknown');
 assert.equal(assessInvoiceCompany(invoice({name:'Fuera del grupo',tax_id:'B55555555'}),companies,1).status,'mismatch');
 assert.equal(assessInvoiceCompany(invoice(companies[1]),[companies[0]],1).matches.length,0);
});
test('unfamiliar PDF layouts keep explicit NIF evidence without guessing amounts or roles',()=>{
 const extraction=parseInvoicePages([{items:[{text:'Factura simplificada'},{text:'C.I.F.: ES B-87654321'},{text:'VAT: B11111111'}]}]);
 assert.ok(extraction.company_tax_ids.includes('ESB87654321'));assert.equal(extraction.total_amount,null);
 const check=assessInvoiceCompany(extraction,companies,1);assert.equal(check.status,'other');assert.equal(check.matches[0].roles[0].role,'unclassified');
});
