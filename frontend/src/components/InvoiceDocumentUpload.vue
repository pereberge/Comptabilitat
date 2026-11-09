<script setup>
import { onBeforeUnmount,ref } from 'vue';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { previewInvoice,documentError } from '../services/invoice-documents.js';
import FormDialog from './FormDialog.vue';
import InvoiceProposal from './InvoiceProposal.vue';
const emit=defineEmits(['close','saved']);
const {selectedId,company,selectedExercise}=useContext();
const busy=ref(false),error=ref(''),preview=ref(null),dragState=ref(''),selectedName=ref('');let disposed=false,token='',dragDepth=0;
async function discard(){const old=token;token='';if(old)await api('/invoice-documents/discard',{method:'POST',body:{token:old}}).catch(()=>{});}
function select(event){const file=event.target.files?.[0];event.target.value='';void readFile(file);}
function dragEnter(event){
 if(busy.value)return;dragDepth++;
 const items=[...(event.dataTransfer?.items||[])].filter(item=>item.kind==='file');
 dragState.value=items.length===1&&(!items[0].type||items[0].type==='application/pdf')?'ready':'invalid';
}
function dragLeave(){if(--dragDepth<=0){dragDepth=0;dragState.value='';}}
function dragOver(event){if(event.dataTransfer)event.dataTransfer.dropEffect=busy.value||dragState.value==='invalid'?'none':'copy';}
function drop(event){dragDepth=0;dragState.value='';if(busy.value)return;const files=[...(event.dataTransfer?.files||[])];if(files.length!==1){error.value='Arrastra una sola factura PDF cada vez.';return;}void readFile(files[0]);}
async function readFile(file){if(busy.value||!file)return;
 if(!/\.pdf$/i.test(file.name)&&file.type!=='application/pdf'){error.value='Selecciona un archivo PDF.';return;}
 if(file.size>5*1024*1024){error.value='El PDF puede ocupar hasta 5 MB.';return;}
 selectedName.value=file.name;busy.value=true;error.value='';preview.value=null;await discard();
 try{const result=await previewInvoice(file,selectedId.value);token=result.token;if(disposed){await discard();return;}preview.value=result;}catch(cause){if(!disposed)error.value=documentError(cause);}finally{busy.value=false;}}
async function archive(){if(busy.value||!preview.value)return;busy.value=true;error.value='';try{const saved=await api('/invoice-documents/archive',{method:'POST',body:{token}});token='';emit('saved',saved);}catch(cause){error.value=documentError(cause);}finally{busy.value=false;}}
onBeforeUnmount(()=>{disposed=true;discard();});
</script>
<template><FormDialog class="invoice-form-dialog" title="Subir factura PDF" :busy="busy" @close="emit('close')">
 <p>{{ company.name }} · {{ selectedExercise?.name }}. Se guardan el PDF original y la propuesta para revisarlos y encontrarlos después.</p>
 <label class="invoice-upload-zone" :class="{'is-ready':dragState==='ready','is-invalid':dragState==='invalid','is-busy':busy}" @dragenter.prevent.stop="dragEnter" @dragover.prevent.stop="dragOver" @dragleave.prevent.stop="dragLeave" @drop.prevent.stop="drop"><strong>{{ dragState==='ready'?'Suelta el PDF para preparar la propuesta':dragState==='invalid'?'Arrastra una sola factura en formato PDF':'Arrastra tu factura PDF aquí' }}</strong><span>O pulsa para seleccionar un archivo</span><small>Una factura por PDF · hasta 5 MB y 20 páginas</small><input name="invoice_pdf" type="file" accept="application/pdf,.pdf" :disabled="busy" @change="select"><span v-if="selectedName" class="invoice-upload-name">{{ selectedName }}</span></label>
 <p v-if="busy" role="status">{{ preview?'Guardando documento…':'Leyendo PDF y consultando tu contabilidad…' }}</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
 <template v-if="preview"><p class="muted">{{ preview.source_name }} · {{ preview.pages }} páginas</p><p v-if="preview.existing_document_id" class="notice">Este PDF ya está guardado en esta empresa y ejercicio. Se abrirá el documento existente.</p><InvoiceProposal :proposal="preview.proposal" :extraction="preview.extraction" /><p class="notice">Guardar conserva una propuesta pendiente. La contabilización y la creación de recibos se realizan al confirmar la propuesta guardada.</p><div class="actions"><button type="button" class="button primary" :disabled="busy" @click="archive">{{ preview.existing_document_id?'Abrir documento guardado':'Guardar PDF y propuesta' }}</button><button type="button" class="button" :disabled="busy" @click="emit('close')">Cerrar</button></div></template>
</FormDialog></template>

<style scoped>
.invoice-upload-zone{display:flex;min-height:250px;padding:32px 24px;box-sizing:border-box;align-items:center;justify-content:center;flex-direction:column;gap:12px;text-align:center;border:2px dashed #7894ae;border-radius:16px;background:#f2f7fc;color:#203c57;cursor:pointer;transition:background .15s,border-color .15s,box-shadow .15s}
.invoice-upload-zone strong{font-size:1.25rem}.invoice-upload-zone input{width:min(100%,360px);margin:4px 0}.invoice-upload-zone:focus-within{outline:3px solid #3974b3;outline-offset:3px}
.invoice-upload-zone.is-ready{background:#dcfce7;border-color:#15803d;color:#14532d;box-shadow:0 0 0 4px #15803d22}.invoice-upload-zone.is-invalid{background:#fee2e2;border-color:#b91c1c;color:#7f1d1d}.invoice-upload-zone.is-busy{opacity:.65;cursor:wait}.invoice-upload-name{overflow-wrap:anywhere;max-width:100%;font-weight:600}
@media(max-width:600px){.invoice-upload-zone{min-height:210px;padding:24px 16px}}
</style>
