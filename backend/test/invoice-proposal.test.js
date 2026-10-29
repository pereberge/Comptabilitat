import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { invoiceDate,parseInvoicePages,extractInvoicePdf } from '../src/services/invoice-pdf.js';
import { buildInvoiceProposal } from '../src/services/invoice-proposal.js';
import { invoicePages,invoicePdf } from '../test-support/invoice-fixture.js';
test('invoice dates validate leap years and Catalan/Spanish month names',()=>{
 assert.equal(invoiceDate("15 d'octubre de 2026"),'2026-10-15');assert.equal(invoiceDate('1 de marzo de 2026'),'2026-03-01');
 assert.equal(invoiceDate('29/02/2025'),null);assert.equal(invoiceDate('29/02/2024'),'2024-02-29');assert.equal(invoiceDate('31/13/2026'),null);
});
test('generic text extraction verifies exact printed amounts and preserves missing fields',()=>{
 const result=parseInvoicePages(invoicePages());assert.equal(result.reference,'SUP-2026-1');assert.equal(result.supplier.tax_id,'B11111111');assert.equal(result.invoice_date,'2026-10-15');assert.equal(result.due_date,'2026-10-22');assert.equal(result.totals_verified,true);assert.equal(result.total_amount,'19.76');
 const missing=parseInvoicePages([{items:[{text:'Invoice number unavailable'}]}]);assert.equal(missing.total_amount,null);assert.equal(missing.reference,'');assert.deepEqual(missing.lines,[]);
 const scanned=parseInvoicePages([{items:[]}]);assert.equal(scanned.parser,'manual');assert.match(scanned.warnings.join(' '),/imagen/);
});
test('Energia XXI adapter reads the tax base including electricity tax and does not mark direct debit paid',()=>{
 const result=parseInvoicePages([{items:["ENERGIA XXI","DADES DE LA FACTURA D'ELECTRICITAT",'Cif: B11111111','Titular del contracte: INVOICE TEST SL NIF: B12345674',"Num. factura: S26CON030949594 emesa el 15 d'octubre de 2026",'Data de carrec: 22/10/2026','Domiciliat','IVA normal: 21 % s/16,33 .... 3,43 €','IMPORT FACTURA: 19,76 €'].map(text=>({text}))}]);
 assert.equal(result.parser,'energia-xxi');assert.equal(result.lines.length,1);assert.equal(result.lines[0].base,'16.33');assert.equal(result.tax_total,'3.43');assert.equal(result.totals_verified,true);assert.equal(result.payment_method,'direct_debit');assert.match(result.warnings.join(' '),/no acreditan/);
});
test('multiple invoices, multiple tax rates, withholding and currency uncertainty are surfaced',()=>{
 const pages=invoicePages();pages[0].items.push(...['Numero factura: SUP-2','IVA 10 %','IRPF: 15 %','Divisa: USD'].map(text=>({text})));
 const result=parseInvoicePages(pages);assert.equal(result.multiple_invoices,true);assert.equal(result.withholding_review,true);assert.equal(result.currency,'unknown');assert.match(result.warnings.join(' '),/varios tipos de IVA/);
});
test('real PDF bytes exercise extraction and invalid bytes reject',async()=>{
 const result=await extractInvoicePdf(invoicePdf());assert.equal(result.total_amount,'19.76');assert.equal(result.reference,'SUP-2026-1');await assert.rejects(extractInvoicePdf(Buffer.from('not a pdf')),/INVOICE_PDF_INVALID/);
});
const accounts=[{id:1,code:'41000001',description:'Electric Supplies SL',kind:'subaccount'},{id:2,code:'62200002',description:'Gastos central',kind:'subaccount'},{id:3,code:'47200021',description:'IVA 21%',kind:'subaccount'}];
const form={exercise_id:1,direction:'received',reference:'SUP-2026-1',invoice_date:'2026-10-15',posting_date:'2026-10-15',party:{name:'Electric Supplies SL',tax_id:'B11111111'},party_parent:'4100',withholding_rate:'0',payment_method:'direct_debit',request_id:randomUUID(),lines:[{description:'Suministro',base:'16.33',tax_rate:'21'}],receipts:[{due_date:'2026-10-22',amount:'19.76'}]};
const journal=accounts.map((account,index)=>({entry_id:55,number:130,entry_date:'2026-10-20',entry_description:'S/ FAC. SUP-2026-1',status:'posted',entry_type:'normal',account_id:account.id,code:account.code,debit:index===0?'0.00':index===1?'16.33':'3.43',credit:index===0?'19.76':'0.00'}));
const exercise={start_date:'2026-01-01',end_date:'2026-12-31'};
test('proposal prioritizes existing accounts and finds the existing invoice journal without modifying input',()=>{
 const before=JSON.stringify(form),proposal=buildInvoiceProposal({form,extraction:parseInvoicePages(invoicePages()),accounts,journal,exercise});
 assert.equal(proposal.ready,true);assert.equal(proposal.form.offset_account_id,2);assert.equal(proposal.form.party_account_id,1);assert.equal(proposal.form.posting_date,'2026-10-20');assert.equal(proposal.candidates[0].number,130);assert.equal(proposal.candidates[0].reference_matches,true);assert.equal(JSON.stringify(form),before);
 assert.equal(proposal.journal.reduce((sum,row)=>sum+BigInt(row.debit.replace('.',''))-BigInt(row.credit.replace('.','')),0n),0n);
});
test('PDF proposals identify the fiscal profile by NIF and include the complete address before posting',()=>{
 const known=accounts.map(account=>account.id===1?{...account,description:'Nombre contable distinto',party_profile:{name:'Electric Supplies SL',tax_id:'B11111111',address:'Carrer Major, 10',postal_code:'25001',city:'Lleida',province:'Lleida',country:'España',email:'facturas@example.com'}}:account);
 const source={...form,party:{name:'Electric Supplies SL',tax_id:'B11111111',address:''},offset_account_id:2,vat_account_id:3};
 const proposal=buildInvoiceProposal({form:source,extraction:parseInvoicePages(invoicePages()),accounts:known,journal:[],exercise});
 assert.equal(proposal.form.party_account_id,1);assert.equal(proposal.form.party.address,'Carrer Major, 10');assert.equal(proposal.form.party.city,'Lleida');assert.equal(proposal.form.party.postal_code,'25001');assert.equal(proposal.ready,true);assert.equal(source.party.address,'');
});
test('unknown supplier, invalid schedule, invalid account and out of year posting remain incomplete',()=>{
 const build=value=>buildInvoiceProposal({form:{...form,...value},extraction:parseInvoicePages(invoicePages()),accounts,journal:[],exercise});
 assert.equal(build({}).ready,false);assert.equal(build({offset_account_id:2,vat_account_id:3}).ready,true);
 assert.equal(build({offset_account_id:1,vat_account_id:3}).ready,false);assert.equal(build({offset_account_id:2,vat_account_id:3,receipts:[{due_date:'2026-10-22',amount:'1.00'}]}).ready,false);
 assert.equal(build({offset_account_id:2,vat_account_id:3,posting_date:'2027-01-01'}).ready,false);
 const corrected=build({offset_account_id:2,vat_account_id:3,lines:[{description:'Correction',base:'100.00',tax_rate:'21'}],receipts:[{due_date:'2026-10-22',amount:'121.00'}]});assert.equal(corrected.ready,true);assert.equal(corrected.needs_amount_review,true);assert.match(corrected.warnings.join(' '),/difiere/);
});

