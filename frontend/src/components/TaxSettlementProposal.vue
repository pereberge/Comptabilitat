<script setup>
import {onBeforeUnmount,ref,watch} from 'vue';
import {api} from '../services/accounting.js';
import {reportMoney as money,reportDate as date,downloadCsv} from '../services/report-format.js';
import {tax} from '../locales/tax.js';
import {errorText} from '../locales/accounting.js';
const props=defineProps({model:{type:Object,required:true},disabled:Boolean});
defineEmits(['entry','close']);
const proposal=ref(null),selected=ref({}),busy=ref(false),error=ref('');let generation=0;
watch(()=>props.model,model=>{generation++;proposal.value=model.settlement_proposal;selected.value={'4700':proposal.value?.selected_accounts['4700']||'','4750':proposal.value?.selected_accounts['4750']||''};busy.value=false;error.value='';},{immediate:true});
async function selectAccount(){
 const ticket=++generation;busy.value=true;error.value='';
 try{
  const model=props.model,query=new URLSearchParams({year:String(model.period.year),frequency:model.period.frequency,period:String(model.period.period)});
  const accounts={};if(selected.value['4700'])accounts.receivable_account_id=Number(selected.value['4700']);if(selected.value['4750'])accounts.payable_account_id=Number(selected.value['4750']);
  const result=await api('/tax/vat/settlement-preview?'+query,{method:'POST',body:{input:model.input,model_hash:model.model_hash,accounts},timeoutMs:45000});
  if(ticket===generation)proposal.value=result;
 }catch(cause){if(ticket===generation)error.value=tax.errors[cause.code]||errorText(cause);}
 finally{if(ticket===generation)busy.value=false;}
}
function exportCsv(){
 const data=proposal.value,amount=value=>({amount:value}),rows=[['Propuesta de liquidación IVA',data.ready?'Revisada':'Pendiente de revisión'],['Empresa',props.model.company.name],['Ejercicio fiscal',props.model.period.year,'Período',props.model.period.code],['Fecha',data.date],['Concepto',data.description],[],['Cuenta','Descripción','Debe','Haber']];
 rows.push(...data.lines.map(line=>[line.code,line.account_name,amount(line.debit),amount(line.credit)]),['Total','',amount(data.totals.debit),amount(data.totals.credit)]);
 if(data.issues.length)rows.push([],['Revisiones pendientes'],...data.issues.map(issue=>[issue.message]));
 downloadCsv('propuesta-liquidacion-iva-'+props.model.period.year+'-'+props.model.period.code+'.csv',rows);
}
onBeforeUnmount(()=>generation++);
</script>
<template>
 <section v-if="proposal" id="vat-settlement" class="panel tax-settlement-proposal tax-controls" aria-label="Propuesta de asiento de liquidación de IVA">
  <div class="tax-detail-heading"><div><h2>Propuesta de asiento de liquidación de IVA</h2><p class="muted">{{ model.company.name }} · {{ model.period.year }} · {{ model.period.code }} · Fecha: {{ date(proposal.date) }}</p></div><div class="actions"><button class="button" :disabled="busy||disabled||!proposal.lines.length" @click="exportCsv">Descargar propuesta CSV</button><button class="button" @click="$emit('close')">Cerrar propuesta</button></div></div>
  <p class="tax-proposal-description">{{ proposal.description }}<span v-if="proposal.exercise"> · {{ proposal.exercise.name }}</span></p>
  <p v-if="disabled" class="notice">Recalcula el modelo para actualizar esta propuesta.</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <div class="table-wrap"><table class="tax-settlement-comparison"><thead><tr><th>Cuotas del período</th><th class="amount">Contabilidad</th><th class="amount">Modelo 303</th><th class="amount">Diferencia</th></tr></thead><tbody><tr><td>477 · IVA repercutido</td><td class="amount">{{ money(proposal.comparison.book_output) }}</td><td class="amount">{{ money(proposal.comparison.model_output) }}</td><td class="amount">{{ money(proposal.comparison.output_difference) }}</td></tr><tr><td>472 · IVA soportado</td><td class="amount">{{ money(proposal.comparison.book_input) }}</td><td class="amount">{{ money(proposal.comparison.model_input) }}</td><td class="amount">{{ money(proposal.comparison.input_difference) }}</td></tr></tbody></table></div>
  <ul v-if="proposal.issues.length" class="notice tax-warning tax-proposal-issues"><li v-for="issue in proposal.issues" :key="issue.code">{{ issue.message }}</li></ul>
  <div v-if="proposal.existing_settlements.length" class="actions"><button v-for="entry in proposal.existing_settlements" :key="entry.entry_id" class="button" @click="$emit('entry',entry.entry_id)">Ver liquidación existente · {{ entry.number }} · {{ date(entry.date) }}</button></div>
  <div v-if="proposal.required_accounts.length" class="tax-proposal-accounts"><label v-for="family in proposal.required_accounts" :key="family">{{ family==='4750'?'4750 · Cuenta de IVA a ingresar':'4700 · Cuenta de IVA a compensar' }}<select v-model="selected[family]" :aria-label="'Subcuenta '+family+' de IVA'" :disabled="busy||disabled||!proposal.account_candidates[family].some(account=>account.eligible)" @change="selectAccount"><option value="" disabled>Selecciona una subcuenta de IVA</option><option v-for="account in proposal.account_candidates[family].filter(account=>account.eligible)" :key="account.id" :value="account.id">{{ account.code }} · {{ account.description }}</option></select></label></div>
  <p v-if="proposal.empty" class="notice">No hay cuotas netas de IVA que liquidar en este período.</p>
  <template v-if="proposal.lines.length"><div class="table-wrap"><table class="tax-proposal-lines"><thead><tr><th>Subcuenta</th><th>Descripción</th><th class="amount">Debe</th><th class="amount">Haber</th></tr></thead><tbody><tr v-for="(line,index) in proposal.lines" :key="index"><td class="account-code">{{ line.code }}<small v-if="line.account_missing" class="tax-source">Subcuenta pendiente</small></td><td>{{ line.account_name }}<small class="tax-source">{{ line.description }}</small></td><td class="amount">{{ money(line.debit) }}</td><td class="amount">{{ money(line.credit) }}</td></tr></tbody><tfoot><tr><th colspan="2">Total</th><th class="amount">{{ money(proposal.totals.debit) }}</th><th class="amount">{{ money(proposal.totals.credit) }}</th></tr></tfoot></table></div><p :class="proposal.ready?'success-note':'muted'">{{ proposal.ready?'Propuesta cuadrada con el modelo y las subcuentas disponibles. Revísala antes de contabilizar.':'Propuesta pendiente de las revisiones indicadas.' }}</p></template>
  <p class="muted">Compensación anterior aplicada: {{ money(proposal.compensation) }} € · Resultado del modelo: {{ money(proposal.result) }} €. La propuesta muestra la liquidación; el pago o la devolución se registran en su movimiento bancario.</p>
 </section>
</template>
