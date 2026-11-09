<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue';
import FormDialog from './FormDialog.vue';
import {companyHeaders} from '../services/company.js';
import {errorText} from '../locales/accounting.js';
import {payrollErrors} from '../locales/payroll.js';
const props=defineProps({slipId:[String,Number]}),emit=defineEmits(['close']),url=ref(''),error=ref(''),controller=new AbortController();let disposed=false;
onMounted(async()=>{const timer=setTimeout(()=>controller.abort(),45000);try{const response=await fetch('/api/payroll/slips/'+props.slipId+'/pdf',{headers:companyHeaders(),signal:controller.signal});if(!response.ok){const body=await response.json();throw {code:body.error?.code};}const blob=await response.blob();if(!disposed)url.value=URL.createObjectURL(blob);}catch(cause){if(!disposed)error.value=payrollErrors[cause.code]||errorText(cause);}finally{clearTimeout(timer);}});
onBeforeUnmount(()=>{disposed=true;controller.abort();if(url.value)URL.revokeObjectURL(url.value);});
</script>
<template><FormDialog class="invoice-pdf-dialog" title="Nómina en PDF" @close="emit('close')"><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><template v-else-if="url"><p><a class="button" :href="url" download="nomina.pdf">Descargar PDF</a></p><iframe class="invoice-pdf-frame" :src="url" title="Nómina en PDF"></iframe></template><p v-else role="status">Preparando nómina en PDF…</p></FormDialog></template>
