<script setup>
import {emptyPayrollInput} from '../../../shared/payroll.js';
import {payrollManualLabels} from '../locales/payroll.js';
const props=defineProps({profile:{type:Object,required:true}});
function enable(event){if(!event.target.checked){props.profile.monthly_template=null;return;}const now=new Date(),year=now.getFullYear(),month=now.getMonth()+1;props.profile.monthly_template={source_period:year+'-'+String(month).padStart(2,'0'),input:emptyPayrollInput({...props.profile,monthly_template:null},year,month)};}
function optional(key,value){if(value==='')delete props.profile.monthly_template.input[key];else props.profile.monthly_template.input[key]=value;}
function addConcept(){props.profile.monthly_template.input.earnings.push({id:crypto.randomUUID(),description:'',amount:'0.00'});}
</script>
<template>
 <section class="payroll-form">
  <h3>Datos económicos mensuales</h3>
  <label class="checkbox-label"><input type="checkbox" :checked="!!profile.monthly_template" @change="enable" />Guardar complementos y bases para las nuevas nóminas mensuales.</label>
  <template v-if="profile.monthly_template">
   <p class="payroll-help">Estos importes se copiarán tanto al crear una nómina como al crear todas en grupo. El salario base, el complemento personal y el porcentaje de IRPF se toman de la ficha. Revisa las incidencias de cada mes antes de contabilizar.</p>
   <div class="payroll-fields">
    <label>Mes de referencia económica<input v-model="profile.monthly_template.source_period" type="month" required /></label>
    <label>Cálculo de las nuevas nóminas<select v-model="profile.monthly_template.input.mode" aria-label="Cálculo de las nuevas nóminas"><option value="general_2026">Cálculo ordinario 2026</option><option value="reviewed">Bases y cuotas del documento de referencia</option></select></label>
   </div>
   <div class="table-wrap"><table><thead><tr><th>Complemento mensual</th><th>Importe (€)</th><th></th></tr></thead><tbody>
    <tr v-for="(row,index) in profile.monthly_template.input.earnings" :key="row.id"><td><input v-model="row.description" :aria-label="'Concepto mensual '+(index+1)" maxlength="160" required /></td><td><input v-model="row.amount" :aria-label="'Importe mensual '+(index+1)" inputmode="decimal" required /></td><td><button type="button" class="button small" @click="profile.monthly_template.input.earnings.splice(index,1)">Quitar concepto</button></td></tr>
   </tbody></table></div>
   <button type="button" class="button small" @click="addConcept">Añadir concepto mensual</button>
   <label class="checkbox-label"><input v-model="profile.monthly_template.input.prorated" type="checkbox" />Calcular además la prorrata salarial de extras de la ficha.</label>
   <p class="payroll-help">Si la paga de beneficios ya está incluida como concepto mensual, evita volver a incluirla mediante la prorrata salarial.</p>
   <template v-if="profile.monthly_template.input.mode==='reviewed'">
    <h3>Bases y cuotas del documento de referencia (€)</h3>
    <p class="payroll-help">Se conservan los importes documentados, incluidos los casos de jornada parcial, horas extra y kilometraje exento. Comprueba que siguen siendo aplicables al mes preparado.</p>
    <div class="payroll-fields">
     <label v-for="(label,key) in payrollManualLabels" :key="key">{{ label }}<input v-model="profile.monthly_template.input.manual[key]" :aria-label="'Referencia · '+label" inputmode="decimal" /></label>
     <label>Prorrata extras para cotización<input :value="profile.monthly_template.input.reviewed_extra_proration??''" inputmode="decimal" @input="optional('reviewed_extra_proration',$event.target.value)" /></label>
     <label>Diferencia de redondeo del resumen<input :value="profile.monthly_template.input.employer_rounding??''" inputmode="decimal" @input="optional('employer_rounding',$event.target.value)" /><small>Admite diferencias positivas o negativas de hasta 1 €.</small></label>
    </div>
   </template>
   <label class="payroll-notes">Origen e incidencias de los importes<textarea v-model="profile.monthly_template.input.notes" rows="4" maxlength="1800"></textarea></label>
  </template>
 </section>
</template>
