import {calculateInvoice} from '../../../shared/invoice-money.js';
import {purchaseLine} from '../../../shared/purchases.js';
import {layoutLines,printedMoney} from './invoice-recognition.js';

const norm=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const number=value=>{const text=String(value||'').replace(/\./g,'').replace(',','.');return /^\d+(?:\.\d{1,6})?$/.test(text)?text:null;};
const date=value=>{const match=String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return null;const result=match[3]+'-'+match[2]+'-'+match[1],parsed=new Date(result+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===result?result:null;};

// Specific digital layout: separate invoice/date columns and a tax summary grid.
export function recognizeArdiacaInvoice(pages){
 if(pages.length!==1)return null;
 const items=pages[0].items.map(item=>({text:item.text??item.str,x:item.x??item.transform?.[4],y:item.y??item.transform?.[5]}));
 const header=text=>items.find(item=>norm(item.text)===norm(text));
 if(!items.some(item=>/CIF\/NIF:\s*B25457086/i.test(item.text)))return null;
 const ref=header('Nº factura'),when=header('Fecha'),units=header('Unidades'),description=header('Descripción'),pvp=header('PVP'),vat=header('% IVA'),baseHeader=header('Base imponible'),totalHeader=header('Total factura'),customerHeader=header('Datos del cliente');
 if(![ref,when,units,description,pvp,vat,baseHeader,totalHeader,customerHeader].every(Boolean))return null;
 const summaryVat=items.find(item=>norm(item.text)==='IVA'&&Math.abs(item.y-baseHeader.y)<2);if(!summaryVat)return null;
 const below=(anchor,left,right)=>items.filter(item=>item.y<anchor.y-3&&item.y>anchor.y-30&&item.x>=left&&item.x<right).sort((a,b)=>b.y-a.y||a.x-b.x);
 const reference=below(ref,ref.x-10,when.x-10)[0]?.text||'',invoice_date=date(below(when,when.x-15,when.x+60)[0]?.text);
 if(!/^[A-Z0-9][A-Z0-9/._-]{1,59}$/i.test(reference)||!invoice_date)return null;
 const summary=below(totalHeader,totalHeader.x,580),total_amount=printedMoney(summary[0]?.text||''),base_total=printedMoney(below(baseHeader,40,145)[0]?.text||''),tax_total=printedMoney(below(summaryVat,190,250)[0]?.text||'');
 const customerRows=items.filter(item=>item.x>=customerHeader.x-3&&item.y<customerHeader.y-3&&item.y>ref.y+5).sort((a,b)=>b.y-a.y);
 const supplierRows=items.filter(item=>item.x<300&&item.y>customerHeader.y+10).sort((a,b)=>b.y-a.y);
 const taxId=rows=>rows.map(item=>item.text.match(/CIF\/NIF:\s*([A-Z0-9]+)/i)?.[1]).find(Boolean)||'';
 const commercial=[],lines=[],groups=[];
 for(const item of items.filter(item=>item.y<units.y-5&&item.y>baseHeader.y+10).sort((a,b)=>b.y-a.y||a.x-b.x)){const last=groups.at(-1);if(last&&Math.abs(last.y-item.y)<2)last.items.push(item);else groups.push({y:item.y,items:[item]});}
 for(const group of groups){
  const cell=(left,right)=>group.items.filter(item=>item.x>=left&&item.x<right).map(item=>item.text).join(' ');
  const quantity=number(cell(40,95)),unit_price=number(cell(350,435)),discount_rate=number(cell(435,470))||'0',tax_rate=number(cell(470,510)),text=cell(95,350),base=printedMoney(cell(510,580));
  if(!quantity||!unit_price||!tax_rate||!text||base===null||discount_rate!=='0')return null;
  try{if(purchaseLine({description:text,quantity,unit_price,discount_rate,tax_rate}).base!==base)return null;}catch{return null;}
  commercial.push({description:text,supplier_code:'',quantity,unit_price,discount_rate,tax_rate,tax_rate_detected:true,source_page:pages[0].page||1});
  lines.push({description:text,base,tax_rate});
 }
 if(!lines.length||!total_amount||!base_total||tax_total===null)return null;
 let calculated;try{calculated=calculateInvoice(lines,'0');}catch{return null;}
 if(calculated.base_total!==base_total||calculated.tax_total!==tax_total||calculated.total_amount!==total_amount)return null;
 const dueLabel=header('Vencimientos:'),due_date=dueLabel?date(items.find(item=>Math.abs(item.y-dueLabel.y)<2&&item.x>dueLabel.x+55&&/^\d{2}\/\d{2}\/\d{4}$/.test(item.text))?.text):null;
 return {parser:'ardiaca',supplier:{name:supplierRows[0]?.text||'',tax_id:'B25457086',address:supplierRows.slice(1).filter(item=>! /Tel\.|CIF\/NIF|@/i.test(item.text)).map(item=>item.text).join(' · ')},customer:{name:customerRows[0]?.text||'',tax_id:taxId(customerRows),address:customerRows.slice(1).filter(item=>!/CIF\/NIF/i.test(item.text)).map(item=>item.text).join(' · ')},reference,invoice_date,due_date,payment_method:'transfer',base_total,tax_total,total_amount,withholding_rate:'0',lines,commercial_lines:commercial,totals_verified:true,header_totals_verified:true,document_hint:'invoice',company_tax_ids:['B25457086',taxId(customerRows)].filter(Boolean),pages:1,currency:'EUR',layout_lines:layoutLines(pages),warnings:['Revisa los datos con el PDF original antes de contabilizar.']};
}
