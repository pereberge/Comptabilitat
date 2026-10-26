<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { onBeforeUnmount,ref,watch } from 'vue';
import {useRoute,useRouter} from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { reportMoney as money,reportDate as date } from '../services/report-format.js';
import { t } from '../locales/treasury.js';
import { documentStatus,documentError } from '../services/invoice-documents.js';
import { downloadFile } from '../services/documentation.js';
import { printInvoice,downloadInvoicePdf,invoiceDeliveryError } from '../services/invoice-delivery.js';
import InvoiceEmailDialog from '../components/InvoiceEmailDialog.vue';
import TradeTabs from '../components/TradeTabs.vue';
import InvoiceForm from '../components/InvoiceForm.vue';
import InvoiceDetail from '../components/InvoiceDetail.vue';
import InvoiceDocumentUpload from '../components/InvoiceDocumentUpload.vue';
import InvoiceDocumentDetail from '../components/InvoiceDocumentDetail.vue';
import InvoiceDeleteDialog from '../components/InvoiceDeleteDialog.vue';
import PortfolioActionDialog from '../components/PortfolioActionDialog.vue';
import FormDialog from '../components/FormDialog.vue';
const {selectedId,selectedExercise,selectExercise}=useContext(),route=useRoute(),router=useRouter();
const emailing=ref(null),deliveryBusy=ref('');
const invoices=ref([]),documents=ref([]),tab=ref('invoices'),uploading=ref(false),documentId=ref(null),loading=ref(false),error=ref(''),notice=ref(''),creating=ref(''),detail=ref(null),voiding=ref(null),deleting=ref(null),draft=ref(null),busy=ref(false),history=ref([]),backupBusy=ref(false),filters=ref({direction:'all',search:''});let generation=0;
async function load(){
 const ticket=++generation;error.value='';loading.value=true;
 try{const query=new URLSearchParams({exercise_id:selectedId.value,...filters.value});const [rows,files,copies]=await Promise.all([selectedId.value?api('/invoices?'+query):[],selectedId.value?api('/invoice-documents?'+query):[],api('/invoice-deletions')]);if(ticket===generation){invoices.value=rows;documents.value=files;history.value=copies;}}
 catch(cause){if(ticket===generation)error.value=documentError(cause);}finally{if(ticket===generation)loading.value=false;}
}
watch(selectedId,()=>{emailing.value=null;detail.value=null;creating.value='';voiding.value=null;deleting.value=null;draft.value=null;documentId.value=null;uploading.value=false;notice.value='';invoices.value=[];documents.value=[];load();},{immediate:true});
async function deliver(invoice,action){if(deliveryBusy.value)return;deliveryBusy.value=action+invoice.id;error.value='';try{if(action==='print')await printInvoice(invoice.id);else await downloadInvoicePdf(invoice.id);}catch(cause){error.value=invoiceDeliveryError(cause);}finally{deliveryBusy.value='';}}
watch([()=>route.query.document_id,()=>route.query.exercise_id,selectedId],()=>{
 const requested=String(route.query.document_id||''),period=String(route.query.exercise_id||'');if(!/^[1-9]\d*$/.test(requested))return;
 if(period&&period!==selectedId.value){selectExercise(period);return;}
 tab.value='documents';documentId.value=Number(requested);filters.value.search='';
 const query={...route.query};delete query.document_id;delete query.exercise_id;void router.replace({path:route.path,query,hash:route.hash});
},{immediate:true,flush:'post'});
async function saved(invoice){creating.value='';notice.value=t.invoiceCreated;await load();detail.value=invoice.id;}
async function archived(document){uploading.value=false;tab.value='documents';filters.value.search='';notice.value=document.replayed?'Este PDF ya estaba guardado.':'PDF y propuesta guardados. Revisa la propuesta antes de contabilizar.';await load();documentId.value=document.id;}
function openVoid(invoice){detail.value=null;voiding.value=invoice;}
async function voided(invoice){voiding.value=null;notice.value=t.operationSaved;await load();detail.value=invoice.id;}
function openInvoice(id){documentId.value=null;detail.value=id;}
function openDelete(invoice){detail.value=null;deleting.value=invoice.id;}
function openDraftDelete(document){documentId.value=null;draft.value=document;}
async function removeDraft(){if(busy.value)return;busy.value=true;error.value='';try{await api('/invoice-documents/'+draft.value.id,{method:'DELETE',body:{version:draft.value.version}});draft.value=null;notice.value='Propuesta y PDF borrados. No se ha modificado ningún asiento ni recibo.';await load();}catch(cause){error.value=documentError(cause);draft.value=null;}finally{busy.value=false;}}
async function deleted(result){deleting.value=null;notice.value='Factura '+result.reference+' borrada con sus asientos y recibos.'+(result.counts.documents?' Los PDF se conservan como propuestas pendientes.':'');await load();}
async function downloadBackup(row){if(backupBusy.value)return;backupBusy.value=true;error.value='';try{await downloadFile('/invoice-deletions/'+row.id+'/backup','copia-factura-'+row.id+'.json');}catch(cause){error.value=documentError(cause);}finally{backupBusy.value=false;}}
onBeforeUnmount(()=>generation++);
</script>
<template>
 <TradeTabs /><div class="page-heading"><div><h1>{{ t.invoices }}</h1><p class="muted">{{ t.invoiceIntro }}</p></div><div class="actions"><button class="button primary" :disabled="!can('accounting_write')||(!selectedId)" @click="uploading=true">Subir factura PDF</button><button class="button" :disabled="!can('accounting_write')||(selectedExercise?.status!=='open')" @click="creating='issued'">{{ t.newIssued }}</button><button class="button" :disabled="!can('accounting_write')||(selectedExercise?.status!=='open')" @click="creating='received'">{{ t.newReceived }}</button></div></div>
 <p v-if="selectedExercise?.status==='closed'" class="notice">{{ t.closed }} <RouterLink to="/ejercicios">{{ t.manageExercises }}</RouterLink></p>
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p>
 <div class="actions invoice-document-tabs" role="group" aria-label="Listado de facturas"><button type="button" class="button" :class="{primary:tab==='invoices'}" :aria-pressed="tab==='invoices'" @click="tab='invoices'">Facturas contabilizadas</button><button type="button" class="button" :class="{primary:tab==='documents'}" :aria-pressed="tab==='documents'" @click="tab='documents'">Documentos y propuestas ({{ documents.length }})</button></div>
 <form class="filters" @submit.prevent="load"><label>{{ t.direction }}<select v-model="filters.direction"><option value="all">{{ t.all }}</option><option value="issued">{{ t.issued }}</option><option value="received">{{ t.received }}</option></select></label><label>{{ t.search }}<input v-model="filters.search" name="invoice_search" type="search" maxlength="200" :placeholder="tab==='documents'?'Proveedor, número, CIF, importe o archivo':'Proveedor o número de factura'"></label><button class="button" :disabled="loading">{{ t.filter }}</button></form>
 <p v-if="loading" role="status">{{ t.loading }}</p>
 <div v-else-if="tab==='documents'" class="table-wrap panel"><table class="invoices-table"><thead><tr><th>Factura y archivo</th><th>{{ t.direction }}</th><th>{{ t.invoiceDate }}</th><th>{{ t.party }}</th><th class="amount">{{ t.total }}</th><th>{{ t.status }}</th><th>Acciones</th></tr></thead><tbody>
  <tr v-for="document in documents" :key="document.id"><td>{{ document.reference||'Referencia pendiente' }}<small class="trade-cell-note">{{ document.source_name }}</small></td><td>{{ document.direction==='issued'?t.issued:t.received }}</td><td>{{ document.invoice_date?date(document.invoice_date):'Pendiente' }}</td><td>{{ document.party_name||'Tercero pendiente' }}<small class="trade-cell-note">{{ document.party_tax_id }}</small></td><td class="amount">{{ document.total_amount?money(document.total_amount):'Pendiente' }}</td><td><span class="badge">{{ documentStatus[document.status] }}</span></td><td><div class="invoice-row-actions"><button class="button" @click="documentId=document.id">Ver PDF y propuesta</button><button :disabled="!can('accounting_write')" v-if="document.status==='draft'" class="button clear-danger" @click="openDraftDelete(document)">Borrar sin contabilizar</button><button v-else-if="document.invoice_id&&can('invoice_delete')" class="button clear-danger" @click="deleting=document.invoice_id">Borrar contabilizada · 96</button></div></td></tr>
  <tr v-if="!documents.length"><td colspan="7" class="empty-cell">No hay documentos para esta búsqueda. Usa «Subir factura PDF» para guardar una factura y preparar su propuesta.</td></tr>
 </tbody></table></div>
 <div v-else class="table-wrap panel"><table class="invoices-table"><thead><tr><th>{{ t.reference }}</th><th>{{ t.direction }}</th><th>{{ t.invoiceDate }}</th><th>{{ t.party }}</th><th class="amount">{{ t.total }}</th><th class="amount">{{ t.remaining }}</th><th>{{ t.receipts }}</th><th>{{ t.status }}</th><th>Acciones</th></tr></thead><tbody>
  <tr v-for="invoice in invoices" :key="invoice.id"><td>{{ invoice.reference }}</td><td>{{ invoice.direction==='issued'?t.collection:t.payment }}</td><td>{{ date(invoice.invoice_date) }}</td><td>{{ invoice.party_name }}<small class="trade-cell-note">{{ invoice.party_tax_id }}</small></td><td class="amount">{{ money(invoice.total_amount) }}</td><td class="amount">{{ money(invoice.remaining_amount) }}</td><td>{{ invoice.receipt_count }}</td><td><span class="badge" :class="'trade-'+invoice.payment_status">{{ t[invoice.payment_status] }}</span></td><td><div class="invoice-row-actions"><button class="button" @click="detail=invoice.id">{{ t.detail }}</button><button class="button" :disabled="!!deliveryBusy" @click="deliver(invoice,'print')">{{ deliveryBusy==='print'+invoice.id?'Preparando…':'Imprimir' }}</button><button class="button" :disabled="!!deliveryBusy" @click="deliver(invoice,'pdf')">{{ deliveryBusy==='pdf'+invoice.id?'Preparando…':'PDF' }}</button><button class="button" :disabled="!!deliveryBusy" @click="emailing=invoice.id">Correo</button><span v-if="invoice.fiscal_registered" class="badge">VERI*FACTU · pruebas</span><button v-else-if="can('invoice_delete')" class="button clear-danger" @click="deleting=invoice.id">Borrar factura y recibos · 96</button></div></td></tr>
  <tr v-if="!invoices.length"><td colspan="9" class="empty-cell">{{ t.emptyInvoices }}</td></tr>
 </tbody></table></div>
 <details v-if="history.length" class="invoice-deletion-history"><summary>Copias anteriores de facturas borradas ({{ history.length }})</summary><ul><li v-for="row in history" :key="row.id"><span>Factura {{ row.reference }} · {{ date(String(row.created_at).slice(0,10)) }}</span><button class="button" :disabled="backupBusy" @click="downloadBackup(row)">Descargar copia</button></li></ul></details>
 <InvoiceDocumentUpload v-if="uploading" @close="uploading=false" @saved="archived" />
 <InvoiceDocumentDetail v-if="documentId" :document-id="documentId" @close="documentId=null" @changed="load" @invoice="openInvoice" @delete-draft="openDraftDelete" @delete-invoice="deleting=$event;documentId=null" />
 <InvoiceEmailDialog v-if="emailing" :invoice-id="emailing" @close="emailing=null" />
 <InvoiceForm v-if="creating" :direction="creating" @close="creating=''" @saved="saved" /><InvoiceDetail v-if="detail" :invoice-id="detail" @close="detail=null" @void="openVoid" @delete="openDelete" />
 <PortfolioActionDialog v-if="voiding" mode="void" :invoice="voiding" @close="voiding=null" @saved="voided" />
 <InvoiceDeleteDialog v-if="deleting&&can('invoice_delete')" :invoice-id="deleting" @close="deleting=null" @deleted="deleted" />
 <FormDialog v-if="draft" title="Borrar propuesta sin contabilizar" :busy="busy" @close="draft=null"><p>¿Borrar «{{ draft.reference||draft.source_name }}» y su PDF? Esta propuesta no tiene factura, asientos ni recibos contabilizados.</p><div class="actions"><button class="button clear-danger" :disabled="busy" @click="removeDraft">{{ busy?'Borrando…':'Borrar propuesta' }}</button><button class="button" :disabled="busy" @click="draft=null">Cancelar</button></div></FormDialog>
</template>
