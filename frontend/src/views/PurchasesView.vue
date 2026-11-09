<script setup>
import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue';
import {useContext} from '../composables/context.js';
import {useAccess} from '../composables/access.js';
import {purchaseApi,purchaseError} from '../services/purchases.js';
import PurchaseUpload from '../components/PurchaseUpload.vue';
import {reportDate as date,reportMoney as money,downloadCsv} from '../services/report-format.js';
import PurchaseDocumentEditor from '../components/PurchaseDocumentEditor.vue';
import InvoiceDetail from '../components/InvoiceDetail.vue';
import FormDialog from '../components/FormDialog.vue';
import DateInput from '../components/DateInput.vue';
import {purchaseFilters} from '../services/purchase-filters.js';
import {printHtml} from '../services/invoice-delivery.js';
import {purchaseNumber,purchaseDecimal,purchaseTotals,purchaseLine,purchaseLineLimits} from '../../../shared/purchases.js';
const {company,selectedExercise}=useContext(),{can,user}=useAccess();
const tab=ref('orders'),rows=ref([]),catalog=ref({units:[],items:[],suppliers:[],sources:[]}),loading=ref(false),error=ref(''),notice=ref(''),active=ref(null),invoiceId=ref(null),prices=ref(null),uploading=ref(false),search=ref('');let generation=0;
const unit=ref({code:'',name:'',dimension:'unit',base_unit_id:'',conversion_factor:'1'}),item=ref({code:'',description:'',unit_id:'',supplier_account_id:'',supplier_code:''});let unitKey=crypto.randomUUID(),itemKey=crypto.randomUUID();
const names={orders:'Comandes',receipts:'Albarans',invoices:'Factures de compra',catalog:'Articles i unitats'};
const status=row=>row.status==='draft'?'Pendent de revisar':row.status==='cancelled'?'Cancel·lat':row.progress==='partial'?'Recepció parcial':row.progress==='complete'?'Completada':row.progress==='pending'?'Pendent de recepció':'Confirmat';
const pendingOnly=ref(false);
const documentStatus=ref('all');
const selectedOnly=ref(false);let nextQuickFilter=null;
function setQuickFilter(preset){
 clearDocumentFilters();
 if(preset==='pending'){documentStatus.value='confirmed';pendingOnly.value=true;}
 else documentStatus.value=preset;
}
function openQuickFilter(kind,preset){
 if(loading.value||uploading.value||!can('purchases_read'))return;
 if(tab.value===kind)setQuickFilter(preset);
 else{nextQuickFilter={kind,preset};tab.value=kind;}
}
function useExerciseDates(){
 if(loading.value||!selectedExercise.value?.start_date||!selectedExercise.value?.end_date)return;
 filterFrom.value=selectedExercise.value.start_date;filterTo.value=selectedExercise.value.end_date;dateInputsValid.value=true;filterRevision.value++;
}
const filterFrom=ref(''),filterTo=ref(''),supplierFilter=ref(''),dateFilters=ref(null),dateInputsValid=ref(true),filterRevision=ref(0);
const documentFiltersValid=computed(()=>dateInputsValid.value&&(!filterFrom.value||!filterTo.value||filterFrom.value<=filterTo.value));
async function validateDateFilters(){await nextTick();dateInputsValid.value=[...(dateFilters.value?.querySelectorAll('input')||[])].every(input=>input.checkValidity());}
const supplierOptions=computed(()=>{
 const options=new Map(catalog.value.suppliers.map(supplier=>[String(supplier.id),{id:String(supplier.id),name:supplier.description}]));
 for(const row of rows.value)if(row.supplier_account_id&&!options.has(String(row.supplier_account_id)))options.set(String(row.supplier_account_id),{id:String(row.supplier_account_id),name:row.supplier_name||String(row.supplier_account_id)});
 return [...options.values()].sort((a,b)=>referenceOrder.compare(a.name,b.name));
});
const documentOrder=ref('date_desc');
const referenceOrder=new Intl.Collator('ca',{numeric:true,sensitivity:'base'});
function compareDocuments(left,right){
 const byDate=documentOrder.value.startsWith('date_'),field=byDate?'document_date':'reference';
 const a=String(left[field]||'').trim(),b=String(right[field]||'').trim();
 if(!a||!b)return a?-1:b?1:0;
 const compared=byDate?(a<b?-1:a>b?1:0):referenceOrder.compare(a,b);
 return documentOrder.value.endsWith('_desc')?-compared:compared;
}
const hasDocumentFilters=computed(()=>!!search.value||pendingOnly.value||selectedOnly.value||documentStatus.value!=='all'||!!filterFrom.value||!!filterTo.value||!!supplierFilter.value||!dateInputsValid.value);
const activeDocumentFilters=computed(()=>{
 const filters=[];
 if(search.value)filters.push({key:'search',label:'Cerca: '+search.value});
 if(documentStatus.value!=='all')filters.push({key:'status',label:'Estat: '+({active:'Actius',draft:'Esborranys',confirmed:'Confirmats',cancelled:'Cancel·lats'}[documentStatus.value])});
 if(pendingOnly.value)filters.push({key:'pending',label:tab.value==='orders'?'Pendents de rebre':'Pendents de facturar'});
 if(selectedOnly.value)filters.push({key:'selected',label:'Només albarans seleccionats'});
 if(supplierFilter.value)filters.push({key:'supplier',label:'Proveïdor: '+(supplierFilter.value==='unassigned'?'Pendent d’identificar':supplierOptions.value.find(supplier=>supplier.id===supplierFilter.value)?.name||supplierFilter.value)});
 if(filterFrom.value)filters.push({key:'from',label:'Des de: '+date(filterFrom.value)});
 if(filterTo.value)filters.push({key:'to',label:'Fins a: '+date(filterTo.value)});
 if(!dateInputsValid.value)filters.push({key:'dates',label:'Dates incorrectes'});
 return filters;
});
function removeDocumentFilter(key){
 if(loading.value)return;
 if(key==='search')search.value='';
 else if(key==='status')documentStatus.value='all';
 else if(key==='pending')pendingOnly.value=false;
 else if(key==='supplier')supplierFilter.value='';
 else if(key==='selected')selectedOnly.value=false;
 else if(['from','to','dates'].includes(key)){
  if(key!=='to')filterFrom.value='';if(key!=='from')filterTo.value='';dateInputsValid.value=true;filterRevision.value++;
 }
}
function clearDocumentFilters(){if(loading.value)return;search.value='';pendingOnly.value=false;selectedOnly.value=false;documentStatus.value='all';filterFrom.value='';filterTo.value='';supplierFilter.value='';dateInputsValid.value=true;filterRevision.value++;}
watch(documentStatus,value=>{if(['cancelled','draft'].includes(value))pendingOnly.value=false;});
watch(pendingOnly,value=>{if(value&&['cancelled','draft'].includes(documentStatus.value))documentStatus.value='active';});
const selectedReceipts=ref([]);
watch(()=>selectedReceipts.value.length,count=>{if(!count)selectedOnly.value=false;});
const groupPreview=ref(null),groupPreviewError=ref('');
const groupSummary=ref(null),printingSummary=ref(false);
const groupQuantities=ref({});
const groupPrices=ref({});
const quantityKey=(receipt,line)=>receipt.id+':'+line.id;
const missingPrice=line=>line.unit_price==null||line.unit_price==='';
const effectivePrice=(receipt,line)=>missingPrice(line)?groupPrices.value[quantityKey(receipt,line)]??'':line.unit_price;
function validGroupPrice(receipt,line){const price=effectivePrice(receipt,line);if(price===''||price==null)return true;try{purchaseNumber(price);return true;}catch{return false;}}
const groupPricesValid=computed(()=>!!groupPreview.value&&groupPreview.value.receipts.every(receipt=>receipt.lines.every(line=>{try{return purchaseNumber(groupQuantities.value[quantityKey(receipt,line)])===0n||validGroupPrice(receipt,line);}catch{return false;}})));
function validGroupQuantity(receipt,line){try{return purchaseNumber(groupQuantities.value[quantityKey(receipt,line)])<=purchaseNumber(line.pending_invoice_quantity);}catch{return false;}}
const groupQuantitiesValid=computed(()=>{
 if(!groupPreview.value)return false;
 let positive=false;
 for(const receipt of groupPreview.value.receipts)for(const line of receipt.lines){if(!validGroupQuantity(receipt,line))return false;if(purchaseNumber(groupQuantities.value[quantityKey(receipt,line)])>0n)positive=true;}
 return positive;
});
const groupEstimate=computed(()=>{
 if(!groupQuantitiesValid.value||!groupPricesValid.value)return null;
 try{
  const lines=groupPreview.value.receipts.flatMap(receipt=>receipt.lines.flatMap(line=>{const quantity=groupQuantities.value[quantityKey(receipt,line)];return purchaseNumber(quantity)>0n?[{...line,quantity,unit_price:effectivePrice(receipt,line)}]:[];}));
  const missing=lines.filter(line=>line.unit_price==null||line.unit_price==='').length;
  return {...purchaseTotals(lines),missing,priced:lines.length-missing};
 }catch{return null;}
});
function selectedGroupLine(receipt,line){return {...line,quantity:groupQuantities.value[quantityKey(receipt,line)],unit_price:effectivePrice(receipt,line)};}
const groupLineAmounts=computed(()=>{
 const amounts={};
 for(const receipt of groupPreview.value?.receipts||[])for(const line of receipt.lines){
  const key=quantityKey(receipt,line);
  try{const selected=selectedGroupLine(receipt,line);amounts[key]=purchaseNumber(selected.quantity)===0n?{excluded:true}:validGroupQuantity(receipt,line)&&validGroupPrice(receipt,line)?purchaseLine(selected,{unpriced:true}):null;}catch{amounts[key]=null;}
 }
 return amounts;
});
const receiptEstimates=computed(()=>Object.fromEntries((groupPreview.value?.receipts||[]).map(receipt=>{
 try{
  const lines=[];
  for(const line of receipt.lines){const amount=groupLineAmounts.value[quantityKey(receipt,line)];if(!amount)return [receipt.id,null];if(!amount.excluded)lines.push(selectedGroupLine(receipt,line));}
  const missing=lines.filter(missingPrice).length;
  return [receipt.id,{...purchaseTotals(lines),selected:lines.length,priced:lines.length-missing}];
 }catch{return [receipt.id,null];}
})));
const groupVatBreakdown=computed(()=>{
 if(!groupEstimate.value)return [];
 const rates=new Map();
 for(const amount of Object.values(groupLineAmounts.value)){
  if(!amount||amount.excluded||amount.base==null)continue;
  const bucket=rates.get(amount.tax_rate)||{rate:amount.tax_rate,base:0n,tax:0n};
  bucket.base+=purchaseNumber(amount.base,2);bucket.tax+=purchaseNumber(amount.tax_amount,2);rates.set(amount.tax_rate,bucket);
 }
 return [...rates.values()].sort((a,b)=>Number(a.rate)-Number(b.rate)).map(row=>({rate:row.rate,base:purchaseDecimal(row.base,2),tax:purchaseDecimal(row.tax,2)}));
});
function restoreGroupQuantities(){
 if(loading.value||!groupPreview.value)return;
 groupQuantities.value=Object.fromEntries(groupPreview.value.receipts.flatMap(receipt=>receipt.lines.map(line=>[quantityKey(receipt,line),line.pending_invoice_quantity])));
}
function exportGroupSummary(){
 if(loading.value||!groupPreview.value||!groupEstimate.value)return;
 const amount=value=>value==null?'':{amount:value};
 const number=value=>value==null||value===''?'':purchaseDecimal(purchaseNumber(value)).replace('.',',');
 const csv=[['Resum dels albarans seleccionats'],['Empresa',company.value?.name||''],['Proveïdor',groupPreview.value.supplier],['Estat',groupEstimate.value.unpriced?'Estimació parcial':'Estimació completa'],['Nota','Estimació abans de retencions. No és una factura.'],[],['Albarà','Article','Quantitat pendent','Quantitat a facturar','Unitat','Preu unitari sense IVA','Descompte %','IVA %','Base','Quota IVA','Total','Estat de la línia']];
 for(const receipt of groupPreview.value.receipts){
  for(const line of receipt.lines){
   const key=quantityKey(receipt,line),computed=groupLineAmounts.value[key];
   csv.push([receipt.reference||receipt.id,line.description,number(line.pending_invoice_quantity),number(groupQuantities.value[key]),line.unit_code||catalog.value.items.find(item=>String(item.id)===String(line.item_id))?.unit_code||'',number(effectivePrice(receipt,line)),decimal(line.discount_rate),decimal(line.tax_rate),amount(computed?.base),amount(computed?.tax_amount),amount(computed?.total),computed?.excluded?'Exclosa':computed?.base==null?'Sense preu':'Inclosa']);
  }
 }
 csv.push([],['Subtotals per albarà'],['Albarà','Base','Quota IVA','Total','Estat']);
 for(const receipt of groupPreview.value.receipts){const subtotal=receiptEstimates.value[receipt.id];csv.push([receipt.reference||receipt.id,amount(subtotal?.priced?subtotal.base:null),amount(subtotal?.priced?subtotal.tax_amount:null),amount(subtotal?.priced?subtotal.total:null),!subtotal?.selected?'Sense línies seleccionades':subtotal.unpriced?'Parcial':'Complet']);}
 csv.push([],['Desglossament de l’IVA'],['Tipus IVA %','Base','Quota IVA'],...groupVatBreakdown.value.map(row=>[decimal(row.rate),amount(row.base),amount(row.tax)]),[],['Total estimat','Base','Quota IVA','Total','Línies sense preu'],[groupEstimate.value.unpriced?'Parcial':'Complet',amount(groupEstimate.value.priced?groupEstimate.value.base:null),amount(groupEstimate.value.priced?groupEstimate.value.tax_amount:null),amount(groupEstimate.value.priced?groupEstimate.value.total:null),groupEstimate.value.missing]);
 downloadCsv('resum-albarans-'+company.value.id+'.csv',csv);
}
async function printGroupSummary(){
 if(loading.value||printingSummary.value||!groupEstimate.value||!groupSummary.value?.$el)return;
 printingSummary.value=true;groupPreviewError.value='';
 try{
  const content=groupSummary.value.$el.cloneNode(true);
  for(const input of content.querySelectorAll('input')){const value=document.createElement('span');value.textContent=input.value;input.replaceWith(value);}
  for(const controls of content.querySelectorAll('button,.purchase-group'))controls.remove();
  const companyName=document.createElement('p');companyName.textContent='Empresa: '+(company.value?.name||'');content.prepend(companyName);
  const html='<!doctype html><html lang="ca"><head><meta charset="utf-8"><title>Resum dels albarans seleccionats</title><style>@page{size:A4 landscape;margin:10mm}body{font:11px Arial,sans-serif;color:#17212d}h2{font-size:18px}h3{font-size:14px;margin-top:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #aab4c0;padding:5px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}p{line-height:1.4}.notice{font-weight:bold}.table-wrap{overflow:visible}</style></head><body>'+content.innerHTML+'</body></html>';
  await printHtml(html,'Resum dels albarans seleccionats');
 }catch{if(groupPreview.value)groupPreviewError.value='No s’ha pogut preparar el resum per imprimir. Torna-ho a provar.';}
 finally{printingSummary.value=false;}
}
const decimal=value=>value==null||value===''?'Sense preu':String(value).replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'').replace('.',',');
const selectedSupplier=computed(()=>rows.value.find(row=>selectedReceipts.value.includes(row.id))?.supplier_account_id);
function selectableReceipt(row){return row.status==='confirmed'&&['pending','partial'].includes(row.invoice_progress)&&!!row.supplier_account_id&&(!selectedReceipts.value.length||String(row.supplier_account_id)===String(selectedSupplier.value));}
async function groupReceipts({proceed=false}={}){
 if(loading.value||uploading.value||!can('purchases_write')||tab.value!=='receipts'||!selectedReceipts.value.length)return;
 if(proceed&&(!groupQuantitiesValid.value||!groupPricesValid.value))return;
 const ticket=generation,ids=[...selectedReceipts.value];loading.value=true;error.value='';notice.value='';groupPreviewError.value='';
 try{
  const receipts=await Promise.all(ids.map(id=>purchaseApi('/receipts/'+id)));if(ticket!==generation)return;
  const supplier=receipts[0].supplier_account_id;
  if(!supplier||receipts.some(receipt=>receipt.status!=='confirmed'||String(receipt.supplier_account_id)!==String(supplier)))throw {code:'PURCHASE_INVALID_LINK'};
  const lines=[],sources=[];
  for(const receipt of receipts){
   const pending=receipt.lines.filter(line=>purchaseNumber(line.pending_invoice_quantity)>0n);
   if(!pending.length)throw {code:'PURCHASE_QUANTITY_EXCEEDED'};
   for(const line of pending){
    lines.push({item_id:line.item_id,description:line.description,quantity:line.pending_invoice_quantity,unit_price:line.unit_price,discount_rate:line.discount_rate,tax_rate:line.tax_rate,links:[{kind:'receipt',line_id:line.id,quantity:line.pending_invoice_quantity}]});
    sources.push({...line,kind:'receipt',document_id:receipt.id,supplier_account_id:supplier,reference:receipt.reference});
   }
  }
  if(lines.length>purchaseLineLimits.invoices){const message='La factura supera les 40 línies. Selecciona menys albarans.';if(groupPreview.value)groupPreviewError.value=message;else error.value=message;return;}
  const draft={kind:'invoices',status:'draft',supplier_account_id:supplier,reference:'',document_date:'',origin_receipt_reference:receipts.map(receipt=>receipt.reference||receipt.id).join(', '),lines};
  const signature=JSON.stringify(draft);
  if(!proceed||groupPreview.value?.signature!==signature){
   const changed=proceed&&!!groupPreview.value;
   const previous=changed?groupQuantities.value:{};
   const previousPrices=changed?groupPrices.value:{};
   groupPrices.value=Object.fromEntries(sources.filter(missingPrice).map(source=>{const key=source.document_id+':'+source.id;return [key,previousPrices[key]??''];}));
   groupQuantities.value=Object.fromEntries(sources.map(source=>{const key=source.document_id+':'+source.id;return [key,previous[key]??source.pending_invoice_quantity];}));
   groupPreview.value={signature,supplier:receipts[0].supplier_name||catalog.value.suppliers.find(row=>String(row.id)===String(supplier))?.description||supplier,receipts:receipts.map(receipt=>({...receipt,lines:receipt.lines.filter(line=>purchaseNumber(line.pending_invoice_quantity)>0n)})),lineCount:lines.length};
   if(changed)groupPreviewError.value='Les dades han canviat. Revisa el resum actualitzat abans de continuar.';
   return;
  }
  draft.lines=draft.lines.flatMap(line=>{
   const source=sources.find(source=>Number(source.id)===Number(line.links[0].line_id));
   const quantity=purchaseNumber(groupQuantities.value[source.document_id+':'+source.id]);
   if(quantity===0n)return [];
   const normalized=purchaseDecimal(quantity),price=effectivePrice({id:source.document_id},source);
   return [{...line,quantity:normalized,unit_price:missingPrice(source)?price===''||price==null?null:purchaseDecimal(purchaseNumber(price)):line.unit_price,links:[{...line.links[0],quantity:normalized}]}];
  });
  const included=new Set(draft.lines.map(line=>Number(line.links[0].line_id)));
  draft.origin_receipt_reference=receipts.filter(receipt=>receipt.lines.some(line=>included.has(Number(line.id)))).map(receipt=>receipt.reference||receipt.id).join(', ');
  catalog.value={...catalog.value,sources:[...catalog.value.sources.filter(source=>!sources.some(current=>source.kind===current.kind&&Number(source.id)===Number(current.id))),...sources]};
  groupPreview.value=null;active.value=draft;
 }catch(cause){if(ticket===generation){if(groupPreview.value)groupPreviewError.value=purchaseError(cause);else error.value=purchaseError(cause);}}
 finally{if(ticket===generation)loading.value=false;}
}
const pendingOrder=row=>row.status==='confirmed'&&['pending','partial'].includes(row.progress);
const pendingDocument=row=>tab.value==='orders'?pendingOrder(row):row.status==='confirmed'&&['pending','partial'].includes(row.invoice_progress);
const pendingCount=computed(()=>rows.value.filter(pendingDocument).length);
const receiptStatus=row=>row.invoice_progress==='complete'?'Facturat':row.invoice_progress==='partial'?'Facturació parcial':'Pendent de facturar';
const visible=computed(()=>documentFiltersValid.value?rows.value.filter(row=>
 (tab.value!=='receipts'||!selectedOnly.value||selectedReceipts.value.includes(row.id))&&
 (documentStatus.value==='all'||(documentStatus.value==='active'?row.status!=='cancelled':row.status===documentStatus.value))&&
 (!supplierFilter.value||(supplierFilter.value==='unassigned'?!row.supplier_account_id:String(row.supplier_account_id)===supplierFilter.value))&&
 (!filterFrom.value||!!row.document_date&&row.document_date>=filterFrom.value)&&(!filterTo.value||!!row.document_date&&row.document_date<=filterTo.value)&&
 (!['orders','receipts'].includes(tab.value)||!pendingOnly.value||pendingDocument(row))&&[row.reference,row.supplier_name].join(' ').toLocaleLowerCase('ca').includes(search.value.toLocaleLowerCase('ca'))).sort(compareDocuments):[]);
async function load(){const ticket=++generation;if(!company.value||!can('purchases_read'))return;const priorSupplier=selectedSupplier.value;loading.value=true;error.value='';try{const [options,list]=await Promise.all([purchaseApi('/catalog'),tab.value==='catalog'?Promise.resolve([]):purchaseApi('/'+tab.value)]);if(ticket===generation){catalog.value=options;rows.value=list;if(tab.value==='receipts')selectedReceipts.value=selectedReceipts.value.filter(id=>list.some(row=>row.id===id&&row.status==='confirmed'&&['pending','partial'].includes(row.invoice_progress)&&String(row.supplier_account_id)===String(priorSupplier)));}}catch(cause){if(ticket===generation)error.value=purchaseError(cause);}finally{if(ticket===generation)loading.value=false;}}
async function refreshDocuments(){if(!loading.value&&!uploading.value)await load();}
function exportDocumentList(){
 if(loading.value||error.value||!documentFiltersValid.value||!visible.value.length||!can('purchases_read'))return;
 const supplier=supplierFilter.value==='unassigned'?'Pendent d’identificar':supplierOptions.value.find(row=>row.id===supplierFilter.value)?.name||'Tots';
 downloadCsv('compres-'+tab.value+'-'+company.value.id+'.csv',[
  ['Llistat de compres',names[tab.value]],['Empresa',company.value.name],['Des de',filterFrom.value],['Fins a',filterTo.value],['Proveïdor',supplier],['Estat',documentStatus.value],['Només pendents',pendingOnly.value?'Sí':'No'],['Cerca',search.value],['Documents visibles',visible.value.length],[],
  ['Referència','Data','Proveïdor','Estat','Línies','Identificador'],...visible.value.map(row=>[row.reference||'',row.document_date||'',row.supplier_name||'Pendent d’identificar',tab.value==='receipts'&&row.status==='confirmed'?receiptStatus(row):status(row),row.line_count||0,row.id])
 ]);
}
watch([()=>user.value?.id||user.value?.username,()=>company.value?.id,tab],()=>{
 active.value=null;groupPreview.value=null;groupPreviewError.value='';
 const saved=purchaseFilters.read(user.value?.id||user.value?.username,company.value?.id,tab.value);
 search.value=saved.search;documentStatus.value=saved.status;pendingOnly.value=saved.pending;documentOrder.value=saved.order;filterFrom.value=saved.from;filterTo.value=saved.to;supplierFilter.value=saved.supplier;dateInputsValid.value=true;filterRevision.value++;selectedReceipts.value=[];selectedOnly.value=false;
 if(nextQuickFilter?.kind===tab.value){const preset=nextQuickFilter.preset;nextQuickFilter=null;setQuickFilter(preset);}else nextQuickFilter=null;
 void load();
},{immediate:true});
watch([search,pendingOnly,documentStatus,documentOrder,filterFrom,filterTo,supplierFilter],()=>{if(documentFiltersValid.value)purchaseFilters.write(user.value?.id||user.value?.username,company.value?.id,tab.value,{search:search.value,pending:pendingOnly.value,status:documentStatus.value,order:documentOrder.value,from:filterFrom.value,to:filterTo.value,supplier:supplierFilter.value});},{flush:'post'});
onBeforeUnmount(()=>{generation++;});
function create(){active.value={kind:tab.value,status:'draft',lines:[]};}
async function open(row){loading.value=true;error.value='';try{active.value=await purchaseApi('/'+tab.value+'/'+row.id);}catch(cause){error.value=purchaseError(cause);}finally{loading.value=false;}}
async function saved(result){notice.value=result.status==='confirmed'?'Document confirmat.':'Esborrany guardat.';await load();}
async function createUnit(){loading.value=true;error.value='';try{await purchaseApi('/units',{method:'POST',body:{...unit.value,request_id:unitKey}});unit.value={code:'',name:'',dimension:'unit',base_unit_id:'',conversion_factor:'1'};unitKey=crypto.randomUUID();await load();}catch(cause){error.value=purchaseError(cause);}finally{loading.value=false;}}
async function createItem(){loading.value=true;error.value='';try{await purchaseApi('/items',{method:'POST',body:{...item.value,request_id:itemKey}});item.value={code:'',description:'',unit_id:'',supplier_account_id:'',supplier_code:''};itemKey=crypto.randomUUID();await load();}catch(cause){error.value=purchaseError(cause);}finally{loading.value=false;}}
async function history(item){error.value='';try{prices.value={item,rows:await purchaseApi('/items/'+item.id+'/prices')};}catch(cause){error.value=purchaseError(cause);}}
function extracted(draft){active.value=draft;notice.value='Original conservat. Revisa el reconeixement abans de confirmar.';}
</script>
<template>
 <div class="page-heading"><div><h1>Compres</h1><p class="muted">{{ company?.name }} · Comandes, albarans i factures revisades</p></div><button v-if="tab!=='catalog'&&can('purchases_write')" class="button primary" :disabled="loading||uploading" @click="create">Crear {{ tab==='orders'?'comanda':tab==='receipts'?'albarà':'factura' }}</button></div>
 <p v-if="!can('purchases_read')" class="notice">No tens permís per consultar les compres d’aquesta empresa.</p>
 <template v-else>
  <nav class="purchase-tabs" aria-label="Documents de compra"><button v-for="(name,key) in names" :key="key" class="button" :aria-pressed="tab===key" :disabled="uploading" @click="tab=key">{{ name }}</button></nav>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="notice" class="success-note" role="status">{{ notice }}</p>
  <PurchaseUpload v-if="tab==='invoices'&&can('purchases_write')" :key="company?.id" :disabled="loading" @busy="uploading=$event" @draft="extracted" />
  <p v-if="loading" role="status">Carregant compres…</p>
  <nav v-if="tab!=='catalog'" class="purchase-group" aria-label="Accessos ràpids de compres"><button type="button" class="button" :disabled="loading||uploading" @click="openQuickFilter('orders','pending')">Comandes pendents</button><button type="button" class="button" :disabled="loading||uploading" @click="openQuickFilter('receipts','pending')">Albarans pendents</button><button type="button" class="button" :disabled="loading||uploading" @click="openQuickFilter(tab,'draft')">Veure esborranys</button><button type="button" class="button" :disabled="loading||uploading" @click="openQuickFilter(tab,'cancelled')">Veure cancel·lats</button><button type="button" class="button" :disabled="loading||!selectedExercise?.start_date||!selectedExercise?.end_date" @click="useExerciseDates">Dates de l’exercici seleccionat</button></nav>
  <template v-if="tab!=='catalog'"><div ref="dateFilters" class="purchase-date-filters" @input="validateDateFilters" @change="validateDateFilters"><label>Des de<DateInput :key="filterRevision+'-from'" v-model="filterFrom" :disabled="loading" /></label><label>Fins a<DateInput :key="filterRevision+'-to'" v-model="filterTo" :disabled="loading" /></label></div><p v-if="!documentFiltersValid" class="notice error-notice" role="alert">Revisa les dates: han de ser completes i la data inicial no pot ser posterior a la final.</p><label class="purchase-search">Filtrar per proveïdor<select v-model="supplierFilter" :disabled="loading"><option value="">Tots els proveïdors</option><option v-for="supplier in supplierOptions" :key="supplier.id" :value="supplier.id">{{ supplier.name }}</option><option v-if="rows.some(row=>!row.supplier_account_id)" value="unassigned">Pendent d’identificar</option></select></label><div class="purchase-group"><button type="button" class="button" :disabled="loading||uploading" @click="refreshDocuments">Actualitzar llistat</button><button type="button" class="button" :disabled="loading||!!error||!documentFiltersValid||!visible.length" @click="exportDocumentList">Exportar llistat CSV</button></div></template>
  <label v-if="tab!=='catalog'" class="purchase-search">Estat dels documents<select v-model="documentStatus" :disabled="loading"><option value="all">Tots</option><option value="active">Actius</option><option value="draft">Esborranys</option><option value="confirmed">Confirmats</option><option value="cancelled">Cancel·lats</option></select></label>
  <label v-if="tab!=='catalog'" class="purchase-search">Ordenar documents<select v-model="documentOrder" :disabled="loading"><option value="date_desc">Data: més recents primer</option><option value="date_asc">Data: més antics primer</option><option value="reference_asc">Referència: ascendent</option><option value="reference_desc">Referència: descendent</option></select></label>
  <p v-if="tab!=='catalog'&&!loading&&!error" class="muted" role="status" aria-label="Recompte de documents">Mostrant {{ visible.length }} de {{ rows.length }} documents carregats.</p>
  <section v-if="tab!=='catalog'&&!loading&&activeDocumentFilters.length" class="purchase-active-filters" aria-label="Filtres actius"><span>Filtres actius:</span><ul><li v-for="filter in activeDocumentFilters" :key="filter.key"><button type="button" class="button" :aria-label="'Treure filtre: '+filter.label" @click="removeDocumentFilter(filter.key)">{{ filter.label }} ×</button></li></ul></section>
  <button v-if="tab!=='catalog'" type="button" class="button" :disabled="loading||!hasDocumentFilters" @click="clearDocumentFilters">Netejar filtres</button>
  <label v-if="tab==='orders'" class="purchase-pending-filter"><input v-model="pendingOnly" type="checkbox" :disabled="loading">Només comandes pendents de rebre ({{ pendingCount }})</label>
  <label v-if="tab==='receipts'" class="purchase-pending-filter"><input v-model="pendingOnly" type="checkbox" :disabled="loading">Només albarans pendents de facturar ({{ pendingCount }})</label>
  <section v-if="tab==='receipts'&&can('purchases_write')" class="purchase-group" aria-label="Agrupar albarans"><p>Selecciona albarans del mateix proveïdor. Seleccionats: {{ selectedReceipts.length }}.</p><button type="button" class="button primary" :disabled="loading||uploading||!selectedReceipts.length" @click="groupReceipts">Crear factura dels albarans seleccionats</button><button v-if="selectedReceipts.length" type="button" class="button" :disabled="loading" :aria-pressed="selectedOnly" @click="selectedOnly=!selectedOnly">{{ selectedOnly?'Mostrar tots els albarans':'Mostrar només els albarans seleccionats' }}</button><button v-if="selectedReceipts.length" type="button" class="button" :disabled="loading" @click="selectedReceipts=[]">Netejar selecció</button></section>
  <template v-if="tab==='catalog'"><div v-if="can('purchases_write')" class="purchase-catalog-forms"><form class="panel" @submit.prevent="createUnit"><h2>Nova unitat</h2><label>Codi<input v-model="unit.code" maxlength="20" required placeholder="kg"></label><label>Nom<input v-model="unit.name" maxlength="100" required></label><label>Tipus<select v-model="unit.dimension"><option value="mass">Massa</option><option value="volume">Volum</option><option value="unit">Unitats</option><option value="time">Temps</option><option value="other">Altres</option></select></label><label>Unitat base, opcional<select v-model="unit.base_unit_id"><option value="">Aquesta és la unitat base</option><option v-for="base in catalog.units.filter(base=>base.dimension===unit.dimension&&!base.base_unit_id)" :key="base.id" :value="base.id">{{ base.code }} · {{ base.name }}</option></select></label><label v-if="unit.base_unit_id">Equivalència: 1 unitat =<input v-model="unit.conversion_factor" inputmode="decimal" required><small>Quantitat en la unitat base; per exemple, 1 tona = 1000 kg.</small></label><button class="button primary" :disabled="loading">Crear unitat</button></form><form class="panel" @submit.prevent="createItem"><h2>Nou article</h2><label>Codi<input v-model="item.code" maxlength="60" required></label><label>Descripció<input v-model="item.description" maxlength="300" required></label><label>Unitat<select v-model="item.unit_id" required><option value="">Selecciona la unitat</option><option v-for="unit in catalog.units" :key="unit.id" :value="unit.id">{{ unit.code }} · {{ unit.name }}</option></select></label><label>Proveïdor habitual, opcional<select v-model="item.supplier_account_id"><option value="">Sense referència específica</option><option v-for="supplier in catalog.suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.description }}</option></select></label><label v-if="item.supplier_account_id">Codi d’article del proveïdor<input v-model="item.supplier_code" maxlength="100"></label><button class="button primary" :disabled="loading||!catalog.units.length">Crear article</button></form></div><div class="table-wrap panel"><table><thead><tr><th>Codi</th><th>Article</th><th>Unitat</th><th></th></tr></thead><tbody><tr v-for="item in catalog.items" :key="item.id"><td>{{ item.code }}</td><td>{{ item.description }}</td><td>{{ item.unit_code }}</td><td><button class="button" @click="history(item)">Històric de preus</button></td></tr><tr v-if="!catalog.items.length"><td colspan="4">Encara no hi ha articles. Crea primer les unitats.</td></tr></tbody></table></div></template>
  <template v-else><label class="purchase-search">Buscar document<input v-model="search" type="search" placeholder="Referència o proveïdor"></label><div class="table-wrap panel"><table><thead><tr><th>Referència</th><th>Data</th><th>Proveïdor</th><th>Estat</th><th>Línies</th><th></th></tr></thead><tbody><tr v-for="row in visible" :key="row.id"><td><input v-if="tab==='receipts'&&can('purchases_write')" v-model="selectedReceipts" type="checkbox" :value="row.id" :aria-label="'Seleccionar albarà '+(row.reference||row.id)" :disabled="loading||!selectableReceipt(row)">{{ row.reference||'Sense referència' }}</td><td>{{ row.document_date?date(row.document_date):'Pendent' }}</td><td>{{ row.supplier_name||'Pendent d’identificar' }}</td><td>{{ tab==='receipts'&&row.status==='confirmed'?receiptStatus(row):status(row) }}<small v-if="tab==='receipts'&&row.status==='confirmed'">{{ row.pending_invoice_lines }} línies pendents de facturar</small><small v-if="tab==='orders'&&row.status==='confirmed'">{{ row.received_quantity }} / {{ row.ordered_quantity }} rebudes</small></td><td>{{ row.line_count }}</td><td><button class="button" :disabled="loading" @click="open(row)">Obrir</button></td></tr><tr v-if="!visible.length"><td colspan="6">No hi ha documents per mostrar.</td></tr></tbody></table></div></template>
  <PurchaseDocumentEditor v-if="active" :key="active.kind+'-'+(active.id||'new')" :document="active" :kind="active.kind" :catalog="catalog" :exercise="selectedExercise" :can-write="can('purchases_write')" :can-post-invoices="can('accounting_write')" :can-confirm="can('purchases_confirm')&&(active.kind!=='invoices'||can('accounting_write'))" @close="active=null;load()" @saved="saved" @invoice="invoiceId=$event" />
  <FormDialog v-if="groupPreview" ref="groupSummary" title="Resum dels albarans seleccionats" :busy="loading" @close="groupPreview=null"><p><strong>Proveïdor: {{ groupPreview.supplier }}</strong></p><p>{{ groupPreview.receipts.length }} albarans · {{ groupPreview.lineCount }} línies pendents de facturar.</p><p v-if="groupPreviewError" class="notice error-notice" role="alert">{{ groupPreviewError }}</p><section v-for="receipt in groupPreview.receipts" :key="receipt.id" :aria-label="'Albarà '+(receipt.reference||receipt.id)"><h3>{{ receipt.reference||receipt.id }}<span v-if="receipt.document_date"> · {{ date(receipt.document_date) }}</span></h3><div class="table-wrap"><table><thead><tr><th>Article</th><th>Quantitat pendent</th><th>A facturar</th><th>Unitat</th><th>Preu unitari sense IVA</th><th>Dto. %</th><th>Base de la línia</th><th>IVA de la línia</th><th>Total de la línia</th></tr></thead><tbody><tr v-for="line in receipt.lines" :key="line.id"><td>{{ line.description }}</td><td>{{ decimal(line.pending_invoice_quantity) }}</td><td><input v-model="groupQuantities[quantityKey(receipt,line)]" inputmode="decimal" :aria-label="'Quantitat a facturar '+(receipt.reference||receipt.id)+' '+line.id" :aria-invalid="!validGroupQuantity(receipt,line)" :disabled="loading"></td><td>{{ line.unit_code||catalog.items.find(item=>String(item.id)===String(line.item_id))?.unit_code||'—' }}</td><td><input v-if="missingPrice(line)" v-model="groupPrices[quantityKey(receipt,line)]" inputmode="decimal" placeholder="Sense preu" :aria-label="'Preu unitari '+(receipt.reference||receipt.id)+' '+line.id" :aria-invalid="!validGroupPrice(receipt,line)" :disabled="loading"><template v-else>{{ decimal(line.unit_price) }}</template></td><td>{{ decimal(line.discount_rate) }}</td><template v-if="groupLineAmounts[quantityKey(receipt,line)]?.excluded"><td colspan="3">Exclosa</td></template><template v-else-if="groupLineAmounts[quantityKey(receipt,line)]?.base!=null"><td>{{ money(groupLineAmounts[quantityKey(receipt,line)].base) }} €</td><td>{{ money(groupLineAmounts[quantityKey(receipt,line)].tax_amount) }} €</td><td>{{ money(groupLineAmounts[quantityKey(receipt,line)].total) }} €</td></template><td v-else colspan="3">{{ groupLineAmounts[quantityKey(receipt,line)]?'Sense preu':'Revisa les dades' }}</td></tr></tbody></table></div><p :aria-label="'Subtotal '+(receipt.reference||receipt.id)"><template v-if="receiptEstimates[receipt.id]?.selected===0">Cap línia seleccionada d’aquest albarà.</template><template v-else-if="receiptEstimates[receipt.id]?.priced"><strong>{{ receiptEstimates[receipt.id].unpriced?'Subtotal parcial':'Subtotal' }}: base {{ money(receiptEstimates[receipt.id].base) }} € · IVA {{ money(receiptEstimates[receipt.id].tax_amount) }} € · total {{ money(receiptEstimates[receipt.id].total) }} €</strong></template><template v-else>{{ receiptEstimates[receipt.id]?'Subtotal pendent de completar els preus.':'Revisa les dades per calcular el subtotal.' }}</template></p></section><section aria-label="Estimació de la factura" class="purchase-estimate"><h3>{{ groupEstimate?.unpriced?'Estimació parcial':'Total estimat de la factura' }}</h3><template v-if="groupEstimate"><p v-if="groupEstimate.priced"><strong>Base {{ money(groupEstimate.base) }} € · IVA {{ money(groupEstimate.tax_amount) }} € · Total {{ money(groupEstimate.total) }} €</strong></p><p v-else>Cap línia seleccionada té preu informat.</p><p v-if="groupEstimate.unpriced" class="notice">{{ groupEstimate.missing }} línies sense preu no estan incloses en els imports. Cal completar-les a la proposta de factura.</p><div v-if="groupVatBreakdown.length" class="table-wrap"><table aria-label="Desglossament de l’IVA"><thead><tr><th>Tipus d’IVA</th><th>Base</th><th>Quota d’IVA</th></tr></thead><tbody><tr v-for="rate in groupVatBreakdown" :key="rate.rate"><td>{{ decimal(rate.rate) }} %</td><td>{{ money(rate.base) }} €</td><td>{{ money(rate.tax) }} €</td></tr></tbody></table></div><p>Descomptes aplicats. Estimació abans de retencions; el total definitiu es revisarà a la factura.</p></template><p v-else>Revisa les quantitats i els imports per calcular l’estimació.</p></section><p>Indica 0 per deixar una línia pendent per a una altra factura.</p><p v-if="!groupQuantitiesValid" class="notice error-notice" role="alert">Revisa les quantitats: de 0 fins a la quantitat pendent, amb un màxim de 6 decimals, i almenys una línia superior a 0.</p><p v-if="!groupPricesValid" class="notice error-notice" role="alert">Revisa els preus introduïts: admeten 0 o valors positius amb un màxim de 6 decimals.</p><p>Els albarans mantenen les seves línies i vincles. Revisa els preus que faltin a la proposta de factura.</p><div class="purchase-group"><button type="button" class="button" :disabled="loading||printingSummary||!groupEstimate" @click="printGroupSummary">Imprimir resum / PDF</button><button type="button" class="button" :disabled="loading||!groupEstimate" @click="exportGroupSummary">Descarregar resum CSV</button><button type="button" class="button" :disabled="loading" @click="restoreGroupQuantities">Restablir quantitats pendents</button><button type="button" class="button" :disabled="loading" @click="groupPreview=null">Tornar a la selecció</button><button type="button" class="button primary" :disabled="loading||!groupQuantitiesValid||!groupPricesValid" @click="groupReceipts({proceed:true})">Preparar proposta de factura</button></div></FormDialog>
  <InvoiceDetail v-if="invoiceId" :invoice-id="invoiceId" @close="invoiceId=null;load()" />
  <FormDialog v-if="prices" :title="'Preus de '+prices.item.code" @close="prices=null"><p>Només compres confirmades; IVA exclòs i descompte aplicat. Unitat: {{ prices.item.unit_code }}.</p><div class="table-wrap"><table><thead><tr><th>Data</th><th>Proveïdor</th><th>Factura</th><th>Preu net</th></tr></thead><tbody><tr v-for="(row,index) in prices.rows" :key="index"><td>{{ date(row.document_date) }}</td><td>{{ row.supplier_name }}</td><td>{{ row.reference }}</td><td>{{ row.net_unit_price }} €</td></tr><tr v-if="!prices.rows.length"><td colspan="4">Sense compres confirmades.</td></tr></tbody></table></div></FormDialog>
 </template>
</template>
<style scoped>.purchase-active-filters{margin:12px 0}.purchase-active-filters ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:8px 0;padding:0}.purchase-active-filters .button{max-width:100%;overflow-wrap:anywhere;text-align:left}.purchase-date-filters{display:flex;gap:16px;flex-wrap:wrap}.purchase-date-filters label{max-width:220px;flex:1 1 160px}.purchase-group{margin:16px 0}.purchase-group .button{margin:0 8px 8px 0}.purchase-pending-filter{display:flex;align-items:center;gap:9px;margin:16px 0}.purchase-pending-filter input{width:auto}.purchase-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.purchase-tabs [aria-pressed=true]{background:var(--primary);color:#fff}.purchase-upload{padding:20px;margin:20px 0}.purchase-upload p{font-size:13px;line-height:1.6}.purchase-upload label,label{display:grid;gap:7px;margin:12px 0}.purchase-catalog-forms{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}.purchase-catalog-forms form{padding:20px}.purchase-catalog-forms h2{font-size:18px}.purchase-search{max-width:450px;margin:20px 0}.table-wrap table{width:100%}td small{display:block;font-size:11px;margin-top:5px;color:#65748a}@media(max-width:700px){.purchase-catalog-forms{grid-template-columns:1fr}}</style>
