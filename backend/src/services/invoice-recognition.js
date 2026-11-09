import {calculateInvoice} from '../../../shared/invoice-money.js';

const identity=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
const invoiceLabel=/\b(?:FACTURA|INVOICE|FACTURE)\b/i;
const nonInvoiceLabel=/\b(?:PRESUPUESTO|PRESSUPOST|PROFORMA|ALBARAN|ALBARA|EXTRACTO BANCARIO|EXTRACTE BANCARI)\b/i;
export function printedMoney(value){
 const text=String(value||'').replace(/[€\s]/g,'').replace(/EUR$/i,'');
 if(/^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(text)||/^-?\d+,\d{2}$/.test(text))return text.replaceAll('.','').replace(',','.');
 if(/^-?\d{1,3}(?:,\d{3})*\.\d{2}$/.test(text)||/^-?\d+\.\d{2}$/.test(text))return text.replaceAll(',','');
 return null;
}
const amountPattern=/-?(?:\d{1,3}(?:[.,]\d{3})+|\d+)[.,]\d{2}(?!\d)/g;
export function invoiceRecognition(extraction){
 if(!extraction)return {kind:'document',status:'not_analyzed',missing:[]};
 if(extraction.error||extraction.parser==='manual')return {kind:'unreadable',status:'needs_data',missing:['Nombre','Número de factura','Importe total']};
 const missing=[];
 if(!extraction.supplier?.name&&!extraction.customer?.name)missing.push('Nombre');
 if(!extraction.reference)missing.push('Número de factura');
 if(!extraction.invoice_date)missing.push('Fecha');
 if(!extraction.total_amount)missing.push('Importe total');
 const excluded=extraction.document_hint==='not_invoice';
 const evidence=extraction.document_hint==='invoice'||extraction.parser==='energia-xxi'||!!extraction.reference;
 const kind=excluded?'document':evidence?(missing.length?'possible_invoice':'invoice'):'document';
 return {kind,status:kind==='document'?'not_invoice':missing.length||!extraction.totals_verified||extraction.multiple_invoices||extraction.withholding_review||extraction.currency!=='EUR'?'needs_data':'pending_review',missing,multiple_invoices:!!extraction.multiple_invoices,remembered_format:extraction.recognized_format||null};
}
export function layoutLines(pages){
 const lines=[];
 for(const page of pages){
  const groups=[];
  for(const item of page.items){
   const text=String(item.text??item.str??'').trim();if(!text)continue;
   if(!Number.isFinite(item.y)){groups.push({y:null,items:[{x:0,text}]});continue;}
   let group=groups.find(row=>row.y!==null&&Math.abs(row.y-item.y)<2.5);
   if(!group){group={y:item.y,items:[]};groups.push(group);}group.items.push({x:item.x||0,text});
  }
  if(groups.every(group=>group.y!==null))groups.sort((a,b)=>b.y-a.y);
  for(const group of groups)lines.push(group.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ').slice(0,1000));
 }
 return lines.slice(0,2000);
}
export function invoiceDocumentHint(lines){const text=normalized(lines.join('\n'));return nonInvoiceLabel.test(text)?'not_invoice':invoiceLabel.test(text)?'invoice':'unknown';}
function date(value){const match=String(value||'').match(/\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);if(!match)return null;const result=match[1]?match[0]:`${match[6]}-${match[5].padStart(2,'0')}-${match[4].padStart(2,'0')}`;const parsed=new Date(result+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===result?result:null;}
const fields={reference:'reference',invoice_date:'invoice_date',due_date:'due_date',base_total:'base_total',tax_total:'tax_total',total_amount:'total_amount'};
const labels={reference:/FACTURA|INVOICE|NUM|REFER|DOC/i,invoice_date:/FECHA|DATA|DATE/i,due_date:/VENC|DUE/i,base_total:/BASE|NET|SUBTOTAL/i,tax_total:/IVA|TAX|QUOTA|CUOTA/i,total_amount:/TOTAL|PAGAR|IMPORT/i};
function occurrence(line,field,value){
 if(field.endsWith('_total')||field==='total_amount')return [...line.matchAll(amountPattern)].map(match=>({value:printedMoney(match[0]),index:match.index})).find(match=>match.value===value);
 if(field.endsWith('_date')){const pattern=/\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}/g;return [...line.matchAll(pattern)].map(match=>({value:date(match[0]),index:match.index})).find(match=>match.value===value);}
 const index=normalized(line).indexOf(normalized(value));return index>=0?{value,index}:null;
}
export function learnInvoiceFormat(extraction,form,company){
 if(!Array.isArray(extraction.layout_lines)||extraction.multiple_invoices||extraction.currency!=='EUR')return null;
 const supplier=form.direction==='received'?form.party:company;
 const tax=identity(supplier?.tax_id),name=String(supplier?.name||'').trim(),key=tax||identity(name);
 if(key.length<6||!identity(extraction.layout_lines.join(' ')).includes(key))return null;
 const rules=[];
 for(const field of Object.keys(fields)){
  const value=field==='due_date'?form.receipts?.[0]?.due_date:form[field];if(!value)continue;
  const candidates=[];
  for(let index=0;index<extraction.layout_lines.length;index++){
   const line=normalized(extraction.layout_lines[index]),match=occurrence(line,field,value);if(!match)continue;
   let label=line.slice(0,match.index).trim(),offset=0;
   if(!label&&index){label=extraction.layout_lines[index-1].trim();offset=1;}
   // Only retain literal labels: never save a past number, amount or date as a rule.
   if(label.length<3||label.length>80||/\d/.test(label)||!labels[field].test(normalized(label)))continue;
   if(field==='invoice_date'&&/VENC|DUE/i.test(label))continue;
   candidates.push({field,label,offset});
  }
  const unique=[...new Map(candidates.map(rule=>[normalized(rule.label)+rule.offset,rule])).values()];
  if(unique.length===1)rules.push(unique[0]);
 }
 if(!rules.some(rule=>rule.field==='reference')||!rules.some(rule=>rule.field==='total_amount'))return null;
 return {version:1,party_key:key,supplier:{name,tax_id:supplier?.tax_id||''},rules};
}
function ruleValue(lines,rule){
 const values=[];
 for(let index=0;index<lines.length;index++){
  const label=normalized(rule.label),line=normalized(lines[index]);
  if(!line.startsWith(label))continue;
  const text=rule.offset===1?(line===label?lines[index+1]||'':''):line.slice(label.length).trim();
  let value;
  if(rule.field.endsWith('_total')||rule.field==='total_amount'){const matches=[...text.matchAll(amountPattern)];if(matches.length===1)value=printedMoney(matches[0][0]);}
  else if(rule.field.endsWith('_date'))value=date(text);
  else value=text.replace(/^\s*[:#：-]\s*/,'').trim().split(/\s+/)[0];
  if(value&&!(rule.field==='reference'&&!/^[A-Z0-9][A-Z0-9/._-]{1,59}$/i.test(value)))values.push(value);
 }
 const unique=[...new Set(values)];return unique.length===1?unique[0]:null;
}
export function applyInvoiceFormat(extraction,template){
 if(template?.version!==1||typeof template.party_key!=='string'||!template.supplier||typeof template.supplier.name!=='string'||!Array.isArray(template.rules)||template.rules.length>6||!Array.isArray(extraction.layout_lines)||extraction.document_hint!=='invoice'||extraction.multiple_invoices)return extraction;
 const text=identity(extraction.layout_lines.join(' '));
 if(!template.party_key||!text.includes(template.party_key))return extraction;
 const found=Object.fromEntries(template.rules.filter(rule=>rule&&Object.hasOwn(fields,rule.field)&&typeof rule.label==='string'&&rule.label.trim().length>=3&&rule.label.length<=80&&[0,1].includes(rule.offset)).map(rule=>[rule.field,ruleValue(extraction.layout_lines,rule)]).filter(([,value])=>value));
 if(!found.reference||!found.total_amount)return extraction;
 const result={...extraction,...found,supplier:{...extraction.supplier,...template.supplier},recognized_format:template.supplier.name||template.supplier.tax_id,warnings:[...extraction.warnings,'Se ha aplicado un formato confirmado anteriormente. Revisa esta factura antes de contabilizar.']};
 // Keep fiscal lines only when they still describe the printed base; do not invent VAT rates.
 if(result.lines.length===1&&result.base_total)result.lines=[{...result.lines[0],base:result.base_total}];
 try{const totals=calculateInvoice(result.lines,result.withholding_rate||'0');result.totals_verified=['total_amount','base_total','tax_total'].every(field=>totals[field]===result[field]);}catch{result.totals_verified=false;}
 return result;
}
export async function recognizeInvoiceFormat(db,companyId,extraction){
 if(!extraction||extraction.error||!extraction.layout_lines?.length||extraction.document_hint!=='invoice')return extraction;
 const [rows]=await db.execute("SELECT JSON_EXTRACT(extraction,'$.learned_template') AS invoice_format FROM invoice_documents WHERE company_id=? AND status IN ('posted','linked') AND JSON_CONTAINS_PATH(extraction,'one','$.learned_template') ORDER BY updated_at DESC,id DESC LIMIT 500",[companyId]);
 for(const row of rows){let template;try{template=typeof row.invoice_format==='string'?JSON.parse(row.invoice_format):row.invoice_format;}catch{continue;}const result=applyInvoiceFormat(extraction,template);if(result!==extraction)return result;}
 return extraction;
}
