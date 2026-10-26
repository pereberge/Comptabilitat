<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { errorText, t } from '../locales/accounting.js';
import { r } from '../locales/reports.js';
import { reportMoney as money, reportDate as date, downloadCsv } from '../services/report-format.js';
import SubaccountInput from '../components/SubaccountInput.vue';
import EntryDetail from '../components/EntryDetail.vue';
const route=useRoute(),router=useRouter();
const {company,exercises,selectedId,selectedExercise}=useContext();
const ledger=computed(()=>route.name==='ledger');
const filters=ref({}),accounts=ref([]),result=ref(null),loading=ref(false),error=ref(''),entryId=ref(null),expanded=ref(new Set());
const columns=['opening','debit','credit','debtor','creditor'];
const orderedExercises=computed(()=>[...exercises.value].sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.id-b.id));
const multiExercise=computed(()=>ledger.value&&filters.value.multi_exercise);
const dateBounds=computed(()=>multiExercise.value?{
 from:orderedExercises.value.find(row=>String(row.id)===String(filters.value.exercise_from_id))?.start_date,
 to:orderedExercises.value.find(row=>String(row.id)===String(filters.value.exercise_to_id))?.end_date,
}:{from:selectedExercise.value?.start_date,to:selectedExercise.value?.end_date});
const exerciseLabel=computed(()=>result.value?.multi_exercise?result.value.exercises.map(row=>row.name).join(' / '):result.value?.exercise.name);
const ledgerSections=computed(()=>!ledger.value||!result.value?[]:result.value.multi_exercise?result.value.sections:[result.value]);
function updateRange(changed){
 if(multiExercise.value){
  const first=orderedExercises.value.findIndex(row=>String(row.id)===String(filters.value.exercise_from_id));
  const last=orderedExercises.value.findIndex(row=>String(row.id)===String(filters.value.exercise_to_id));
  if(first>last){if(changed==='from')filters.value.exercise_to_id=filters.value.exercise_from_id;else filters.value.exercise_from_id=filters.value.exercise_to_id;}
 }
 filters.value.from=dateBounds.value.from;filters.value.to=dateBounds.value.to;
}
let generation=0;
const exportReady=computed(()=>{
 const data=result.value;if(!data||loading.value||!selectedExercise.value)return false;
 const from=!ledger.value&&filters.value.mode==='accumulated'?selectedExercise.value.start_date:filters.value.from;
 if(data.from!==from||data.to!==filters.value.to)return false;
 if(ledger.value&&data.exclude_annual!==filters.value.exclude_annual)return false;
 if(data.exclude_closing!==filters.value.exclude_closing||String(data.exercise.id)!==selectedId.value||data.company.id!==company.value?.id)return false;
 if(ledger.value&&(!!data.multi_exercise!==!!multiExercise.value||multiExercise.value&&(String(data.exercise_from_id)!==String(filters.value.exercise_from_id)||String(data.exercise_to_id)!==String(filters.value.exercise_to_id))))return false;
 return ledger.value?String(data.account.id)===String(filters.value.account_id):data.mode===filters.value.mode&&data.level===filters.value.level&&data.show_empty===filters.value.show_empty;
});
function query(){return {company_id:String(company.value.id),exercise_id:selectedId.value,from:!ledger.value&&filters.value.mode==='accumulated'?selectedExercise.value.start_date:filters.value.from,to:filters.value.to,exclude_closing:String(filters.value.exclude_closing),...(filters.value.exclude_annual?{exclude_annual:'true'}:{}),...(ledger.value?{account_id:String(filters.value.account_id||''),multi_exercise:String(multiExercise.value),...(multiExercise.value?{exercise_from_id:String(filters.value.exercise_from_id),exercise_to_id:String(filters.value.exercise_to_id)}:{}),...(route.query.return_to?{return_to:route.query.return_to}:{}),...(route.query.scroll==='last'?{scroll:'last'}:{})}:{mode:filters.value.mode,level:filters.value.level,show_empty:String(filters.value.show_empty)})};}
async function consult(){
 const q=query();
 if(JSON.stringify(route.query)!==JSON.stringify(q)) await router.push({path:route.path,query:q});
 else await load();
}
async function load(){
 const ticket=++generation;result.value=null;error.value='';entryId.value=null;expanded.value=new Set();
 if(!selectedExercise.value){loading.value=false;return;}
 loading.value=true;
 try{
  if(ledger.value){const data=await api('/accounts?kind=subaccount');if(ticket!==generation)return;accounts.value=data;if(!filters.value.account_id)return;}
  const data=await api('/accounting/'+(ledger.value?'ledger':'trial-balance')+'?'+new URLSearchParams(query()));
  if(ticket===generation){result.value=data;if(ledger.value&&route.query.scroll==='last'){await nextTick();if(ticket===generation)document.querySelector('.ledger-exercise:last-of-type tbody tr:last-child')?.scrollIntoView({block:'end'});}}
 }catch(e){if(ticket===generation)error.value=['INVALID_REPORT_FILTER','INVALID_ACCOUNT_HIERARCHY','INVALID_ID','DATE_OUTSIDE_EXERCISE','EXERCISE_NOT_FOUND'].includes(e.code)?r.invalid:errorText(e);}
 finally{if(ticket===generation)loading.value=false;}
}
watch([()=>route.fullPath,selectedId],()=>{
 const period=selectedExercise.value;if(!period){result.value=null;loading.value=false;accounts.value=[];generation++;return;}
 const q=route.query;
 const valid=q.exercise_id===selectedId.value&&q.company_id===String(company.value.id);
 const multi=ledger.value&&(!valid||q.multi_exercise==='true'||q.multi_exercise===undefined&&!q.account_id);
 const first=valid&&q.exercise_from_id||String(orderedExercises.value[0]?.id||period.id),last=valid&&q.exercise_to_id||String(orderedExercises.value.at(-1)?.id||period.id);
 const start=multi?orderedExercises.value.find(row=>String(row.id)===first)?.start_date:period.start_date,end=multi?orderedExercises.value.find(row=>String(row.id)===last)?.end_date:period.end_date;
 filters.value={multi_exercise:multi,exercise_from_id:first,exercise_to_id:last,from:valid&&q.from||start,to:valid&&q.to||end,account_id:valid&&q.account_id||'',mode:valid&&q.mode||'accumulated',level:valid&&q.level||'subaccount',show_empty:valid&&q.show_empty==='true',exclude_annual:ledger.value&&valid&&q.exclude_annual==='true',exclude_closing:valid&&q.exclude_closing==='true'};
 load();
},{immediate:true});
watch(()=>filters.value.mode,mode=>{if(!ledger.value&&mode==='accumulated'&&selectedExercise.value)filters.value.from=selectedExercise.value.start_date;});
onBeforeUnmount(()=>generation++);
function toggle(id){const next=new Set(expanded.value);next.has(id)?next.delete(id):next.add(id);expanded.value=next;}
function ledgerLink(row){return {name:'ledger',query:{company_id:String(result.value.company.id),exercise_id:String(result.value.exercise.id),account_id:String(row.id),from:result.value.from,to:result.value.to,exclude_closing:String(result.value.exclude_closing),return_to:route.fullPath}};}
function exportCsv(){
 const data=result.value, numeric=value=>({amount:value});
 const rows=[[ledger.value?r.ledger:r.trialBalance],[r.company,data.company.name],[data.multi_exercise?r.exercises:r.exercise,exerciseLabel.value],[r.from,date(data.from),r.to,date(data.to)],[r.currency]];
 rows.push([r.excludeClosing,String(data.exclude_closing)]);
 if(data.exclude_annual)rows.push(['Excluir apertura, regularización y cierre','true']);
 if(ledger.value){
  rows.push([r.code,data.account.code,r.description,data.account.description]);
  if(data.multi_exercise)rows.push([r.multiExerciseHint]);
  for(const section of ledgerSections.value){
   if(data.multi_exercise)rows.push([],[r.exercise,section.exercise.name],[r.from,date(section.from),r.to,date(section.to)]);
   rows.push([r.opening,numeric(section.totals.opening)],[r.date,r.entry,r.concept,r.debit,r.credit,r.balance]);
   rows.push(...section.rows.map(row=>[date(row.entry_date),row.number,row.description,numeric(row.debit),numeric(row.credit),numeric(row.balance)]));
   rows.push([r.total,'','',numeric(section.totals.debit),numeric(section.totals.credit),numeric(section.totals.closing)]);
  }
 }else{
  rows.push([r.mode,data.mode==='accumulated'?r.accumulated:r.period],[r.level,data.level],[r.showEmpty,String(data.show_empty)], [r.code,r.description,r.initial,r.debit,r.credit,r.debtor,r.creditor]);
  rows.push(...data.rows.map(row=>[row.code,row.description,...columns.map(key=>numeric(row[key]))]));
  rows.push([r.total,'',...columns.map(key=>numeric(data.totals[key]))]);
  rows.push([r.openingDifference,numeric(data.checks.differences.opening)],[r.movementDifference,numeric(data.checks.differences.movements)],[r.closingDifference,numeric(data.checks.differences.closing)]);
 }
 downloadCsv((ledger.value?(data.multi_exercise?'mayor-multiejercicio':'mayor'):'sumas-saldos')+'.csv',rows);
}
</script>
<template>
 <div class="page-heading"><div><h1>{{ ledger?r.ledger:r.trialBalance }}</h1><p class="muted">{{ multiExercise?r.multiExercise:r.exercise+': '+selectedExercise?.name }} · {{ r.currency }}</p></div><button class="button" :disabled="!exportReady" @click="exportCsv">{{ r.export }}</button></div>
 <RouterLink v-if="ledger&&route.query.return_to==='/conciliacion-bancaria'" class="button" to="/conciliacion-bancaria">Volver a la conciliación bancaria</RouterLink>
 <RouterLink v-else-if="ledger&&route.query.return_to==='/'" class="button" to="/">Volver al inicio</RouterLink>
 <RouterLink v-else-if="ledger&&typeof route.query.return_to==='string'&&(route.query.return_to.startsWith('/sumas-saldos?')||route.query.return_to.startsWith('/balance-situacion?'))" class="button" :to="route.query.return_to">{{ route.query.return_to.startsWith('/balance-situacion?')?'Volver al Balance de Situación':r.back }}</RouterLink>
 <RouterLink v-if="ledger&&typeof route.query.return_to==='string'&&route.query.return_to.startsWith('/perdidas-ganancias?')" class="button" :to="route.query.return_to">Volver a Pérdidas y Ganancias</RouterLink>
 <p v-if="ledger&&filters.exclude_annual" class="muted">Se excluyen apertura, regularización y cierre para mostrar los movimientos de Pérdidas y Ganancias.</p>
 <p v-if="!selectedExercise" class="notice">{{ t.noExercise }}</p>
 <form v-else class="filters report-filters" @submit.prevent="consult">
  <SubaccountInput v-if="ledger" :key="route.fullPath+selectedId" v-model="filters.account_id" :accounts="accounts" :label="t.subaccount" :disabled="loading" />
  <label v-if="ledger" class="checkbox-label"><input v-model="filters.multi_exercise" type="checkbox" @change="updateRange">{{ r.multiExercise }}</label>
  <template v-if="multiExercise">
   <label>{{ r.exerciseFrom }}<select v-model="filters.exercise_from_id" :aria-label="r.exerciseFrom" required @change="updateRange('from')"><option v-for="exercise in orderedExercises" :key="exercise.id" :value="String(exercise.id)">{{ exercise.name }}</option></select></label>
   <label>{{ r.exerciseTo }}<select v-model="filters.exercise_to_id" :aria-label="r.exerciseTo" required @change="updateRange('to')"><option v-for="exercise in orderedExercises" :key="exercise.id" :value="String(exercise.id)">{{ exercise.name }}</option></select></label>
  </template>
  <label v-if="!ledger">{{ r.mode }}<select v-model="filters.mode"><option value="accumulated">{{ r.accumulated }}</option><option value="period">{{ r.period }}</option></select></label>
  <label>{{ r.from }}<input v-model="filters.from" type="date" :disabled="!ledger&&filters.mode==='accumulated'" :min="dateBounds.from" :max="dateBounds.to" required></label>
  <label>{{ r.to }}<input v-model="filters.to" type="date" :min="dateBounds.from" :max="dateBounds.to" required></label>
  <label v-if="!ledger">{{ r.level }}<select v-model="filters.level"><option value="subaccount">{{ r.subaccounts }} ({{ company.subaccount_length }})</option><option value="3">{{ r.accounts }}</option><option value="2">{{ r.subgroups }}</option><option value="1">{{ r.groups }}</option></select></label>
  <label v-if="!ledger" class="checkbox-label"><input v-model="filters.show_empty" type="checkbox">{{ r.showEmpty }}</label>
  <label class="checkbox-label"><input v-model="filters.exclude_closing" type="checkbox">{{ r.excludeClosing }}</label>
  <button class="button primary" :disabled="loading||(ledger&&!filters.account_id)">{{ r.consult }}</button>
 </form>
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
 <p v-if="ledger&&!result&&!loading&&!error" class="notice">{{ r.choose }}</p>
 <template v-if="result">
  <p class="muted report-caption">{{ result.company.name }} · {{ exerciseLabel }} · {{ date(result.from) }} — {{ date(result.to) }}</p>
  <template v-if="ledger">
   <h2>{{ result.account.code }} · {{ result.account.description }}</h2>
   <p v-if="result.multi_exercise" class="notice">{{ r.multiExerciseHint }}</p>
   <section v-for="section in ledgerSections" :key="section.exercise.id" class="ledger-exercise" :aria-label="r.exercise+': '+section.exercise.name">
   <h3 v-if="result.multi_exercise">{{ r.exercise }}: {{ section.exercise.name }} · {{ date(section.from) }} — {{ date(section.to) }}</h3>
   <p>{{ r.opening }}: {{ money(section.totals.opening) }} EUR</p>
   <div class="table-wrap panel"><table><thead><tr><th>{{ r.date }}</th><th>{{ r.entry }}</th><th>{{ r.concept }}</th><th class="amount">{{ r.debit }}</th><th class="amount">{{ r.credit }}</th><th class="amount">{{ r.balance }}</th></tr></thead><tbody>
    <tr v-for="row in section.rows" :key="row.id"><td>{{ date(row.entry_date) }}</td><td><button class="report-link" @click="entryId=row.entry_id">{{ row.number }}</button></td><td>{{ row.description }}</td><td class="amount">{{ money(row.debit) }}</td><td class="amount">{{ money(row.credit) }}</td><td class="amount">{{ money(row.balance) }}</td></tr>
    <tr v-if="!section.rows.length"><td colspan="6" class="empty-cell">{{ r.empty }}</td></tr>
   </tbody><tfoot><tr><th colspan="3">{{ r.total }}</th><th class="amount">{{ money(section.totals.debit) }}</th><th class="amount">{{ money(section.totals.credit) }}</th><th class="amount">{{ money(section.totals.closing) }}</th></tr></tfoot></table></div>
   <div class="entry-totals"><span v-for="key in ['opening','debit','credit','closing']" :key="key">{{ r[key] }}<strong>{{ money(section.totals[key]) }} EUR</strong></span></div>
   </section>
  </template>
  <template v-else>
   <p :class="result.checks.balanced?'success-note':'notice error-notice'" role="status">{{ result.checks.balanced?r.balanced:r.warning }}</p>
   <p v-if="!result.checks.balanced" role="alert">{{ r.openingDifference }}: {{ money(result.checks.differences.opening) }} EUR · {{ r.movementDifference }}: {{ money(result.checks.differences.movements) }} EUR · {{ r.closingDifference }}: {{ money(result.checks.differences.closing) }} EUR</p>
   <div class="table-wrap panel"><table><thead><tr><th>{{ r.code }}</th><th>{{ r.description }}</th><th v-for="key in columns" :key="key" class="amount">{{ key==='opening'?r.initial:r[key] }}</th></tr></thead><tbody>
    <template v-for="row in result.rows" :key="row.id"><tr><td><RouterLink v-if="row.kind==='subaccount'" :to="ledgerLink(row)">{{ row.code }}</RouterLink><button v-else class="report-link" :aria-expanded="expanded.has(row.id)" :title="r.details" @click="toggle(row.id)">{{ expanded.has(row.id)?'−':'+' }} {{ row.code }}</button></td><td>{{ row.description }}</td><td v-for="key in columns" :key="key" class="amount">{{ money(row[key]) }}</td></tr>
     <template v-if="row.kind!=='subaccount'&&expanded.has(row.id)"><tr v-for="child in row.children" :key="child.id" class="report-child"><td><RouterLink :to="ledgerLink(child)">{{ child.code }}</RouterLink></td><td>{{ child.description }}</td><td v-for="key in columns" :key="key" class="amount">{{ money(child[key]) }}</td></tr></template>
    </template><tr v-if="!result.rows.length"><td colspan="7" class="empty-cell">{{ t.empty }}</td></tr>
   </tbody><tfoot><tr><th colspan="2">{{ r.total }}</th><th v-for="key in columns" :key="key" class="amount">{{ money(result.totals[key]) }}</th></tr></tfoot></table></div>
  </template>
 </template>
 <EntryDetail v-if="entryId" :entry-id="entryId" :allow-edit="ledger" @close="entryId=null" @saved="load" />
</template>
