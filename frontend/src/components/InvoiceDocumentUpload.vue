<script setup>
import { onBeforeUnmount,ref } from 'vue';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { previewInvoice,documentError } from '../services/invoice-documents.js';
import FormDialog from './FormDialog.vue';
import InvoiceProposal from './InvoiceProposal.vue';
const emit=defineEmits(['close','saved']);
const {selectedId,company,selectedExercise}=useContext();
const busy=ref(false),error=ref(''),preview=ref(null);let disposed=false,token='';
async function discard(){const old=token;token='';if(old)await api('/invoice-documents/discard',{method:'POST',body:{token:old}}).catch(()=>{});}
async function select(event){const file=event.target.files?.[0];if(!file)return;error.value='';preview.value=null;await discard();if(file.size>5*1024*1024){error.value='El PDF puede ocupar hasta 5 MB.';return;}busy.value=true;
 try{const result=await previewInvoice(file,selectedId.value);token=result.token;if(disposed){await discard();return;}preview.value=result;}catch(cause){if(!disposed)error.value=documentError(cause);}finally{busy.value=false;}}
async function archive(){if(busy.value||!preview.value)return;busy.value=true;error.value='';try{const saved=await api('/invoice-documents/archive',{method:'POST',body:{token}});token='';emit('saved',saved);}catch(cause){error.value=documentError(cause);}finally{busy.value=false;}}
onBeforeUnmount(()=>{disposed=true;discard();});
</script>
<template><FormDialog class="invoice-form-dialog" title="Subir factura PDF" :busy="busy" @close="emit('close')">
 <p>{{ company.name }} · {{ selectedExercise?.name }}. Se guardan el PDF original y la propuesta para revisarlos y encontrarlos después.</p>
 <label>Una factura por PDF · hasta 5 MB y 20 páginas<input name="invoice_pdf" type="file" accept="application/pdf,.pdf" :disabled="busy" @change="select"></label>
 <p v-if="busy" role="status">{{ preview?'Guardando documento…':'Leyendo PDF y consultando tu contabilidad…' }}</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
 <template v-if="preview"><p class="muted">{{ preview.source_name }} · {{ preview.pages }} páginas</p><p v-if="preview.existing_document_id" class="notice">Este PDF ya está guardado en esta empresa y ejercicio. Se abrirá el documento existente.</p><InvoiceProposal :proposal="preview.proposal" :extraction="preview.extraction" /><p class="notice">Guardar conserva una propuesta pendiente. La contabilización y la creación de recibos se realizan al confirmar la propuesta guardada.</p><div class="actions"><button type="button" class="button primary" :disabled="busy" @click="archive">{{ preview.existing_document_id?'Abrir documento guardado':'Guardar PDF y propuesta' }}</button><button type="button" class="button" :disabled="busy" @click="emit('close')">Cerrar</button></div></template>
</FormDialog></template>
