import {isValidIban} from './company-profile.js';
export const sepaSequences=['RCUR','OOFF','FRST','FNAL'];
export const emptySepaMandate=()=>({reference:'',signed_on:'',sequence:'RCUR'});
export function sepaIdentifier(value){return typeof value==='string'&&value.length>=1&&value.length<=35&&/^[A-Za-z0-9/\-?:().,'+ ]+$/.test(value)&&!value.startsWith('/')&&!value.endsWith('/')&&!value.includes('//');}
export function normalizeSepaMandate(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['reference','signed_on','sequence'].includes(key)))throw new Error('INVALID_SEPA_MANDATE');
 const result={...emptySepaMandate(),...value};
 if(typeof result.reference!=='string'||typeof result.signed_on!=='string')throw new Error('INVALID_SEPA_MANDATE');
 result.reference=result.reference.trim();
 if((result.reference&&!sepaIdentifier(result.reference))||(result.signed_on&&(result.signed_on<'1000-01-01'||!/^\d{4}-\d{2}-\d{2}$/.test(result.signed_on)||!Number.isFinite(Date.parse(result.signed_on))||new Date(result.signed_on).toISOString().slice(0,10)!==result.signed_on))||!sepaSequences.includes(result.sequence))throw new Error('INVALID_SEPA_MANDATE');
 return result;
}
export function isValidCreditorId(value){
 if(typeof value!=='string'||! /^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(value)||Number(value.slice(2,4))<2||Number(value.slice(2,4))>98)return false;
 let remainder=0;
 // EPC Creditor Identifier: the three-character business code is excluded.
 for(const char of value.slice(7)+value.slice(0,4))for(const digit of /[A-Z]/.test(char)?String(char.charCodeAt(0)-55):char)remainder=(remainder*10+Number(digit))%97;
 return remainder===1;
}
export const normalizedIban=value=>String(value||'').replace(/\s/g,'').toUpperCase();
export function validSepaIban(value){return isValidIban(value);}
// EPC common character set, avoiding bank-specific extended-character agreements.
export function sepaText(value,max=70){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9/\-?:().,'+ ]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
