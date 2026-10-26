<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { onMounted,ref } from 'vue';
import { api } from '../services/accounting.js';
import { treasuryError } from '../locales/treasury.js';
import { reportMoney as money } from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({invoiceId:[Number,String]}),emit=defineEmits(['close','deleted']);
const preview=ref(null),loading=ref(false),busy=ref(false),error=ref(''),code=ref('');let requestId='';
const labels={invoices:'Factura',receipts:'Recibos',settlements:'Cobros y pagos, incluidos los anulados',entries:'Asientos de factura, cobros, pagos y anulaciones',lines:'Líneas de asiento'};
function message(cause){return ({INVOICE_DELETE_CODE:'Escribe exactamente 96 para borrar.',INVOICE_DELETE_PREVIEW_REQUIRED:'Actualiza el resumen antes de continuar.',INVOICE_DELETE_STALE:'La factura o sus movimientos han cambiado. Actualiza el resumen y revísalo de nuevo.',INVOICE_DELETE_DEPENDENCIES:'Hay ejercicios cerrados o movimientos dependientes. Revisa las indicaciones del resumen.'})[cause?.code]||treasuryError(cause);}
async function review(){if(!can('invoice_delete')){error.value=treasuryError({code:'PERMISSION_DENIED'});return;}loading.value=true;error.value='';code.value='';preview.value=null;requestId=crypto.randomUUID();try{preview.value=await api('/invoices/'+props.invoiceId+'/delete-preview',{timeoutMs:60000});}catch(cause){error.value=message(cause);}finally{loading.value=false;}}
async function remove(){if(!can('invoice_delete')||busy.value||code.value!=='96'||!preview.value?.ready)return;busy.value=true;error.value='';try{emit('deleted',await api('/invoices/'+props.invoiceId+'/delete',{method:'POST',timeoutMs:90000,body:{confirmation:code.value,preview_hash:preview.value.preview_hash,request_id:requestId}}));}catch(cause){error.value=message(cause);}finally{busy.value=false;}}
onMounted(review);
</script>
<template><FormDialog title="Borrar factura contabilizada y recibos" class="invoice-delete-dialog" :busy="busy||loading" @close="emit('close')">
 <p v-if="loading" role="status">Comprobando los asientos y recibos vinculados…</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
 <template v-if="preview"><p><strong>{{ preview.company.name }}</strong></p><h3>Factura {{ preview.invoice.reference }}</h3><p>{{ preview.invoice.party_name }} · {{ money(preview.invoice.total_amount) }} €</p><p>Ejercicios afectados: {{ preview.exercises.map(row=>row.name).join(', ') }}</p>
 <dl class="exercise-clear-counts"><template v-for="(label,key) in labels" :key="key"><dt>{{ label }}</dt><dd>{{ preview.counts[key] }}</dd></template></dl>
 <p v-if="preview.counts.documents" class="notice">Los PDF originales ({{ preview.counts.documents }}) se conservarán en «Documentos y propuestas», pendientes de contabilizar.</p>
 <div v-if="preview.blockers.length" role="alert" class="notice error-notice"><ul><li v-for="(blocker,index) in preview.blockers" :key="index">{{ blocker.message }}</li></ul></div>
 <form v-if="preview.ready&&can('invoice_delete')" @submit.prevent="remove"><label>Código de seguridad: escribe <strong>96</strong><input v-model="code" name="invoice_delete_code" autocomplete="off" inputmode="numeric" pattern="96" maxlength="2" :disabled="busy" required></label><div class="actions"><button class="button clear-danger" :disabled="busy||code!=='96'">{{ busy?'Borrando…':'Borrar factura y recibos' }}</button><button type="button" class="button" :disabled="busy" @click="emit('close')">Cancelar</button></div></form>
 </template><button v-if="!loading&&!busy" type="button" class="button" @click="review">Actualizar resumen</button>
</FormDialog></template>
