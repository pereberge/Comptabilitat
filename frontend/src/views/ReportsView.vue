<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { errorText, t } from '../locales/accounting.js';
import { r } from '../locales/reports.js';
import { reportMoney as money, reportDate as date, downloadCsv } from '../services/report-format.js';
import SubaccountInput from '../components/SubaccountInput.vue';
import EntryDetail from '../components/EntryDetail.vue';
const route=useRoute(),router=useRouter();
const {company,selectedId,selectedExercise}=useContext();
const ledger=computed(()=>route.name==='ledger');
const filters=ref({}),accounts=ref([]),result=ref(null),loading=ref(false),error=ref(''),entryId=ref(null),expanded=ref(new Set());
const columns=['opening','debit','credit','debtor','creditor'];
let generation=0;
const exportReady=computed(()=>{
 const data=result.value;if(!data||loading.value||!selectedExercise.value)return false;
 const from=!ledger.value&&filters.value.mode==='accumulated'?selectedExercise.value.start_date:filters.value.from;
 if(data.from!==from||data.to!==filters.value.to)return false;
 return ledger.value?String(data.account.id)===String(filters.value.account_id):data.mode===filters.value.mode&&data.level===filters.value.level&&data.show_empty===filters.value.show_empty;
});
function query(){return {company_id:String(company.value.id),exercise_id:selectedId.value,from:!ledger.value&&filters.value.mode==='accumulated'?selectedExercise.value.start_date:filters.value.from,to:filters.value.to,...(ledger.value?{account_id:String(filters.value.account_id||''),...(route.query.return_to?{return_to:route.query.return_to}:{})}:{mode:filters.value.mode,level:filters.value.level,show_empty:String(filters.value.show_empty)})};}
async function consult(){
 const q=query();
 if(JSON.stringify(route.query)!==JSON.stringify(q)) await router.push({path:route.path,query:q});
 else await load();
}
async function load(){
 const ticket=++generation;result.value=null;error.value='';entryId.value=null;expanded.value=new Set();
 if(!selectedExercise.value)return;
 loading.value=true;
 try{
  if(ledger.value){const data=await api('/accounts?kind=subaccount');if(ticket!==generation)return;accounts.value=data;if(!filters.value.account_id)return;}
  const data=await api('/accounting/'+(ledger.value?'ledger':'trial-balance')+'?'+new URLSearchParams(query()));
  if(ticket===generation)result.value=data;
 }catch(e){if(ticket===generation)error.value=['INVALID_REPORT_FILTER','INVALID_ACCOUNT_HIERARCHY'].includes(e.code)?r.invalid:errorText(e);}
 finally{if(ticket===generation)loading.value=false;}
}
watch([()=>route.fullPath,selectedId],()=>{
 const period=selectedExercise.value;if(!period){result.value=null;generation++;return;}
 const q=route.query;
 const valid=q.exercise_id===selectedId.value&&q.company_id===String(company.value.id);
 filters.value={from:valid&&q.from||period.start_date,to:valid&&q.to||period.end_date,account_id:valid&&q.account_id||'',mode:valid&&q.mode||'accumulated',level:valid&&q.level||'subaccount',show_empty:valid&&q.show_empty==='true'};
 load();
},{immediate:true});
watch(()=>filters.value.mode,mode=>{if(!ledger.value&&mode==='accumulated'&&selectedExercise.value)filters.value.from=selectedExercise.value.start_date;});
function toggle(id){const next=new Set(expanded.value);next.has(id)?next.delete(id):next.add(id);expanded.value=next;}
function ledgerLink(row){return {name:'ledger',query:{company_id:String(result.value.company.id),exercise_id:String(result.value.exercise.id),account_id:String(row.id),from:result.value.from,to:result.value.to,return_to:route.fullPath}};}
function exportCsv(){
 const data=result.value, numeric=value=>({amount:value});
 const rows=[[ledger.value?r.ledger:r.trialBalance],[r.company,data.company.name],[r.exercise,data.exercise.name],[r.from,date(data.from),r.to,date(data.to)],[r.currency]];
 if(ledger.value){
  rows.push([r.code,data.account.code,r.description,data.account.description],[r.opening,numeric(data.totals.opening)],[r.date,r.entry,r.concept,r.debit,r.credit,r.balance]);
  rows.push(...data.rows.map(row=>[date(row.entry_date),row.number,row.description,numeric(row.debit),numeric(row.credit),numeric(row.balance)]));
  rows.push([r.total,'','',numeric(data.totals.debit),numeric(data.totals.credit),numeric(data.totals.closing)]);
 }else{
  rows.push([r.mode,data.mode==='accumulated'?r.accumulated:r.period],[r.level,data.level],[r.showEmpty,String(data.show_empty)], [r.code,r.description,r.initial,r.debit,r.credit,r.debtor,r.creditor]);
  rows.push(...data.rows.map(row=>[row.code,row.description,...columns.map(key=>numeric(row[key]))]));
  rows.push([r.total,'',...columns.map(key=>numeric(data.totals[key]))]);
  rows.push([r.openingDifference,numeric(data.checks.differences.opening)],[r.movementDifference,numeric(data.checks.differences.movements)],[r.closingDifference,numeric(data.checks.differences.closing)]);
 }
 downloadCsv((ledger.value?'mayor':'sumas-saldos')+'.csv',rows);
}
</script>
<template>
 <div class="page-heading"><div><h1>{{ ledger?r.ledger:r.trialBalance }}</h1><p class="muted">{{ r.exercise }}: {{ selectedExercise?.name }} · {{ r.currency }}</p></div><button class="button" :disabled="!exportReady" @click="exportCsv">{{ r.export }}</button></div>
 <RouterLink v-if="ledger&&typeof route.query.return_to==='string'&&(route.query.return_to.startsWith('/sumas-saldos?')||route.query.return_to.startsWith('/balance-situacion?'))" class="button" :to="route.query.return_to">{{ route.query.return_to.startsWith('/balance-situacion?')?'Volver al Balance de Situación':r.back }}</RouterLink>
 <p v-if="!selectedExercise" class="notice">{{ t.noExercise }}</p>
 <form v-else class="filters report-filters" @submit.prevent="consult">
  <SubaccountInput v-if="ledger" :key="route.fullPath+selectedId" v-model="filters.account_id" :accounts="accounts" :label="t.subaccount" :disabled="loading" />
  <label v-if="!ledger">{{ r.mode }}<select v-model="filters.mode"><option value="accumulated">{{ r.accumulated }}</option><option value="period">{{ r.period }}</option></select></label>
  <label>{{ r.from }}<input v-model="filters.from" type="date" :disabled="!ledger&&filters.mode==='accumulated'" :min="selectedExercise.start_date" :max="selectedExercise.end_date" required></label>
  <label>{{ r.to }}<input v-model="filters.to" type="date" :min="selectedExercise.start_date" :max="selectedExercise.end_date" required></label>
  <label v-if="!ledger">{{ r.level }}<select v-model="filters.level"><option value="subaccount">{{ r.subaccounts }} ({{ company.subaccount_length }})</option><option value="3">{{ r.accounts }}</option><option value="2">{{ r.subgroups }}</option><option value="1">{{ r.groups }}</option></select></label>
  <label v-if="!ledger" class="checkbox-label"><input v-model="filters.show_empty" type="checkbox">{{ r.showEmpty }}</label>
  <button class="button primary" :disabled="loading||(ledger&&!filters.account_id)">{{ r.consult }}</button>
 </form>
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
 <p v-if="ledger&&!result&&!loading&&!error" class="notice">{{ r.choose }}</p>
 <template v-if="result">
  <p class="muted report-caption">{{ result.company.name }} · {{ result.exercise.name }} · {{ date(result.from) }} — {{ date(result.to) }}</p>
  <template v-if="ledger">
   <h2>{{ result.account.code }} · {{ result.account.description }}</h2><p>{{ r.opening }}: {{ money(result.totals.opening) }} EUR</p>
   <div class="table-wrap panel"><table><thead><tr><th>{{ r.date }}</th><th>{{ r.entry }}</th><th>{{ r.concept }}</th><th class="amount">{{ r.debit }}</th><th class="amount">{{ r.credit }}</th><th class="amount">{{ r.balance }}</th></tr></thead><tbody>
    <tr v-for="row in result.rows" :key="row.id"><td>{{ date(row.entry_date) }}</td><td><button class="report-link" @click="entryId=row.entry_id">{{ row.number }}</button></td><td>{{ row.description }}</td><td class="amount">{{ money(row.debit) }}</td><td class="amount">{{ money(row.credit) }}</td><td class="amount">{{ money(row.balance) }}</td></tr>
    <tr v-if="!result.rows.length"><td colspan="6" class="empty-cell">{{ r.empty }}</td></tr>
   </tbody><tfoot><tr><th colspan="3">{{ r.total }}</th><th class="amount">{{ money(result.totals.debit) }}</th><th class="amount">{{ money(result.totals.credit) }}</th><th class="amount">{{ money(result.totals.closing) }}</th></tr></tfoot></table></div>
   <div class="entry-totals"><span v-for="key in ['opening','debit','credit','closing']" :key="key">{{ r[key] }}<strong>{{ money(result.totals[key]) }} EUR</strong></span></div>
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
 <EntryDetail v-if="entryId" :entry-id="entryId" @close="entryId=null" />
</template>
