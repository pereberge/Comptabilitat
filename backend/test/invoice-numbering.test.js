import test from 'node:test';
import assert from 'node:assert/strict';
import { issuedJournalReference,proposeInvoiceReference,referenceParts } from '../src/services/invoice-numbering.js';
const exercise={id:1,start_date:'2026-01-01'},row=(reference,date='2026-10-01',order=1,exerciseId=1)=>({reference,date,order,exercise_id:exerciseId,source:'invoice'});
test('consecutive references preserve series, leading zeroes, suffixes and rollover',()=>{
 for(const [previous,next]of [['A-240','A-241'],['2026/0099','2026/0100'],['F-009-A','F-010-A'],['0009','0010'],['999','1000']])assert.equal(proposeInvoiceReference({exercise,records:[row(previous)]}).reference,next);
});
test('new periods begin with a year reference and avoid numbers already used in another period',()=>{
 assert.equal(proposeInvoiceReference({exercise,records:[]}).reference,'2026/0001');assert.equal(proposeInvoiceReference({exercise,records:[row('2026/0001','2027-01-01',1,2)]}).reference,'2026/0002');
});
test('the most recent series uses its highest reserved number, including earlier entries and collisions',()=>{
 const records=[row('F-0200','2026-09-01'),row('F-0100','2026-10-01',2),row('OTHER-9999','2026-08-01',3)];assert.equal(proposeInvoiceReference({exercise,records}).reference,'F-0201');assert.equal(proposeInvoiceReference({exercise,records,occupied:['f-0201']}).reference,'F-0202');
 records.push(row('X-0004','2026-10-02',4));assert.equal(proposeInvoiceReference({exercise,records}).reference,'X-0005');
});
test('imported journals identify explicit issued numbers without inventing missing references',()=>{
 for(const [description,reference]of [['N/ FAC. Nº A-240. CLIENT','A-240'],['N/ FAC. Nº A230. CLIENT','A230'],['Factura emitida 2026/0010 · Customer','2026/0010'],['N/ FAC. Nº . CLIENT',null],['S/ FAC. Nº A-999. Supplier',null],['N/ FAC. Nº . CLIENT 123',null],['Capital contribution 2026',null]])assert.equal(issuedJournalReference(description),reference);
});
test('unknown newer journal numbers produce a warning and a traceable editable proposal',()=>{
 const proposal=proposeInvoiceReference({exercise,records:[{...row('A-240'),source:'journal'},row(null,'2026-10-02',2)]});assert.equal(proposal.reference,'A-241');assert.equal(proposal.previous.source,'journal');assert.equal(proposal.warnings.length,1);
});
test('a newer manual nonnumeric reference does not hide the previous identifiable series',()=>{
 const proposal=proposeInvoiceReference({exercise,records:[row('A-0240'),row('MANUAL','2026-10-02',2)]});assert.equal(proposal.reference,'A-0241');assert.equal(proposal.previous.reference,'A-0240');assert.match(proposal.warnings.join(' '),/manuales/);
});
test('numbers stay exact beyond Number precision and unsupported formats require manual input',()=>{
 assert.equal(proposeInvoiceReference({exercise,records:[row('F-900719925474099999')]}).reference,'F-900719925474100000');assert.equal(proposeInvoiceReference({exercise,records:[row('MANUAL')]}).automatic_available,false);assert.equal(referenceParts(''),null);
 const full='X'+'9'.repeat(59);assert.equal(proposeInvoiceReference({exercise,records:[row(full)]}).automatic_available,false);
});
