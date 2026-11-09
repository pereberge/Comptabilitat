<script setup>
import {computed,useId} from 'vue';
import {v as validationText} from '../locales/invoice-validation.js';
import {t as reconciliationText} from '../locales/reconciliation-matches.js';
const props=defineProps({document:Object,action:String,label:String,busy:Boolean,canWrite:Boolean,fromReconciliation:Boolean,postingIssue:String}),emit=defineEmits(['post','edit']);
const reviewed=defineModel('reviewed',{type:Boolean,default:false}),selectedEntry=defineModel('entry',{type:[String,Number],default:''}),validationId=useId();
const postLabel=computed(()=>!props.fromReconciliation?props.label:props.action==='attach'?reconciliationText.attachInvoice:props.action==='link'?reconciliationText.linkInvoice:reconciliationText.postInvoice);
const disabled=computed(()=>!props.canWrite||props.busy||!reviewed.value||!!props.postingIssue||!props.document.proposal.ready||props.document.exercise.status!=='open'||props.action==='link'&&!selectedEntry.value);
</script>
<template>
 <section class="trade-form-section invoice-confirmation" :class="{'reconciliation-confirmation':fromReconciliation}">
  <h3>{{ fromReconciliation?reconciliationText.invoiceStep:'Confirmar propuesta' }}</h3>
  <p v-if="fromReconciliation" class="muted">{{ reconciliationText.confirmHelp }}</p>
  <div v-if="fromReconciliation" class="actions invoice-confirm-actions"><button type="button" class="button primary" :disabled="disabled" @click="emit('post')">{{ postLabel }}</button><button v-if="!document.proposal.ready" type="button" class="button primary" :disabled="busy||!canWrite" @click="emit('edit')">{{ reconciliationText.completeInvoice }}</button></div>
  <p v-if="action==='link'">La vinculación conserva el asiento existente y crea la ficha de factura con los recibos pendientes indicados.</p><p v-else-if="action==='attach'">Se añade el PDF a la factura existente con sus recibos actuales.</p><p v-else>Se crearán el asiento, la factura y sus recibos en una misma operación.</p>
  <p v-if="postingIssue" class="notice error-notice" role="alert">{{ postingIssue }}</p>
  <label v-if="document.proposal.candidates.length>1">Asiento a vincular<select v-model="selectedEntry" name="invoice_existing_entry" :aria-invalid="!selectedEntry?'true':undefined" :aria-describedby="!selectedEntry?validationId+'-entry':undefined"><option value="">Selecciona el asiento revisado</option><option v-for="candidate in document.proposal.candidates" :key="candidate.entry_id" :value="candidate.entry_id">{{ candidate.number }} · {{ candidate.description }}</option></select><small v-if="!selectedEntry" :id="validationId+'-entry'" class="invoice-field-error">{{ validationText.selectEntry }}</small></label>
  <p v-if="!document.proposal.ready" class="notice error-notice" role="status">{{ fromReconciliation?reconciliationText.completeInvoiceHelp:validationText.proposalIncomplete }}</p><p v-if="document.exercise.status!=='open'" class="notice error-notice" role="status">El ejercicio está cerrado. Puedes conservar y consultar el documento.</p>
  <p v-if="document.extraction?.currency&&document.extraction.currency!=='EUR'" class="notice error-notice">{{ validationText.currency }}</p><p v-if="document.extraction?.multiple_invoices" class="notice error-notice">{{ validationText.multiple }}</p>
  <label class="invoice-review-confirm" :class="{'invoice-review-missing':!reviewed}"><input v-model="reviewed" name="invoice_reviewed" :aria-invalid="!reviewed?'true':undefined" :aria-describedby="!reviewed?validationId+'-review':undefined" type="checkbox" :disabled="busy">He revisado el PDF, los importes, las cuentas, los vencimientos y las posibles coincidencias.</label><p v-if="!reviewed" :id="validationId+'-review'" class="invoice-field-error">{{ validationText.confirm }}</p>
  <button v-if="!fromReconciliation" type="button" class="button primary" :disabled="disabled" @click="emit('post')">{{ postLabel }}</button>
 </section>
</template>
<style scoped>
.invoice-confirmation>p{margin:12px 0;line-height:1.6}.reconciliation-confirmation{padding:18px;border:1px solid var(--primary-border,#bdcbdc);border-radius:8px;background:var(--primary-soft,#f5f7fa);margin:18px 0}.invoice-confirm-actions{margin:14px 0;gap:10px;flex-wrap:wrap}.invoice-confirm-actions .button{min-height:42px;font-size:14px;white-space:normal}.invoice-confirmation .notice{padding:14px}.invoice-confirmation .invoice-review-confirm{display:flex;align-items:flex-start;gap:12px;margin:18px 0}.invoice-confirmation .invoice-review-confirm input{width:16px;height:16px;min-height:16px;flex:0 0 16px;margin-top:3px}.invoice-confirmation .invoice-review-confirm:not(.invoice-review-missing){background:white}
</style>
