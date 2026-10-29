<script setup>
import { onBeforeUnmount,onMounted,ref } from 'vue';
import { invoicePdfUrl,documentError } from '../services/invoice-documents.js';
import {loadInvoicePdf,invoiceDeliveryError} from '../services/invoice-delivery.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({documentId:[String,Number],invoiceId:[String,Number],filename:String}),emit=defineEmits(['close']);
const url=ref(''),error=ref(''),downloadName=ref('');let disposed=false;
const original=props.documentId!==undefined&&props.documentId!==null;
onMounted(async()=>{try{const result=original?{url:await invoicePdfUrl(props.documentId),filename:props.filename||'factura.pdf'}:await loadInvoicePdf(props.invoiceId);if(disposed)URL.revokeObjectURL(result.url);else{url.value=result.url;downloadName.value=result.filename;}}catch(cause){if(!disposed)error.value=original?documentError(cause):invoiceDeliveryError(cause);}});
onBeforeUnmount(()=>{disposed=true;if(url.value)URL.revokeObjectURL(url.value);});
</script>
<template><FormDialog class="invoice-pdf-dialog" :title="filename||downloadName||(original?'PDF original':'Factura en PDF')" @close="emit('close')"><p v-if="error" role="alert">{{ error }}</p><template v-else-if="url"><p><a class="button" :href="url" :download="downloadName">{{ original?'Descargar PDF original':'Descargar PDF' }}</a></p><iframe class="invoice-pdf-frame" :src="url" :title="original?'Factura original en PDF':'Factura en PDF'"></iframe></template><p v-else role="status">Cargando PDF…</p></FormDialog></template>
