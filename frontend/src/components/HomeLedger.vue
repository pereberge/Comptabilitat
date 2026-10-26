<script setup>
import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue';
import {useContext} from '../composables/context.js';
import {useAccess} from '../composables/access.js';
import {api} from '../services/accounting.js';
import {t,errorText} from '../locales/accounting.js';
import {r} from '../locales/reports.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import SubaccountInput from './SubaccountInput.vue';
import EntryDetail from './EntryDetail.vue';
const props=defineProps({exercise:{type:Object,required:true}}),{company}=useContext(),{can}=useAccess();
const accounts=ref([]),accountId=ref(''),result=ref(null),loading=ref(false),error=ref(''),entryId=ref(null),editRequested=ref(false),scroll=ref(null),notice=ref('');let generation=0;
const editable=computed(()=>props.exercise.status==='open'&&can('accounting_write'));
const fullLink=computed(()=>({name:'ledger',query:{company_id:String(company.value.id),exercise_id:String(props.exercise.id),...(result.value?.account?{account_id:String(result.value.account.id)}:{}),from:props.exercise.start_date,to:props.exercise.end_date,exclude_closing:'true',return_to:'/',scroll:'last'}}));
function storageKey(){return 'home-ledger:'+company.value.id+':'+props.exercise.id;}
function fitLedger(){
 const element=scroll.value;if(!element)return;
 const atBottom=element.scrollHeight-element.clientHeight-element.scrollTop<2;
 const height=window.innerWidth<=700?360:Math.max(240,Math.min(650,window.innerHeight-element.getBoundingClientRect().top-24));
 element.style.setProperty('--home-ledger-height',height+'px');if(atBottom)element.scrollTop=element.scrollHeight;
}
async function showLast(){await nextTick();fitLedger();if(scroll.value)scroll.value.scrollTop=scroll.value.scrollHeight;}
window.addEventListener('resize',fitLedger);
async function load(reloadAccounts=false,editedId=null){
 const ticket=++generation;loading.value=true;error.value='';result.value=null;
 try{
  if(reloadAccounts){const rows=await api('/accounts?kind=subaccount');if(ticket!==generation)return;accounts.value=rows;let remembered='';try{remembered=sessionStorage.getItem(storageKey())||'';}catch{}accountId.value=rows.some(account=>String(account.id)===remembered)?remembered:'';}
  const query={company_id:String(company.value.id),exercise_id:String(props.exercise.id),from:props.exercise.start_date,to:props.exercise.end_date,exclude_closing:'true',...(accountId.value?{account_id:String(accountId.value)}:{latest:'true'})};
  const data=await api('/accounting/ledger?'+new URLSearchParams(query));if(ticket!==generation)return;
  result.value=data;accountId.value=data.account?String(data.account.id):'';try{if(data.account)sessionStorage.setItem(storageKey(),accountId.value);}catch{}
  loading.value=false;await showLast();
  if(editedId){const rows=[...(scroll.value?.querySelectorAll('[data-entry-id]')||[])];rows.findLast(row=>row.dataset.entryId===String(editedId))?.scrollIntoView({block:'nearest'});}
 }catch(cause){if(ticket===generation)error.value=errorText(cause);}finally{if(ticket===generation)loading.value=false;}
}
function chooseAccount(id){accountId.value=id;notice.value='';if(id)load();else{generation++;loading.value=false;result.value=null;}}
function openEntry(row,edit=false){entryId.value=row.entry_id;editRequested.value=edit;}
async function saved(entry){notice.value=t.entryUpdated;await load(false,entry.id);}
watch(()=>props.exercise.id,()=>load(true),{immediate:true});onBeforeUnmount(()=>{generation++;window.removeEventListener('resize',fitLedger);});
</script>
<template>
 <section class="panel home-ledger" aria-labelledby="home-ledger-title">
  <header class="home-ledger-heading"><div><h2 id="home-ledger-title">{{ r.ledger }} · {{ exercise.name }}</h2><p class="muted">{{ editable?'Puedes editar los asientos desde sus movimientos.':'Consulta de los movimientos del ejercicio.' }}</p></div><div class="actions"><RouterLink class="button" to="/asientos">{{ t.entries }}</RouterLink><RouterLink class="button" :to="fullLink">Ampliar Mayor</RouterLink></div></header>
  <form class="home-ledger-filters" @submit.prevent="load()"><div class="home-ledger-account"><span class="home-ledger-field-label">{{ t.subaccount }}</span><SubaccountInput v-model="accountId" :accounts="accounts" :label="r.ledger" :disabled="loading" @update:model-value="chooseAccount" /></div><button class="button" :disabled="loading">{{ r.consult }}</button><button type="button" class="button" :disabled="loading||!result?.rows.length" @click="showLast">Último apunte ↓</button><p v-if="result?.account" class="home-ledger-account-name">{{ result.account.code }} · {{ result.account.description }}</p></form>
  <p v-if="notice" class="success-note" role="status">{{ notice }}</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" class="home-ledger-loading" role="status">{{ t.loading }}</p>
  <div v-if="result?.account" ref="scroll" class="home-ledger-scroll" role="region" :aria-label="r.ledger+' · '+result.account.code" tabindex="0">
   <table class="home-ledger-table"><thead><tr><th>{{ r.date }}</th><th>{{ r.entry }}</th><th>{{ r.concept }}</th><th class="amount">{{ r.debit }}</th><th class="amount">{{ r.credit }}</th><th class="amount">{{ r.balance }}</th><th v-if="editable">Editar</th></tr></thead><tbody>
    <tr v-for="row in result.rows" :key="row.id" :data-entry-id="row.entry_id" :class="{'home-ledger-last':row.entry_id===result.rows.at(-1)?.entry_id}"><td>{{ date(row.entry_date) }}</td><td><button class="report-link" @click="openEntry(row)">{{ row.number }}</button></td><td>{{ row.description }}</td><td class="amount">{{ money(row.debit) }}</td><td class="amount">{{ money(row.credit) }}</td><td class="amount">{{ money(row.balance) }}</td><td v-if="editable"><button v-if="row.entry_type==='normal'" class="button home-ledger-edit" :aria-label="t.editEntry+' '+row.number" @click="openEntry(row,true)">Editar</button></td></tr>
    <tr v-if="!result.rows.length"><td :colspan="editable?7:6" class="empty-cell">{{ r.empty }}</td></tr>
   </tbody><tfoot><tr><th colspan="3">{{ r.total }}</th><td class="amount">{{ money(result.totals.debit) }}</td><td class="amount">{{ money(result.totals.credit) }}</td><td class="amount">{{ money(result.totals.closing) }}</td><td v-if="editable"></td></tr></tfoot></table>
  </div>
  <p v-else-if="!loading&&!error" class="empty-cell">{{ result?r.empty:r.choose }}</p>
 </section>
 <EntryDetail v-if="entryId" :entry-id="entryId" allow-edit :edit-on-open="editRequested" @close="entryId=null" @saved="saved" />
</template>
<style scoped>
.home-ledger{margin:20px 0;min-width:0;overflow:hidden}.home-ledger-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px 12px}.home-ledger-heading h2{font-size:18px}.home-ledger-heading .muted{margin-top:5px;font-size:12px}.home-ledger-filters{display:flex;align-items:end;flex-wrap:wrap;gap:10px;padding:0 20px 14px}.home-ledger-account{width:280px;max-width:100%}.home-ledger-field-label{display:block;font-size:12px;color:#65748a;margin-bottom:5px}.home-ledger-account-name{font-size:12px;color:#53647b;align-self:center;flex:1;min-width:180px;overflow-wrap:anywhere}.home-ledger-scroll{height:var(--home-ledger-height,clamp(300px,calc(100dvh - 410px),650px));overflow:auto;overscroll-behavior:contain;border-top:1px solid #e2e7ed}.home-ledger-table{min-width:700px}.home-ledger-table th{position:sticky;top:0;z-index:1}.home-ledger-table tfoot th,.home-ledger-table tfoot td{position:sticky;bottom:0;background:#f0f4f8;border-top:1px solid #cbd5e1;font-weight:600}.home-ledger-table td{padding:9px 12px}.home-ledger-table td:nth-child(3){min-width:220px;overflow-wrap:anywhere}.home-ledger-last{background:var(--primary-soft)}.home-ledger-edit{font-size:11px;padding:5px 9px}.home-ledger-loading,.home-ledger>.success-note{padding:12px 20px}.home-ledger>.notice{margin:0 20px 14px}
@media(max-width:700px){.home-ledger-heading{align-items:flex-start;flex-direction:column;padding:16px}.home-ledger-filters{padding:0 16px 12px}.home-ledger-scroll{height:var(--home-ledger-height,360px)}.home-ledger-account{width:100%}.home-ledger-account-name{flex-basis:100%}}
</style>
