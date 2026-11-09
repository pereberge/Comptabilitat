import {calculateInvoice,rate} from '../../../shared/invoice-money.js';
import {cents,displayMoney} from '../../../shared/money.js';
import {partyProfileFields} from '../../../shared/account-party.js';
import {paymentMethods} from '../../../shared/company-profile.js';
import {partyTaxId,partyAccountsByTaxId,partyAccountsByName} from '../../../shared/party-identity.js';
import {t,treasuryError} from '../locales/treasury.js';
import {partyText} from '../locales/parties.js';
import {v} from '../locales/invoice-validation.js';

const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='1000-01-01'&&value<='9999-12-31'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const positive=value=>{try{return cents(value)>0n;}catch{return false;}};
const validRate=value=>{try{rate(value);return true;}catch{return false;}};

export function invoiceFormIssues(form,{exercise,accounts=[],parties=[],requirePostingAccounts=false,automaticError=''}={}){
 const issues=[],add=(field,label,message,target=field)=>{if(!issues.some(issue=>issue.field===field))issues.push({field,label,message,target});};
 const text=(field,label,value,max,missing)=>{if(typeof value!=='string'||!value.trim()){if(missing)add(field,label,missing);return;}if(value.trim().length>max)add(field,label,v.length(max));else if((field.startsWith('party_')?/[\u0000-\u001f\u007f]/:/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/).test(value))add(field,label,v.required);};
 const received=form.direction==='received',prefixes=received?['400','410']:['430','440'];
 text('invoice_reference',t.reference,form.reference,60,v.reference);
 if(!validDate(form.invoice_date))add('invoice_date',t.invoiceDate,v.date);
 if(!validDate(form.posting_date))add('posting_date',t.postingDate,v.date);
 else if(exercise&&(form.posting_date<exercise.start_date||form.posting_date>exercise.end_date))add('posting_date',t.postingDate,v.outsideExercise);
 else if(validDate(form.invoice_date)&&form.posting_date<form.invoice_date)add('posting_date',t.postingDate,v.postingBefore);
 if(!paymentMethods.includes(form.payment_method))add('payment_method',t.paymentMethod,v.required);
 for(const [key,max]of Object.entries(partyProfileFields))text('party_'+key,partyText.labels[key],form.party?.[key],max,key==='name'?v.name:null);
 if(form.party?.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.party.email))add('party_email',partyText.labels.email,v.email);
 if(!Array.isArray(form.lines)||!form.lines.length||form.lines.length>40)add('invoice_lines',t.items,v.lines,'add_invoice_line');
 for(const [index,line]of (form.lines||[]).entries()){
  text('line_description_'+index,t.concept+' '+(index+1),line.description,200,v.concept);
  if(!positive(line.base))add('line_base_'+index,t.base+' '+(index+1),v.amount);
  if(!validRate(line.tax_rate))add('line_tax_'+index,t.vatRate+' '+(index+1),v.rate);
 }
 if(!validRate(form.withholding_rate))add('withholding_rate',t.withholdingRate,v.rate);
 let totals;
 try{totals=calculateInvoice(form.lines,form.withholding_rate);}catch(cause){if(!issues.some(issue=>/^(line_base_|line_tax_|withholding_rate|invoice_lines)/.test(issue.field)))add('invoice_totals',t.total,treasuryError(cause),'line_base_0');}
 const account=(field,label,allowed,requiredMessage)=>{
  if(!form[field]){if(requiredMessage)add(field,label,requiredMessage);return;}
  const found=accounts.find(row=>String(row.id)===String(form[field]));
  if(!found||found.kind!=='subaccount'||!allowed.some(prefix=>found.code.startsWith(prefix)))add(field,label,v.account);
 };
 account('party_account_id',t.partyAccount,prefixes);
 account('offset_account_id',t.offset,received?['6','2']:['7'],requirePostingAccounts?v.offset:null);
 account('vat_account_id',t.vatAccount,received?['472']:['477'],requirePostingAccounts&&totals&&cents(totals.tax_total)>0n?v.vat:null);
 account('withholding_account_id',t.withholdingAccount,received?['4751']:['473'],requirePostingAccounts&&totals&&cents(totals.withholding_total)>0n?v.withholding:null);
 const eligible=accounts.filter(row=>row.kind==='subaccount'&&prefixes.some(prefix=>row.code.startsWith(prefix)));
 const identities=[...parties,...eligible.filter(row=>row.party_profile?.tax_id).map(row=>({account_id:row.id,direction:form.direction,tax_id:row.party_profile.tax_id}))];
 const tax=partyTaxId(form.party?.tax_id),matches=partyAccountsByTaxId(identities,form.direction,tax).filter(id=>eligible.some(row=>Number(row.id)===id));
 if(!form.party_account_id&&(matches.length>1||!matches.length&&partyAccountsByName(eligible,identities,form.direction,form.party?.name,form.party?.tax_id).length>1))add('party_account_id',t.partyAccount,v.ambiguous);
 const selected=identities.filter(row=>String(row.account_id)===String(form.party_account_id)&&row.direction===form.direction&&partyTaxId(row.tax_id));
 if(tax&&selected.length&&!selected.some(row=>partyTaxId(row.tax_id)===tax))add('party_account_id',t.partyAccount,v.taxConflict);
 if(!Array.isArray(form.receipts)||!form.receipts.length||form.receipts.length>60)add('invoice_receipts',t.receipts,v.receipts,'add_invoice_receipt');
 let sum=0n,amountsValid=true;
 for(const [index,row]of (form.receipts||[]).entries()){
  if(!validDate(row.due_date))add('due_date_'+index,t.dueDate+' '+(index+1),v.date);
  else if(validDate(form.invoice_date)&&row.due_date<form.invoice_date)add('due_date_'+index,t.dueDate+' '+(index+1),v.due);
  if(!positive(row.amount)){add('due_amount_'+index,t.amount+' '+(index+1),v.amount);amountsValid=false;}else sum+=cents(row.amount);
 }
 if(totals&&amountsValid&&form.receipts?.length&&sum!==cents(totals.total_amount))add('receipt_total',t.receipts,v.receiptSum(displayMoney(sum),displayMoney(cents(totals.total_amount)),displayMoney(cents(totals.total_amount)-sum)),'due_amount_0');
 if(automaticError)add('automatic_receipts',t.receipts,automaticError);
 text('invoice_notes',t.notes,form.notes,1000);
 return issues;
}
