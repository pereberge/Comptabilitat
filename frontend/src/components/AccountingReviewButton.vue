<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { reportMoney as money, reportDate as date, downloadCsv } from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
import EntryDetail from './EntryDetail.vue';
defineProps({disabled:Boolean});
const {company,selectedId,selectedExercise,loading:contextLoading}=useContext(),route=useRoute();
const open=ref(false),loading=ref(false),error=ref(''),report=ref(null),filter=ref('all'),category=ref('all'),limit=ref(30),entryId=ref(null);
const labels={error:'Error',review:'A revisar',improvement:'Mejora'};
const categories={journal:'Asientos',accounts:'Cuentas contables',annual:'Apertura y cierre',taxes:'IVA e impuestos',banks:'Bancos',portfolio:'Facturas y cartera',company:'Datos de empresa'};
const filtered=computed(()=>report.value?.findings.filter(row=>(filter.value==='all'||row.severity===filter.value)&&(category.value==='all'||row.category===category.value))||[]);
const visible=computed(()=>filtered.value.slice(0,limit.value));
let generation=0;
function close(){generation++;open.value=false;entryId.value=null;report.value=null;loading.value=false;}
async function review(){
 const ticket=++generation,companyId=company.value?.id,exerciseId=selectedId.value;
 if(!companyId||!exerciseId)return;
 open.value=true;loading.value=true;error.value='';report.value=null;entryId.value=null;
 try{
  const data=await api('/accounting/review?'+new URLSearchParams({exercise_id:exerciseId}),{timeoutMs:60000});
  if(ticket===generation&&data.company.id===companyId&&String(data.exercise.id)===selectedId.value)report.value=data;
 }catch(e){if(ticket===generation)error.value=e.code==='EXERCISE_NOT_FOUND'?'El ejercicio ya no está disponible para esta empresa.':'No se ha podido completar la revisión. Comprueba la conexión y vuelve a intentarlo.';}
 finally{if(ticket===generation)loading.value=false;}
}
watch([()=>company.value?.id,selectedId],close);
watch([filter,category],()=>{limit.value=30;});
onBeforeUnmount(()=>{generation++;});
function accountLink(account,finding){return {name:'ledger',query:{company_id:String(report.value.company.id),exercise_id:String(report.value.exercise.id),account_id:String(account.id),from:finding.from||report.value.scope.from,to:finding.to||report.value.scope.to,exclude_closing:'true',return_to:route.fullPath}};}
function exportCsv(){
 const data=report.value,numeric=value=>({amount:value});
 const rows=[['REVISIÓN CONTABLE'],['Empresa',data.company.name],['Ejercicio',data.exercise.name],['Consulta',date(data.as_of)],
  ['Período',date(data.scope.from),date(data.scope.to)],['Asientos contabilizados',data.summary.posted_entries],['Asientos anulados excluidos',data.summary.cancelled_entries],
  ['Debe',numeric(data.summary.debit),'Haber',numeric(data.summary.credit),'Diferencia',numeric(data.summary.difference)],
  ['Revisión de consulta; las observaciones necesitan contraste con los justificantes'],
  ['Prioridad','Área','Observación','Motivo','Propuesta','Importe de referencia','Cuentas','Asientos','Referencia']];
 for(const finding of data.findings)rows.push([labels[finding.severity],categories[finding.category],finding.title,finding.detail,finding.suggestion,
  finding.amount!==undefined?numeric(finding.amount):'',finding.accounts.map(row=>row.code).join(', '),finding.entries.map(row=>row.number+' ('+date(row.date)+')').join(', '),finding.reference||'']);
 downloadCsv('revision-contable-'+data.company.id+'-'+data.exercise.name+'.csv',rows);
}
</script>

<template>
 <button class="button" :disabled="disabled||contextLoading||!selectedExercise" @click="review">Revisar contabilidad</button>
 <FormDialog v-if="open" class="accounting-review-dialog" title="Revisión contable" @close="close">
  <p class="review-context"><strong>{{ company?.name }}</strong> · Ejercicio {{ selectedExercise?.name }}</p>
  <p v-if="loading" role="status">Revisando asientos, cuentas, IVA, bancos y cartera…</p>
  <div v-if="error" class="notice error-notice" role="alert"><p>{{ error }}</p><button class="button" @click="review">Volver a intentar</button></div>
  <template v-if="report">
   <p class="muted">Consulta del {{ date(report.as_of) }} · {{ date(report.scope.from) }} a {{ date(report.scope.to) }}.</p>
   <p class="muted">{{ report.summary.posted_entries }} asientos contabilizados · {{ report.summary.cancelled_entries }} anulados excluidos · {{ report.summary.active_accounts }} subcuentas con movimientos. Se revisa también el plan de cuentas común de la empresa.</p>
   <p v-if="!report.summary.posted_entries" class="notice review-notice">Este ejercicio no tiene asientos contabilizados. La revisión del plan de cuentas y de las demás áreas sigue disponible.</p>
   <p v-else-if="!report.summary.errors" class="success-note">Sin errores detectados en las comprobaciones automáticas. Revisa también las observaciones y las propuestas de mejora.</p>
   <div class="review-summary">
    <button type="button" :class="{'is-selected':filter==='error'}" :aria-pressed="filter==='error'" @click="filter=filter==='error'?'all':'error'"><span>Errores</span><strong>{{ report.summary.errors }}</strong></button>
    <button type="button" :class="{'is-selected':filter==='review'}" :aria-pressed="filter==='review'" @click="filter=filter==='review'?'all':'review'"><span>A revisar</span><strong>{{ report.summary.review }}</strong></button>
    <button type="button" :class="{'is-selected':filter==='improvement'}" :aria-pressed="filter==='improvement'" @click="filter=filter==='improvement'?'all':'improvement'"><span>Mejoras de cuentas y datos</span><strong>{{ report.summary.improvements }}</strong></button>
   </div>
   <div class="review-controls"><button class="button" :aria-pressed="filter==='all'" @click="filter='all';category='all'">Ver todas</button>
    <label>Área<select v-model="category"><option value="all">Todas las áreas</option><option v-for="(label,key) in categories" :key="key" :value="key">{{ label }}</option></select></label>
    <button class="button" @click="review">Repetir revisión</button><button class="button" @click="exportCsv">Exportar revisión CSV</button>
   </div>
   <p class="muted review-totals">Debe: {{ money(report.summary.debit) }} € · Haber: {{ money(report.summary.credit) }} € · Diferencia: {{ money(report.summary.difference) }} €.</p>
   <p v-if="!filtered.length" class="notice review-notice" role="status">{{ report.findings.length?'No hay observaciones con este filtro.':'No se han encontrado incidencias en las comprobaciones realizadas.' }}</p>
   <div class="review-findings" aria-live="polite">
    <article v-for="finding in visible" :key="finding.id" class="panel review-finding" :class="'review-'+finding.severity">
     <div class="review-finding-heading"><span class="review-severity">{{ labels[finding.severity] }}</span><span class="muted">{{ categories[finding.category] }}</span></div>
     <h3>{{ finding.title }}</h3><p>{{ finding.detail }}</p>
     <p v-if="finding.amount!==undefined" class="review-amount">Saldo o importe a contrastar: <strong>{{ money(finding.amount) }} €</strong>.</p>
     <p><strong>Propuesta:</strong> {{ finding.suggestion }}</p>
     <div v-if="finding.accounts.length||finding.entries.length" class="review-evidence">
      <RouterLink v-for="account in finding.accounts" :key="account.id" :to="accountLink(account,finding)" :title="account.description" @click="close">Mayor {{ account.code }}</RouterLink>
      <button v-for="entry in finding.entries" :key="entry.id" class="report-link" @click="entryId=entry.id">Asiento {{ entry.number }} · {{ date(entry.date) }}</button>
      <span v-if="finding.count>12" class="muted">Se muestran hasta 12 referencias de {{ finding.count }}.</span>
     </div>
     <div class="review-evidence"><RouterLink v-if="finding.category==='annual'" to="/ejercicios" @click="close">Ver operaciones del ejercicio</RouterLink>
      <RouterLink v-if="finding.category==='banks'" to="/conciliacion-bancaria" @click="close">Ver conciliaciones bancarias</RouterLink>
      <RouterLink v-if="finding.category==='portfolio'" to="/cartera" @click="close">Ver cartera</RouterLink>
      <RouterLink v-if="finding.category==='company'" to="/empresas" @click="close">Ver datos de empresa</RouterLink>
      <a v-if="finding.reference" :href="finding.reference" target="_blank" rel="noopener noreferrer">Referencia: PGC del BOE</a></div>
    </article>
   </div>
   <button v-if="filtered.length>limit" class="button" @click="limit+=30">Mostrar más observaciones ({{ visible.length }}/{{ filtered.length }})</button>
   <details class="review-scope"><summary>Qué se ha revisado</summary><p>{{ Object.values(categories).join(' · ') }}.</p><p>Se comprueban los apuntes existentes y los datos guardados. Las observaciones sobre clasificación fiscal, anticipos, préstamos o duplicados requieren contrastar los justificantes. La revisión no cambia los datos.</p></details>
  </template>
 </FormDialog>
 <EntryDetail v-if="entryId&&open" :entry-id="entryId" @close="entryId=null" />
</template>

<style scoped>
.review-context{margin-bottom:12px}.accounting-review-dialog .muted{line-height:1.6;margin-bottom:10px}.review-notice{display:block;line-height:1.6}.review-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.review-summary button{border:1px solid #dce4ee;background:#f7f9fc;border-radius:8px;color:#23354c;text-align:left;padding:16px;font:inherit;min-width:0}.review-summary button.is-selected{border-color:var(--primary);box-shadow:0 0 0 1px var(--primary)}.review-summary span{font-size:13px}.review-summary strong{display:block;font-size:26px;margin-top:8px}.review-controls{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;margin:18px 0}.review-controls label{margin:0;min-width:160px}.review-totals{padding:12px;background:#f7f9fc;border-radius:6px}.review-findings{margin-top:18px}.review-finding{padding:20px;margin:14px 0;border-left:4px solid #c79243;overflow-wrap:anywhere}.review-finding.review-error{border-left-color:#b64747}.review-finding.review-improvement{border-left-color:#6685ac}.review-finding-heading{display:flex;align-items:center;gap:12px;margin-bottom:10px}.review-finding-heading .muted{margin:0}.review-severity{font-size:12px;font-weight:600}.review-finding h3{font-size:17px;margin-bottom:10px}.review-finding p{font-size:14px;line-height:1.65;margin:10px 0}.review-evidence{display:flex;gap:10px 18px;flex-wrap:wrap;font-size:13px;margin-top:14px}.review-evidence:empty{display:none}.review-scope{margin:22px 0 0;font-size:13px;line-height:1.6}.review-scope summary{cursor:pointer}.review-scope p{margin-top:10px}
@media(max-width:600px){.review-summary{gap:8px}.review-summary button{padding:10px}.review-summary span{font-size:11px}.review-summary strong{font-size:23px}.review-finding{padding:14px}.review-controls{align-items:stretch}.review-controls label{width:100%}.review-controls .button{flex:1 1 140px}}
</style>
