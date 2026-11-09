<script setup>
import {onBeforeUnmount,onMounted,ref} from 'vue';
import FormDialog from './FormDialog.vue';
import {api} from '../services/accounting.js';
import {errorText} from '../locales/accounting.js';
import {payrollErrors} from '../locales/payroll.js';
import {reportDate as date,reportMoney as money} from '../services/report-format.js';
const props=defineProps({rows:{type:Array,required:true},exerciseId:{type:[Number,String],required:true},scope:{type:String,required:true}}),emit=defineEmits(['close','saved']);
const plan=ref(null),busy=ref(false),error=ref('');let mounted=true;
function payload(){return {exercise_id:props.exerciseId,slips:props.rows.map(row=>({id:row.id,version:row.version}))};}
async function review(){busy.value=true;error.value='';plan.value=null;try{const result=await api('/payroll/batch/delete-preview',{method:'POST',body:payload()});if(mounted)plan.value=result;}catch(cause){if(mounted)error.value=payrollErrors[cause.code]||errorText(cause);}finally{if(mounted)busy.value=false;}}
async function remove(){if(!plan.value?.ready)return;busy.value=true;error.value='';try{const result=await api('/payroll/batch/delete',{method:'POST',body:{...payload(),preview_hash:plan.value.hash},timeoutMs:45000});if(mounted)emit('saved',result);}catch(cause){if(mounted){plan.value=null;error.value=payrollErrors[cause.code]||errorText(cause);}}finally{if(mounted)busy.value=false;}}
onMounted(review);onBeforeUnmount(()=>{mounted=false;});
</script>
<template>
 <FormDialog class="payroll-dialog" title="Eliminar borradores en grupo" :busy="busy" @close="emit('close')">
  <div class="payroll-form">
   <p><strong>{{ scope }}</strong>. Se eliminarán únicamente los borradores que aparecen en esta revisión. Las nóminas contabilizadas y anuladas se conservan.</p>
   <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
   <template v-if="plan">
    <p class="notice">{{ plan.rows.length }} borradores pendientes de eliminar. Esta acción no elimina trabajadores ni genera movimientos contables.</p>
    <div class="table-wrap payroll-batch-table"><table><thead><tr><th>Trabajador</th><th>Período</th><th class="amount">Bruto</th><th class="amount">Líquido</th></tr></thead><tbody><tr v-for="row in plan.rows" :key="row.id"><td>{{ row.name }}<small>{{ row.code }}</small></td><td>{{ date(row.period_from) }} — {{ date(row.period_to) }}</td><td class="amount">{{ money(row.totals.gross) }}</td><td class="amount">{{ money(row.totals.net) }}</td></tr></tbody></table></div>
   </template>
   <div class="dialog-actions"><button type="button" class="button" :disabled="busy" @click="emit('close')">Cancelar</button><button v-if="!plan" type="button" class="button" :disabled="busy" @click="review">Actualizar revisión</button><button type="button" class="button primary" :disabled="busy||!plan?.ready" @click="remove">Eliminar {{ plan?.rows.length||rows.length }} borradores</button></div>
  </div>
 </FormDialog>
</template>
