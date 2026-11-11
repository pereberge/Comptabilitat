import {parseInvoicePages} from './invoice-pdf.js';
import {recognizeO2Purchase} from './purchase-o2.js';
import {recognizeSantIsidrePurchases} from './purchase-sant-isidre.js';
const normalize=value=>String(value).normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const number=value=>{
 let text=String(value).replace(/EUR|€|%/gi,'').trim().replace(/\s/g,'');if(text.includes(','))text=text.replaceAll('.','').replace(',','.');
 return /^\d{1,14}(?:\.\d{1,6})?$/.test(text)?text:null;
};
export function recognizePurchasePages(pages){
 const cooperative=recognizeSantIsidrePurchases(pages);if(cooperative)return cooperative;
 const extraction=recognizeO2Purchase(parseInvoicePages(pages),pages),commercial=[];
 if(extraction.parser==='ardiaca')return extraction;
 for(const page of pages){
  const aliases={description:['DESCRIPCION','DESCRIPCIO','ARTICULO','ARTICLE','CONCEPTO','CONCEPTE'],quantity:['CANTIDAD','QUANTITAT','QTY','CANT','QUANT'],price:['PRECIO','PREU','PRECIOUNITARIO','PREUUNITARI'],discount:['DESCUENTO','DESCOMPTE','DTO'],tax:['IVA'],code:['CODIGO','CODI','REF','REFERENCIA']};
  const headers=Object.fromEntries(Object.entries(aliases).map(([key,names])=>[key,page.items.find(item=>names.includes(normalize(item.text)))]));
  if(!headers.description||!headers.quantity||!headers.price)continue;
  const columns=Object.entries(headers).filter(([,value])=>value).sort((a,b)=>a[1].x-b[1].x),groups=[];
  for(const item of page.items.filter(item=>item.y<headers.quantity.y-4).sort((a,b)=>b.y-a.y||a.x-b.x)){
   let group=groups.find(group=>Math.abs(group.y-item.y)<3);if(!group){group={y:item.y,items:[]};groups.push(group);}group.items.push(item);
  }
  for(const group of groups){
   const cells=Object.fromEntries(columns.map(([key,header],index)=>[key,group.items.filter(item=>item.x>=header.x-5&&item.x<(columns[index+1]?.[1].x??Infinity)-5).map(item=>item.text).join(' ')]));
   const quantity=number(cells.quantity),price=number(cells.price);if(!quantity||!price||!cells.description?.trim())continue;
   commercial.push({supplier_code:cells.code||'',description:cells.description.trim().slice(0,300),quantity,unit_price:price,discount_rate:number(cells.discount)||'0',tax_rate:number(cells.tax)||'0',tax_rate_detected:!!number(cells.tax),source_page:page.page});
  }
 }
 return {...extraction,commercial_lines:commercial,warnings:[...(extraction.warnings||[]),...(!commercial.length?['No s’han identificat les columnes d’articles amb prou seguretat. Cal completar-ne el detall.']:[])]};
}
