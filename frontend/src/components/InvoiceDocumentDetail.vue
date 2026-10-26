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
const props=defineProps({documentId:[String,Number]}),emit=defineEmits(['close','changed','invoice','delete-draft','delete-invoice']);
const document=ref(null),error=ref(''),busy=ref(false),editing=ref(false),pdf=ref(false),reviewed=ref(false),selectedEntry=ref('');let disposed=false;
const action=computed(()=>document.value?.proposal.existing_invoice?'attach':document.value?.proposal.candidates.length?'link':'create');
const label=computed(()=>action.value==='attach'?'Vincular con factura existente':action.value==='link'?'Vincular al asiento y crear recibos':'Contabilizar y crear recibos');
async function load(){try{const result=await api('/invoice-documents/'+props.documentId);if(disposed)return;document.value=result;selectedEntry.value=result.proposal.candidates.length===1?result.proposal.candidates[0].entry_id:'';reviewed.value=false;}catch(cause){if(!disposed)error.value=documentError(cause);}}
async function saved(result){document.value=result;editing.value=false;reviewed.value=false;emit('changed');}
async function post(){if(busy.value||!reviewed.value)return;busy.value=true;error.value='';try{await api('/invoice-documents/'+document.value.id+'/post',{method:'POST',body:{version:document.value.version,confirm:true,action:action.value,entry_id:selectedEntry.value}});await load();emit('changed');}catch(cause){error.value=documentError(cause);}finally{busy.value=false;}}
onMounted(load);onBeforeUnmount(()=>disposed=true);
</script>
<template><FormDialog class="invoice-form-dialog" title="Documento y propuesta contable" :busy="busy" @close="emit('close')">
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="!document" role="status">Cargando documento…</p>
 <template v-else><p><strong>{{ document.source_name }}</strong> · {{ document.exercise.name }} · <span class="badge">{{ documentStatus[document.status] }}</span></p><div class="actions"><button type="button" class="button" @click="pdf=true">Ver PDF original</button><button v-if="document.status==='draft'" type="button" class="button" :disabled="!can('accounting_write')||(busy)" @click="editing=true">Editar propuesta y recibos</button><button v-if="document.invoice_id" type="button" class="button" @click="emit('invoice',document.invoice_id)">Ver factura y recibos</button><button v-if="document.status==='draft'" type="button" class="button clear-danger" :disabled="!can('accounting_write')||(busy)" @click="emit('delete-draft',document)">Borrar sin contabilizar</button><button v-else-if="document.invoice_id&&can('invoice_delete')" type="button" class="button clear-danger" :disabled="busy" @click="emit('delete-invoice',document.invoice_id)">Borrar contabilizada · 96</button></div>
 <InvoiceProposal :proposal="document.proposal" :extraction="document.extraction" />
 <section v-if="document.status==='draft'" class="trade-form-section"><h3>Confirmar propuesta</h3><p v-if="action==='link'">La vinculación conserva el asiento existente y crea la ficha de factura con los recibos pendientes indicados.</p><p v-else-if="action==='attach'">Se añade el PDF a la factura existente con sus recibos actuales.</p><p v-else>Se crearán el asiento, la factura y sus recibos en una misma operación.</p>
  <label v-if="document.proposal.candidates.length>1">Asiento a vincular<select v-model="selectedEntry"><option value="">Selecciona el asiento revisado</option><option v-for="candidate in document.proposal.candidates" :key="candidate.entry_id" :value="candidate.entry_id">{{ candidate.number }} · {{ candidate.description }}</option></select></label>
  <p v-if="!document.proposal.ready" class="notice">Completa la propuesta y selecciona las cuentas necesarias en «Editar propuesta y recibos».</p><p v-if="document.exercise.status!=='open'" class="notice">El ejercicio está cerrado. Puedes conservar y consultar el documento.</p>
  <label class="invoice-review-confirm"><input v-model="reviewed" name="invoice_reviewed" type="checkbox" :disabled="busy">He revisado el PDF, los importes, las cuentas, los vencimientos y las posibles coincidencias.</label><button type="button" class="button primary" :disabled="!can('accounting_write')||(busy||!reviewed||!document.proposal.ready||document.exercise.status!=='open'||(action==='link'&&!selectedEntry))" @click="post">{{ label }}</button>
 </section><p v-else class="success-note">Documento guardado y vinculado. Los recibos se consultan desde la factura o desde Cartera.</p>
 </template>
 <InvoiceForm v-if="editing" :direction="document.form.direction" :initial-value="document.form" :document-id="document.id" :document-version="document.version" @close="editing=false" @saved="saved" />
 <InvoicePdf v-if="pdf" :document-id="document.id" :filename="document.source_name" @close="pdf=false" />
</FormDialog></template>
