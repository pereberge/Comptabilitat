import { createHash } from 'node:crypto';
import layouts from './vat-filing-layouts.json' with { type:'json' };
import { validNif,normalizeNif } from './verifactu-format.js';
import { isValidIban } from '../../../shared/company-profile.js';
import { vatAmount,vatPeriod,vatError } from '../../../shared/vat-model.js';

export const vatFilingLayouts=layouts;
export function vatModelHash(model){
 return createHash('sha256').update(JSON.stringify({company:[model.company.id,model.company.name,model.company.tax_id],period:model.period,input:model.input,boxes:model.boxes,provisional:model.provisional,sources:model.records.map(row=>[row.key,row.fingerprint])})).digest('hex');
}
export function vatFilingAvailability(model){
 const issues=[];
 if(!layouts[model.period.year])issues.push('VAT_FILING_YEAR');
 if(model.provisional)issues.push('VAT_FILING_REVIEW_REQUIRED');
 if(!validNif(model.company.tax_id))issues.push('VAT_FILING_NIF');
 try{filingText(model.company.name,80);}catch{issues.push('VAT_FILING_NAME');}
 return {ready:issues.length===0,issues,default_type:model.result_kind==='pay'?'I':model.result_kind==='credit'?'C':'N',default_iban:model.company.iban||'',layout_version:layouts[model.period.year]?.version||null};
}
export function filingText(value,length){
 if(typeof value!=='string')vatError('INVALID_VAT_FILING');
 const normalized=value.toUpperCase().normalize('NFD').replace(/N\u0303/g,'Ñ').replace(/C\u0327/g,'Ç').replace(/\p{M}/gu,'').replace(/[^A-Z0-9ÑÇ ]/g,' ').replace(/\s+/g,' ').trim();
 if(!normalized||normalized.length>length)vatError('VAT_FILING_NAME');
 return normalized.padEnd(length,' ');
}
export function filingNumber(value,length,signed=false){
 const amount=filingAmount(value),negative=amount<0n;
 if(negative&&!signed)vatError('INVALID_VAT_FILING');
 const digits=String(negative?-amount:amount),available=length-(negative?1:0);
 if(digits.length>available)vatError('VAT_FILING_AMOUNT_OVERFLOW');
 return (negative?'N':'')+digits.padStart(available,'0');
}
function filingAmount(value){
 if(typeof value!=='string'||! /^-?\d{1,22}\.\d{2}$/.test(value))vatError('INVALID_VAT_FILING');
 return BigInt(value.replace('.',''));
}
function filingOptions(model,options){
 if(!options||typeof options!=='object'||Array.isArray(options)||options.confirmed!==true)vatError('VAT_FILING_CONFIRM_REQUIRED');
 if(!['I','U','C','D','N'].includes(options.type))vatError('INVALID_VAT_FILING');
 for(const field of ['redeme','voluntary_sii','annual_exempt','no_activity'])if(typeof options[field]!=='boolean')vatError('INVALID_VAT_FILING');
 const result=filingAmount(model.result),last=model.period.code==='4T'||model.period.code==='12';
 if(result>0n&&!['I','U'].includes(options.type)||result<0n&&!['C','D'].includes(options.type)||result===0n&&options.type!=='N')vatError('VAT_FILING_RESULT_TYPE');
 if(options.redeme&&model.period.frequency!=='monthly')vatError('VAT_FILING_REDEME_PERIOD');
 if(last&&(options.annual_exempt||options.redeme||options.voluntary_sii))vatError('VAT_FILING_ANNUAL_INFORMATION');
 if(options.type==='D'&&!last&&!options.redeme)vatError('VAT_FILING_REFUND_PERIOD');
 if(options.no_activity&&(result!==0n||model.records.some(row=>vatAmount(row.tax_amount)!==0n)))vatError('VAT_FILING_ACTIVITY');
 const iban=typeof options.iban==='string'?options.iban.replace(/\s/g,'').toUpperCase():'';
 if(['U','D'].includes(options.type)&&(!/^ES\d{22}$/.test(iban)||!isValidIban(iban)))vatError('VAT_FILING_IBAN');
 return {...options,iban:['U','D'].includes(options.type)?iban:'',last};
}
function record(layout,values,boxes){
 const buffer=Buffer.alloc(layout.length,0x20);
 for(const field of layout.fields){
  let text=field.literal;
  if(text===undefined){
   const value=field.key?.startsWith('box:')?boxes[field.key.slice(4)]??'0.00':values[field.key];
   if(field.type==='N'||field.type==='Num')text=value===undefined?'0'.repeat(field.length):field.key?.startsWith('box:')?filingNumber(value,field.length,field.type==='N'):String(value).padStart(field.length,'0');
   else text=value===undefined?' '.repeat(field.length):String(value).padEnd(field.length,' ');
  }
  if(text.length!==field.length||Buffer.byteLength(text,'latin1')!==field.length)vatError('INVALID_VAT_FILING');
  if((field.type==='N'&&!/^(?:\d+|N\d+)$/.test(text))||(field.type==='Num'&&!/^\d+$/.test(text)))vatError('INVALID_VAT_FILING');
  buffer.write(text,field.position-1,field.length,'latin1');
 }
 return buffer;
}

export function buildVatFiling(model,options,{softwareNif=process.env.TAX_SOFTWARE_NIF||''}={}){
 const availability=vatFilingAvailability(model);if(!availability.ready)vatError(availability.issues[0]);
 const period=vatPeriod(model.period),layout=layouts[period.year],settings=filingOptions(model,options),nif=normalizeNif(model.company.tax_id);
 if(model.period.code!==period.code)vatError('INVALID_VAT_PERIOD');
 const outer='T3030'+period.year+period.code+'0000',header=Buffer.alloc(layout.header_length,0x20);
 header.write('<'+outer+'>',0,'ascii');header.write('<AUX>',17,'ascii');header.write('0100',92,'ascii');
 if(softwareNif){if(!validNif(softwareNif))vatError('VAT_FILING_SOFTWARE_NIF');header.write(normalizeNif(softwareNif),100,'ascii');}
 header.write('</AUX>',322,'ascii');
 const values={declaration_type:settings.type,nif,name:filingText(model.company.name,80),year:period.year,period:period.code,foral:2,redeme:settings.redeme?1:2,simplified:3,joint:2,cash_regime:2,cash_recipient:2,special_prorata:2,revoke_prorata:2,insolvency:2,voluntary_sii:settings.voluntary_sii?1:2,annual_exempt:settings.last?2:0,annual_activity:0,hydrocarbons:period.frequency==='monthly'&&period.period>=2?2:0,no_activity:settings.no_activity?'X':'',iban:settings.iban,sepa:settings.type==='D'?1:0};
 const pages=['01000','03000','DID00'].map(page=>record(layout.pages[page],values,model.boxes));
 const buffer=Buffer.concat([header,...pages,Buffer.from('</'+outer+'>','ascii')]);
 const expected=layout.header_length+layout.footer_length+Object.values(layout.pages).reduce((sum,page)=>sum+page.length,0);
 if(buffer.length!==expected)vatError('INVALID_VAT_FILING');
 return {file:buffer,filename:nif+'_'+period.year+'_'+period.code+'.303',layout_version:layout.version};
}
