<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import FormDialog from './FormDialog.vue';
import {api} from '../services/accounting.js';
import {errorText} from '../locales/accounting.js';
import {payrollErrors} from '../locales/payroll.js';
const props=defineProps({employees:{type:Array,required:true},exerciseId:{type:[Number,String],required:true},year:Number,month:Number}),emit=defineEmits(['close','saved']);
const year=ref(props.year),month=ref(props.month),kind=ref('monthly'),selected=ref(props.employees.filter(row=>row.profile.active&&!row.profile.batch_excluded).map(row=>row.id)),plan=ref(null),busy=ref(false),error=ref(''),requestId=ref(crypto.randomUUID());let generation=0;
const available=computed(()=>props.employees.filter(row=>row.profile.active&&!row.profile.batch_excluded));
const states={create:'Se creará un borrador',exists:'Ya tiene nómina en este período',inactive:'Trabajador inactivo',excluded:'Excluido en la ficha',outside_period:'Sin alta en este período',agreement_changed:'Revisar convenio de la ficha'};
const planned=computed(()=>new Map((plan.value?.rows||[]).map(row=>[row.employee_id,row])));
function invalidate(){generation++;plan.value=null;error.value='';requestId.value=crypto.randomUUID();}
watch([year,month,kind,()=>selected.value.join(',')],invalidate);
function payload(){return {exercise_id:props.exerciseId,year:year.value,month:month.value,kind:kind.value,employee_ids:[...selected.value]};}
async function preview(){const ticket=++generation;busy.value=true;error.value='';try{const data=await api('/payroll/batch/preview',{method:'POST',body:payload(),timeoutMs:45000});if(ticket===generation)plan.value=data;}catch(cause){if(ticket===generation)error.value=payrollErrors[cause.code]||errorText(cause);}finally{if(ticket===generation)busy.value=false;}}
async function create(){if(!plan.value?.ready)return;busy.value=true;error.value='';try{const data=await api('/payroll/batch',{method:'POST',body:{...payload(),preview_hash:plan.value.hash,request_id:requestId.value},timeoutMs:45000});emit('saved',{...data,year:year.value,month:month.value});}catch(cause){error.value=payrollErrors[cause.code]||errorText(cause);}finally{busy.value=false;}}
onBeforeUnmount(()=>generation++);
</script>
<template>
 <FormDialog class="payroll-dialog" title="Crear nóminas en grupo" :busy="busy" @close="emit('close')">
  <div class="payroll-form">
   <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
   <p>Prepara los borradores del mes con los datos de las fichas. Revisa complementos, bajas, bases, cuotas e IRPF antes de contabilizar. Las nóminas ya existentes se conservan.</p>
   <fieldset :disabled="busy">
    <div class="payroll-fields">
     <label>Año del grupo<input v-model.number="year" type="number" min="2000" max="2099" aria-label="Año del grupo" /></label>
     <label>Mes del grupo<select v-model.number="month" aria-label="Mes del grupo"><option v-for="m in 12" :key="m" :value="m">{{ String(m).padStart(2,'0') }}</option></select></label>
     <label>Tipo del grupo<select v-model="kind" aria-label="Tipo del grupo"><option value="monthly">Nómina mensual</option><option value="extra">Paga extraordinaria</option></select></label>
    </div>
    <div class="actions"><button type="button" class="button small" @click="selected=available.map(row=>row.id)">Seleccionar todos los disponibles</button><button type="button" class="button small" @click="selected=[]">Quitar selección</button><span>{{ selected.length }} seleccionados</span></div>
    <div class="table-wrap payroll-batch-table"><table><thead><tr><th>Incluir</th><th>Código</th><th>Trabajador</th><th>Resultado / revisión</th></tr></thead><tbody>
     <tr v-for="person in employees" :key="person.id" :data-batch-employee="person.id">
      <td><input v-model="selected" type="checkbox" :value="person.id" :disabled="!person.profile.active||person.profile.batch_excluded" :aria-label="'Incluir '+person.profile.name" /></td>
      <td>{{ person.profile.code }}</td><td>{{ person.profile.name }}<small>{{ person.profile.job_title }}</small></td>
      <td><span>{{ states[planned.get(person.id)?.status]||(!person.profile.active?states.inactive:person.profile.batch_excluded?states.excluded:'Disponible') }}</span>
       <details v-if="planned.get(person.id)?.issues.length"><summary>Datos pendientes de revisión</summary><ul><li v-for="issue in planned.get(person.id).issues" :key="issue">{{ payrollErrors[issue]||issue }}</li></ul></details>
      </td>
     </tr>
    </tbody></table></div>
   </fieldset>
   <p v-if="selected.length>500" class="notice">Selecciona como máximo 500 trabajadores por grupo.</p>
   <div v-if="plan" class="notice" role="status" data-payroll-batch-summary>
    <strong>{{ plan.summary.create }} borradores nuevos</strong> · {{ plan.summary.exists }} ya existentes · {{ plan.summary.omitted }} omitidos.
    <p v-if="plan.summary.pending_review">{{ plan.summary.pending_review }} borradores requieren completar o revisar los datos de la ficha y las incidencias. Sus importes se conservarán como provisionales.</p>
    <p v-if="!plan.ready">No hay nóminas nuevas disponibles para crear o el ejercicio está cerrado.</p>
   </div>
   <div class="dialog-actions"><button type="button" class="button" :disabled="busy" @click="emit('close')">Cerrar</button><button type="button" class="button" :disabled="busy||!selected.length||selected.length>500" @click="preview">Revisar selección</button><button type="button" class="button primary" :disabled="busy||!plan?.ready" @click="create">Crear borradores seleccionados</button></div>
  </div>
 </FormDialog>
</template>
