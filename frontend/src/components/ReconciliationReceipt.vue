<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {api} from '../services/accounting.js';
import {treasuryError} from '../locales/treasury.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
import InvoicePdf from './InvoicePdf.vue';
import PortfolioActionDialog from './PortfolioActionDialog.vue';
const props=defineProps({receiptId:[Number,String],canWrite:Boolean,editOnOpen:Boolean}),emit=defineEmits(['close','changed']);
const receipt=ref(null),invoice=ref(null),editing=ref(false),pdf=ref(null),loading=ref(true),error=ref(''),notice=ref('');let disposed=false;
onMounted(async()=>{try{
 const result=await api('/portfolio/receipts/'+props.receiptId);
 const source=await api('/invoices/'+result.invoice_id);
 if(disposed)return;receipt.value=result;invoice.value=source;
 editing.value=props.editOnOpen&&props.canWrite&&['pending','partial'].includes(result.status)&&!result.remittance_id;
}catch(cause){if(!disposed)error.value=treasuryError(cause);}finally{if(!disposed)loading.value=false;}});
onBeforeUnmount(()=>{disposed=true;});
function saved(result){receipt.value=result;editing.value=false;notice.value='Vencimiento guardado.';emit('changed');}
</script>
<template>
 <PortfolioActionDialog v-if="editing&&receipt" mode="reschedule" :receipt="receipt" @close="editing=false" @saved="saved" />
 <FormDialog v-else title="Recibo y documento original" :busy="loading" @close="emit('close')">
  <p v-if="loading" role="status">Cargando recibo...</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p>
  <template v-if="receipt&&invoice">
   <h3>{{ receipt.party_name }} · {{ receipt.reference }}</h3>
   <p>Recibo {{ receipt.id }} · Factura: {{ date(receipt.invoice_date) }}</p>
   <dl><dt>Vencimiento</dt><dd>{{ date(receipt.due_date) }}</dd><dt>Importe</dt><dd>{{ money(receipt.amount) }} €</dd><dt>Pendiente</dt><dd>{{ money(receipt.remaining_amount) }} €</dd></dl>
   <p v-if="receipt.notes">{{ receipt.notes }}</p>
   <div class="actions"><button v-if="['pending','partial'].includes(receipt.status)" type="button" class="button primary" :disabled="!canWrite||!!receipt.remittance_id" @click="editing=true">Cambiar vencimiento</button><button v-for="document in invoice.documents" :key="document.id" type="button" class="button" @click="pdf=document">Ver PDF original · {{ document.source_name }}</button><button type="button" class="button" @click="emit('close')">Volver a conciliación</button></div>
   <p v-if="receipt.remittance_id" class="muted">El recibo pertenece a una remesa. Retíralo de la remesa para cambiar el vencimiento.</p>
   <p v-if="!invoice.documents.length" class="muted">Esta factura no tiene un PDF original adjunto.</p>
  </template>
 </FormDialog>
 <InvoicePdf v-if="pdf" :document-id="pdf.id" :filename="pdf.source_name" @close="pdf=null" />
</template>
