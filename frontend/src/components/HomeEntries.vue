<script setup>
import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue';
import {useAccess} from '../composables/access.js';
import {api} from '../services/accounting.js';
import {t,errorText} from '../locales/accounting.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import EntryDetail from './EntryDetail.vue';
import JournalSource from './JournalSource.vue';
const props=defineProps({exercise:{type:Object,required:true}}),{can}=useAccess();
const entries=ref([]),loading=ref(false),error=ref(''),notice=ref(''),entryId=ref(null),scroll=ref(null);
const editable=computed(()=>props.exercise.status==='open'&&can('accounting_write'));
let generation=0;
function fitEntries(){
 const element=scroll.value;if(!element)return;
 const atBottom=element.scrollHeight-element.clientHeight-element.scrollTop<2;
 element.style.maxHeight=Math.max(180,Math.min(650,window.innerHeight-element.getBoundingClientRect().top-24))+'px';
 if(atBottom)element.scrollTop=element.scrollHeight;
}
window.addEventListener('resize',fitEntries);
async function load(){
 const ticket=++generation;loading.value=true;error.value='';entries.value=[];
 try{
  const data=await api('/entries?'+new URLSearchParams({exercise_id:String(props.exercise.id),view:'lines'}));
  if(ticket!==generation)return;
  entries.value=data.sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.number-b.number);
  loading.value=false;await nextTick();
  if(ticket===generation){
   fitEntries();if(scroll.value)scroll.value.scrollTop=scroll.value.scrollHeight;
   if(entries.value.length)scroll.value?.querySelector('tbody tr:last-child')?.scrollIntoView({block:'nearest',inline:'nearest'});
  }
 }catch(cause){if(ticket===generation)error.value=errorText(cause);}
 finally{if(ticket===generation)loading.value=false;}
}
function openEntry(line){entryId.value=line.entry_id;}
async function saved(){notice.value=t.entryUpdated;await load();}
watch(()=>props.exercise.id,()=>{entryId.value=null;notice.value='';load();},{immediate:true});
onBeforeUnmount(()=>{generation++;window.removeEventListener('resize',fitEntries);});
</script>
<template>
 <section class="panel home-entries" aria-labelledby="home-entries-title">
  <header class="home-entries-heading"><div><h2 id="home-entries-title">{{ t.entries }} · {{ exercise.name }}</h2><p class="muted">{{ editable?t.homeEntriesHelp:t.homeEntriesReadOnly }}</p></div><div class="actions"><button type="button" class="button" :disabled="loading" @click="load">{{ t.retry }}</button><RouterLink class="button" to="/asientos">{{ t.viewAllEntries }}</RouterLink></div></header>
  <p v-if="notice" class="success-note" role="status">{{ notice }}</p>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <p v-if="loading" class="home-entries-loading" role="status">{{ t.loading }}</p>
  <div ref="scroll" class="home-entries-scroll" role="region" :aria-label="t.entries+' · '+exercise.name" :aria-busy="loading" tabindex="0">
   <table class="journal-table home-entries-table"><thead><tr><th>{{ t.date }}</th><th>{{ t.entryNumber }}</th><th>{{ t.account }}</th><th>{{ t.subaccount }}</th><th>{{ t.accountName }}</th><th>{{ t.concept }}</th><th class="amount">{{ t.debit }}</th><th class="amount">{{ t.credit }}</th></tr></thead><tbody>
    <tr v-for="(line,index) in entries" :key="line.id" :data-entry-id="line.entry_id" class="home-entry-row" :class="{'journal-entry-start':index>0&&entries[index-1].entry_id!==line.entry_id,'journal-cancelled':line.status==='cancelled'}" @click="openEntry(line)"><td>{{ date(line.entry_date) }}</td><td><button type="button" class="report-link" :aria-label="(editable?t.editEntry:t.detail)+' '+line.number" @click.stop="openEntry(line)">{{ line.number }}</button><JournalSource :entry="line" /><span v-if="line.status==='cancelled'" class="cancelled-label">Anulado</span></td><td class="account-code">{{ line.account_code }}</td><td class="account-code">{{ line.subaccount_code }}</td><td>{{ line.account_name }}</td><td>{{ line.description }}</td><td class="amount">{{ money(line.debit) }}</td><td class="amount">{{ money(line.credit) }}</td></tr>
    <tr v-if="!entries.length&&!loading&&!error"><td colspan="8" class="empty-cell">{{ t.empty }}</td></tr>
   </tbody></table>
  </div>
 </section>
 <EntryDetail v-if="entryId" :entry-id="entryId" allow-edit :edit-on-open="editable" @close="entryId=null" @saved="saved" />
</template>
<style scoped>
.home-entries{margin:20px 0;min-width:0;overflow:hidden}.home-entries-heading{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px}.home-entries-heading h2{font-size:18px}.home-entries-heading .muted{margin-top:5px;font-size:12px}.home-entries-scroll{max-height:clamp(260px,calc(100dvh - 380px),650px);overflow:auto;overscroll-behavior:contain;border-top:1px solid #e2e7ed}.home-entries-table{min-width:900px}.home-entries-table th{position:sticky;top:0;z-index:1}.home-entries-table td{padding:9px 12px}.home-entries-table td:nth-child(5),.home-entries-table td:nth-child(6){min-width:180px;overflow-wrap:anywhere}.home-entry-row{cursor:pointer}.home-entry-row:hover,.home-entry-row:focus-within{background:var(--primary-soft)}.home-entries-loading,.home-entries>.success-note{padding:12px 20px}.home-entries>.notice{margin:0 20px 14px}
@media(max-width:700px){.home-entries-heading{align-items:flex-start;flex-direction:column;padding:16px}.home-entries-scroll{max-height:360px}}
</style>
