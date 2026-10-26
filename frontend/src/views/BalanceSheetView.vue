<script setup>
import { computed,onBeforeUnmount,ref,watch } from 'vue';
import { useRoute,useRouter } from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { errorText,t } from '../locales/accounting.js';
import { b } from '../locales/balance-sheet.js';
import { reportMoney as money,reportDate as date,downloadCsv } from '../services/report-format.js';
import { balanceSheetCsv } from '../services/balance-sheet-csv.js';
import { balanceDetailSections } from '../services/balance-detail.js';
import {exerciseMonths,latestExercise,reportDefaultCutoff,previousExerciseEnd,previousYearCutoff} from '../../../shared/report-periods.js';
import BalanceSheetNode from '../components/BalanceSheetNode.vue';
import BalanceComparison from '../components/BalanceComparison.vue';
const {company,exercises,selectExercise,selectedId,selectedExercise}=useContext(),route=useRoute(),router=useRouter();
const previousDay=ref(''),accountDigits=ref(0),loadedDigits=ref(0);
const digitOptions=computed(()=>Array.from({length:Math.max(0,Number(company.value.subaccount_length)-2)},(_,index)=>index+3));
const displayResult=computed(()=>{
 const data=result.value;if(!data)return null;
 return {...data,sections:balanceDetailSections(data.sections,loadedDigits.value),...(data.comparison?.available?{comparison:{...data.comparison,sections:balanceDetailSections(data.comparison.sections,loadedDigits.value)}}:{})};
});
const months=computed(()=>exerciseMonths(selectedExercise.value));
const priorExercise=computed(()=>selectedExercise.value&&exercises.value.find(item=>item.end_date===previousExerciseEnd(selectedExercise.value.start_date)));
const priorMonths=computed(()=>exerciseMonths(priorExercise.value));
const effectivePreviousDay=computed(()=>previousDay.value||(day.value===selectedExercise.value?.end_date?priorExercise.value?.end_date:day.value?previousYearCutoff(day.value):''));
const currentMonth=computed({get:()=>day.value.slice(0,7),set:value=>{day.value=months.value.find(item=>item.value===value).to;}});
const priorMonth=computed({get:()=>effectivePreviousDay.value?.slice(0,7),set:value=>{previousDay.value=priorMonths.value.find(item=>item.value===value).to;}});
const day=ref(''),model=ref('abbreviated'),comparePrevious=ref(true),result=ref(null),loading=ref(false),error=ref('');
let generation=0;
const current=computed(()=>result.value&&result.value.date===day.value&&result.value.model===model.value&&loadedDigits.value===accountDigits.value&&result.value.compare_previous===comparePrevious.value&&(!comparePrevious.value||!result.value.comparison?.available||result.value.comparison.previous.date===effectivePreviousDay.value)&&String(result.value.exercise.id)===selectedId.value);
const diagnostics=computed(()=>result.value&&(!result.value.checks.valid||result.value.diagnostic.warnings.length));
function query(){return {company_id:String(company.value.id),exercise_id:selectedId.value,date:day.value,model:model.value,digits:String(accountDigits.value),compare_previous:String(comparePrevious.value),...(comparePrevious.value&&previousDay.value?{previous_date:previousDay.value}:{})};}
async function load(){
 const ticket=++generation,digits=accountDigits.value;result.value=null;error.value='';
 if(!selectedExercise.value){loading.value=false;return;}
 loading.value=true;
 try{const data=await api('/accounting/balance-sheet?'+new URLSearchParams(query()));if(ticket===generation){result.value=data;loadedDigits.value=digits;}}
 catch(e){if(ticket===generation)error.value=['INVALID_REPORT_FILTER','INVALID_DATE','DATE_OUTSIDE_EXERCISE'].includes(e.code)?b.invalid:errorText(e);}
 finally{if(ticket===generation)loading.value=false;}
}
async function consult(){const q=query();if(JSON.stringify(q)===JSON.stringify(route.query))await load();else await router.push({name:'balanceSheet',query:q});}
async function toggleComparison(event){if(!event.currentTarget.form.reportValidity())return;comparePrevious.value=!comparePrevious.value;await consult();}
// Explicit links restore their period; a fresh report opens on the latest exercise.
watch(()=>route.fullPath,()=>{
 if(route.name!=='balanceSheet')return;
 const q=route.query;
 const exercise=q.company_id===String(company.value.id)&&exercises.value.find(item=>String(item.id)===q.exercise_id)||latestExercise(exercises.value);
 if(exercise)selectExercise(String(exercise.id));
},{immediate:true});
watch([()=>route.fullPath,selectedId],()=>{
 const exercise=selectedExercise.value;
 if(!exercise){generation++;result.value=null;loading.value=false;return;}
 const q=route.query,valid=q.company_id===String(company.value.id)&&q.exercise_id===selectedId.value;
 day.value=valid&&typeof q.date==='string'?q.date:reportDefaultCutoff(exercise);
 accountDigits.value=valid&&digitOptions.value.includes(Number(q.digits))?Number(q.digits):0;
 model.value=valid&&typeof q.model==='string'?q.model:'abbreviated';comparePrevious.value=!(valid&&q.compare_previous==='false');previousDay.value=valid&&typeof q.previous_date==='string'?q.previous_date:'';load();
},{immediate:true});
function ledgerLink(row,data=result.value){const original=result.value;return {name:'ledger',query:{company_id:String(data.company.id),exercise_id:String(data.exercise.id),account_id:String(row.id),from:data.from,to:data.date,exclude_closing:'true',return_to:router.resolve({name:'balanceSheet',query:{company_id:String(original.company.id),exercise_id:String(original.exercise.id),date:original.date,model:original.model,digits:String(loadedDigits.value),compare_previous:String(original.compare_previous),...(original.compare_previous&&original.comparison?.available?{previous_date:original.comparison.previous.date}:{})}}).fullPath}};}
function exportCsv(){if(current.value)downloadCsv('balance-situacion-'+result.value.date+'.csv',balanceSheetCsv(result.value,{digits:loadedDigits.value}));}
onBeforeUnmount(()=>generation++);
</script>
<template>
 <div class="page-heading"><div><h1>{{ b.title }}</h1><p class="muted">{{ company.name }} · {{ selectedExercise?.name }}</p></div><button class="button" :disabled="!current||loading" @click="exportCsv">{{ b.export }}</button></div>
 <p v-if="!selectedExercise" class="notice">{{ t.noExercise }}</p>
 <form v-else class="filters report-filters" @submit.prevent="consult">
  <label>Mes actual<select v-model="currentMonth" aria-label="Mes actual"><option v-for="month in months" :key="month.value" :value="month.value">{{ month.label }}</option></select></label>
  <label v-if="comparePrevious&&priorExercise">Mes comparado<select v-model="priorMonth" aria-label="Mes comparado"><option v-if="!priorMonths.some(item=>item.value===priorMonth)" value="" disabled>Selecciona un mes</option><option v-for="month in priorMonths" :key="month.value" :value="month.value">{{ month.label }}</option></select></label>
  <label>{{ b.date }}<input v-model="day" type="date" :min="selectedExercise.start_date" :max="selectedExercise.end_date" required></label>
  <label>{{ b.model }}<select v-model="model"><option value="abbreviated">{{ b.abbreviated }}</option><option value="normal">{{ b.normal }}</option></select></label>
  <label>{{ b.detail }}<select v-model.number="accountDigits" :aria-label="b.detail"><option :value="0">{{ b.headings }}</option><option v-for="digits in digitOptions" :key="digits" :value="digits">{{ digits }} {{ b.digits }}{{ digits===Number(company.subaccount_length)?' · '+b.subaccounts:'' }}</option></select></label>
  <button class="button primary" :disabled="loading">{{ b.consult }}</button>
  <button type="button" class="button" :aria-pressed="comparePrevious" :disabled="loading" @click="toggleComparison">{{ comparePrevious?b.hideComparison:b.comparePrevious }}</button>
 </form>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
 <template v-if="result">
  <p v-if="!current" class="notice" role="status">{{ b.stale }}</p>
  <p class="muted">{{ result.company.name }} · {{ result.exercise.name }} · {{ date(result.date) }} · {{ b[result.model] }} · EUR</p>
  <p class="muted">{{ b.scope }}</p>
  <p v-if="result.comparison&&!result.comparison.available" role="status" class="notice comparison-notice">{{ result.comparison.reason==='PREVIOUS_EXERCISE_NOT_FOUND'?b.missingPrevious+' '+date(result.comparison.expected_end)+'.':b.missingPeriod }} <RouterLink to="/ejercicios">{{ b.manageExercises }}</RouterLink></p>
  <p v-if="result.comparison?.available&&!result.comparison.has_activity" role="status" class="notice comparison-notice">{{ b.emptyPrevious }}</p>
  <BalanceComparison v-if="result.comparison?.available" :data="displayResult" :account-digits="loadedDigits" side-totals :ledger-link="ledgerLink" @select-exercise="selectExercise(String($event))" />
  <div v-else class="balance-columns">
   <section v-for="side in ['asset','equity_liabilities']" :key="side" class="panel balance-column"><h2>{{ side==='asset'?b.asset:b.equity }}</h2><BalanceSheetNode v-for="node in displayResult.sections.filter(s=>s.side===side)" :key="node.id+':'+loadedDigits" :node="node" :account-digits="loadedDigits" :ledger-link="ledgerLink" /><p class="balance-side-total"><strong>{{ side==='asset'?b.totalAsset:b.totalEquity }}</strong><strong class="amount">{{ money(result.totals[side==='asset'?'assets':'equity_liabilities']) }} €</strong></p></section>
  </div>
  <div v-if="!result.comparison?.available" class="panel balance-totals"><p><strong>{{ b.difference }}</strong><strong>{{ money(result.totals.difference) }} €</strong></p><p v-if="result.generated_result!==undefined"><strong>{{ b.generatedResult }}</strong><strong>{{ money(result.generated_result) }} €</strong></p></div>
  <p v-if="result.generated_result!==undefined" class="muted">{{ b.generatedResultHelp }}</p>
  <p class="notice" :class="{'error-notice':!result.checks.balanced}" role="status">{{ result.checks.balanced?b.balanced:b.unbalanced }} — {{ b.difference }}: {{ money(result.totals.difference) }} €<span v-if="!result.checks.complete"> · {{ b.review }}</span><span v-else-if="result.diagnostic.warnings.length"> · {{ b.observations }}</span></p>
  <details class="panel balance-diagnostic" :open="!!diagnostics"><summary>{{ b.diagnostic }}</summary>
   <p>{{ result.checks.reconciles_trial_balance?b.verified:b.notVerified }}</p>
   <h3>{{ b.result }}: {{ money(result.result.total) }} €</h3><p>{{ b.booked }}: {{ money(result.result.booked_129) }} €</p><p>{{ b.residual }}: {{ money(result.result.residual_6_7) }} €</p><p class="muted">{{ b.resultHelp }}</p>
   <h3 v-if="result.diagnostic.unclassified.length">{{ b.unclassified }}</h3>
   <div v-for="row in result.diagnostic.unclassified" :key="row.id" class="notice"><RouterLink :to="ledgerLink(row)">{{ row.code }} · {{ row.description }}</RouterLink><p>{{ b.signed }}: {{ money(row.signed_balance) }} €</p><p>{{ b.reason[row.reason] }}</p></div>
   <p v-for="(warning,i) in result.diagnostic.warnings" :key="i" class="notice">{{ b.reason[warning.code] }} <RouterLink v-if="warning.account" :to="ledgerLink(warning.account)">{{ warning.account.code }} · {{ money(warning.account.amount) }} €</RouterLink><span v-if="warning.amount"> {{ money(warning.amount) }} €</span></p>
  </details>
  <details v-if="result.comparison?.available" class="panel balance-diagnostic" :open="!result.comparison.previous.checks.valid">
   <summary>{{ b.priorDiagnostic }} · {{ result.comparison.previous.exercise.name }}</summary>
   <p>{{ result.comparison.previous.checks.balanced?b.balanced:b.unbalanced }} · {{ result.comparison.previous.checks.reconciles_trial_balance?b.verified:b.notVerified }}</p>
   <p>{{ b.result }}: {{ money(result.comparison.previous.result.total) }} €</p>
   <h3 v-if="result.comparison.previous.diagnostic.unclassified.length">{{ b.unclassified }}</h3>
   <div v-for="row in result.comparison.previous.diagnostic.unclassified" :key="row.id" class="notice"><RouterLink :to="ledgerLink(row,result.comparison.previous)" @click="selectExercise(String(result.comparison.previous.exercise.id))">{{ row.code }} · {{ row.description }}</RouterLink><p>{{ b.signed }}: {{ money(row.signed_balance) }} €</p><p>{{ b.reason[row.reason] }}</p></div>
   <p v-for="(warning,i) in result.comparison.previous.diagnostic.warnings" :key="i" class="notice">{{ b.reason[warning.code] }} <RouterLink v-if="warning.account" :to="ledgerLink(warning.account,result.comparison.previous)" @click="selectExercise(String(result.comparison.previous.exercise.id))">{{ warning.account.code }} · {{ money(warning.account.amount) }} €</RouterLink><span v-if="warning.amount"> {{ money(warning.amount) }} €</span></p>
  </details>
 </template>
</template>
<style scoped>
.balance-side-total{display:flex;justify-content:space-between;gap:1rem;padding:1rem .65rem;margin:1rem 0 0;border-top:2px solid var(--primary);background:#edf3f7;font-size:.9rem}.balance-side-total .amount{white-space:nowrap}
.comparison-notice{margin:16px 0}.comparison-notice a{display:inline-block;margin-left:8px}
.balance-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.25rem;align-items:start;margin:1.4rem 0}.balance-column{padding:1rem;min-width:0}.balance-column h2{font-size:1rem;letter-spacing:.04em;padding:.5rem;margin-bottom:.8rem}.balance-totals,.balance-diagnostic{padding:1.25rem;margin:1rem 0}.balance-totals p{display:flex;justify-content:space-between;gap:1rem;font-variant-numeric:tabular-nums}.balance-diagnostic>summary{font-weight:700;cursor:pointer}.balance-diagnostic p{overflow-wrap:anywhere}
@media(max-width:1100px){.balance-columns{grid-template-columns:1fr}}@media(max-width:520px){.balance-column{padding:.5rem}.balance-totals p{flex-wrap:wrap}}
</style>
