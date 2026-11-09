<script setup>
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import {api} from '../services/accounting.js';
import {treasuryError} from '../locales/treasury.js';
import {reportDate as date} from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
import DateInput from './DateInput.vue';
const props=defineProps({invoiceId:[String,Number],movementDate:String}),emit=defineEmits(['close','saved']);
const source=ref(null),invoiceDate=ref(''),postingDate=ref(''),loading=ref(true),saving=ref(false),error=ref('');let disposed=false;
const messages={
 INVOICE_DATES_CHANGED:'Les dates o els rebuts han canviat. Tanca aquesta finestra i torna a obrir-la per revisar les dades actuals.',
 INVOICE_DATES_NOT_EDITABLE:'Només es poden corregir factures rebudes comptabilitzades en un exercici obert i sense rebuts en remesa.',
 INVOICE_DATES_RECEIPT_CONFLICT:'La data de factura no pot ser posterior a un venciment ni a un cobrament o pagament ja registrat.',
 INVALID_INVOICE_DATE:'La data comptable no pot ser anterior a la data de factura.',
};
const valid=computed(()=>source.value?.editable&&invoiceDate.value&&postingDate.value&&invoiceDate.value<=postingDate.value&&postingDate.value>=source.value.start_date&&postingDate.value<=source.value.end_date);
onMounted(async()=>{try{const result=await api('/invoices/'+props.invoiceId+'/dates');if(disposed)return;source.value=result;invoiceDate.value=result.invoice_date;postingDate.value=result.entry_date;}catch(cause){if(!disposed)error.value=messages[cause.code]||treasuryError(cause);}finally{if(!disposed)loading.value=false;}});
onBeforeUnmount(()=>{disposed=true;});
async function save(){if(saving.value||!valid.value)return;saving.value=true;error.value='';try{const result=await api('/invoices/'+props.invoiceId+'/dates',{method:'PATCH',body:{revision:source.value.revision,invoice_date:invoiceDate.value,posting_date:postingDate.value}});if(!disposed)emit('saved',result);}catch(cause){if(!disposed)error.value=messages[cause.code]||treasuryError(cause);}finally{if(!disposed)saving.value=false;}}
</script>
<template>
 <FormDialog title="Corregir dates de la factura" :busy="saving" @close="emit('close')">
  <p v-if="loading" role="status">Llegint les dates actuals…</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <template v-if="source&&!loading">
   <h3>{{ source.reference }}</h3>
   <p>Moviment bancari: <strong>{{ date(movementDate) }}</strong>.</p>
   <p>El pagament comprova la <strong>data de factura</strong>, que no pot ser posterior al moviment. Canviar només la data comptable no canvia aquesta comprovació.</p>
   <p>Data de factura actual: <strong>{{ date(source.invoice_date) }}</strong> · Data de l’assentament: <strong>{{ date(source.entry_date) }}</strong>.</p>
   <p v-if="source.posting_date!==source.entry_date" class="notice">La data comptable guardada a la factura ({{ date(source.posting_date) }}) no coincideix amb la de l’assentament. En guardar quedaran sincronitzades.</p>
   <p v-if="!source.editable" class="notice">{{ messages.INVOICE_DATES_NOT_EDITABLE }}</p>
   <form v-else @submit.prevent="save">
    <p>Revisa la data de factura amb el PDF original. Es corregiran la factura i la data del seu assentament; es conservaran els imports i els rebuts.</p>
    <fieldset :disabled="saving"><label>Data de factura<DateInput v-model="invoiceDate" name="invoice_date" min="1000-01-01" :max="postingDate" required /></label><label>Data comptable<DateInput v-model="postingDate" name="posting_date" :min="source.start_date" :max="source.end_date" required /></label></fieldset>
    <p v-if="invoiceDate>movementDate" class="notice">La data de factura encara és posterior al moviment. El pagament continuarà bloquejat.</p>
    <p v-if="invoiceDate>postingDate" class="notice error-notice">{{ messages.INVALID_INVOICE_DATE }}</p>
    <div class="actions"><button class="button primary" :disabled="saving||!valid">Guardar dates i tornar a conciliar</button><button type="button" class="button" :disabled="saving" @click="emit('close')">Cancel·lar</button></div>
   </form>
  </template>
 </FormDialog>
</template>
<style scoped>p{line-height:1.6;margin:16px 0}fieldset{border:0;padding:0;display:grid;gap:16px;margin:20px 0}label{display:grid;gap:7px}.actions{flex-wrap:wrap}</style>
