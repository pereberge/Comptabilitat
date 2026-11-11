import {invoiceDate} from './invoice-pdf.js';
import {layoutLines,printedMoney} from './invoice-recognition.js';
import {calculateInvoice} from '../../../shared/invoice-money.js';
import {purchaseTotals} from '../../../shared/purchases.js';
const norm=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const number=value=>{const text=String(value||'').trim().replaceAll('.','').replace(',','.');return /^\d+(?:\.\d{1,6})?$/.test(text)?text:null;};
const header=(items,name)=>items.find(item=>norm(item.text)===norm(name));
const below=(items,label,left,right)=>items.filter(item=>item.y<label.y-3&&item.y>label.y-35&&item.x>=left&&item.x<right).sort((a,b)=>b.y-a.y||a.x-b.x)[0]?.text||'';
function pageIdentity(page){
 const items=page.items,invoice=header(items,'Nº FACTURA'),date=header(items,'DATA FACTURA'),client=header(items,'Nº CLIENT');
 if(!invoice||!date||!client||!items.some(item=>/NIF\s*:\s*F25003518\b/i.test(item.text)))return null;
 const reference=below(items,invoice,invoice.x-5,date.x-5),invoice_date=invoiceDate(below(items,date,date.x-5,client.x-5));
 return reference&&invoice_date?{reference,invoice_date}:null;
}
function extract(pages,identity){
 const first=pages[0].items,lines=layoutLines(pages),supplierName=first.find(item=>/Camp i secci[oó] de cr[eè]dit Sant Isidre/i.test(item.text));
 const client=header(first,'C.I.F. CLIENT'),invoice=header(first,'Nº FACTURA');
 const supplierTax=first.find(item=>/NIF\s*:\s*F25003518\b/i.test(item.text));
 const supplier={name:supplierName?.text||'Camp i secció de crèdit Sant Isidre',tax_id:'F25003518',address:first.filter(item=>item.x>=(supplierName?.x||295)-5&&item.y<(supplierName?.y||802)&&item.y>supplierTax.y&&/^(?:Avda\.|\d{5}\s)/i.test(item.text)).map(item=>item.text).join(' · ')};
 const customer={name:first.find(item=>item.x>260&&Math.abs(item.y-invoice.y)<10)?.text.replace(/\s*-+\s*$/,'').trim()||'',tax_id:client?below(first,client,client.x-5,135):'',address:''};
 const commercial=[],totals=[];let farm='',delivery='',last=null,unread=0;
 for(const page of pages){
  const items=page.items,quantity=header(items,'QUANTITAT'),price=header(items,'PREU'),code=header(items,'CODI'),vat=header(items,'IVA'),unit=header(items,'Un.'),amount=header(items,'IMPORT');
  if(!quantity||!price||!code||!vat||!unit||!amount)continue;
  const floor=header(items,'BASE IMP.')?.y+20||15;
  const groups=[];for(const item of items.filter(item=>item.y<quantity.y-8&&item.y>floor).sort((a,b)=>b.y-a.y||a.x-b.x)){let row=groups.find(row=>Math.abs(row.y-item.y)<3);if(!row){row={y:item.y,items:[]};groups.push(row);}row.items.push(item);}
  for(const row of groups){
   const farmLabel=row.items.find(item=>/^GRANJA\s*:/i.test(item.text));if(farmLabel){farm=row.items.filter(item=>item.x>farmLabel.x).map(item=>item.text).join(' ');last=null;continue;}
   const supplierCode=row.items.find(item=>item.x>=code.x-15&&item.x<vat.x-5&&/^\d{8}$/.test(item.text));
   const cell=(left,right)=>row.items.filter(item=>item.x>=left&&item.x<right).map(item=>item.text).join(' ');
   if(supplierCode){
    const qty=number(cell(quantity.x-5,price.x-5)),unitPrice=number(cell(price.x-5,amount.x-5)),rate=number(cell(vat.x-5,vat.x+10)),description=cell(vat.x+10,unit.x-5);
    if(!qty||!unitPrice||!rate||!description){unread++;continue;}
    delivery=row.items.find(item=>/^\d+[A-Z]\.\d+$/i.test(item.text))?.text||delivery;
    last={supplier_code:supplierCode.text,item_description:description,description:[description,farm].filter(Boolean).join(' · ').slice(0,300),quantity:qty,unit_price:unitPrice,discount_rate:'0',tax_rate:rate,tax_rate_detected:true,source_page:page.page,farm,delivery_reference:delivery,printed_line_total:number(cell(amount.x-5,(header(items,'TOTAL ALB.')?.x||515)-5))};commercial.push(last);
   }else if(last){const note=cell(vat.x+10,unit.x-5);if(note&&!/^(?:SUMA ANTERIOR|RÒSSEC)/i.test(note))last.description=(last.description+' · '+note).slice(0,300);}
  }
  const base=header(items,'BASE IMP.'),tax=header(items,'QUOTA IVA'),total=header(items,'TOTAL EUR');
  if(base&&tax&&total){const percent=items.find(item=>item.text==='%'&&Math.abs(item.y-base.y)<3&&item.x>base.x),rate=percent?below(items,percent,percent.x-15,tax.x-10):'';
   totals.push({base_total:printedMoney(below(items,base,base.x-10,(percent?.x||254)-15)),tax_total:printedMoney(below(items,tax,tax.x-10,total.x-15)),total_amount:printedMoney(below(items,total,total.x-10,Infinity)),tax_rate:number(rate),due_date:invoiceDate(items.find(item=>item.y<base.y-30&&/^\d{2}\/\d{2}\/\d{4}$/.test(item.text))?.text)});
  }
 }
 const unique=[...new Map(totals.map(row=>[JSON.stringify(row),row])).values()],fiscal=unique.length===1?unique[0]:{},summary=fiscal.base_total&&fiscal.tax_rate?[{description:'Resum fiscal Sant Isidre',base:fiscal.base_total,tax_rate:fiscal.tax_rate}]:[];
 let headerVerified=false,verified=false;try{const value=calculateInvoice(summary,'0');headerVerified=value.base_total===fiscal.base_total&&value.tax_total===fiscal.tax_total&&value.total_amount===fiscal.total_amount;const detail=purchaseTotals(commercial);verified=headerVerified&&detail.base===fiscal.base_total&&detail.tax_amount===fiscal.tax_total&&detail.total===fiscal.total_amount;}catch{}
 const warnings=['Revisa el proveïdor, els articles, els impostos i els imports amb el document abans de confirmar.'];if(!verified)warnings.push('Revisa els arrodoniments: el document imprimeix imports de línia amb tres decimals i preus amb cinc. Es conserven les quantitats i preus originals sense inventar ajustos.');if(unread)warnings.push('Hi ha '+unread+' línies amb codi que no s’han pogut llegir completament. Revisa-les amb l’original.');
 return {parser:'cooperativa-sant-isidre',supplier,customer,...identity,...fiscal,payment_method:'direct_debit',withholding_rate:'0',currency:'EUR',commercial_lines:commercial,lines:summary,layout_lines:lines,recognized_text:lines.join('\n'),source_pages:pages.map(page=>page.page),pages:pages.length,totals_verified:verified,header_totals_verified:headerVerified,multiple_invoices:false,warnings};
}
export function recognizeSantIsidrePurchases(pages){
 const groups=[];for(const page of pages){const identity=pageIdentity(page);if(!identity)return null;let group=groups.at(-1);if(group?.identity.reference!==identity.reference){group={identity,pages:[]};groups.push(group);}if(group.identity.invoice_date!==identity.invoice_date)return null;group.pages.push(page);}
 if(!groups.length||new Set(groups.map(group=>group.identity.reference)).size!==groups.length)return null;
 const invoices=groups.map(group=>extract(group.pages,group.identity));if(invoices.length===1)return invoices[0];
 return {parser:'cooperativa-sant-isidre-batch',invoices,multiple_invoices:true,reference:'',supplier:invoices[0].supplier,commercial_lines:[],lines:[],totals_verified:false,warnings:['El document conté '+invoices.length+' factures. Es preparen propostes separades per no barrejar línies ni imports.']};
}
