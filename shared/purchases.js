const invalid=()=>{throw new Error('PURCHASE_INVALID_AMOUNT');};
export const purchaseLineLimits=Object.freeze({orders:100,receipts:100,invoices:40});
export function purchaseNumber(value,places=6){
 if(typeof value!=='string'||!new RegExp('^\\d{1,14}(?:[.,]\\d{1,'+places+'})?$').test(value))invalid();
 const [whole,fraction='']=value.replace(',','.').split('.');return BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));
}
export function purchaseDecimal(value,places=6){const sign=value<0n?'-':'';value=value<0n?-value:value;const scale=10n**BigInt(places);return sign+(value/scale)+'.'+String(value%scale).padStart(places,'0');}
const round=(n,d)=>(n+d/2n)/d;
export function purchaseLine(line,{unpriced=false}={}){
 const quantity=purchaseNumber(line.quantity),price=line.unit_price==null||line.unit_price===''?null:purchaseNumber(line.unit_price);
 const discount=purchaseNumber(line.discount_rate||'0',5),tax=purchaseNumber(line.tax_rate||'0',2);
 if(quantity<=0n||discount>10000000n||tax>10000n||price===null&&!unpriced)invalid();
 if(price===null)return {quantity:purchaseDecimal(quantity),unit_price:null,discount_rate:purchaseDecimal(discount,5),tax_rate:purchaseDecimal(tax,2),base:null,tax_amount:null,total:null,net_unit_price:null};
 const base=round(quantity*price*(10000000n-discount),100000000000000000n),taxAmount=round(base*tax,10000n);
 if(base+taxAmount>999999999999999n)invalid();
 return {quantity:purchaseDecimal(quantity),unit_price:purchaseDecimal(price),discount_rate:purchaseDecimal(discount,5),tax_rate:purchaseDecimal(tax,2),base:purchaseDecimal(base,2),tax_amount:purchaseDecimal(taxAmount,2),total:purchaseDecimal(base+taxAmount,2),net_unit_price:purchaseDecimal(round(price*(10000000n-discount),10000000n))};
}
export function purchaseTotals(lines){let base=0n,tax=0n,unpriced=false;for(const line of lines){const amount=purchaseLine(line,{unpriced:true});if(amount.base===null){unpriced=true;continue;}base+=purchaseNumber(amount.base,2);tax+=purchaseNumber(amount.tax_amount,2);}return {base:purchaseDecimal(base,2),tax_amount:purchaseDecimal(tax,2),total:purchaseDecimal(base+tax,2),unpriced};}
export function purchasePriceChange(previous,current){const old=purchaseNumber(previous),next=purchaseNumber(current);if(!old)return null;return purchaseDecimal((next-old)*10000n/old,2);}
export function purchaseAmountDifferences(lines,extraction,{withholdingRate=extraction?.withholding_rate||'0'}={}){
 if(!extraction)return [];
 const fields=['base_total','tax_total','total_amount'];let calculated;
 try{
  const totals=purchaseTotals(lines),rate=purchaseNumber(withholdingRate,2);
  if(totals.unpriced||rate>10000n)throw new Error('Incomplete');
  const base=purchaseNumber(totals.base,2),tax=purchaseNumber(totals.tax_amount,2),retained=(base*rate+5000n)/10000n;
  calculated={base_total:base,tax_total:tax,total_amount:base+tax-retained};
 }catch{}
 return fields.flatMap(field=>{
  if(extraction.currency&&extraction.currency!=='EUR')return [{kind:'amount_review',field,reason:'currency'}];
  const raw=extraction[field];
  if(raw==null||raw==='')return [{kind:'amount_review',field,reason:'missing'}];
  let recognized;try{recognized=purchaseNumber(raw,2);}catch{return [{kind:'amount_review',field,reason:'invalid'}];}
  if(!calculated)return [{kind:'amount_review',field,reason:'incomplete'}];
  const amount=calculated[field];
  return amount===recognized?[]:[{kind:'amount',field,recognized_amount:purchaseDecimal(recognized,2),calculated_amount:purchaseDecimal(amount,2),difference:purchaseDecimal(amount-recognized,2)}];
 });
}
