<script setup>
import { onMounted,ref } from 'vue';
import { api } from '../services/accounting.js';
import { clearError } from '../services/exercise-clear.js';
import { reportDate as date } from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({exercise:Object}),emit=defineEmits(['close','cleared']);
const loading=ref(false),busy=ref(false),error=ref(''),code=ref(''),preview=ref(null),requestId=ref('');
const labels={entries:'Asientos (incluye apertura, regularización y cierre)',lines:'Líneas de asiento',invoices:'Facturas',receipts:'Recibos de esas facturas',settlements:'Cobros y pagos del período',documents:'PDF de facturas y propuestas',bank_reports:'Informes de conciliación bancaria',imports:'Libros diarios importados',annual_operations:'Operaciones de cierre y apertura'};
async function review(){loading.value=true;error.value='';code.value='';preview.value=null;requestId.value=crypto.randomUUID();try{preview.value=await api('/exercises/'+props.exercise.id+'/clear/preview',{timeoutMs:90000});}catch(cause){error.value=clearError(cause);}finally{loading.value=false;}}
labels.farm_costs='Líneas de costes de granjas';labels.farm_invoices='Facturas del registro de granjas';labels.farm_sales='Ventas manuales de granjas';labels.farm_deaths='Bajas de animales';labels.farm_care_costs='Cuido de animales';labels.farm_feed_transfers='Traspasos de pienso';
async function clear(){if(busy.value||code.value!=='96'||!preview.value?.ready)return;busy.value=true;error.value='';try{const result=await api('/exercises/'+props.exercise.id+'/clear',{method:'POST',timeoutMs:120000,body:{confirmation:code.value,preview_hash:preview.value.preview_hash,request_id:requestId.value}});code.value='';emit('cleared',result);}catch(cause){error.value=clearError(cause);}finally{busy.value=false;}}
onMounted(review);
</script>
<template><FormDialog class="exercise-clear-dialog" title="Borrar contabilidad del período" :busy="busy||loading" @close="emit('close')">
 <p v-if="loading" role="status">Comprobando los movimientos y las relaciones del período…</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
 <template v-if="preview"><div class="exercise-clear-scope"><strong>{{ preview.company.name }}</strong><h3>Ejercicio {{ preview.exercise.name }}</h3><p>{{ date(preview.exercise.start_date) }} — {{ date(preview.exercise.end_date) }}</p></div>
 <p>Se eliminarán los siguientes datos del período y el ejercicio quedará vacío y abierto para volver a importar.</p>
 <dl class="exercise-clear-counts"><template v-for="(label,key) in labels" :key="key"><dt>{{ label }}</dt><dd>{{ preview.counts[key] }}</dd></template></dl>
 <p class="notice">Antes de borrar se guardará una copia automática con los datos y documentos originales. Después podrás descargarla desde la ficha del ejercicio. Se conservan la empresa, el ejercicio y su plan de cuentas.</p>
 <p v-if="preview.counts.restored_settlements">Las {{ preview.counts.restored_settlements }} anulaciones de cobros o pagos de años anteriores registradas en este período se retirarán; sus cobros o pagos originales volverán a estar vigentes.</p>
 <p v-if="preview.counts.restored_invoices">Las {{ preview.counts.restored_invoices }} anulaciones de facturas de años anteriores registradas en este período se retirarán; esas facturas volverán a estar vigentes.</p>
 <div v-if="preview.blockers.length" class="notice error-notice" role="alert"><p>No se puede vaciar el período mientras existan estas relaciones:</p><ul><li v-for="(blocker,index) in preview.blockers" :key="index"><strong>Ejercicio {{ blocker.exercise_name }}</strong>: {{ blocker.message }} ({{ blocker.count }})</li></ul></div>
 <p v-else-if="!preview.ready" class="notice">Este período ya está vacío.</p>
 <form v-if="preview.ready" @submit.prevent="clear"><label>Código de seguridad: escribe <strong>96</strong><input v-model="code" name="exercise_clear_code" type="text" inputmode="numeric" pattern="96" maxlength="2" autocomplete="off" :disabled="busy" required aria-describedby="exercise-clear-help"></label><p id="exercise-clear-help" class="muted">Confirma el borrado únicamente de la empresa y el ejercicio indicados arriba.</p><div class="actions"><button class="button clear-danger" :disabled="busy||code!=='96'">{{ busy?'Guardando copia y borrando…':'Borrar contabilidad del período' }}</button><button type="button" class="button" :disabled="busy" @click="emit('close')">Cancelar</button></div></form>
 </template>
 <button v-if="!busy&&!loading" type="button" class="button exercise-clear-refresh" @click="review">Actualizar resumen</button>
</FormDialog></template>
