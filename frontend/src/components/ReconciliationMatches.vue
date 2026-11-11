<script setup>
import ReconciliationReceipt from './ReconciliationReceipt.vue';
import ReconciliationInvoiceDates from './ReconciliationInvoiceDates.vue';
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import FormDialog from './FormDialog.vue';
import PortfolioActionDialog from './PortfolioActionDialog.vue';
import ReconciliationInvoiceFlow from './ReconciliationInvoiceFlow.vue';
import InvoiceDocumentUpload from './InvoiceDocumentUpload.vue';
import {useContext} from '../composables/context.js';
import {api} from '../services/accounting.js';
import {reconciliationProposalError} from '../services/reconciliation-proposals.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {t} from '../locales/reconciliation-matches.js';
const viewedReceipt=ref(null);
const dateInvoice=ref(null);
const props=defineProps({report:Object,movement:Object,canWrite:Boolean,busy:Boolean,initialInvoice:Object,initialWorkflow:Boolean}),emit=defineEmits(['close','saved']);
const {company,selectedId}=useContext(),result=ref(null),loading=ref(false),error=ref(''),settling=ref(null),invoice=ref(null),uploading=ref(false);let disposed=false;
const writable=computed(()=>props.canWrite&&!props.movement.done&&!props.movement.modified);
const reconciliation=computed(()=>result.value?{id:props.report.id,version:result.value.version,movement_id:props.movement.id,bank_account_id:result.value.bank_account_id,date:props.movement.date,amount:props.movement.amount.replace(/^-/,''),signed_amount:props.movement.amount,exercise_id:result.value.exercise_id}:null);
async function load(){loading.value=true;error.value='';try{const data=await api('/bank-reconciliations/'+props.report.id+'/movements/'+encodeURIComponent(props.movement.id)+'/matches',{timeoutMs:90000});if(!disposed)result.value=data;}catch(cause){if(!disposed)error.value=reconciliationProposalError(cause);}finally{if(!disposed)loading.value=false;}}
function portfolioLink(receipt){return {name:'portfolio',query:{company_id:String(company.value.id),receipt_id:String(receipt.id),return_to:'/conciliacion-bancaria',bank_company_id:String(company.value.id),bank_exercise_id:selectedId.value}};}
function uploaded(document){uploading.value=false;invoice.value={invoice_document_id:document.id};}
onMounted(async()=>{await load();if(disposed||!result.value||!writable.value)return;if(props.initialInvoice){invoice.value=props.initialInvoice;return;}if(props.initialWorkflow){const count=result.value.invoices.length+result.value.receipts.length;if(!count)uploading.value=true;else if(count===1&&result.value.invoices.length===1)invoice.value=result.value.invoices[0];else if(count===1&&result.value.receipts[0].invoice_date<=props.movement.date)settling.value=result.value.receipts[0];}});onBeforeUnmount(()=>{disposed=true;});
</script>
<template>
 <ReconciliationInvoiceDates v-if="dateInvoice" :invoice-id="dateInvoice" :movement-date="movement.date" @close="dateInvoice=null;load()" @saved="dateInvoice=null;load()" />
 <ReconciliationReceipt v-else-if="viewedReceipt" :receipt-id="viewedReceipt.id" :edit-on-open="viewedReceipt.edit" :can-write="canWrite" @close="viewedReceipt=null;load()" @changed="load" />
 <InvoiceDocumentUpload v-else-if="uploading&&reconciliation" @close="uploading=false;load()" @saved="uploaded" />
 <ReconciliationInvoiceFlow v-else-if="invoice&&reconciliation" :candidate="invoice" :reconciliation="reconciliation" :movement="movement" :can-write="writable" @close="invoice=null;load()" @saved="emit('saved',$event)" />
 <PortfolioActionDialog v-else-if="settling&&reconciliation" mode="settle" :receipt="settling" :reconciliation="reconciliation" @close="settling=null;load()" @saved="emit('saved',$event)" />
 <FormDialog v-else class="reconciliation-matches" :title="t.title" :busy="busy" @close="emit('close')">
  <p class="match-movement"><strong>{{ date(movement.date) }} · {{ money(movement.amount) }} €</strong><span>{{ movement.concept }}</span><span v-if="movement.reference">Referència: {{ movement.reference }}</span></p>
  <p class="muted">{{ t.help }}</p><p v-if="movement.done||movement.modified" class="notice">{{ movement.modified?t.reviewExistingEntry:t.alreadyReconciled }}</p><p v-else-if="!canWrite" class="notice">{{ t.readOnly }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <template v-if="result&&!loading">
   <section><h3>{{ t.receipts }} ({{ result.receipts.length }})</h3><p v-if="!result.receipts.length" class="muted">{{ t.noReceipts }}</p>
    <article v-for="receipt in result.receipts" :key="receipt.id" :data-match-receipt-id="receipt.id">
     <strong>{{ receipt.party_name }} · {{ receipt.reference }}</strong><small>{{ t.receiptInvoiceRecorded }}</small><p>{{ t.receipt }} {{ receipt.id }} · {{ receipt.exercise_name }} · {{ t.due }} {{ date(receipt.due_date) }}</p>
     <p>Data de factura: <strong>{{ date(receipt.invoice_date) }}</strong><template v-if="receipt.posting_date"> · Data comptable: <strong>{{ date(receipt.posting_date) }}</strong></template></p>
     <p>{{ t.pending }}: <strong>{{ money(receipt.remaining_amount) }} €</strong><span v-if="receipt.paid_amount!=='0.00'"> · {{ t.original }}: {{ money(receipt.amount) }} € · {{ t.paid }}: {{ money(receipt.paid_amount) }} €</span></p>
     <p v-if="receipt.partial_payment" class="notice">{{ receipt.match_basis }}. Import d’aquest moviment: {{ money(receipt.payment_amount) }} € · Resta pendent: {{ money(receipt.remaining_after_payment) }} €.</p><p v-if="receipt.remittance_id" class="muted">{{ t.remittance }} {{ receipt.remittance_id }}</p><p v-if="receipt.invoice_date>movement.date" class="notice">La data de factura ({{ date(receipt.invoice_date) }}) és posterior al moviment ({{ date(movement.date) }}). Aquesta comprovació fa servir la data de factura, no la comptable.</p>
     <div class="actions"><button v-if="writable" type="button" class="button primary" :disabled="busy||receipt.invoice_date>movement.date" @click="settling=receipt">{{ receipt.direction==='issued'?t.collect:t.pay }}</button><button v-if="canWrite&&receipt.direction==='received'" type="button" class="button" :disabled="busy||!!receipt.remittance_id" @click="dateInvoice=receipt.invoice_id">Corregir dates</button><button type="button" class="button" @click="viewedReceipt={id:receipt.id,edit:false}">Ver recibo y PDF</button><button v-if="canWrite" type="button" class="button" :disabled="busy||!!receipt.remittance_id" @click="viewedReceipt={id:receipt.id,edit:true}">Cambiar vencimiento</button><RouterLink class="button" :to="portfolioLink(receipt)">{{ t.portfolio }}</RouterLink></div>
    </article>
   </section>
   <section><h3>{{ t.invoices }} ({{ result.invoices.length }})</h3><p v-if="!result.invoices.length" class="muted">{{ t.noInvoices }}</p>
    <article v-for="candidate in result.invoices" :key="candidate.invoice_document_id?'draft-'+candidate.invoice_document_id:candidate.invoice_id?'invoice-'+candidate.invoice_id:'document-'+candidate.documentation_id" :data-match-document-id="candidate.documentation_id" :data-match-invoice-document-id="candidate.invoice_document_id" :data-match-invoice-id="candidate.invoice_id"><strong>{{ candidate.title }}</strong><small v-if="candidate.invoice_id">{{ t.postedInvoice }}</small><small v-else-if="candidate.invoice_document_id">{{ t.draftInvoice }}</small><p v-if="candidate.party||candidate.reference">{{ candidate.party }}<template v-if="candidate.reference"> · {{ candidate.reference }}</template></p><p>{{ money(candidate.total_amount) }} €<template v-if="candidate.invoice_date"> · {{ t.invoiceDate }} {{ date(candidate.invoice_date) }}</template><template v-if="candidate.due_date"> · {{ t.due }} {{ date(candidate.due_date) }}</template></p><small v-if="candidate.source_name">{{ candidate.source_name }}</small><button type="button" class="button primary" :disabled="busy||!writable" @click="invoice=candidate">{{ candidate.invoice_id?t.paymentStep:t.transfer }}</button></article>
   </section>
  </template>
  <p v-if="result&&!loading&&!result.receipts.length&&!result.invoices.length" class="notice">{{ t.noMatchHelp }}</p>
  <div class="actions match-footer"><button v-if="writable&&result" type="button" class="button primary" :disabled="busy||loading" @click="uploading=true">{{ t.uploadInvoice }}</button><button type="button" class="button" :disabled="busy||loading" @click="load">{{ t.retry }}</button><button type="button" class="button" :disabled="busy" @click="emit('close')">{{ t.close }}</button></div>
 </FormDialog>
</template>
<style scoped>
.reconciliation-matches{width:min(800px,95vw)}.match-movement{display:grid;gap:8px;margin:18px 0;overflow-wrap:anywhere}.reconciliation-matches>p{line-height:1.6}.reconciliation-matches section{margin:24px 0}.reconciliation-matches h3{font-size:17px;margin-bottom:12px}.reconciliation-matches article{border:1px solid #dce4ee;border-radius:8px;padding:16px;margin:12px 0;overflow-wrap:anywhere}.reconciliation-matches article p{margin:8px 0;font-size:13px;line-height:1.6}.reconciliation-matches article small{display:block;color:#65748a;margin:10px 0}.reconciliation-matches .actions{flex-wrap:wrap;gap:8px}.match-footer{margin-top:24px}
</style>
