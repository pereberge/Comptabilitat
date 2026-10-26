import { cents, decimal } from './money.js';
const limit=999999999999999n;
export function rate(value) {
  const result=cents(value);
  if(result>10000n)throw new Error('INVALID_TAX_RATE');
  return result;
}
export function calculateInvoice(lines,withholding='0') {
  if(!Array.isArray(lines)||!lines.length||lines.length>40)throw new Error('INVALID_INVOICE_LINES');
  let base=0n,tax=0n;
  const result=lines.map(line=>{
    if(!line||typeof line!=='object'||Array.isArray(line))throw new Error('INVALID_INVOICE_LINES');
    const amount=cents(line.base),percentage=rate(line.tax_rate);
    if(amount<=0n)throw new Error('INVALID_INVOICE_AMOUNT');
    const vat=(amount*percentage+5000n)/10000n;
    if(vat>limit)throw new Error('TOTAL_TOO_LARGE');
    base+=amount;tax+=vat;
    return {...line,base:decimal(amount),tax_rate:decimal(percentage),tax_amount:decimal(vat)};
  });
  const withholdingRate=rate(withholding),retained=(base*withholdingRate+5000n)/10000n,total=base+tax-retained;
  if(total<=0n||[base,tax,retained,total].some(value=>value>limit))throw new Error('INVALID_INVOICE_AMOUNT');
  return {lines:result,base_total:decimal(base),tax_total:decimal(tax),withholding_rate:decimal(withholdingRate),withholding_total:decimal(retained),total_amount:decimal(total)};
}
export function splitInstallments(total,count,firstDate,months=1) {
  const amount=cents(total);
  if(!Number.isInteger(count)||count<1||count>60||amount<BigInt(count)||!Number.isInteger(months)||months<1||months>12)throw new Error('INVALID_INSTALLMENTS');
  const [year,month,day]=String(firstDate).split('-').map(Number),first=new Date(String(firstDate)+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)||!Number.isFinite(first.getTime())||first.toISOString().slice(0,10)!==firstDate||year<1000)throw new Error('INVALID_DATE');
  const regular=amount/BigInt(count),extra=amount%BigInt(count);
  return Array.from({length:count},(_,index)=>{
    const target=new Date(Date.UTC(year,month-1+index*months,1)),last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
    target.setUTCDate(Math.min(day,last));
    if(target.getUTCFullYear()>9999)throw new Error('INVALID_DATE');
    return {due_date:target.toISOString().slice(0,10),amount:decimal(regular+(index===count-1?extra:0n))};
  });
}
