import {amount} from './report-amount.js';
import {bankDayNumber,BANK_BALANCE_MAX_DAYS} from '../../../shared/bank-reconciliation.js';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(bankDayNumber(value));
export function matchPendingInvoices(rows,invoices){
 const matches=[];
 for(const row of rows){
  const value=amount(row.amount),absolute=value<0n?-value:value,concept=normalize(row.concept),candidates=[];
  for(const invoice of invoices){
   const data=invoice.extraction||{};
   if(data.multiple_invoices||data.currency&&data.currency!=='EUR'||!/^\d{1,13}\.\d{2}$/.test(data.total_amount||'')||amount(data.total_amount)!==absolute)continue;
   if(invoice.direction==='issued'&&value<0n||invoice.direction==='received'&&value>0n)continue;
   const dates=[data.due_date,data.invoice_date].filter(validDate).map(date=>({date,distance:Math.abs(bankDayNumber(date)-bankDayNumber(row.date))})).sort((a,b)=>a.distance-b.distance);
   const closest=dates[0],reference=normalize(data.reference),party=normalize(invoice.direction==='issued'?data.customer?.name:data.supplier?.name);
   const referenceMatches=reference.length>=4&&concept.replaceAll(' ','').includes(reference.replaceAll(' ',''));
   const words=party.split(' ').filter(word=>word.length>=4),partyMatches=words.length>0&&words.some(word=>concept.split(' ').includes(word));
   const dated=closest&&closest.distance<=BANK_BALANCE_MAX_DAYS;
   if(!dated&&!referenceMatches&&!partyMatches)continue;
   candidates.push({documentation_id:invoice.id,version:invoice.version,title:invoice.title,source_name:invoice.source_name,reference:data.reference||'',party:invoice.direction==='issued'?data.customer?.name||'':data.supplier?.name||'',invoice_date:data.invoice_date||null,due_date:data.due_date||null,total_amount:data.total_amount,
    difference_days:closest?.distance??null,basis:'Importe exacto'+(dated?' y fecha a '+closest.distance+' días':'')+(referenceMatches?'; referencia en el concepto':'')+(partyMatches?'; nombre en el concepto':''),confidence:referenceMatches||partyMatches?'Importe y referencia / nombre':'Importe y fecha; validar',rank:(referenceMatches?4:0)+(partyMatches?2:0)+(dated?1:0)});
  }
  candidates.sort((a,b)=>b.rank-a.rank||(a.difference_days??Infinity)-(b.difference_days??Infinity)||a.documentation_id-b.documentation_id);
  if(candidates.length)matches.push({movement_id:row.id,date:row.date,concept:row.concept,amount:row.amount,ambiguous:candidates.length>1,candidates:candidates.map(({rank,...candidate})=>candidate)});
 }
 return matches;
}
