import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {normalizeReceivedInvoice,accountingCompatibility} from '../src/integrations/invoice-contract.js';
import {integrationClients,authenticateIntegration} from '../src/integrations/auth.js';
import {createIntegrationDocumentService} from '../src/integrations/documents.js';
import {sample} from '../test-support/integrations/invoice.js';
test('contract normalizes number/string amounts, tax IDs, and optional fields deterministically',()=>{
 const numeric=normalizeReceivedInvoice(sample()),textual=sample();textual.taxBreakdown=[{taxRate:'21.00',taxableBase:'1000.00',taxAmount:'210.00'}];textual.total='1210.00';textual.supplier.taxId='b-12345678';assert.deepEqual(numeric,normalizeReceivedInvoice(textual));assert.equal(numeric.payload.total,'1210.00');assert.deepEqual(accountingCompatibility(numeric.payload),[]);
 assert.deepEqual(normalizeReceivedInvoice(numeric.payload),numeric);
});
test('multiple VAT types, exemptions and withholdings reconcile in exact cents',()=>{
 const input=sample();input.taxBreakdown=[{taxRate:21,taxableBase:100,taxAmount:21},{taxRate:10,taxableBase:100,taxAmount:10},{taxType:'exempt',taxRate:0,taxableBase:100,taxAmount:0,exemptionReason:'Exención indicada por el emisor'}];input.withholdings=[{rate:15,base:300,amount:45}];input.total=286;
 const result=normalizeReceivedInvoice(input);assert.equal(result.baseTotal,'300.00');assert.equal(result.taxTotal,'31.00');assert.equal(result.withholdingTotal,'45.00');assert.deepEqual(accountingCompatibility(result.payload),[]);
});
test('rectifying and credit invoices are accepted without forcing them into unsupported posting rules',()=>{
 const input=sample();input.invoiceType='credit_note';input.rectification={reason:'Devolución',originalInvoiceNumber:'2026-100'};input.taxBreakdown=[{taxRate:21,taxableBase:-1000,taxAmount:-210}];input.total=-1210;
 const result=normalizeReceivedInvoice(input);assert.equal(result.payload.total,'-1210.00');assert.ok(accountingCompatibility(result.payload).includes('RECTIFICATION_REQUIRES_REVIEW'));
});
test('tax rounding tolerance is one cent per component; the grand total is exact',()=>{
 const input=sample();input.taxBreakdown[0].taxAmount='210.01';input.total='1210.01';const result=normalizeReceivedInvoice(input);assert.ok(accountingCompatibility(result.payload).includes('ROUNDING_REQUIRES_REVIEW'));
 input.total='1210.00';assert.throws(()=>normalizeReceivedInvoice(input),error=>error.code==='INTEGRATION_TOTAL_MISMATCH');input.taxBreakdown[0].taxAmount='210.02';input.total='1210.02';assert.throws(()=>normalizeReceivedInvoice(input),error=>error.code==='INTEGRATION_TAX_MISMATCH');
});
test('strict validation rejects unknown fields, impossible dates, excessive precision and inconsistent lines',()=>{
 for(const modify of [input=>input.companyId=1,input=>input.invoiceDate='2026-02-30',input=>input.total='1210.001',input=>input.supplier.taxId='../../file',input=>input.lines=[{description:'bad',taxRate:21,taxableBase:1,taxAmount:0.21}],input=>input.taxBreakdown[0].taxRate=101]){const input=sample();modify(input);assert.throws(()=>normalizeReceivedInvoice(input));}
});
test('service auth is scoped, constant-length hashed, disabled by default, and enforces production HTTPS',()=>{
 const token=randomBytes(32).toString('base64url'),client={clientId:'gestio',sourceSystem:'gestio',tokenSha256:createHash('sha256').update(token).digest('hex'),scopes:['invoices:received:write']},clients=integrationClients(JSON.stringify([client])),req={secure:true,get:()=> 'Bearer '+token};
 assert.equal(authenticateIntegration(req,clients,{production:true}).clientId,'gestio');assert.throws(()=>authenticateIntegration({...req,secure:false},clients,{production:true}),error=>error.status===426);assert.throws(()=>authenticateIntegration({...req,get:()=> 'Bearer '+'a'.repeat(43)},clients),error=>error.status===401);assert.throws(()=>authenticateIntegration(req,[]),error=>error.status===503);assert.throws(()=>authenticateIntegration(req,[{...clients[0],scopes:[]}]),error=>error.status===403);assert.throws(()=>integrationClients('[{"clientId":"bad"}]'));
});
test('document references never become public URLs or backend requests without authorization and an adapter',async()=>{
 const service=createIntegrationDocumentService(),reference={companyId:1,sourceSystem:'gestio',documentExternalId:'https://example.test/private'};
 await assert.rejects(service.getFile(reference,{authenticated:false,allowedCompanyIds:[1]}),error=>error.status===403);await assert.rejects(service.getFile(reference,{authenticated:true,allowedCompanyIds:[2]}),error=>error.status===403);await assert.rejects(service.getFile(reference,{authenticated:true,allowedCompanyIds:[1]}),error=>error.status===501);
});
