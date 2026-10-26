<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { ref,onMounted } from 'vue';
import { api } from '../services/accounting.js';
import { reportMoney as money,reportDate as date } from '../services/report-format.js';
import { t,treasuryError } from '../locales/treasury.js';
import FormDialog from './FormDialog.vue';
import EntryDetail from './EntryDetail.vue';
const props=defineProps({receiptId:[String,Number]}),emit=defineEmits(['close','settle','reschedule','reverse','invoice']);
const receipt=ref(null),error=ref(''),entryId=ref(null);
onMounted(async()=>{try{receipt.value=await api('/portfolio/receipts/'+props.receiptId);}catch(cause){error.value=treasuryError(cause);}});
function print(){window.print();}
</script>
<template><Teleport to="body">
 <FormDialog class="print-document receipt-detail-dialog" :title="receipt?(receipt.direction==='issued'?t.receiptCollection:t.receiptPayment)+' · '+receipt.id:t.receipt" @close="emit('close')">
  <p v-if="error" role="alert">{{ error }}</p><p v-else-if="!receipt" role="status">{{ t.loading }}</p>
  <template v-else><div class="trade-document-heading"><div><h3>{{ receipt.issuer_snapshot.name }}</h3><p>{{ receipt.issuer_snapshot.tax_id }}</p><p>{{ receipt.issuer_snapshot.address }}</p></div><div><span class="badge" :class="'trade-'+receipt.status">{{ t[receipt.status] }}</span><p v-if="receipt.overdue">{{ t.overdue }}</p><p>{{ t.originalInvoice }}: {{ receipt.reference }}</p><p>{{ t.invoiceDate }}: {{ date(receipt.invoice_date) }}</p></div></div>
   <section class="trade-document-party"><h3>{{ receipt.party_name }}</h3><p>{{ receipt.party_tax_id }}</p><p>{{ receipt.party_address }}</p></section>
   <dl class="receipt-facts"><div><dt>{{ t.dueDate }}</dt><dd>{{ date(receipt.due_date) }}</dd></div><div v-if="receipt.original_due_date!==receipt.due_date"><dt>{{ t.originalDue }}</dt><dd>{{ date(receipt.original_due_date) }}</dd></div><div><dt>{{ t.amount }}</dt><dd>{{ money(receipt.amount) }} €</dd></div><div><dt>{{ t.paid }}</dt><dd>{{ money(receipt.paid_amount) }} €</dd></div><div><dt>{{ t.remaining }}</dt><dd>{{ money(receipt.remaining_amount) }} €</dd></div><div><dt>{{ t.paymentMethod }}</dt><dd>{{ t.methods[receipt.payment_method] }}</dd></div></dl>
   <p v-if="receipt.notes" class="trade-document-notes">{{ receipt.notes }}</p>
   <h3>{{ t.settlements }}</h3><p v-if="!receipt.settlements.length" class="muted">{{ t.noSettlements }}</p><div v-else class="table-wrap"><table><thead><tr><th>{{ t.paymentDate }}</th><th>{{ t.bank }}</th><th class="amount">{{ t.amount }}</th><th>{{ t.movementReference }}</th><th>{{ t.status }}</th><th class="document-controls">{{ t.entry }}</th></tr></thead><tbody><tr v-for="movement in receipt.settlements" :key="movement.id"><td>{{ date(movement.payment_date) }}<small class="trade-cell-note">{{ movement.exercise_name }}</small></td><td>{{ movement.bank_code }} · {{ movement.bank_name }}</td><td class="amount">{{ money(movement.amount) }}</td><td>{{ movement.reference }}</td><td>{{ movement.reversal_entry_id?t.reversed:t.settled }}<template v-if="movement.reversal_date"><small class="trade-cell-note">{{ date(movement.reversal_date) }} · {{ movement.reversal_reason }}</small></template></td><td class="document-controls"><div class="actions"><button class="button" @click="entryId=movement.entry_id">{{ t.entry }}</button><button :disabled="!can('accounting_write')" v-if="!movement.reversal_entry_id" class="button" @click="emit('reverse',{receipt,movement})">{{ t.reverse }}</button><button v-else class="button" @click="entryId=movement.reversal_entry_id">{{ t.reversed }}</button></div></td></tr></tbody></table></div>
   <div class="actions document-controls"><button class="button" @click="print">{{ t.print }}</button><button class="button" @click="emit('invoice',receipt.invoice_id)">{{ t.viewInvoice }}</button><template v-if="receipt.status==='pending'||receipt.status==='partial'"><button :disabled="!can('accounting_write')" class="button primary" @click="emit('settle',receipt)">{{ receipt.direction==='issued'?t.recordCollection:t.recordPayment }}</button><button :disabled="!can('accounting_write')" class="button" @click="emit('reschedule',receipt)">{{ t.reschedule }}</button></template></div>
  </template>
 </FormDialog><EntryDetail v-if="entryId" :entry-id="entryId" @close="entryId=null" />
</Teleport></template>
