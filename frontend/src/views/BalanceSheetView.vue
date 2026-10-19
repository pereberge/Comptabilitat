<script setup>
import { computed,ref,watch } from 'vue';
import { useRoute,useRouter } from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { errorText,t } from '../locales/accounting.js';
import { b } from '../locales/balance-sheet.js';
import { reportMoney as money,reportDate as date,downloadCsv } from '../services/report-format.js';
import { balanceSheetCsv } from '../services/balance-sheet-csv.js';
import BalanceSheetNode from '../components/BalanceSheetNode.vue';
const {company,selectedId,selectedExercise}=useContext(),route=useRoute(),router=useRouter();
const day=ref(''),model=ref('abbreviated'),result=ref(null),loading=ref(false),error=ref('');
let generation=0;
const current=computed(()=>result.value&&result.value.date===day.value&&result.value.model===model.value&&String(result.value.exercise.id)===selectedId.value);
const diagnostics=computed(()=>result.value&&(!result.value.checks.valid||result.value.diagnostic.warnings.length));
function query(){return {company_id:String(company.value.id),exercise_id:selectedId.value,date:day.value,model:model.value};}
async function load(){
 const ticket=++generation;result.value=null;error.value='';
 if(!selectedExercise.value){loading.value=false;return;}
 loading.value=true;
 try{const data=await api('/accounting/balance-sheet?'+new URLSearchParams(query()));if(ticket===generation)result.value=data;}
 catch(e){if(ticket===generation)error.value=e.code==='INVALID_REPORT_FILTER'?b.invalid:errorText(e);}
 finally{if(ticket===generation)loading.value=false;}
}
async function consult(){const q=query();if(JSON.stringify(q)===JSON.stringify(route.query))await load();else await router.push({name:'balanceSheet',query:q});}
watch([()=>route.fullPath,selectedId],()=>{
 const exercise=selectedExercise.value;
 if(!exercise){generation++;result.value=null;loading.value=false;return;}
 const q=route.query,valid=q.company_id===String(company.value.id)&&q.exercise_id===selectedId.value;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
 day.value=valid&&typeof q.date==='string'?q.date:today>=exercise.start_date&&today<=exercise.end_date?today:exercise.end_date;
 model.value=valid&&typeof q.model==='string'?q.model:'abbreviated';load();
},{immediate:true});
function ledgerLink(row){const data=result.value;return {name:'ledger',query:{company_id:String(data.company.id),exercise_id:String(data.exercise.id),account_id:String(row.id),from:data.from,to:data.date,return_to:router.resolve({name:'balanceSheet',query:{company_id:String(data.company.id),exercise_id:String(data.exercise.id),date:data.date,model:data.model}}).fullPath}};}
function exportCsv(){if(current.value)downloadCsv('balance-situacion-'+result.value.date+'.csv',balanceSheetCsv(result.value));}
</script>
<template>
 <div class="page-heading"><div><h1>{{ b.title }}</h1><p class="muted">{{ company.name }} · {{ selectedExercise?.name }}</p></div><button class="button" :disabled="!current||loading" @click="exportCsv">{{ b.export }}</button></div>
 <p v-if="!selectedExercise" class="notice">{{ t.noExercise }}</p>
 <form v-else class="filters report-filters" @submit.prevent="consult">
  <label>{{ b.date }}<input v-model="day" type="date" :min="selectedExercise.start_date" :max="selectedExercise.end_date" required></label>
  <label>{{ b.model }}<select v-model="model"><option value="abbreviated">{{ b.abbreviated }}</option><option value="normal">{{ b.normal }}</option></select></label>
  <button class="button primary" :disabled="loading">{{ b.consult }}</button>
 </form>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
 <template v-if="result">
  <p v-if="!current" class="notice" role="status">{{ b.stale }}</p>
  <p class="muted">{{ result.company.name }} · {{ result.exercise.name }} · {{ date(result.date) }} · {{ b[result.model] }} · EUR</p>
  <p class="muted">{{ b.scope }}</p>
  <div class="balance-columns">
   <section v-for="side in ['asset','equity_liabilities']" :key="side" class="panel balance-column"><h2>{{ side==='asset'?b.asset:b.equity }}</h2><BalanceSheetNode v-for="node in result.sections.filter(s=>s.side===side)" :key="node.id" :node="node" :ledger-link="ledgerLink" /></section>
  </div>
  <div class="panel balance-totals"><p><strong>{{ b.totalAsset }}</strong><strong>{{ money(result.totals.assets) }} €</strong></p><p><strong>{{ b.totalEquity }}</strong><strong>{{ money(result.totals.equity_liabilities) }} €</strong></p><p><strong>{{ b.difference }}</strong><strong>{{ money(result.totals.difference) }} €</strong></p></div>
  <p class="notice" :class="{'error-notice':!result.checks.balanced}" role="status">{{ result.checks.balanced?b.balanced:b.unbalanced }} — {{ b.difference }}: {{ money(result.totals.difference) }} €<span v-if="!result.checks.complete"> · {{ b.review }}</span><span v-else-if="result.diagnostic.warnings.length"> · {{ b.observations }}</span></p>
  <details class="panel balance-diagnostic" :open="!!diagnostics"><summary>{{ b.diagnostic }}</summary>
   <p>{{ result.checks.reconciles_trial_balance?b.verified:b.notVerified }}</p>
   <h3>{{ b.result }}: {{ money(result.result.total) }} €</h3><p>{{ b.booked }}: {{ money(result.result.booked_129) }} €</p><p>{{ b.residual }}: {{ money(result.result.residual_6_7) }} €</p><p class="muted">{{ b.resultHelp }}</p>
   <h3 v-if="result.diagnostic.unclassified.length">{{ b.unclassified }}</h3>
   <div v-for="row in result.diagnostic.unclassified" :key="row.id" class="notice"><RouterLink :to="ledgerLink(row)">{{ row.code }} · {{ row.description }}</RouterLink><p>{{ b.signed }}: {{ money(row.signed_balance) }} €</p><p>{{ b.reason[row.reason] }}</p></div>
   <p v-for="(warning,i) in result.diagnostic.warnings" :key="i" class="notice">{{ b.reason[warning.code] }} <RouterLink v-if="warning.account" :to="ledgerLink(warning.account)">{{ warning.account.code }} · {{ money(warning.account.amount) }} €</RouterLink><span v-if="warning.amount"> {{ money(warning.amount) }} €</span></p>
  </details>
 </template>
</template>
<style scoped>
.balance-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.25rem;align-items:start;margin:1.4rem 0}.balance-column{padding:1rem;min-width:0}.balance-column h2{font-size:1rem;letter-spacing:.04em;padding:.5rem;margin-bottom:.8rem}.balance-totals,.balance-diagnostic{padding:1.25rem;margin:1rem 0}.balance-totals p{display:flex;justify-content:space-between;gap:1rem;font-variant-numeric:tabular-nums}.balance-diagnostic>summary{font-weight:700;cursor:pointer}.balance-diagnostic p{overflow-wrap:anywhere}
@media(max-width:1100px){.balance-columns{grid-template-columns:1fr}}@media(max-width:520px){.balance-column{padding:.5rem}.balance-totals p{flex-wrap:wrap}}
</style>
