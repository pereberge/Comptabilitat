import {invoiceDate} from './invoice-pdf.js';
import {printedMoney} from './invoice-recognition.js';
import {calculateInvoice} from '../../../shared/invoice-money.js';

// O2 prints issuer details in the legal footer and VAT in a parenthesized row.
export function recognizeO2Purchase(extraction,pages){
 const lines=extraction.layout_lines||[],text=lines.join('\n');
 const normalized=text.normalize('NFD').replace(/\p{M}/gu,'');
 if(!/\bo2online\.es\b/i.test(normalized)||!/Telefonica Moviles Espana,\s*S\.?A\.?/i.test(normalized))return extraction;
 const supplier=text.match(/Telefónica Móviles España,\s*S\.?A\.?/i)?.[0]||'';
 const taxId=normalized.match(/Telefonica Moviles Espana[^\n]*C\.?I\.?F\.?\s*[:.-]?\s*([A-Z]\d{8})\b/i)?.[1]||'';
 const invoiceDateText=normalized.match(/(?:^|\n)(\d{1,2}\s+de\s+[A-Za-z]+\s+de\s+\d{4})\s+Pagina\s+1\b/i)?.[1];
 const dueText=normalized.match(/Mandaremos el recibo[\s\S]*?a\s+partir del\s+(\d{1,2}\s+de\s+[A-Za-z]+\s+de\s+\d{4})/i)?.[1];
 const vat=normalized.match(/(?:^|\n)IVA\s*\((\d+(?:[.,]\d+)?)\s*%\)\s*sobre\s*([\d.,]+)\s*€\s*([\d.,]+)\s*€/i);
 const total=normalized.match(/(?:^|\n)Total factura\s*([\d.,]+)\s*€/i)?.[1];
 const first=pages[0]?.items||[],holder=first.find(item=>/^Titular\s*:\s*$/i.test(item.text.trim()));
 const customer=holder?first.filter(item=>item.x>holder.x&&Math.abs(item.y-holder.y)<3).sort((a,b)=>a.x-b.x)[0]?.text||'':'';
 const customerTaxes=[...new Set(first.map(item=>item.text.trim()).filter(value=>/^[A-Z]\d{7}[A-Z0-9]$/.test(value)&&value!==taxId))];
 const result={...extraction,parser:'o2-mobile',supplier:{name:supplier,tax_id:taxId,address:''},
  customer:{...extraction.customer,name:customer,tax_id:customerTaxes.length===1?customerTaxes[0]:''},
  invoice_date:invoiceDate(invoiceDateText)||extraction.invoice_date,due_date:invoiceDate(dueText)||extraction.due_date,
  payment_method:/Mandaremos el recibo/i.test(normalized)?'direct_debit':extraction.payment_method,
  base_total:vat?printedMoney(vat[2]):extraction.base_total,tax_total:vat?printedMoney(vat[3]):extraction.tax_total,
  total_amount:printedMoney(total)||extraction.total_amount};
 if(vat&&result.base_total&&result.tax_total)result.lines=[{description:'Serveis O2 mòbil · resum de la factura',base:result.base_total,tax_rate:vat[1].replace(',','.')}];
 try{const calculated=calculateInvoice(result.lines,'0');result.totals_verified=calculated.base_total===result.base_total&&calculated.tax_total===result.tax_total&&calculated.total_amount===result.total_amount;}catch{result.totals_verified=false;}
 result.warnings=[...(extraction.warnings||[]).filter(warning=>!warning.startsWith('Comprueba los campos extraídos')&&!warning.startsWith('No se ha podido comprobar base + IVA')&&!warning.startsWith('El vencimiento no se ha identificado')),'Revisa les dades reconegudes abans de confirmar. La línia és el resum fiscal, no el detall dels consums.','La data anunciada del rebut no acredita el pagament.'];
 if(!result.totals_verified)result.warnings.push('No s’ha pogut verificar base + IVA = total. Revisa els imports.');
 if(!result.due_date)result.warnings.push('Cal completar el venciment.');
 return result;
}
