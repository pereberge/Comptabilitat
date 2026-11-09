<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { computed,onBeforeUnmount,onMounted,ref } from 'vue';
import { api } from '../services/accounting.js';
import { documentError,documentStatus } from '../services/invoice-documents.js';
import FormDialog from './FormDialog.vue';
import InvoiceProposal from './InvoiceProposal.vue';
import InvoiceForm from './InvoiceForm.vue';
import InvoicePdf from './InvoicePdf.vue';
import InvoiceDocumentConfirmation from './InvoiceDocumentConfirmation.vue';
import '../assets/invoice-validation.css';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {t as reconciliationText} from '../locales/reconciliation-matches.js';
const props=defineProps({documentId:[String,Number],reconciliation:Object}),emit=defineEmits(['close','changed','invoice','delete-draft','delete-invoice','posted']);
const document=ref(null),error=ref(''),busy=ref(false),editing=ref(false),pdf=ref(false),reviewed=ref(false),selectedEntry=ref('');let disposed=false;
const action=computed(()=>document.value?.proposal.existing_invoice?'attach':document.value?.proposal.candidates.length?'link':'create');
const label=computed(()=>action.value==='attach'?'Vincular con factura existente':action.value==='link'?'Vincular al asiento y crear recibos':'Contabilizar y crear recibos');
async function load(){try{const result=await api('/invoice-documents/'+props.documentId);if(disposed)return;document.value=result;selectedEntry.value=result.proposal.candidates.length===1?result.proposal.candidates[0].entry_id:'';reviewed.value=false;}catch(cause){if(!disposed)error.value=documentError(cause);}}
async function saved(result){document.value=result;editing.value=false;reviewed.value=false;emit('changed');}
async function post(){if(busy.value||!reviewed.value)return;busy.value=true;error.value='';try{const result=await api('/invoice-documents/'+document.value.id+'/post',{method:'POST',timeoutMs:90000,body:{version:document.value.version,confirm:true,action:action.value,entry_id:selectedEntry.value}});await load();if(!disposed){emit('changed');emit('posted',result);}}catch(cause){if(!disposed)error.value=documentError(cause);}finally{busy.value=false;}}
onMounted(load);onBeforeUnmount(()=>disposed=true);
</script>
<template><FormDialog class="invoice-form-dialog" :title="reconciliation?reconciliationText.reviewTitle:'Documento y propuesta contable'" :busy="busy" @close="emit('close')">
 <p v-if="reconciliation" class="notice">{{ reconciliationText.invoiceStep }} · {{ date(reconciliation.date) }} · {{ money(reconciliation.signed_amount||reconciliation.amount) }} €. {{ reconciliationText.invoiceStepHelp }}</p>
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="!document" role="status">Cargando documento…</p>
 <template v-else><p><strong>{{ document.source_name }}</strong> · {{ document.exercise.name }} · <span class="badge">{{ documentStatus[document.status] }}</span></p><div class="actions"><button type="button" class="button" @click="pdf=true">Ver PDF original</button><button v-if="document.status==='draft'" type="button" class="button" :disabled="!can('accounting_write')||(busy)" @click="editing=true">Editar propuesta y recibos</button><button v-if="document.invoice_id" type="button" class="button" @click="emit('invoice',document.invoice_id)">Ver factura y recibos</button><button v-if="document.status==='draft'" type="button" class="button clear-danger" :disabled="!can('accounting_write')||(busy)" @click="emit('delete-draft',document)">Borrar sin contabilizar</button><button v-else-if="document.invoice_id&&can('invoice_delete')" type="button" class="button clear-danger" :disabled="busy" @click="emit('delete-invoice',document.invoice_id)">Borrar contabilizada · 96</button></div>
 <InvoiceDocumentConfirmation v-if="document.status==='draft'&&reconciliation" v-model:reviewed="reviewed" v-model:entry="selectedEntry" :document="document" :action="action" :label="label" :busy="busy" :can-write="can('accounting_write')" :from-reconciliation="!!reconciliation" @edit="editing=true" @post="post" />
 <InvoiceProposal :proposal="document.proposal" :extraction="document.extraction" />
 <InvoiceDocumentConfirmation v-if="document.status==='draft'&&!reconciliation" v-model:reviewed="reviewed" v-model:entry="selectedEntry" :document="document" :action="action" :label="label" :busy="busy" :can-write="can('accounting_write')" :from-reconciliation="!!reconciliation" @edit="editing=true" @post="post" /><p v-if="document.status!=='draft'" class="success-note">Documento guardado y vinculado. Los recibos se consultan desde la factura o desde Cartera.</p>
 </template>
 <InvoiceForm v-if="editing" :direction="document.form.direction" :initial-value="document.form" :document-id="document.id" :document-version="document.version" :exercise="document.exercise" @close="editing=false" @saved="saved" />
 <InvoicePdf v-if="pdf" :document-id="document.id" :filename="document.source_name" @close="pdf=false" />
</FormDialog></template>
