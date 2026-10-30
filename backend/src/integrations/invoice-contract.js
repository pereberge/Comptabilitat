import {HttpError} from '../middleware/errors.js';
import {date} from '../services/validation.js';
import {cents,decimal} from '../../../shared/money.js';
import {calculateInvoice} from '../../../shared/invoice-money.js';

export function invalid(code,field,status=422){const error=new HttpError(status,code);error.field=field;throw error;}
export function strictObject(value,keys,field){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))invalid('INTEGRATION_INVALID_FIELDS',field);}
export function string(value,max,field,required=true){if(value===undefined&&!required)return '';if(typeof value!=='string'||!value.trim()&&required||value.trim().length>max||/[\x00-\x1f\x7f]/.test(value))invalid('INTEGRATION_INVALID_FIELD',field);return value.trim();}
export function identifier(value,field,max=128){const result=string(value,max,field);if(!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result))invalid('INTEGRATION_INVALID_FIELD',field);return result;}
export function money(value,field){
 const text=typeof value==='number'&&Number.isFinite(value)?String(value):value;
 if(typeof text!=='string'||! /^-?\d{1,13}(\.\d{1,2})?$/.test(text))invalid('INTEGRATION_INVALID_AMOUNT',field);
 const negative=text.startsWith('-');let amount;try{amount=cents(negative?text.slice(1):text);}catch{invalid('INTEGRATION_INVALID_AMOUNT',field);}return (negative?-1n:1n)*amount;
}
function day(value,field){try{return date(value);}catch{invalid('INTEGRATION_INVALID_DATE',field);}}
const abs=value=>value<0n?-value:value;
const rounded=(base,rate)=>(base<0n?-1n:1n)*((abs(base)*rate+5000n)/10000n);
function percentage(value,field){const amount=money(value,field);if(amount<0n||amount>10000n)invalid('INTEGRATION_INVALID_RATE',field);return amount;}
function taxes(value,field){
 if(!Array.isArray(value)||!value.length||value.length>40)invalid('INTEGRATION_INVALID_TAXES',field);
 return value.map((row,index)=>{
  const at=field+'.'+index;strictObject(row,['taxType','taxRate','taxableBase','taxAmount','exemptionReason'],at);
  const taxType=row.taxType||'vat';if(!['vat','exempt','not_subject','reverse_charge'].includes(taxType))invalid('INTEGRATION_INVALID_TAX_TYPE',at+'.taxType');
  const base=money(row.taxableBase,at+'.taxableBase'),rate=percentage(row.taxRate,at+'.taxRate'),tax=money(row.taxAmount,at+'.taxAmount');
  if(!base||base>0n&&tax<0n||base<0n&&tax>0n)invalid('INTEGRATION_INVALID_TAXES',at);
  const exemptionReason=string(row.exemptionReason,250,at+'.exemptionReason',false);
  if(taxType!=='vat'&&(rate!==0n||tax!==0n)||taxType==='exempt'&&!exemptionReason)invalid('INTEGRATION_INVALID_TAXES',at);
  if(abs(tax-rounded(base,rate))>1n)invalid('INTEGRATION_TAX_MISMATCH',at+'.taxAmount');
  return {taxType,taxRate:decimal(rate),taxableBase:decimal(base),taxAmount:decimal(tax),exemptionReason};
 });
}
export function normalizeReceivedInvoice(input){
 strictObject(input,['sourceSystem','externalId','companyExternalId','supplier','invoiceNumber','invoiceDate','dueDate','currency','invoiceType','rectification','description','taxBreakdown','withholdings','total','documentExternalId','lines'],'body');
 const sourceSystem=identifier(input.sourceSystem,'sourceSystem',64),externalId=identifier(input.externalId,'externalId'),companyExternalId=identifier(input.companyExternalId,'companyExternalId');
 strictObject(input.supplier,['name','taxId','address','email'],'supplier');
 const supplier={name:string(input.supplier.name,200,'supplier.name'),taxId:string(input.supplier.taxId,32,'supplier.taxId').replace(/[ .-]/g,'').toUpperCase(),address:string(input.supplier.address,250,'supplier.address',false),email:string(input.supplier.email,254,'supplier.email',false)};
 if(!/^[A-Z0-9]{3,32}$/.test(supplier.taxId))invalid('INTEGRATION_INVALID_TAX_ID','supplier.taxId');if(supplier.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplier.email))invalid('INTEGRATION_INVALID_FIELD','supplier.email');
 const invoiceNumber=string(input.invoiceNumber,60,'invoiceNumber'),invoiceDate=day(input.invoiceDate,'invoiceDate'),dueDate=day(input.dueDate,'dueDate');if(dueDate<invoiceDate)invalid('INTEGRATION_INVALID_DATE','dueDate');
 const currency=string(input.currency,3,'currency').toUpperCase();if(!/^[A-Z]{3}$/.test(currency))invalid('INTEGRATION_INVALID_FIELD','currency');
 const invoiceType=input.invoiceType||'standard';if(!['standard','credit_note','rectifying'].includes(invoiceType))invalid('INTEGRATION_INVALID_FIELD','invoiceType');
 let rectification=null;if(invoiceType!=='standard'){strictObject(input.rectification,['reason','originalInvoiceNumber'],'rectification');rectification={reason:string(input.rectification.reason,250,'rectification.reason'),originalInvoiceNumber:string(input.rectification.originalInvoiceNumber,60,'rectification.originalInvoiceNumber')};}else if(input.rectification!==undefined&&input.rectification!==null)invalid('INTEGRATION_INVALID_FIELDS','rectification');
 const description=string(input.description,1000,'description'),taxBreakdown=taxes(input.taxBreakdown,'taxBreakdown');
 const withholdings=input.withholdings===undefined?[]:input.withholdings;if(!Array.isArray(withholdings)||withholdings.length>10)invalid('INTEGRATION_INVALID_FIELDS','withholdings');
 const retained=withholdings.map((row,index)=>{const at='withholdings.'+index;strictObject(row,['rate','base','amount'],at);const base=money(row.base,at+'.base'),rate=percentage(row.rate,at+'.rate'),amount=money(row.amount,at+'.amount');if(!base||base>0n&&amount<0n||base<0n&&amount>0n||abs(amount-rounded(base,rate))>1n)invalid('INTEGRATION_WITHHOLDING_MISMATCH',at);return {rate:decimal(rate),base:decimal(base),amount:decimal(amount)};});
 const base=taxBreakdown.reduce((n,row)=>n+money(row.taxableBase,'taxableBase'),0n),tax=taxBreakdown.reduce((n,row)=>n+money(row.taxAmount,'taxAmount'),0n),withholding=retained.reduce((n,row)=>n+money(row.amount,'amount'),0n),total=money(input.total,'total');
 // Per-component tax rounding can differ by a cent; the declared grand total is exact.
 if(total!==base+tax-withholding)invalid('INTEGRATION_TOTAL_MISMATCH','total');if(!total||invoiceType==='standard'&&total<0n||invoiceType==='credit_note'&&total>0n)invalid('INTEGRATION_INVALID_AMOUNT','total');
 for(const value of [base,tax,withholding,total])if(abs(value)>999999999999999n)invalid('INTEGRATION_INVALID_AMOUNT','total');
 let lines=[];
 if(input.lines!==undefined){
  if(!Array.isArray(input.lines)||input.lines.length>200)invalid('INTEGRATION_INVALID_FIELDS','lines');
  lines=input.lines.map((row,index)=>{strictObject(row,['description','taxType','taxRate','taxableBase','taxAmount','exemptionReason'],'lines.'+index);return {description:string(row.description,200,'lines.'+index+'.description'),...taxes([{taxType:row.taxType,taxRate:row.taxRate,taxableBase:row.taxableBase,taxAmount:row.taxAmount,exemptionReason:row.exemptionReason}],'lines.'+index)[0]};});
  const grouped=rows=>{const map=new Map();for(const row of rows){const key=row.taxType+':'+row.taxRate;const old=map.get(key)||[0n,0n];map.set(key,[old[0]+money(row.taxableBase,'base'),old[1]+money(row.taxAmount,'tax')]);}return [...map].sort(([a],[b])=>a.localeCompare(b)).map(([key,values])=>[key,...values.map(String)]);};
  if(lines.length&&JSON.stringify(grouped(lines))!==JSON.stringify(grouped(taxBreakdown)))invalid('INTEGRATION_LINES_MISMATCH','lines');
 }
 const fiscalNumber=invoiceNumber.toUpperCase().replace(/\s+/g,'');if(fiscalNumber.length>60)invalid('INTEGRATION_INVALID_FIELD','invoiceNumber');
 const payload={sourceSystem,externalId,companyExternalId,supplier,invoiceNumber,invoiceDate,dueDate,currency,invoiceType,rectification,description,taxBreakdown,withholdings:retained,total:decimal(total),documentExternalId:string(input.documentExternalId,200,'documentExternalId'),lines};
 return {payload,baseTotal:decimal(base),taxTotal:decimal(tax),withholdingTotal:decimal(withholding),fiscalNumber};
}

export function accountingCompatibility(payload){
 const issues=[];
 if(payload.currency!=='EUR')issues.push('CURRENCY_REQUIRES_REVIEW');
 if(payload.invoiceType!=='standard'||payload.taxBreakdown.some(row=>money(row.taxableBase,'base')<=0n))issues.push('RECTIFICATION_REQUIRES_REVIEW');
 if(payload.taxBreakdown.some(row=>row.taxType==='reverse_charge'))issues.push('REVERSE_CHARGE_REQUIRES_REVIEW');
 const base=payload.taxBreakdown.reduce((n,row)=>n+money(row.taxableBase,'base'),0n);
 if(payload.withholdings.length>1||payload.withholdings.length===1&&money(payload.withholdings[0].base,'base')!==base)issues.push('WITHHOLDING_REQUIRES_REVIEW');
 try{const calculated=calculateInvoice(payload.taxBreakdown.map(row=>({description:payload.description.slice(0,200),base:row.taxableBase,tax_rate:row.taxRate})),payload.withholdings[0]?.rate||'0');if(calculated.total_amount!==payload.total||calculated.lines.some((line,index)=>line.tax_amount!==payload.taxBreakdown[index].taxAmount))issues.push('ROUNDING_REQUIRES_REVIEW');}catch{if(!issues.includes('RECTIFICATION_REQUIRES_REVIEW'))issues.push('ACCOUNTING_REQUIRES_REVIEW');}
 return issues;
}
