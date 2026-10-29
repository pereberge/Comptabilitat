<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useContext} from '../composables/context.js';
import {api} from '../services/accounting.js';
import {errorText,t} from '../locales/accounting.js';
import {b} from '../locales/balance-sheet.js';
import {p,profitLossTotalLabels} from '../locales/profit-loss.js';
import {exerciseMonths,latestExercise,reportDefaultCutoff,previousExerciseEnd,previousYearDate,previousYearCutoff} from '../../../shared/report-periods.js';
import {reportMoney as money,reportDate as date,downloadCsv} from '../services/report-format.js';
import {profitLossCsv} from '../services/profit-loss-csv.js';
import BalanceSheetNode from '../components/BalanceSheetNode.vue';
import BalanceComparison from '../components/BalanceComparison.vue';
import ProfitLossComparison from '../components/ProfitLossComparison.vue';
import ReportMonthSelect from '../components/ReportMonthSelect.vue';
const {company,exercises,selectedId,selectedExercise,selectExercise}=useContext(),route=useRoute(),router=useRouter();
const from=ref(''),to=ref(''),previousFrom=ref(''),previousTo=ref(''),olderFrom=ref(''),olderTo=ref(''),comparePrevious=ref(true),showThird=ref(false),result=ref(null),loading=ref(false),error=ref(''),loadedQuery=ref(null);
const months=computed(()=>exerciseMonths(selectedExercise.value));
const priorExercise=computed(()=>selectedExercise.value&&exercises.value.find(row=>row.end_date===previousExerciseEnd(selectedExercise.value.start_date)));
const priorMonths=computed(()=>exerciseMonths(priorExercise.value));
const olderExercise=computed(()=>priorExercise.value&&exercises.value.find(row=>row.end_date===previousExerciseEnd(priorExercise.value.start_date)));
const olderMonths=computed(()=>exerciseMonths(olderExercise.value));
const effectiveOlderFrom=computed(()=>olderFrom.value||(from.value===selectedExercise.value?.start_date?olderExercise.value?.start_date:from.value?previousYearDate(previousYearDate(from.value)):''));
const effectiveOlderTo=computed(()=>olderTo.value||(to.value===selectedExercise.value?.end_date?olderExercise.value?.end_date:to.value?previousYearCutoff(previousYearCutoff(to.value)):''));
const olderFromMonth=computed({get:()=>effectiveOlderFrom.value?.slice(0,7),set:value=>{olderFrom.value=olderMonths.value.find(row=>row.value===value).from;}});
const olderToMonth=computed({get:()=>effectiveOlderTo.value?.slice(0,7),set:value=>{olderTo.value=olderMonths.value.find(row=>row.value===value).to;}});
const priorFrom=computed(()=>previousFrom.value||(from.value===selectedExercise.value?.start_date?priorExercise.value?.start_date:from.value?previousYearDate(from.value):''));
const priorTo=computed(()=>previousTo.value||(to.value===selectedExercise.value?.end_date?priorExercise.value?.end_date:to.value?previousYearCutoff(to.value):''));
const fromMonth=computed({get:()=>from.value.slice(0,7),set:value=>{from.value=months.value.find(row=>row.value===value).from;}});
const toMonth=computed({get:()=>to.value.slice(0,7),set:value=>{to.value=months.value.find(row=>row.value===value).to;}});
const previousFromMonth=computed({get:()=>priorFrom.value?.slice(0,7),set:value=>{previousFrom.value=priorMonths.value.find(row=>row.value===value).from;}});
const previousToMonth=computed({get:()=>priorTo.value?.slice(0,7),set:value=>{previousTo.value=priorMonths.value.find(row=>row.value===value).to;}});
let generation=0;
function query(){return {company_id:String(company.value.id),exercise_id:selectedId.value,from:from.value,to:to.value,compare_previous:String(comparePrevious.value),comparison_count:showThird.value?'3':'2',...(comparePrevious.value?{...(previousFrom.value?{previous_from:previousFrom.value}:{}),...(previousTo.value?{previous_to:previousTo.value}:{}),...(showThird.value?{...(olderFrom.value?{older_from:olderFrom.value}:{}),...(olderTo.value?{older_to:olderTo.value}:{})}:{})}:{})};}
const current=computed(()=>result.value&&!loading.value&&JSON.stringify(loadedQuery.value)===JSON.stringify(query()));
const historicalPeriods=computed(()=>result.value?.comparison?.multiple?.periods.slice(1)||(result.value?.comparison?[result.value.comparison.available?{available:true,sheet:result.value.comparison.previous}:result.value.comparison]:[]));
const diagnosticSheets=computed(()=>result.value?[result.value,...historicalPeriods.value.filter(period=>period.available).map(period=>period.sheet)].filter(sheet=>!sheet.checks.complete):[]);
async function load(){
 const ticket=++generation;result.value=null;error.value='';if(!selectedExercise.value){loading.value=false;return;}
 loading.value=true;const q=query();
 try{const data=await api('/accounting/profit-loss?'+new URLSearchParams(q));if(ticket===generation){result.value=data;loadedQuery.value=q;}}
 catch(e){if(ticket===generation)error.value=['INVALID_REPORT_FILTER','INVALID_DATE','DATE_OUTSIDE_EXERCISE'].includes(e.code)?p.invalid:errorText(e);}
 finally{if(ticket===generation)loading.value=false;}
}
async function consult(){if(from.value>to.value||comparePrevious.value&&(priorExercise.value&&priorFrom.value>priorTo.value||showThird.value&&olderExercise.value&&effectiveOlderFrom.value>effectiveOlderTo.value)){error.value=p.invalid;return;}const q=query();if(JSON.stringify(q)===JSON.stringify(route.query))await load();else await router.push({name:'profitLoss',query:q});}
async function toggleComparison(){comparePrevious.value=!comparePrevious.value;await consult();}
async function toggleThird(event){if(event.currentTarget.form.reportValidity())await consult();}
// Report links restore manual filters and the optional third exercise.
watch(()=>route.fullPath,()=>{
 if(route.name!=='profitLoss')return;
 const q=route.query;
 const exercise=['2','3'].includes(q.comparison_count)&&q.company_id===String(company.value.id)&&exercises.value.find(row=>String(row.id)===q.exercise_id)||selectedExercise.value||latestExercise(exercises.value);
 if(exercise)selectExercise(String(exercise.id));
},{immediate:true});
watch([()=>route.fullPath,selectedId],([path],previous=[])=>{
 const exercise=selectedExercise.value;if(!exercise){generation++;result.value=null;loading.value=false;return;}
 const q=route.query,valid=['2','3'].includes(q.comparison_count)&&q.company_id===String(company.value.id)&&q.exercise_id===selectedId.value;
 from.value=valid&&typeof q.from==='string'?q.from:exercise.start_date;
 to.value=valid&&typeof q.to==='string'?q.to:reportDefaultCutoff(exercise);
 previousFrom.value=valid&&typeof q.previous_from==='string'?q.previous_from:'';previousTo.value=valid&&typeof q.previous_to==='string'?q.previous_to:'';olderFrom.value=valid&&typeof q.older_from==='string'?q.older_from:'';olderTo.value=valid&&typeof q.older_to==='string'?q.older_to:'';comparePrevious.value=!(valid&&q.compare_previous==='false');if(valid)showThird.value=q.comparison_count==='3';else if(path!==previous[0])showThird.value=false;load();
},{immediate:true});
function ledgerLink(row,sheet=result.value){return {name:'ledger',query:{company_id:String(sheet.company.id),exercise_id:String(sheet.exercise.id),account_id:String(row.id),from:sheet.from,to:sheet.to,exclude_annual:'true',return_to:router.resolve({name:'profitLoss',query:loadedQuery.value}).fullPath}};}
function selectPeriod(event,sheet){if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0)selectExercise(String(sheet.exercise.id));}
function exportCsv(){if(current.value)downloadCsv('perdidas-ganancias-'+result.value.from+'-'+result.value.to+'.csv',profitLossCsv(result.value));}
onBeforeUnmount(()=>generation++);
</script>
<template>
 <div class="page-heading"><div><h1>{{ p.title }}</h1><p class="muted">{{ company.name }} · {{ selectedExercise?.name }} · {{ p.model }}</p></div><button class="button" :disabled="!current" @click="exportCsv">{{ b.export }}</button></div>
 <p v-if="!selectedExercise" class="notice">{{ t.noExercise }}</p>
 <form v-else class="filters report-filters profit-filters" @submit.prevent="consult">
  <div class="profit-period" role="group" :aria-label="selectedExercise.name">
   <ReportMonthSelect v-model="fromMonth" :months="months" label="Desde" :aria-label="p.from" />
   <ReportMonthSelect v-model="toMonth" :months="months" label="Hasta" :aria-label="p.to" />
  </div>
  <div v-if="comparePrevious&&priorExercise" class="profit-period" role="group" :aria-label="priorExercise.name">
   <ReportMonthSelect v-model="previousFromMonth" :months="priorMonths" label="Desde" :aria-label="p.previousFrom" />
   <ReportMonthSelect v-model="previousToMonth" :months="priorMonths" label="Hasta" :aria-label="p.previousTo" />
  </div>
  <div v-if="comparePrevious&&showThird&&olderExercise" class="profit-period" role="group" :aria-label="olderExercise.name">
   <ReportMonthSelect v-model="olderFromMonth" :months="olderMonths" label="Desde" :aria-label="p.olderFrom" />
   <ReportMonthSelect v-model="olderToMonth" :months="olderMonths" label="Hasta" :aria-label="p.olderTo" />
  </div>
  <div class="profit-filter-actions">
   <button class="button primary" :disabled="loading">{{ b.consult }}</button>
   <button type="button" class="button" :disabled="loading" :aria-pressed="comparePrevious" @click="toggleComparison">{{ comparePrevious?b.hideComparison:b.comparePrevious }}</button>
   <label v-if="comparePrevious" class="profit-third-option"><input v-model="showThird" type="checkbox" :disabled="loading" @change="toggleThird">{{ p.showThird }}</label>
  </div>
 </form>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
 <template v-if="result">
  <p v-if="!current" class="notice" role="status">{{ p.stale }}</p>
  <p class="muted">{{ result.company.name }} · {{ result.exercise.name }} · {{ date(result.from) }} — {{ date(result.to) }} · EUR</p><p class="muted">{{ p.scope }}</p>
  <p v-if="!result.has_activity" class="notice" role="status">{{ p.empty }}</p>
  <template v-for="(period,index) in historicalPeriods" :key="index">
   <p v-if="!period.available" class="notice" role="status">{{ period.reason==='PREVIOUS_EXERCISE_NOT_FOUND'?b.missingPrevious+' '+date(period.expected_end)+'.':b.missingPeriod+' '+(period.exercise?.name||'') }} <RouterLink to="/ejercicios">{{ b.manageExercises }}</RouterLink></p>
   <p v-else-if="!period.sheet.has_activity" class="notice" role="status">{{ period.sheet.exercise.name }} · {{ p.emptyPrevious }}</p>
  </template>
  <ProfitLossComparison v-if="result.comparison?.multiple" :key="JSON.stringify(loadedQuery)" :data="result" :ledger-link="ledgerLink" @select-exercise="selectExercise(String($event))" />
  <BalanceComparison v-else-if="result.comparison?.available" :key="JSON.stringify(loadedQuery)" :data="result" :ledger-link="ledgerLink" :total-labels="profitLossTotalLabels" :show-result="false" @select-exercise="selectExercise(String($event))" />
  <section v-else class="panel profit-statement"><BalanceSheetNode v-for="node in result.sections" :key="node.id" :node="node" :ledger-link="ledgerLink" /></section>
  <div v-if="!result.comparison?.multiple&&!result.comparison?.available" class="panel profit-totals"><p v-for="[key,label] in profitLossTotalLabels" :key="key"><strong>{{ label }}</strong><strong>{{ money(result.totals[key]) }} €</strong></p></div>
  <details v-for="sheet in diagnosticSheets" :key="sheet.exercise.id" class="panel profit-diagnostic" open><summary>{{ p.unclassified }} · {{ sheet.exercise.name }}</summary><p class="notice error-notice">{{ p.review }}</p><p>{{ p.unclassifiedHelp }}</p><p v-for="row in sheet.diagnostic.unclassified" :key="row.id"><RouterLink :to="ledgerLink(row,sheet)" @click="selectPeriod($event,sheet)">{{ row.code }} · {{ row.description }}</RouterLink> · {{ money(row.amount) }} €</p></details>
 </template>
</template>
<style scoped>
.profit-filters{gap:14px;margin:16px 0}.profit-period{display:flex;gap:6px}.profit-filter-actions{display:flex;align-items:end;gap:8px;flex-wrap:wrap}.profit-filters+.notice{margin-top:8px}.profit-third-option{flex-direction:row;align-items:center;gap:6px;font-size:12px;min-height:36px;cursor:pointer}.profit-third-option input{min-height:0;width:16px;height:16px;margin:0;accent-color:var(--primary)}
@media(max-width:520px){.profit-filters{gap:8px}.profit-period{gap:4px}.profit-filter-actions{width:100%}}

.profit-statement,.profit-totals,.profit-diagnostic{padding:1.25rem;margin:1.25rem 0}.profit-totals p{display:flex;justify-content:space-between;gap:1rem;font-variant-numeric:tabular-nums}.profit-totals strong:last-child{white-space:nowrap}.profit-diagnostic summary{font-weight:700;cursor:pointer}@media(max-width:600px){.profit-statement{padding:.5rem}.profit-totals p{flex-wrap:wrap}}
</style>
