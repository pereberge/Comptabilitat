<script setup>
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import FormDialog from './FormDialog.vue';
import DateInput from './DateInput.vue';
import PartyProfileFields from './PartyProfileFields.vue';
import {emptyPartyProfile} from '../../../shared/account-party.js';
import {purchaseApi,purchaseError} from '../services/purchases.js';
import {companyHeaders} from '../services/company.js';
import {downloadFile} from '../services/documentation.js';
import {purchaseTotals,purchaseNumber,purchaseDecimal,purchaseAmountDifferences,purchaseLineLimits} from '../../../shared/purchases.js';
import {reportMoney as money} from '../services/report-format.js';
const props=defineProps({document:Object,kind:String,catalog:Object,exercise:Object,canWrite:Boolean,canConfirm:Boolean,canPostInvoices:Boolean}),emit=defineEmits(['close','saved','invoice']);
const clone=value=>JSON.parse(JSON.stringify(value));
const document=ref(clone(props.document)),busy=ref(false),error=ref(''),reviewed=ref(false),audit=ref(null),originalUrl=ref(''),previewError=ref('');let disposed=false;
const names={orders:'Comanda',receipts:'Albarà',invoices:'Factura de compra'};
const linkedDocument=ref(null);
const cancelDependencies=ref(null),dependenciesError=ref('');
async function openDependency(dependency){
 if(dependency.kind==='invoices')await openLinkedInvoice(dependency.id);
 else if(dependency.kind==='receipts')await openOrigin({kind:'receipt',document_id:dependency.id});
}
const receiptDraft=ref(null),receiptSources=ref([]);
const invoiceDraft=ref(null),invoiceSources=ref([]);
const invoiceCatalog=computed(()=>({...props.catalog,sources:[...props.catalog.sources.filter(source=>!invoiceSources.value.some(current=>source.kind===current.kind&&Number(source.id)===Number(current.id))),...invoiceSources.value]}));
const canInvoice=computed(()=>props.canWrite&&props.kind==='receipts'&&document.value.status==='confirmed'&&document.value.lines.some(line=>{try{return purchaseNumber(line.pending_invoice_quantity)>0n;}catch{return false;}}));
async function createInvoice(){
 if(!canInvoice.value||busy.value||disposed)return;
 busy.value=true;error.value='';
 try{
  const receipt=await purchaseApi('/receipts/'+document.value.id);if(disposed)return;
  document.value=receipt;
  if(receipt.status!=='confirmed')throw {code:'PURCHASE_CHANGED'};
  const pending=receipt.lines.filter(line=>purchaseNumber(line.pending_invoice_quantity)>0n);
  if(!pending.length)throw {code:'PURCHASE_QUANTITY_EXCEEDED'};
  invoiceSources.value=receipt.lines.map(line=>({...line,kind:'receipt',document_id:receipt.id,supplier_account_id:receipt.supplier_account_id,reference:receipt.reference}));
  invoiceDraft.value={kind:'invoices',status:'draft',supplier_account_id:receipt.supplier_account_id,reference:'',document_date:'',origin_receipt_reference:receipt.reference,lines:pending.map(line=>({item_id:line.item_id,description:line.description,quantity:line.pending_invoice_quantity,unit_price:line.unit_price,discount_rate:line.discount_rate,tax_rate:line.tax_rate,links:[{kind:'receipt',line_id:line.id,quantity:line.pending_invoice_quantity}]}))};
 }catch(cause){if(!disposed)error.value=purchaseError(cause);}
 finally{if(!disposed)busy.value=false;}
}
async function invoiceSaved(result){
 emit('saved',result);
 if(result.status==='confirmed')try{const receipt=await purchaseApi('/receipts/'+document.value.id);if(!disposed)document.value=receipt;}catch(cause){if(!disposed)error.value=purchaseError(cause);}
}
const receiptCatalog=computed(()=>({...props.catalog,sources:[...props.catalog.sources.filter(source=>!receiptSources.value.some(current=>source.kind===current.kind&&Number(source.id)===Number(current.id))),...receiptSources.value]}));
const canReceive=computed(()=>props.canWrite&&props.kind==='orders'&&document.value.status==='confirmed'&&document.value.lines.some(line=>{try{return purchaseNumber(line.pending_quantity)>0n;}catch{return false;}}));
async function createReceipt(){
 if(!canReceive.value||busy.value||disposed)return;
 busy.value=true;error.value='';
 try{
  const order=await purchaseApi('/orders/'+document.value.id);if(disposed)return;
  document.value=order;
  if(order.status!=='confirmed')throw {code:'PURCHASE_CHANGED'};
  const pending=order.lines.filter(line=>purchaseNumber(line.pending_quantity)>0n);
  if(!pending.length)throw {code:'PURCHASE_QUANTITY_EXCEEDED'};
  receiptSources.value=order.lines.map(line=>({...line,kind:'order',document_id:order.id,supplier_account_id:order.supplier_account_id,reference:order.reference}));
  receiptDraft.value={kind:'receipts',status:'draft',supplier_account_id:order.supplier_account_id,reference:'',document_date:'',origin_reference:order.reference,lines:pending.map(line=>({item_id:line.item_id,description:line.description,quantity:line.pending_quantity,unit_price:line.unit_price,discount_rate:line.discount_rate,tax_rate:line.tax_rate,links:[{kind:'order',line_id:line.id,quantity:line.pending_quantity}]}))};
 }catch(cause){if(!disposed)error.value=purchaseError(cause);}
 finally{if(!disposed)busy.value=false;}
}
async function receiptSaved(result){
 emit('saved',result);
 if(result.status==='confirmed')try{const order=await purchaseApi('/orders/'+document.value.id);if(!disposed)document.value=order;}catch(cause){if(!disposed)error.value=purchaseError(cause);}
}
const form=ref({supplier_account_id:document.value.supplier_account_id||'',reference:document.value.reference||'',document_date:document.value.document_date||'',due_date:document.value.due_date||'',notes:document.value.notes||'',original_document_id:document.value.original_document_id||null,lines:clone(document.value.lines||[])});
if(!form.value.lines.length)form.value.lines.push(newLine());
let baseline=JSON.stringify(form.value),saveKey=crypto.randomUUID(),confirmKey=crypto.randomUUID(),cancelKey=crypto.randomUUID();
const postingDate=ref(document.value.document_date||props.exercise?.start_date||''),expenseAccount=ref(''),vatAccount=ref(''),withholding=ref(document.value.extraction?.withholding_rate||'0'),withholdingAccount=ref(''),paymentMethod=ref(document.value.extraction?.payment_method||'transfer'),accounts=ref([]);
const postingEdited=ref(false);
const differencesAccepted=ref(false);
const reviewDifferences=computed(()=>props.kind==='invoices'?[...(document.value.differences||[]).filter(difference=>!['amount','amount_review'].includes(difference.kind)),...purchaseAmountDifferences(document.value.lines,document.value.extraction,{withholdingRate:withholding.value})]:document.value.differences||[]);
const hasDifferences=computed(()=>!!reviewDifferences.value.length);
watch(withholding,()=>{differencesAccepted.value=false;});
watch(()=>form.value,()=>{differencesAccepted.value=false;},{deep:true});
function differenceLine(difference){return document.value.lines.find(line=>String(line.id)===String(difference.line_id));}
function differenceLabel(difference){if(['amount','amount_review'].includes(difference.kind))return {base_total:'Base imposable',tax_total:'Quota d’IVA',total_amount:'Total de la factura'}[difference.field]||'Import del document';const line=differenceLine(difference),index=document.value.lines.indexOf(line);return line?'Línia '+(index+1)+' · '+line.description:'Línia no disponible';}
function differenceUnit(difference){const line=differenceLine(difference);return props.catalog.items.find(item=>String(item.id)===String(line?.item_id))?.unit_code||'unitats';}
function preciseAmount(value){const normalized=String(value).replace(',','.');if(!/^\d+(?:\.\d+)?$/.test(normalized))return '—';const [whole,fraction='']=normalized.split('.'),decimals=fraction.replace(/0+$/,'');return whole+(decimals?','+decimals:'');}
watch(()=>form.value.document_date,value=>{if(!postingEdited.value)postingDate.value=value;});
const postingValid=computed(()=>props.kind!=='invoices'||!!props.exercise&&props.exercise.status==='open'&&!!postingDate.value&&postingDate.value>=form.value.document_date&&postingDate.value>=props.exercise.start_date&&postingDate.value<=props.exercise.end_date);
const editable=computed(()=>props.canWrite&&document.value.status==='draft'),saved=computed(()=>!!document.value.id&&JSON.stringify(form.value)===baseline);
const supplierForm=ref(null),supplierError=ref(''),addedSuppliers=ref([]);
let supplierRequestId='';
const suppliers=computed(()=>[...props.catalog.suppliers,...addedSuppliers.value.filter(account=>!props.catalog.suppliers.some(existing=>String(existing.id)===String(account.id)))]);
function reviewSupplier(){
 if(!editable.value||!props.canPostInvoices||busy.value)return;
 const source=document.value.extraction?.supplier||{},profile=emptyPartyProfile();
 for(const key of Object.keys(profile))profile[key]=String(source[key]||'');
 supplierForm.value=profile;supplierError.value='';supplierRequestId=crypto.randomUUID();
}
async function saveSupplier(){
 if(!editable.value||!props.canPostInvoices||busy.value||!supplierForm.value)return;
 busy.value=true;supplierError.value='';
 try{
  const account=await purchaseApi('/suppliers',{method:'POST',body:{party:supplierForm.value,request_id:supplierRequestId}});
  if(disposed)return;
  addedSuppliers.value=addedSuppliers.value.filter(existing=>String(existing.id)!==String(account.id));
  addedSuppliers.value.push(account);form.value.supplier_account_id=account.id;supplierForm.value=null;
 }catch(cause){if(!disposed)supplierError.value=purchaseError(cause);}
 finally{if(!disposed)busy.value=false;}
}
const withinLineLimit=computed(()=>form.value.lines.length<=purchaseLineLimits[props.kind]);
const total=computed(()=>{try{return purchaseTotals(form.value.lines);}catch{return null;}});
const originalMime=ref('');
async function downloadOriginal(){try{await downloadFile('/documentation/'+document.value.original_document_id+'/source',document.value.source_name||'factura.pdf');}catch(cause){error.value=purchaseError(cause);}}
const linkedOrigins=computed(()=>{
 const origins=new Map();
 for(const line of form.value.lines)for(const link of line.links||[]){
  const source=props.catalog.sources.find(source=>source.kind===link.kind&&Number(source.id)===Number(link.line_id)&&Number(source.item_id)===Number(line.item_id)&&Number(source.supplier_account_id)===Number(form.value.supplier_account_id));
  if(source&&Number.isSafeInteger(Number(source.document_id))&&Number(source.document_id)>0)origins.set(source.kind+':'+source.document_id,source);
 }
 return [...origins.values()];
});
const linkedTrace=computed(()=>form.value.lines.flatMap((line,index)=>(line.links||[]).map(link=>{
 const source=props.catalog.sources.find(source=>source.kind===link.kind&&Number(source.id)===Number(link.line_id)&&Number(source.item_id)===Number(line.item_id)&&Number(source.supplier_account_id)===Number(form.value.supplier_account_id));
 return {line:index+1,description:line.description,origin:source?(source.kind==='order'?'Comanda ':'Albarà ')+(source.reference||source.document_id||source.id):'Origen no disponible',sourceLine:link.line_id,quantity:link.quantity,unit:source?.unit_code||props.catalog.items.find(item=>String(item.id)===String(line.item_id))?.unit_code||'—'};
})));
async function openOrigin(source){
 if(busy.value||disposed)return;
 busy.value=true;error.value='';
 const kind=source.kind==='order'?'orders':'receipts';
 try{const result=await purchaseApi('/'+kind+'/'+source.document_id);if(!disposed)linkedDocument.value={...result,kind};}
 catch(cause){if(!disposed)error.value=purchaseError(cause);}
 finally{if(!disposed)busy.value=false;}
}
async function openLinkedInvoice(invoiceId){
 if(busy.value||disposed||!Number.isSafeInteger(Number(invoiceId))||Number(invoiceId)<1)return;
 busy.value=true;error.value='';
 try{const result=await purchaseApi('/invoices/'+invoiceId);if(!disposed)linkedDocument.value={...result,kind:'invoices'};}
 catch(cause){if(!disposed)error.value=purchaseError(cause);}
 finally{if(!disposed)busy.value=false;}
}
function newLine(){return {item_id:'',description:'',quantity:'1',unit_price:'',discount_rate:'0',tax_rate:'21',links:[]};}
function add(){if(form.value.lines.length>=purchaseLineLimits[props.kind])return;form.value.lines.push(newLine());reviewed.value=false;}
function selectItem(line){const item=props.catalog.items.find(item=>String(item.id)===String(line.item_id));if(item)line.description=item.description;line.links=[];}
watch(()=>form.value.supplier_account_id,(value,previous)=>{if(editable.value&&String(value)!==String(previous))for(const line of form.value.lines)line.links=[];});
function sourceOptions(line,current){return props.catalog.sources.filter(source=>Number(source.item_id)===Number(line.item_id)&&Number(source.supplier_account_id)===Number(form.value.supplier_account_id)&&(props.kind==='receipts'?source.kind==='order':['order','receipt'].includes(source.kind))&&!line.links.some(link=>link!==current&&link.kind===source.kind&&Number(link.line_id)===Number(source.id)));}
const linksValid=computed(()=>{
 if(props.kind==='orders')return true;
 try{return form.value.lines.every(line=>{
  let assigned=0n;const seen=new Set();
  for(const link of line.links){
   const key=link.kind+':'+link.line_id,quantity=purchaseNumber(link.quantity);
   if(seen.has(key)||quantity<=0n||!sourceOptions(line,link).some(source=>source.kind===link.kind&&Number(source.id)===Number(link.line_id)))return false;
   seen.add(key);assigned+=quantity;
  }
  return assigned<=purchaseNumber(line.quantity);
 });}catch{return false;}
});
function setSource(line,link,event){const [kind,id]=event.target.value.split(':');link.kind=kind;link.line_id=Number(id);}
function addLink(line){try{const source=sourceOptions(line)[0],remaining=purchaseNumber(line.quantity)-line.links.reduce((sum,link)=>sum+purchaseNumber(link.quantity),0n);if(source&&remaining>0n)line.links.push({kind:source.kind,line_id:source.id,quantity:purchaseDecimal(remaining)});}catch{error.value=purchaseError({code:'PURCHASE_INVALID_AMOUNT'});}}
function close(){if(!busy.value&&(!editable.value||JSON.stringify(form.value)===baseline||window.confirm('Hi ha canvis sense guardar. Vols sortir?')))emit('close');}
async function save(){if(!editable.value||!linksValid.value||!withinLineLimit.value||busy.value)return;busy.value=true;error.value='';try{
 const result=await purchaseApi('/'+props.kind+(document.value.id?'/'+document.value.id:''),{method:document.value.id?'PATCH':'POST',body:{...form.value,version:document.value.version,request_id:saveKey}});
 document.value=result;form.value={supplier_account_id:result.supplier_account_id||'',reference:result.reference,document_date:result.document_date||'',due_date:result.due_date||'',notes:result.notes,original_document_id:result.original_document_id,lines:clone(result.lines)};baseline=JSON.stringify(form.value);saveKey=crypto.randomUUID();reviewed.value=false;audit.value=null;emit('saved',result);
 }catch(cause){error.value=purchaseError(cause);}finally{busy.value=false;}}
async function confirm(){if(!props.canConfirm||!saved.value||!reviewed.value||hasDifferences.value&&!differencesAccepted.value||!postingValid.value||!linksValid.value||!withinLineLimit.value||busy.value)return;busy.value=true;error.value='';try{
 const result=await purchaseApi('/'+props.kind+'/'+document.value.id+'/confirm',{method:'POST',body:{version:document.value.version,request_id:confirmKey,reviewed:true,accept_differences:!hasDifferences.value||differencesAccepted.value,exercise_id:props.exercise?.id,posting_date:postingDate.value,offset_account_id:expenseAccount.value||null,vat_account_id:vatAccount.value||null,withholding_rate:withholding.value,withholding_account_id:withholdingAccount.value||null,payment_method:paymentMethod.value}});
 document.value=result;audit.value=null;confirmKey=crypto.randomUUID();emit('saved',result);
 }catch(cause){error.value=purchaseError(cause);}finally{busy.value=false;}}
async function cancel(){
 if(!props.canWrite||!document.value.id||document.value.status==='cancelled'||document.value.invoice_id||busy.value||!window.confirm('Vols cancel·lar aquest document? Es conservarà a l’historial.'))return;
 busy.value=true;error.value='';cancelDependencies.value=null;dependenciesError.value='';
 try{
  const result=await purchaseApi('/'+props.kind+'/'+document.value.id+'/cancel',{method:'POST',body:{version:document.value.version,request_id:cancelKey}});
  if(disposed)return;document.value=result;audit.value=null;emit('saved',result);
 }catch(cause){
  if(disposed)return;error.value=purchaseError(cause);
  if(cause.code==='PURCHASE_HAS_DEPENDENCIES')try{
   const dependencies=await purchaseApi('/'+props.kind+'/'+document.value.id+'/dependencies');if(!disposed)cancelDependencies.value=dependencies;
  }catch{if(!disposed)dependenciesError.value='No s’ha pogut carregar el detall dels documents que bloquegen la cancel·lació. Torna-ho a provar.';}
 }finally{if(!disposed)busy.value=false;}
}
async function history(event){if(!event.target.open||audit.value||!document.value.id)return;try{audit.value=await purchaseApi('/'+props.kind+'/'+document.value.id+'/audit');}catch(cause){error.value=purchaseError(cause);}}
onMounted(async()=>{
 if(props.kind==='invoices')try{accounts.value=await (await import('../services/accounting.js')).api('/accounts?kind=subaccount');}catch(cause){if(!disposed)error.value=purchaseError(cause);}
 if(document.value.original_document_id)try{const response=await fetch('/api/documentation/'+document.value.original_document_id+'/source',{headers:companyHeaders()});if(!response.ok)throw new Error();const mime=response.headers.get('Content-Type')?.split(';')[0].trim();if(!['application/pdf','image/jpeg','image/png'].includes(mime))throw new Error();const blob=await response.blob();if(!disposed){originalMime.value=mime;originalUrl.value=URL.createObjectURL(blob);}}catch{if(!disposed)previewError.value='No s’ha pogut obrir l’original.';}
});
onBeforeUnmount(()=>{disposed=true;if(originalUrl.value)URL.revokeObjectURL(originalUrl.value);});
</script>
<template>
 <FormDialog class="purchase-editor" :title="names[kind]+(document.reference?' · '+document.reference:' nova')" :busy="busy" @close="close">
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <p v-if="!withinLineLimit" class="notice error-notice" role="alert">Aquest document supera el límit de {{ purchaseLineLimits[kind] }} línies. Divideix-lo abans de guardar o confirmar.</p>
  <p v-if="document.origin_reference" class="notice">Albarà proposat des de la comanda {{ document.origin_reference }}. Revisa les quantitats i indica la referència i la data de l’albarà abans de guardar.</p>
  <p v-if="document.origin_receipt_reference" class="notice">Factura proposada des de l’albarà {{ document.origin_receipt_reference }}. Revisa les quantitats i els preus i indica la referència i la data de la factura abans de guardar.</p>
  <p class="muted">{{ document.status==='draft'?'Esborrany pendent de revisar':document.status==='confirmed'?'Document confirmat':'Document cancel·lat' }}<span v-if="document.created_by"> · Creat per {{ document.created_by }}</span><span v-if="document.confirmed_by"> · Confirmat per {{ document.confirmed_by }}</span></p>
  <p v-if="document.extraction?.supplier?.name" class="notice">Proveïdor reconegut: {{ document.extraction.supplier.name }} · NIF {{ document.extraction.supplier.tax_id||'pendent' }}.<span v-if="!form.supplier_account_id"> Selecciona el seu subcompte abans de confirmar.</span></p>
  <p v-if="document.extraction?.base_total&&document.extraction?.tax_total&&document.extraction?.total_amount" class="notice">Totals impresos al document: Base <strong>{{ money(document.extraction.base_total) }} €</strong> · IVA <strong>{{ money(document.extraction.tax_total) }} €</strong> · Total <strong>{{ money(document.extraction.total_amount) }} €</strong>. Revisa les diferències amb el detall calculat abans de confirmar.</p>
  <p v-if="document.extraction?.source_pages?.length" class="muted">Pàgines d’aquesta factura al document original: {{ document.extraction.source_pages.join(', ') }}.</p>
  <p v-if="document.extraction?.engine==='tesseract-local'" class="muted">Original llegit amb Tesseract OCR.<span v-if="document.extraction.field_source==='pdf-text'"> Camps contrastats amb el text del PDF.</span> Revisa les dades abans de confirmar.</p>
  <div class="purchase-editor-columns" :class="{'has-original':document.original_document_id}">
   <form @submit.prevent="save">
    <fieldset :disabled="busy||!editable">
     <div class="purchase-fields"><label>Proveïdor<select v-model="form.supplier_account_id" required><option value="">Selecciona el proveïdor</option><option v-for="supplier in suppliers" :key="supplier.id" :value="supplier.id">{{ supplier.code }} · {{ supplier.description }}</option></select></label><button v-if="editable&&canPostInvoices" type="button" class="button" :disabled="busy" @click="reviewSupplier">Revisar / crear proveïdor</button><label>Referència<input v-model="form.reference" maxlength="100"></label><label>Data<DateInput v-model="form.document_date" required /></label><label>{{ kind==='orders'?'Data prevista de recepció':'Venciment' }}<DateInput v-model="form.due_date" /></label></div>
     <div class="table-wrap"><table class="purchase-lines"><thead><tr><th>Article / concepte</th><th>Quantitat</th><th>Preu unitari</th><th>Dto. %</th><th>IVA %</th><th></th></tr></thead><tbody><tr v-for="(line,index) in form.lines" :key="index"><td><select v-model="line.item_id" :aria-label="'Article '+(index+1)" @change="selectItem(line)"><option value="">Pendent d’identificar</option><option v-for="item in catalog.items.filter(item=>item.active)" :key="item.id" :value="item.id">{{ item.code }} · {{ item.description }} ({{ item.unit_code }})</option></select><input v-model="line.description" :aria-label="'Concepte '+(index+1)" maxlength="300"><section v-if="kind!=='orders'" class="purchase-links"><div v-for="(link,linkIndex) in line.links" :key="linkIndex"><select :value="link.kind+':'+link.line_id" :aria-label="'Document origen '+(index+1)+' '+(linkIndex+1)" @change="setSource(line,link,$event)"><option v-for="source in sourceOptions(line,link)" :key="source.kind+source.id" :value="source.kind+':'+source.id">{{ source.kind==='order'?'Comanda':'Albarà' }} {{ source.reference }} · {{ source.item_name }} · {{ source.quantity }} {{ source.unit_code }}</option></select><input v-model="link.quantity" inputmode="decimal" :aria-label="'Quantitat vinculada '+(index+1)+' '+(linkIndex+1)"><button type="button" class="button" @click="line.links.splice(linkIndex,1)">Treure vincle</button></div><button v-if="editable" type="button" class="button" :disabled="!sourceOptions(line).length" @click="addLink(line)">Vincular {{ kind==='receipts'?'comanda':'albarà o comanda' }}</button></section></td><td><input v-model="line.quantity" inputmode="decimal" :aria-label="'Quantitat '+(index+1)"><small>{{ catalog.items.find(item=>String(item.id)===String(line.item_id))?.unit_code }}</small></td><td><input v-model="line.unit_price" inputmode="decimal" :aria-label="'Preu '+(index+1)" :placeholder="kind==='receipts'?'No consta':''"></td><td><input v-model="line.discount_rate" inputmode="decimal" :aria-label="'Descompte '+(index+1)"></td><td><input v-model="line.tax_rate" inputmode="decimal" :aria-label="'IVA '+(index+1)"></td><td><button v-if="form.lines.length>1" type="button" class="button" @click="form.lines.splice(index,1)">×</button></td></tr></tbody></table></div>
     <button v-if="editable" type="button" class="button" :disabled="form.lines.length>=purchaseLineLimits[kind]" @click="add">Afegir línia</button><label>Notes<textarea v-model="form.notes" maxlength="1000" rows="3"></textarea></label>
    </fieldset>
    <p v-if="total"><strong>Base {{ money(total.base) }} € · IVA {{ money(total.tax_amount) }} € · Total {{ money(total.total) }} €</strong><span v-if="total.unpriced"> · Hi ha línies sense preu.</span></p><p v-else class="notice">Revisa els imports i les quantitats.</p>
    <p v-if="!linksValid" class="notice error-notice" role="alert">{{ purchaseError({code:'PURCHASE_INVALID_LINK'}) }} Revisa les quantitats vinculades: han de ser positives i no superar la quantitat de la línia.</p>
    <button v-if="editable" class="button primary" :disabled="busy||!total||!linksValid||!withinLineLimit">Guardar esborrany</button>
   </form>
   <aside v-if="document.original_document_id" class="purchase-original"><h3>Document original</h3><p>{{ document.source_name }}</p><button type="button" class="button" @click="downloadOriginal">Descarregar original</button><p v-if="previewError">{{ previewError }}</p><template v-if="originalUrl"><iframe v-if="originalMime==='application/pdf'" :src="originalUrl+'#page='+(document.extraction?.source_pages?.[0]||1)" title="Document original"></iframe><img v-else :src="originalUrl" alt="Factura original"></template><p v-else-if="!previewError">Preparant l’original…</p><details v-if="document.extraction"><summary>Text i dades reconegudes</summary><p v-for="warning in document.extraction.warnings" :key="warning" class="notice">{{ warning }}</p><pre>{{ document.extraction.recognized_text||document.extraction.layout_lines?.join('\n') }}</pre></details></aside>
  </div>
  <button v-if="canReceive" type="button" class="button primary" :disabled="busy" @click="createReceipt">Crear albarà amb les quantitats pendents</button>
  <section v-if="kind==='orders'&&document.status==='confirmed'" class="purchase-review" aria-label="Albarans vinculats a la comanda"><h3>Albarans vinculats a la comanda</h3><p>Recepcions d’albarans confirmats, detallades per línia i unitat.</p><div v-if="document.receipt_allocations?.length" class="table-wrap"><table><thead><tr><th>Albarà</th><th>Data</th><th>Línia de la comanda</th><th>Concepte de l’albarà</th><th>Quantitat rebuda</th><th>Unitat</th><th></th></tr></thead><tbody><tr v-for="(allocation,index) in document.receipt_allocations" :key="index"><td>{{ allocation.reference||allocation.purchase_receipt_id }}</td><td>{{ allocation.document_date?allocation.document_date.split('-').reverse().join('/'):'—' }}</td><td>{{ document.lines.findIndex(line=>String(line.id)===String(allocation.order_line_id))+1 }}</td><td>{{ allocation.description }}</td><td>{{ preciseAmount(allocation.quantity) }}</td><td>{{ allocation.unit_code||'—' }}</td><td><button type="button" class="button" :disabled="busy" @click="openOrigin({kind:'receipt',document_id:allocation.purchase_receipt_id})">Obrir albarà {{ allocation.reference||allocation.purchase_receipt_id }}</button></td></tr></tbody></table></div><p v-else>Encara no hi ha albarans confirmats vinculats a aquesta comanda.</p></section>
  <button v-if="canInvoice" type="button" class="button primary" :disabled="busy" @click="createInvoice">Crear factura amb les quantitats pendents</button>
  <section v-if="kind==='receipts'&&document.status==='confirmed'" class="purchase-review" aria-label="Factures vinculades a l’albarà"><h3>Factures vinculades a l’albarà</h3><p>Quantitats consumides per factures confirmades. Cada fila conserva la línia d’origen i la seva unitat.</p><div v-if="document.invoice_allocations?.length" class="table-wrap"><table><thead><tr><th>Factura</th><th>Data</th><th>Línia de l’albarà</th><th>Concepte de factura</th><th>Quantitat</th><th>Unitat</th><th></th></tr></thead><tbody><tr v-for="(allocation,index) in document.invoice_allocations" :key="index"><td>{{ allocation.reference||allocation.purchase_invoice_id }}</td><td>{{ allocation.document_date?allocation.document_date.split('-').reverse().join('/'):'—' }}</td><td>{{ document.lines.findIndex(line=>String(line.id)===String(allocation.receipt_line_id))+1 }}</td><td>{{ allocation.description }}</td><td>{{ preciseAmount(allocation.quantity) }}</td><td>{{ allocation.unit_code||'—' }}</td><td><button type="button" class="button" :disabled="busy" @click="openLinkedInvoice(allocation.purchase_invoice_id)">Obrir factura {{ allocation.reference||allocation.purchase_invoice_id }}</button></td></tr></tbody></table></div><p v-else>Encara no hi ha factures confirmades vinculades a aquest albarà.</p></section>
  <section v-if="kind==='receipts'&&document.status==='confirmed'" class="purchase-review" aria-label="Facturació de l’albarà"><h3>Facturació de l’albarà</h3><p>Només es compten les quantitats de factures confirmades. Les unitats es mostren per article.</p><div class="table-wrap"><table><thead><tr><th>Article</th><th>Unitat</th><th>Rebuda</th><th>Facturada</th><th>Pendent de facturar</th></tr></thead><tbody><tr v-for="line in document.lines" :key="line.id"><td>{{ line.description }}</td><td>{{ line.unit_code||catalog.items.find(item=>String(item.id)===String(line.item_id))?.unit_code||'—' }}</td><td>{{ preciseAmount(line.quantity) }}</td><td>{{ preciseAmount(line.invoiced_quantity) }}</td><td>{{ preciseAmount(line.pending_invoice_quantity) }}</td></tr></tbody></table></div></section>
  <section v-if="kind==='orders'&&document.status==='confirmed'" class="purchase-review" aria-label="Recepció de la comanda"><h3>Recepció de la comanda</h3><p>Només es compten les quantitats d’albarans confirmats. Les unitats es mostren per article.</p><div class="table-wrap"><table><thead><tr><th>Article</th><th>Unitat</th><th>Demanada</th><th>Rebuda</th><th>Pendent de rebre</th></tr></thead><tbody><tr v-for="line in document.lines" :key="line.id"><td>{{ line.description }}</td><td>{{ line.unit_code||catalog.items.find(item=>String(item.id)===String(line.item_id))?.unit_code||'—' }}</td><td>{{ preciseAmount(line.quantity) }}</td><td>{{ preciseAmount(line.received_quantity) }}</td><td>{{ preciseAmount(line.pending_quantity) }}</td></tr></tbody></table></div></section>
  <section v-if="linkedTrace.length" class="purchase-review" aria-label="Documents vinculats"><h3>Documents vinculats</h3><p>Pots consultar els originals vinculats sense perdre els canvis d’aquest document.</p><p v-if="!saved&&editable" class="notice">El resum inclou els vincles de l’esborrany que estàs editant. Guarda els canvis per conservar-los.</p><div class="table-wrap"><table aria-label="Traçabilitat documental"><thead><tr><th>Línia actual</th><th>Article / concepte</th><th>Document d’origen</th><th>Línia d’origen</th><th>Quantitat vinculada</th><th>Unitat</th></tr></thead><tbody><tr v-for="(trace,index) in linkedTrace" :key="index"><td>{{ trace.line }}</td><td>{{ trace.description }}</td><td>{{ trace.origin }}</td><td>{{ trace.sourceLine }}</td><td>{{ preciseAmount(trace.quantity) }}</td><td>{{ trace.unit }}</td></tr></tbody></table></div><div class="actions purchase-footer"><button v-for="source in linkedOrigins" :key="source.kind+':'+source.document_id" type="button" class="button" :disabled="busy" @click="openOrigin(source)">Obrir {{ source.kind==='order'?'comanda':'albarà' }} {{ source.reference||source.document_id }}</button></div></section>
  <section v-if="document.price_comparisons?.length" class="purchase-review"><h3>Comparació amb compres confirmades</h3><p v-for="comparison in document.price_comparisons" :key="comparison.line_id">{{ comparison.item_code }}: abans {{ comparison.previous_price }} €, ara {{ comparison.current_price }} €<strong v-if="comparison.change_percent"> · {{ comparison.change_percent }} %</strong> · {{ comparison.previous_reference }}</p></section>
  <section v-if="hasDifferences" class="purchase-review" aria-label="Diferències per revisar"><h3>Diferències per revisar ({{ reviewDifferences.length }})</h3><p v-if="!saved" class="notice">Aquest resum correspon a l’últim esborrany guardat. Guarda els canvis per actualitzar-lo.</p><p>Revisa cada diferència abans de confirmar. Pots corregir les línies o acceptar les diferències indicades.</p><ul><li v-for="(difference,index) in reviewDifferences" :key="index"><strong>{{ differenceLabel(difference) }}</strong><p v-if="difference.kind==='amount'">Import reconegut: {{ money(difference.recognized_amount) }} € · Import calculat: {{ money(difference.calculated_amount) }} € · Diferència (calculat menys reconegut): {{ money(difference.difference) }} €.</p><p v-else-if="difference.kind==='amount_review'">{{ difference.reason==='missing'?'No s’ha reconegut aquest import al document.':difference.reason==='invalid'?'L’import reconegut no té un format vàlid.':difference.reason==='currency'?'La moneda del document no és EUR. Cal revisar els imports.':'Completa els preus i revisa la retenció per poder comparar els imports.' }}</p><p v-else-if="difference.kind==='unlinked_quantity'">{{ preciseAmount(difference.quantity) }} {{ differenceUnit(difference) }} sense vincle amb una comanda o un albarà.</p><p v-else-if="difference.kind==='price'">Preu unitari net de {{ difference.source==='order'?'la comanda':'l’albarà' }}: {{ preciseAmount(difference.source_price) }} € · Preu unitari net actual: {{ preciseAmount(difference.invoice_price) }} €. Imports sense IVA, amb el descompte aplicat.</p><p v-else>Diferència pendent de revisar.</p></li></ul><label v-if="document.status==='draft'&&canConfirm" class="purchase-reviewed"><input v-model="differencesAccepted" type="checkbox" :disabled="busy||!saved">Accepto les diferències indicades en aquest esborrany.</label></section>
  <form v-if="document.status==='draft'&&canConfirm&&document.id" class="purchase-confirm" @submit.prevent="confirm"><h3>Revisió i confirmació</h3><p v-if="!saved" class="notice">Guarda els canvis abans de confirmar.</p><div v-if="kind==='invoices'" class="purchase-fields"><label>Data comptable<DateInput v-model="postingDate" :min="exercise?.start_date" :max="exercise?.end_date" required @update:model-value="postingEdited=true" /></label><label>Compte de despesa<select v-model="expenseAccount"><option value="">Proposar compte de compra</option><option v-for="account in accounts.filter(account=>/^[62]/.test(account.code))" :key="account.id" :value="account.id">{{ account.code }} · {{ account.description }}</option></select></label><label>Compte d’IVA<select v-model="vatAccount"><option value="">Proposar IVA suportat</option><option v-for="account in accounts.filter(account=>account.code.startsWith('472'))" :key="account.id" :value="account.id">{{ account.code }} · {{ account.description }}</option></select></label><label>Retenció %<input v-model="withholding" inputmode="decimal"></label><label v-if="withholding!=='0'">Compte de retenció<select v-model="withholdingAccount"><option value="">Proposar compte</option><option v-for="account in accounts.filter(account=>account.code.startsWith('4751'))" :key="account.id" :value="account.id">{{ account.code }} · {{ account.description }}</option></select></label><label>Pagament<select v-model="paymentMethod"><option value="transfer">Transferència</option><option value="direct_debit">Domiciliació</option><option value="cash">Efectiu</option><option value="card">Targeta</option><option value="other">Altres</option></select></label></div><label class="purchase-reviewed"><input v-model="reviewed" type="checkbox" :disabled="busy||!saved">He revisat les dades, l’original i les diferències indicades.</label><button type="submit" class="button primary" :disabled="busy||!saved||!reviewed||!postingValid||!linksValid||!withinLineLimit||(hasDifferences&&!differencesAccepted)">{{ kind==='invoices'?'Confirmar factura i comptabilitzar':'Confirmar '+names[kind].toLowerCase() }}</button><p v-if="kind==='invoices'">La confirmació crearà la factura, l’assentament i els rebuts. No registrarà cap pagament.</p></form>
  <section v-if="cancelDependencies!==null||dependenciesError" class="purchase-review" aria-label="Documents que impedeixen cancel·lar"><h3>Documents que impedeixen cancel·lar</h3><p v-if="dependenciesError">{{ dependenciesError }}</p><div v-else-if="cancelDependencies.length" class="table-wrap"><table><thead><tr><th>Tipus</th><th>Referència</th><th>Data</th><th>Estat</th><th></th></tr></thead><tbody><tr v-for="dependency in cancelDependencies" :key="dependency.kind+'-'+dependency.id"><td>{{ dependency.kind==='receipts'?'Albarà':'Factura' }}</td><td>{{ dependency.reference||dependency.id }}</td><td>{{ dependency.document_date?dependency.document_date.split('-').reverse().join('/'):'—' }}</td><td>{{ dependency.status==='draft'?'Esborrany':'Confirmat' }}</td><td><button type="button" class="button" :disabled="busy" @click="openDependency(dependency)">Consultar {{ dependency.reference||dependency.id }}</button></td></tr></tbody></table></div><p v-else>Els vincles han canviat i ja no hi ha dependències actives. Torna a provar la cancel·lació.</p></section>
  <div class="actions purchase-footer"><button v-if="document.invoice_id" type="button" class="button primary" @click="emit('invoice',document.invoice_id)">Veure factura comptabilitzada</button><button v-if="canWrite&&document.id&&document.status!=='cancelled'&&!document.invoice_id" type="button" class="button" :disabled="busy" @click="cancel">Cancel·lar document</button><button type="button" class="button" :disabled="busy" @click="close">Tancar</button></div>
  <details v-if="document.id" @toggle="history"><summary>Historial del document</summary><p v-for="(event,index) in audit" :key="index">{{ event.created_at }} · {{ event.actor }} · {{ event.action }}</p></details>
 </FormDialog>
 <FormDialog v-if="supplierForm" title="Revisar les dades del proveïdor" :busy="busy" @close="supplierForm=null"><form @submit.prevent="saveSupplier"><p>Valida les dades per crear o reutilitzar el subcompte del proveïdor. La factura continua com a esborrany.</p><PartyProfileFields v-model="supplierForm" /><p v-if="supplierError" class="notice error">{{ supplierError }}</p><button type="submit" class="button primary" :disabled="busy">Validar i utilitzar proveïdor</button></form></FormDialog>
 <PurchaseDocumentEditor v-if="linkedDocument" :key="linkedDocument.kind+'-'+linkedDocument.id" :document="linkedDocument" :kind="linkedDocument.kind" :catalog="catalog" :exercise="exercise" :can-write="false" :can-confirm="false" @close="linkedDocument=null" @invoice="emit('invoice',$event)" />
 <PurchaseDocumentEditor v-if="receiptDraft" :document="receiptDraft" kind="receipts" :catalog="receiptCatalog" :exercise="exercise" :can-write="canWrite" :can-confirm="canConfirm" :can-post-invoices="canPostInvoices" @close="receiptDraft=null" @saved="receiptSaved" @invoice="emit('invoice',$event)" />
 <PurchaseDocumentEditor v-if="invoiceDraft" :document="invoiceDraft" kind="invoices" :catalog="invoiceCatalog" :exercise="exercise" :can-write="canWrite" :can-confirm="canConfirm&&canPostInvoices" @close="invoiceDraft=null" @saved="invoiceSaved" @invoice="emit('invoice',$event)" />
</template>
<style scoped>
.purchase-editor{width:min(1500px,97vw)}.purchase-editor-columns{display:grid;gap:22px}.has-original{grid-template-columns:minmax(0,1fr) minmax(280px,.65fr)}fieldset{padding:0;border:0;min-width:0}.purchase-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:16px 0}label{display:grid;gap:7px;margin:12px 0}input,select,textarea{max-width:100%;box-sizing:border-box}table{width:100%}.purchase-lines td{vertical-align:top}.purchase-lines td:first-child{min-width:230px}.purchase-lines td:not(:first-child) input{min-width:70px;max-width:110px}.purchase-lines td:first-child>input,.purchase-lines td:first-child>select{width:100%;margin-bottom:7px}.purchase-links{font-size:12px}.purchase-links>div{display:grid;gap:6px;margin:10px 0}.purchase-original iframe{width:100%;height:65vh;border:1px solid #dce4ee}.purchase-original img{max-width:100%;height:auto}.purchase-original pre{white-space:pre-wrap;max-height:300px;overflow:auto}.purchase-review,.purchase-confirm{padding:18px;background:#f5f7fb;border-radius:8px;margin:20px 0}.purchase-reviewed{display:flex;align-items:center;gap:9px}.purchase-reviewed input{width:auto}.purchase-footer{margin:20px 0;flex-wrap:wrap}details{margin:16px 0}summary{cursor:pointer}p{line-height:1.5}@media(max-width:1000px){.has-original{grid-template-columns:1fr}.purchase-original iframe{height:50vh}}@media(max-width:600px){.purchase-fields{grid-template-columns:1fr}}
</style>
