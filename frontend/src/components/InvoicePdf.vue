<script setup>
import { onBeforeUnmount,onMounted,ref } from 'vue';
import { invoicePdfUrl,documentError } from '../services/invoice-documents.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({documentId:[String,Number],filename:String}),emit=defineEmits(['close']);
const url=ref(''),error=ref('');let disposed=false;
onMounted(async()=>{try{const result=await invoicePdfUrl(props.documentId);if(disposed)URL.revokeObjectURL(result);else url.value=result;}catch(cause){if(!disposed)error.value=documentError(cause);}});
onBeforeUnmount(()=>{disposed=true;if(url.value)URL.revokeObjectURL(url.value);});
</script>
<template><FormDialog class="invoice-pdf-dialog" :title="filename||'PDF original'" @close="emit('close')"><p v-if="error" role="alert">{{ error }}</p><template v-else-if="url"><p><a class="button" :href="url" :download="filename||'factura.pdf'">Descargar PDF original</a></p><iframe class="invoice-pdf-frame" :src="url" title="Factura original en PDF"></iframe></template><p v-else role="status">Cargando PDF…</p></FormDialog></template>
