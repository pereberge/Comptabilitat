<script setup>
import ReconciliationReceipt from './ReconciliationReceipt.vue';
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import FormDialog from './FormDialog.vue';
import InvoiceDocumentDetail from './InvoiceDocumentDetail.vue';
import PortfolioActionDialog from './PortfolioActionDialog.vue';
import EntryDetail from './EntryDetail.vue';
import {api} from '../services/accounting.js';
import {transferDocumentInvoice,documentationError} from '../services/documentation.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {cents,decimal} from '../../../shared/money.js';
import {t} from '../locales/reconciliation-matches.js';
const viewedReceipt=ref(null);
const props=defineProps({candidate:Object,reconciliation:Object,movement:Object,canWrite:Boolean}),emit=defineEmits(['close','saved']);
const documentId=ref(null),invoice=ref(null),loading=ref(false),error=ref(''),paying=ref(false),paymentContext=ref(null),entryId=ref(null);let disposed=false;
const pending=computed(()=>invoice.value?.receipts.filter(row=>['pending','partial'].includes(row.status))||[]);
const total=computed(()=>decimal(pending.value.reduce((sum,row)=>sum+cents(row.remaining_amount),0n)));
const canPay=computed(()=>props.canWrite&&invoice.value?.status==='posted'&&pending.value.length>0&&total.value===props.reconciliation.amount&&invoice.value.direction===(props.movement.amount.startsWith('-')?'received':'issued')&&invoice.value.invoice_date<=props.reconciliation.date);
const paymentReceipt=computed(()=>invoice.value?{...pending.value[0],direction:invoice.value.direction,party_name:invoice.value.party_name,reference:invoice.value.reference,invoice_date:invoice.value.invoice_date,remaining_amount:total.value}:null);
async function loadInvoice(id){loading.value=true;error.value='';try{const result=await api('/invoices/'+id);if(!disposed){invoice.value=result;documentId.value=null;}}catch(cause){if(!disposed)error.value=documentationError(cause);}finally{if(!disposed)loading.value=false;}}
async function start(){
 if(loading.value)return;if(props.candidate.invoice_id){await loadInvoice(props.candidate.invoice_id);return;}
 loading.value=true;error.value='';
 try{const result=props.candidate.invoice_document_id?{id:props.candidate.invoice_document_id}:await transferDocumentInvoice({id:props.candidate.documentation_id,version:props.candidate.version},props.reconciliation.exercise_id);if(!disposed)documentId.value=result.id;}
 catch(cause){if(!disposed)error.value=documentationError(cause);}finally{if(!disposed)loading.value=false;}
}
async function preparePayment(){if(!canPay.value||loading.value)return;loading.value=true;error.value='';try{const latest=await api('/bank-reconciliations/'+props.reconciliation.id+'/movements/'+encodeURIComponent(props.reconciliation.movement_id)+'/matches',{timeoutMs:90000});if(!disposed){paymentContext.value={...props.reconciliation,version:latest.version};paying.value=true;}}catch(cause){if(!disposed)error.value=documentationError(cause);}finally{if(!disposed)loading.value=false;}}
onMounted(start);onBeforeUnmount(()=>{disposed=true;});
</script>
<template>
 <ReconciliationReceipt v-if="viewedReceipt" :receipt-id="viewedReceipt.id" :edit-on-open="viewedReceipt.edit" :can-write="canWrite" @close="viewedReceipt=null;loadInvoice(invoice.id)" @changed="loadInvoice(invoice.id)" />
 <PortfolioActionDialog v-else-if="paying&&paymentReceipt" mode="settle" :receipt="paymentReceipt" :receipts="pending" :reconciliation="paymentContext" @close="paying=false;loadInvoice(invoice.id)" @saved="emit('saved',{...$event,invoice_id:invoice.id})" />
 <InvoiceDocumentDetail v-else-if="documentId&&!loading&&!error" :document-id="documentId" :reconciliation="reconciliation" @close="emit('close')" @posted="loadInvoice($event.id)" @invoice="loadInvoice" />
 <FormDialog v-else class="reconciliation-invoice-flow" :title="t.invoiceFlow" :busy="loading" @close="emit('close')">
  <p class="flow-movement"><strong>{{ date(movement.date) }} · {{ money(movement.amount) }} €</strong><span>{{ movement.concept }}</span></p>
  <p v-if="loading" role="status">{{ t.preparingInvoice }}</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <template v-if="invoice&&!loading">
   <h3>{{ t.paymentStep }}</h3><p class="success-note">{{ t.invoiceRecorded }}: <strong>{{ invoice.reference }}</strong> · {{ invoice.party_name }}</p>
   <button v-if="invoice.entry_id" type="button" class="button" @click="entryId=invoice.entry_id">{{ t.viewInvoiceEntry }}</button>
   <h3>{{ t.invoiceReceipts }}</h3><div class="table-wrap"><table><thead><tr><th>{{ t.receipt }}</th><th>{{ t.due }}</th><th class="amount">{{ t.pending }}</th><th>Acciones</th></tr></thead><tbody><tr v-for="receipt in invoice.receipts" :key="receipt.id"><td>{{ receipt.id }}</td><td>{{ date(receipt.due_date) }}</td><td class="amount">{{ money(receipt.remaining_amount) }} €</td><td><div class="actions"><button type="button" class="button" @click="viewedReceipt={id:receipt.id,edit:false}">Ver recibo y PDF</button><button v-if="canWrite&&['pending','partial'].includes(receipt.status)" type="button" class="button" :disabled="!!receipt.remittance_id" @click="viewedReceipt={id:receipt.id,edit:true}">Cambiar vencimiento</button></div></td></tr></tbody></table></div>
   <p v-if="invoice.status==='void'" class="notice error-notice">{{ t.invoiceVoid }}</p><p v-else-if="!pending.length" class="notice">{{ t.invoicePaid }}</p><p v-else-if="total!==reconciliation.amount" class="notice error-notice">{{ t.pendingMismatch }}</p><p v-if="invoice.invoice_date>reconciliation.date" class="notice error-notice">{{ t.futureInvoice }}</p>
   <p v-if="pending.length>1" class="muted">{{ t.multipleReceipts }}</p>
   <div class="actions"><button type="button" class="button primary" :disabled="!canPay||loading" @click="preparePayment">{{ invoice.direction==='issued'?t.collectInvoice:t.payInvoice }}</button><button type="button" class="button" :disabled="loading" @click="emit('close')">{{ t.back }}</button></div>
  </template>
  <div v-else-if="!loading" class="actions"><button type="button" class="button" @click="start">{{ t.retry }}</button><button type="button" class="button" @click="emit('close')">{{ t.close }}</button></div>
 </FormDialog>
 <EntryDetail v-if="entryId" :entry-id="entryId" @close="entryId=null" />
</template>
<style scoped>
.reconciliation-invoice-flow{width:min(850px,95vw)}.flow-movement{display:grid;gap:8px;margin:18px 0;overflow-wrap:anywhere}.reconciliation-invoice-flow h3{font-size:17px;margin:24px 0 14px}.reconciliation-invoice-flow p{line-height:1.6;margin:16px 0}.reconciliation-invoice-flow .actions{margin-top:24px;flex-wrap:wrap;gap:10px}.reconciliation-invoice-flow table{width:100%}.amount{text-align:right;white-space:nowrap}
</style>
