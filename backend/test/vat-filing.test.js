import test from 'node:test';
import assert from 'node:assert/strict';
import {vatPeriod,calculateVatModel} from '../../shared/vat-model.js';
import {buildVatFiling,filingNumber,vatModelHash,vatFilingAvailability,vatFilingLayouts} from '../src/services/vat-filing.js';

const invoice=(extra={})=>({key:'invoice:example:1',fingerprint:'a'.repeat(64),direction:'issued',base:'1000.00',tax_amount:'210.00',rate:'21.00',category:'output',review_required:false,...extra});
function model(sources=[invoice()],query={year:2026,frequency:'quarterly',period:1},input={confirmed_general:true}){
 const period=vatPeriod(query);return {...calculateVatModel(sources,input,period),period,company:{id:1,name:'Agrícola Peñón & Ç, SL',tax_id:'B12345674',iban:''}};
}
const options=extra=>({type:'I',confirmed:true,redeme:false,voluntary_sii:false,annual_exempt:false,no_activity:false,iban:'',...extra});
function field(buffer,page,position,length){const start=buffer.indexOf(Buffer.from('<T303'+page+'>'));assert.ok(start>=0);return buffer.subarray(start+position-1,start+position-1+length).toString('latin1');}
test('official 303 records cover the full byte layout without gaps or overlaps',()=>{
 for(const layout of Object.values(vatFilingLayouts))for(const page of Object.values(layout.pages)){let position=1;for(const field of page.fields){assert.equal(field.position,position);position+=field.length;}assert.equal(position-1,page.length);}
});
test('2026 filing uses the current company and period, Latin-1, exact lengths and official box offsets',()=>{
 const data=model(),result=buildVatFiling(data,options()),file=result.file;
 assert.equal(result.filename,'B12345674_2026_1T.303');assert.equal(file.length,3767);
 assert.equal(file.subarray(0,17).toString('ascii'),'<T303020261T0000>');assert.equal(file.subarray(-18).toString('ascii'),'</T303020261T0000>');
 assert.equal(field(file,'01000',13,1),'I');assert.equal(field(file,'01000',14,9),'B12345674');assert.equal(field(file,'01000',103,4),'2026');assert.equal(field(file,'01000',107,2),'1T');
 assert.equal(field(file,'01000',23,80).trim(),'AGRICOLA PEÑON Ç SL');assert.ok(file.includes(Buffer.from([0xd1])));assert.equal(file.includes(Buffer.from([0xc3,0x91])),false);
 assert.equal(field(file,'01000',326,17),'00000000000100000');assert.equal(field(file,'01000',348,17),'00000000000021000');assert.equal(field(file,'03000',408,17),'00000000000021000');
 assert.equal(field(file,'01000',226,5),'00400');assert.equal(field(file,'01000',304,5),'01000');assert.equal(field(file,'01000',343,5),'02100');assert.equal(field(file,'03000',216,5),'10000');
 assert.equal(field(file,'01000',128,1),'0');assert.equal(field(file,'01000',130,1),'0');assert.equal(file.subarray(100,109).toString('ascii'),'         ');
});
test('2025 uses its own positions instead of the shifted 2026 record',()=>{
 const result=buildVatFiling(model(undefined,{year:2025,frequency:'quarterly',period:4}),options());
 assert.equal(result.filename,'B12345674_2025_4T.303');assert.equal(field(result.file,'01000',286,17),'00000000000100000');assert.equal(field(result.file,'01000',308,17),'00000000000021000');assert.equal(field(result.file,'03000',374,17),'00000000000021000');assert.equal(field(result.file,'01000',128,1),'2');
});
test('monthly period is encoded with two digits and hydrocarbon census follows the period rules',()=>{
 const file=buildVatFiling(model(undefined,{year:2026,frequency:'monthly',period:9}),options()).file;
 assert.equal(field(file,'01000',107,2),'09');assert.equal(field(file,'01000',130,1),'2');assert.match(file.subarray(0,17).toString('ascii'),/202609/);
});
test('signed amounts use N in the first position and preserve negative rectifications',()=>{
 const data=model([invoice({base:'-100.00',tax_amount:'-21.00',category:'output_adjustment'})]),file=buildVatFiling(data,options({type:'C'})).file;
 assert.equal(field(file,'01000',433,17),'N0000000000010000');assert.equal(field(file,'01000',450,17),'N0000000000002100');assert.equal(field(file,'03000',408,17),'N0000000000002100');
 assert.equal(filingNumber('999999999999999.99',17),'99999999999999999');assert.equal(filingNumber('-99999999999999.99',17,true),'N9999999999999999');
 assert.throws(()=>filingNumber('-999999999999999.99',17,true),{code:'VAT_FILING_AMOUNT_OVERFLOW'});assert.throws(()=>filingNumber('-1.00',17),{code:'INVALID_VAT_FILING'});
});
test('domiciliation and refund require an explicit valid Spanish bank account',()=>{
 const iban='ES9121000418450200051332',debit=buildVatFiling(model(),options({type:'U',iban})).file;
 assert.equal(field(debit,'01000',13,1),'U');assert.equal(field(debit,'DID00',23,34).trim(),iban);
 assert.throws(()=>buildVatFiling(model(),options({type:'U',iban:'ES0000000000000000000000'})),{code:'VAT_FILING_IBAN'});
 const negative=model([invoice({direction:'received',category:'domestic'})],{year:2026,frequency:'quarterly',period:4});
 const refund=buildVatFiling(negative,options({type:'D',iban})).file;assert.equal(field(refund,'DID00',194,1),'1');
 const ordinary=buildVatFiling(model(),options({iban})).file;assert.equal(field(ordinary,'DID00',23,34),' '.repeat(34));
});
test('refund restrictions, yearly exemptions and mismatched declaration types cannot produce a filing',()=>{
 const negative=model([invoice({direction:'received',category:'domestic'})]);
 assert.throws(()=>buildVatFiling(negative,options({type:'D',iban:'ES9121000418450200051332'})),{code:'VAT_FILING_REFUND_PERIOD'});
 assert.throws(()=>buildVatFiling(model(),options({redeme:true})),{code:'VAT_FILING_REDEME_PERIOD'});
 const last=model(undefined,{year:2026,frequency:'quarterly',period:4});assert.throws(()=>buildVatFiling(last,options({annual_exempt:true})),{code:'VAT_FILING_ANNUAL_INFORMATION'});
 assert.throws(()=>buildVatFiling(model(),options({type:'C'})),{code:'VAT_FILING_RESULT_TYPE'});
});
test('zero result and no-activity are distinct and non-deductible VAT still prevents no-activity',()=>{
 const empty=model([]),file=buildVatFiling(empty,options({type:'N',no_activity:true})).file;
 assert.equal(field(file,'03000',425,1),'X');assert.equal(field(file,'01000',13,1),'N');
 const nonDeductible=model([invoice({direction:'received',category:'non_deductible'})]);assert.throws(()=>buildVatFiling(nonDeductible,options({type:'N',no_activity:true})),{code:'VAT_FILING_ACTIVITY'});
});
test('unreviewed models, unsupported years, invalid tax IDs and missing confirmation are blocked',()=>{
 assert.throws(()=>buildVatFiling(model([invoice({review_required:true})]),options()),{code:'VAT_FILING_REVIEW_REQUIRED'});
 assert.throws(()=>buildVatFiling(model(undefined,{year:2024,frequency:'quarterly',period:1}),options()),{code:'VAT_FILING_YEAR'});
 const bad=model();bad.company.tax_id='B12345678';assert.equal(vatFilingAvailability(bad).ready,false);assert.throws(()=>buildVatFiling(bad,options()),{code:'VAT_FILING_NIF'});
 assert.throws(()=>buildVatFiling(model(),options({confirmed:false})),{code:'VAT_FILING_CONFIRM_REQUIRED'});
});
test('model fingerprint changes with company, period, tax values, sources and reviewed inputs',()=>{
 const data=model(),hash=vatModelHash(data);assert.match(hash,/^[a-f0-9]{64}$/);assert.equal(vatModelHash(structuredClone(data)),hash);
 for(const change of [value=>value.company.id++,value=>value.period.period++,value=>value.boxes['71']='0.00',value=>value.records[0].fingerprint='b'.repeat(64),value=>value.input.confirmed_general=false]){const changed=structuredClone(data);change(changed);assert.notEqual(vatModelHash(changed),hash);}
});
