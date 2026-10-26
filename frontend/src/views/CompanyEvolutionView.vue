<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useAccess} from '../composables/access.js';
import {api} from '../services/accounting.js';
import {errorText,t} from '../locales/accounting.js';
import {evolution as e} from '../locales/company-evolution.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {companyTheme} from '../services/company-theme.js';
import EvolutionChart from '../components/EvolutionChart.vue';
const {user}=useAccess(),result=ref(null),loading=ref(false),error=ref(''),metric=ref('net_equity');
const master=computed(()=>user.value?.role==='master'),metricLabel=computed(()=>metric.value==='net_equity'?e.netEquity:e.profit);
let generation=0;
async function load(){
 const ticket=++generation;result.value=null;error.value='';if(!master.value)return;loading.value=true;
 try{const data=await api('/master/company-evolution',{timeoutMs:30000});if(ticket===generation&&master.value)result.value=data;}
 catch(cause){if(ticket===generation)error.value=errorText(cause);}finally{if(ticket===generation)loading.value=false;}
}
watch(master,allowed=>{if(allowed)load();else{generation++;result.value=null;loading.value=false;}},{immediate:true});
onBeforeUnmount(()=>generation++);
</script>
<template>
 <div class="page-heading"><div><h1>{{ e.title }}</h1><p class="muted">{{ e.subtitle }}</p></div><button v-if="master" class="button" :disabled="loading" @click="load">{{ e.refresh }}</button></div>
 <p v-if="!master" class="notice" role="alert">{{ e.masterOnly }}</p>
 <template v-else>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
  <template v-if="result">
   <div class="evolution-filters"><label>{{ e.metric }}<select v-model="metric" :aria-label="e.metric"><option value="net_equity">{{ e.netEquity }}</option><option value="profit">{{ e.profit }}</option></select></label><p class="muted">{{ e.cutoff }}: {{ date(result.as_of) }} · EUR</p></div>
   <p class="muted evolution-scope">{{ e.scope }} {{ e.currentScope }}</p>
   <p v-if="result.companies.length!==3" class="notice" role="status">{{ e.missingCompanies }}</p>
   <section v-for="company in result.companies" :key="company.id" class="panel evolution-company" :style="companyTheme(company.id)" :aria-labelledby="'evolution-company-'+company.id">
    <header><h2 :id="'evolution-company-'+company.id">{{ company.name }}</h2><span>{{ company.years.length }} {{ e.exercise.toLocaleLowerCase('es') }}s</span></header>
    <EvolutionChart :years="company.years" :metric="metric" :label="metricLabel" :color="companyTheme(company.id)['--primary']" />
    <div class="table-wrap"><table><thead><tr><th scope="col">{{ e.exercise }}</th><th scope="col">{{ e.cutoff }}</th><th scope="col" class="amount">{{ e.netEquity }}</th><th scope="col" class="amount">{{ e.profit }}</th><th scope="col">{{ e.status }}</th></tr></thead><tbody>
     <tr v-for="year in company.years" :key="year.exercise_id" :data-exercise-id="year.exercise_id"><th scope="row">{{ year.name }}</th><td>{{ date(year.cutoff) }}</td><td class="amount">{{ year.net_equity===null?'—':money(year.net_equity)+' €' }}</td><td class="amount" :class="{'evolution-loss':year.profit?.startsWith('-')}">{{ year.profit===null?'—':money(year.profit)+' €' }}</td><td><span v-if="!year.has_activity" class="muted">{{ e.noActivity }}</span><template v-else><span>{{ year.partial?e.partial:year.status==='closed'?e.closed:e.open }}</span><span v-if="year.needs_review" class="evolution-review"> · {{ e.review }}</span></template></td></tr>
     <tr v-if="!company.years.length"><td colspan="5" class="empty-cell">{{ e.noYears }}</td></tr>
    </tbody></table></div>
   </section>
  </template>
 </template>
</template>
<style scoped>
.evolution-filters{display:flex;gap:20px;align-items:end;flex-wrap:wrap;margin:12px 0}.evolution-filters select{min-width:220px}.evolution-scope{font-size:12px;line-height:1.7;margin-bottom:24px;max-width:1000px}.evolution-company{margin:24px 0;min-width:0;overflow:hidden;border-top:3px solid var(--primary)}.evolution-company>header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:20px;flex-wrap:wrap}.evolution-company h2{font-size:17px;overflow-wrap:anywhere}.evolution-company header>span{font-size:12px;color:#6c7b8f}.evolution-company table{min-width:670px}.evolution-company tbody th{background:transparent;font-size:13px;color:inherit}.evolution-loss{color:#a0382d}.evolution-review{color:#8c5d17}.evolution-company td:last-child{font-size:12px}
@media(max-width:520px){.evolution-company>header{padding:16px}.evolution-company h2{font-size:16px}.evolution-filters label,.evolution-filters select{width:100%}}
</style>
