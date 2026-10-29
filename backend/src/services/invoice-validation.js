import { createHash } from 'node:crypto';
import { calculateInvoice } from '../../../shared/invoice-money.js';
import { cents,decimal } from '../../../shared/money.js';
import { paymentMethods } from '../../../shared/company-profile.js';
import { normalizePartyProfile,partyProfileFields } from '../../../shared/account-party.js';
import {normalizePartyPaymentProfile} from '../../../shared/party-payments.js';
import { date,description,fail,id } from './validation.js';
export const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function requestId(value){if(typeof value!=='string'||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value))fail('INVALID_REQUEST');return value.toLowerCase();}
export function text(value,max,required=false){if(value===undefined&&!required)return '';if(typeof value!=='string'||value.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||(required&&!value.trim()))fail('INVALID_INVOICE');return value.trim();}
export function method(value){if(!paymentMethods.includes(value))fail('INVALID_PAYMENT_METHOD');return value;}
export function object(value){if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_INVOICE');return value;}
export function optionalId(value){return value===undefined||value===null||value===''?null:id(value);}
export function positiveAmount(value){let result;try{result=cents(value);}catch{fail('INVALID_AMOUNT');}if(result<=0n||result>999999999999999n)fail('INVALID_AMOUNT');return decimal(result);}
export function validateInvoice(body){
 object(body);
 if(body.automatic_receipts!==undefined&&typeof body.automatic_receipts!=='boolean')fail('INVALID_PARTY_PAYMENT');
 if(!['issued','received'].includes(body.direction))fail('INVALID_INVOICE');
 const invoiceDate=date(body.invoice_date),postingDate=date(body.posting_date||body.invoice_date);
 if(postingDate<invoiceDate)fail('INVALID_INVOICE_DATE');
 object(body.party);
 const party={name:text(body.party.name,200,true),tax_id:text(body.party.tax_id,32).replace(/\s/g,'').toUpperCase(),address:text(body.party.address,250),email:text(body.party.email,254)};
 if(party.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(party.email))fail('INVALID_COMPANY_EMAIL');
 try{
  const profile=normalizePartyProfile({...body.party,...party});
  for(const key of Object.keys(partyProfileFields))if(!Object.hasOwn(party,key)&&Object.hasOwn(body.party,key))party[key]=profile[key];
 }catch(error){fail(error.message);}
 let totals;try{totals=calculateInvoice(body.lines,body.withholding_rate??'0');}catch(error){fail(error.message);}
 totals.lines=totals.lines.map(line=>({description:description(line.description),base:line.base,tax_rate:line.tax_rate,tax_amount:line.tax_amount}));
 const automatic=body.automatic_receipts===true;
 let paymentProfile;
 if(automatic&&body.payment_profile!==undefined)try{paymentProfile=normalizePartyPaymentProfile(body.payment_profile);}catch(error){fail(error.message);}
 const input=automatic&&body.receipts===undefined?[]:body.receipts;
 if(!Array.isArray(input)||!automatic&&!input.length||input.length>60)fail('INVALID_INSTALLMENTS');
 const receipts=input.map(receipt=>{
  object(receipt);const due=date(receipt.due_date);if(due<invoiceDate)fail('INVALID_DUE_DATE');
  return {due_date:due,amount:positiveAmount(receipt.amount)};
 });
 if((!automatic||receipts.length)&&receipts.reduce((sum,row)=>sum+cents(row.amount),0n)!==cents(totals.total_amount))fail('INSTALLMENT_TOTAL_MISMATCH');
 const partyParent=body.party_parent || (body.direction==='issued'?'4300':'4000');
 if(!(body.direction==='issued'?['4300','4400']:['4000','4100']).includes(partyParent))fail('INVALID_PARTY_ACCOUNT');
 return {exercise_id:id(body.exercise_id),direction:body.direction,reference:text(body.reference,60,true),invoice_date:invoiceDate,posting_date:postingDate,party,
  party_account_id:optionalId(body.party_account_id),party_parent:partyParent,offset_account_id:optionalId(body.offset_account_id),vat_account_id:optionalId(body.vat_account_id),withholding_account_id:optionalId(body.withholding_account_id),
  payment_method:method(body.payment_method || 'transfer'),notes:text(body.notes,1000),request_id:requestId(body.request_id),...totals,receipts,...(automatic?{automatic_receipts:true,...(paymentProfile?{payment_profile:paymentProfile}:{})}:{})};
}
