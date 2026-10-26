<script setup>
import { ref,computed,onMounted,onBeforeUnmount } from 'vue';
import { api } from '../services/accounting.js';
import { exerciseError,operationLabels,entryLabels } from '../locales/exercises.js';
import { reportDate as date,reportMoney as money } from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
import AnnualEntryPreview from './AnnualEntryPreview.vue';
const props=defineProps({exercise:Object,kind:String});
const emit=defineEmits(['close','saved','entry']);
const plan=ref(null),history=ref([]),accounts=ref([]),resultAccount=ref(''),reason=ref(''),loading=ref(false),busy=ref(false),error=ref('');
const requestId=ref(crypto.randomUUID()),cancelling=computed(()=>props.kind.startsWith('cancel_'));
let active=true,generation=0;
async function load(){
 const ticket=++generation;loading.value=true;error.value='';plan.value=null;requestId.value=crypto.randomUUID();
 try{
  const data=await api('/exercises/'+props.exercise.id+'/operations'+(props.kind==='history'?'':'/'+props.kind+'/preview?'+new URLSearchParams(resultAccount.value?{result_account_id:resultAccount.value}:{})),{timeoutMs:90000});
  if(active&&ticket===generation){if(props.kind==='history')history.value=data;else plan.value=data;}
 }catch(e){if(active&&ticket===generation)error.value=exerciseError(e);}finally{if(active&&ticket===generation)loading.value=false;}
}
onMounted(async()=>{
 if(props.kind==='closing'){try{accounts.value=(await api('/accounts?kind=subaccount')).filter(row=>row.code.startsWith('129'));}catch(e){error.value=exerciseError(e);}}
 if(active)load();
});
onBeforeUnmount(()=>{active=false;generation++;});
async function save(){
 if(busy.value||loading.value||!plan.value||(cancelling.value&&!reason.value.trim()))return;
 busy.value=true;error.value='';
 try{
  const result=await api('/exercises/'+props.exercise.id+'/operations/'+props.kind,{method:'POST',timeoutMs:90000,body:{request_id:requestId.value,preview_hash:plan.value.preview_hash,...(resultAccount.value?{result_account_id:Number(resultAccount.value)}:{}),...(cancelling.value?{reason:reason.value.trim()}:{})}});
  emit('saved',result);
 }catch(e){error.value=exerciseError(e);if(e.code==='ANNUAL_PREVIEW_STALE')plan.value=null;}finally{busy.value=false;}
}
</script>
<template>
 <FormDialog class="annual-dialog" :title="operationLabels[kind]+' · '+exercise.name" :busy="busy" @close="emit('close')">
  <p v-if="kind==='closing'" class="muted">Se regularizan los saldos de los grupos 6 y 7 contra la cuenta 129 y se cierran las cuentas patrimoniales. El ejercicio quedará cerrado.</p>
  <p v-else-if="kind==='opening'" class="muted">Los saldos del ejercicio anterior cerrado se incorporan al primer día de este ejercicio.</p>
  <p v-else-if="cancelling" class="notice">Los asientos indicados quedarán anulados y se conservarán en el diario. Después podrás generarlos de nuevo.</p>
  <label v-if="kind==='closing'&&accounts.length" class="annual-result">Cuenta de resultado del ejercicio<select v-model="resultAccount" name="result_account_id" :disabled="busy||loading" @change="load"><option value="">Selección automática (129)</option><option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.code }} · {{ account.description }}</option></select></label>
  <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
  <p v-if="loading" role="status">Preparando la información…</p>
  <template v-if="plan">
   <p v-if="plan.source">Origen: <strong>{{ plan.source.name }}</strong> · destino: <strong>{{ exercise.name }}</strong></p>
   <p>Fecha: <strong>{{ date(plan.date) }}</strong></p>
   <p v-if="kind==='closing'">Resultado pendiente de regularizar: <strong>{{ money(plan.result_transfer) }} €</strong></p>
   <AnnualEntryPreview :entries="plan.entries" />
   <template v-if="cancelling">
    <p v-if="kind==='cancel_closing'" class="notice">El ejercicio {{ exercise.name }} volverá a estar abierto.<template v-if="plan.affected_exercises.length>1"> También se anulará la apertura de {{ plan.affected_exercises.slice(1).map(row=>row.name).join(', ') }}. Las facturas, los cobros y los pagos se mantienen.</template></p>
    <div v-if="plan.cancel_entries.length" class="table-wrap"><table><thead><tr><th>Ejercicio</th><th>Asiento</th><th>Tipo</th><th>Fecha</th></tr></thead><tbody><tr v-for="entry in plan.cancel_entries" :key="entry.id"><td>{{ entry.exercise_name }}</td><td>{{ entry.number }}</td><td>{{ entryLabels[entry.entry_type] }}</td><td>{{ date(entry.entry_date) }}</td></tr></tbody></table></div>
    <label>Motivo de la anulación<input v-model="reason" name="cancellation_reason" maxlength="200" required :disabled="busy"></label>
   </template>
  </template>
  <template v-if="kind==='history'&&!loading">
   <p v-if="!history.length" class="notice">Todavía no hay operaciones realizadas desde esta pantalla. Los asientos importados se consultan en el diario.</p>
   <article v-for="operation in history" :key="operation.id" class="annual-history">
    <h3>{{ operationLabels[operation.kind] }} · #{{ operation.id }}</h3><p>{{ new Date(operation.created_at).toLocaleString('es-ES') }}</p><p v-if="operation.reason">Motivo: {{ operation.reason }}</p>
    <p v-for="entry in operation.result?.entries||[]" :key="entry.id">{{ entryLabels[entry.entry_type] }}: <button class="report-link" @click="emit('entry',entry.id)">asiento {{ entry.number }}</button></p>
    <p v-for="entry in operation.result?.cancelled_entries||[]" :key="entry.id">Anulado: <button class="report-link" @click="emit('entry',entry.id)">asiento {{ entry.number }}</button> · {{ entryLabels[entry.entry_type] }}</p>
   </article>
  </template>
  <div class="actions">
   <button v-if="kind!=='history'" class="button primary" :disabled="busy||loading||!plan||(cancelling&&!reason.trim())" @click="save">{{ busy?'Guardando…':operationLabels[kind] }}</button>
   <button v-if="!busy" class="button" :disabled="loading" @click="load">Actualizar vista previa</button>
   <button class="button" :disabled="busy" @click="emit('close')">Cerrar</button>
  </div>
 </FormDialog>
</template>

