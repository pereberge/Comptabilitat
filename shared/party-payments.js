import {paymentMethods,isValidIban} from './company-profile.js';
import {splitInstallments} from './invoice-money.js';
export const emptyPartyPaymentProfile=()=>({payment_method:'',due_days:30,installments:1,interval_months:1,payment_day:0,iban:''});
export function normalizePartyPaymentProfile(value){
 const result=emptyPartyPaymentProfile();
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(result,key)))throw new Error('INVALID_PARTY_PAYMENT');
 for(const [key,min,max]of [['due_days',0,3650],['installments',1,60],['interval_months',1,12],['payment_day',0,31]]){
  const item=value[key]??result[key];
  if(typeof item!=='number'||!Number.isInteger(item)||item<min||item>max)throw new Error('INVALID_PARTY_PAYMENT');
  result[key]=item;
 }
 result.payment_method=value.payment_method??'';
 if(result.payment_method!==''&&!paymentMethods.includes(result.payment_method))throw new Error('INVALID_PAYMENT_METHOD');
 if(value.iban!==undefined&&typeof value.iban!=='string')throw new Error('INVALID_IBAN');
 result.iban=(value.iban||'').replace(/\s/g,'').toUpperCase();
 if(result.iban&&!isValidIban(result.iban))throw new Error('INVALID_IBAN');
 return result;
}
function iso(day){if(!Number.isFinite(day.getTime())||day.getUTCFullYear()<1000||day.getUTCFullYear()>9999)throw new Error('INVALID_DATE');return day.toISOString().slice(0,10);}
function paymentDay(value,day){
 const date=new Date(value+'T00:00:00Z'),year=date.getUTCFullYear(),month=date.getUTCMonth();
 const candidate=new Date(Date.UTC(year,month,Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate())));
 if(candidate<date){candidate.setUTCDate(1);candidate.setUTCMonth(month+1);candidate.setUTCDate(Math.min(day,new Date(Date.UTC(year,month+2,0)).getUTCDate()));}
 return iso(candidate);
}
export function partyPaymentReceipts(total,invoiceDate,profile){
 const settings=normalizePartyPaymentProfile(profile||{}),date=new Date(String(invoiceDate)+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)||iso(date)!==invoiceDate)throw new Error('INVALID_DATE');
 date.setUTCDate(date.getUTCDate()+settings.due_days);
 const first=settings.payment_day?paymentDay(iso(date),settings.payment_day):iso(date);
 const receipts=splitInstallments(total,settings.installments,first,settings.interval_months);
 return settings.payment_day?receipts.map(row=>({...row,due_date:paymentDay(row.due_date,settings.payment_day)})):receipts;
}
