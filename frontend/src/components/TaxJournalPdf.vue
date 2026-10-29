<script setup>
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {companyHeaders} from '../services/company.js';
import {errorText} from '../locales/accounting.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({entryId:[String,Number],page:Number}),emit=defineEmits(['close']);
const url=ref(''),error=ref(''),controller=new AbortController();let disposed=false;
const frameUrl=computed(()=>url.value+(props.page?'#page='+props.page:''));
onMounted(async()=>{
 const timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api/tax/vat/entries/'+props.entryId+'/source',{headers:companyHeaders(),signal:controller.signal});
  if(!response.ok){const data=await response.json();throw Object.assign(new Error(),{code:data.error?.code});}
  const blob=await response.blob();if(!disposed)url.value=URL.createObjectURL(blob);
 }catch(cause){if(!disposed)error.value=cause.code==='VAT_SOURCE_NOT_FOUND'?'No se ha encontrado el PDF original de este asiento.':errorText(cause);}
 finally{clearTimeout(timeout);}
});
onBeforeUnmount(()=>{disposed=true;controller.abort();if(url.value)URL.revokeObjectURL(url.value);});
</script>
<template><FormDialog class="invoice-pdf-dialog" title="Diario original · IVA" @close="emit('close')"><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><template v-else-if="url"><p><a class="button" :href="url" download="diario-original.pdf">Descargar diario original</a></p><iframe class="invoice-pdf-frame" :src="frameUrl" title="Diario original en PDF"></iframe></template><p v-else role="status">Cargando diario original…</p></FormDialog></template>
