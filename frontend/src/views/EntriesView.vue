<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { t,errorText } from '../locales/accounting.js';
import { cents,displayMoney } from '../../../shared/money.js';
import EntryDetail from '../components/EntryDetail.vue';
import JournalSource from '../components/JournalSource.vue';
import SubaccountInput from '../components/SubaccountInput.vue';
import FormDialog from '../components/FormDialog.vue';
import { reportMoney } from '../services/report-format.js';
const {selectedExercise,selectedId}=useContext();
const entries=ref([]),subaccounts=ref([]),loading=ref(false),error=ref(''),notice=ref(''),form=ref(null),busy=ref(false),formError=ref('');
const detailId=ref(null);
const filters=ref({from:'',to:'',number:'',amount:''});
let generation=0,lineKey=0;
const newLine=()=>({key:++lineKey,account_id:'',debit:'',credit:''});
const totals=computed(()=>{let debit=0n,credit=0n;try{for(const line of form.value?.lines||[]){debit+=cents(line.debit||'0');credit+=cents(line.credit||'0');}return {debit,credit,difference:debit-credit,valid:true};}catch{return {debit:0n,credit:0n,difference:0n,valid:false};}});
const canSave=computed(()=>!busy.value&&form.value&&selectedExercise.value?.status==='open'&&String(form.value.exercise_id)===selectedId.value&&totals.value.valid&&totals.value.debit>0n&&totals.value.difference===0n&&form.value.lines.length>=2&&form.value.lines.every(line=>line.account_id));
async function load(){
 const ticket=++generation;entries.value=[];error.value='';
 if(!selectedId.value)return;loading.value=true;
 try{const data=await api('/entries?'+new URLSearchParams({exercise_id:selectedId.value,view:'lines',...filters.value}));if(ticket===generation)entries.value=data;}
 catch(e){if(ticket===generation)error.value=errorText(e);}finally{if(ticket===generation)loading.value=false;}
}
watch(selectedId,()=>{detailId.value=null;filters.value={from:'',to:'',number:'',amount:''};load();},{immediate:true});
async function entrySaved(){notice.value=t.entryUpdated;await load();}
async function open(){
 formError.value='';notice.value='';busy.value=true;
 const period=selectedExercise.value;
 try{
  subaccounts.value=await api('/accounts?kind=subaccount');
  if(selectedExercise.value?.id!==period?.id)return;
  if(subaccounts.value.length<1){error.value=t.noSubaccounts;return;}
  const now=new Date();const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  form.value={exercise_id:period.id,entry_date:today>=period.start_date&&today<=period.end_date?today:period.start_date,description:'',request_id:crypto.randomUUID(),lines:[newLine(),newLine()]};
 }catch(e){error.value=errorText(e);}finally{busy.value=false;}
}
function accountName(accountId){return subaccounts.value.find(account=>String(account.id)===String(accountId))?.description||'';}
function close(){if(!busy.value&&window.confirm(t.confirmDiscard))form.value=null;}
async function save(){
 busy.value=true;formError.value='';
 try{
 const payload={...form.value,lines:form.value.lines.map(({key,...line})=>({...line,description:form.value.description,debit:line.debit||'0',credit:line.credit||'0'}))};
 await api('/entries',{method:'POST',body:payload});
 form.value=null;notice.value=t.successEntry;await load();
 }catch(e){formError.value=errorText(e);}finally{busy.value=false;}
}
function money(value){return reportMoney(value);}
function unload(event){if(form.value){event.preventDefault();event.returnValue='';}}
window.addEventListener('beforeunload',unload);
onBeforeUnmount(()=>{generation++;window.removeEventListener('beforeunload',unload);});
onBeforeRouteLeave(()=>!form.value||(!busy.value&&window.confirm(t.confirmDiscard)));
</script>
<template>
 <div class="page-heading"><div><h1>{{ t.entries }}</h1><p class="muted">{{ t.entryHelp }}</p></div><button class="button primary" :disabled="!can('accounting_write')||(busy||selectedExercise?.status!=='open')" @click="open">{{ t.newEntry }}</button></div>
 <p v-if="!selectedExercise" class="notice">{{ t.noExercise }}</p><p v-else-if="selectedExercise.status==='closed'" class="notice">{{ t.closed }}</p>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p>
 <form class="filters" @submit.prevent="load"><label>{{ t.from }}<input v-model="filters.from" type="date"></label><label>{{ t.to }}<input v-model="filters.to" type="date"></label><label>{{ t.number }}<input v-model="filters.number" type="text" inputmode="numeric" pattern="[0-9]+"></label><label>{{ t.amount }}<input v-model="filters.amount" type="text" inputmode="decimal" placeholder="0,00" maxlength="16" :title="t.amountSearchHelp"></label><button class="button" :disabled="loading||!selectedId">{{ t.filter }}</button></form>
 <p class="muted entry-search-help">{{ t.amountSearchHelp }} {{ t.entryClickHelp }}</p>
 <p v-if="loading" role="status">{{ t.loading }}</p>
 <div v-else class="table-wrap panel"><table class="journal-table"><thead><tr><th>{{ t.date }}</th><th>{{ t.entryNumber }}</th><th>{{ t.account }}</th><th>{{ t.subaccount }}</th><th>{{ t.accountName }}</th><th>{{ t.concept }}</th><th class="amount">{{ t.debit }}</th><th class="amount">{{ t.credit }}</th></tr></thead><tbody>
 <tr v-for="(line,index) in entries" :key="line.id" class="entry-selectable-row" :data-entry-id="line.entry_id" :class="{'journal-entry-start':index>0&&entries[index-1].entry_id!==line.entry_id,'journal-cancelled':line.status==='cancelled'}" @click="detailId=line.entry_id"><td>{{ line.entry_date.split('-').reverse().join('/') }}</td><td><button type="button" class="report-link" @click.stop="detailId=line.entry_id">{{ line.number }}</button><JournalSource :entry="line" /><span v-if="line.status==='cancelled'" class="cancelled-label">Anulado</span></td><td class="account-code">{{ line.account_code }}</td><td class="account-code">{{ line.subaccount_code }}</td><td>{{ line.account_name }}</td><td>{{ line.description }}</td><td class="amount">{{ money(line.debit) }}</td><td class="amount">{{ money(line.credit) }}</td></tr>
 <tr v-if="!entries.length"><td colspan="8" class="empty-cell">{{ t.empty }}</td></tr>
 </tbody></table></div>
 <FormDialog v-if="form" :title="t.newEntry" :busy="busy" @close="close"><form @submit.prevent="save">
 <p v-if="formError" role="alert" class="notice error-notice">{{ formError }}</p>
 <div class="form-grid"><label>{{ t.number }}<input :value="t.automatic" disabled></label><label>{{ t.date }}<input v-model="form.entry_date" type="date" :min="selectedExercise?.start_date" :max="selectedExercise?.end_date" required :disabled="busy"></label></div>
 <label>{{ t.concept }}<input v-model="form.description" maxlength="200" required :disabled="busy"></label>
 <div class="table-wrap"><table class="entry-grid"><thead><tr><th>{{ t.subaccount }}</th><th>{{ t.description }}</th><th>{{ t.debit }}</th><th>{{ t.credit }}</th><th>{{ t.remove }}</th></tr></thead><tbody><tr v-for="(line,index) in form.lines" :key="line.key">
 <td><SubaccountInput v-model="line.account_id" :accounts="subaccounts" :label="t.subaccount+' '+(index+1)" :disabled="busy" /></td>
 <td><input :value="accountName(line.account_id)" readonly :aria-label="t.description+' '+(index+1)" :title="accountName(line.account_id)"></td>
 <td><input v-model="line.debit" inputmode="decimal" placeholder="0,00" :aria-label="t.debit+' '+(index+1)" :disabled="busy"></td><td><input v-model="line.credit" inputmode="decimal" placeholder="0,00" :aria-label="t.credit+' '+(index+1)" :disabled="busy"></td>
 <td><button v-if="index >= 2" type="button" class="button" :disabled="busy" :aria-label="t.remove+' '+(index+1)" @click="form.lines.splice(index,1)">×</button></td></tr></tbody></table></div>
 <button type="button" class="button" :disabled="busy||form.lines.length>=100" @click="form.lines.push(newLine())">{{ t.addLine }}</button>
 <div class="entry-totals" aria-live="polite"><template v-if="totals.valid"><span>{{ t.debit }} <strong>{{ displayMoney(totals.debit) }}</strong></span><span>{{ t.credit }} <strong>{{ displayMoney(totals.credit) }}</strong></span><span>{{ t.difference }} <strong>{{ displayMoney(totals.difference) }}</strong></span><span :class="totals.difference===0n&&totals.debit>0n?'success-note':''">{{ totals.difference===0n&&totals.debit>0n?t.balanced:t.unbalanced }}</span></template><span v-else role="alert">{{ t.invalidTotals }}</span></div>
 <div class="actions"><button class="button primary" :disabled="!canSave">{{ t.register }}</button><button type="button" class="button" :disabled="busy" @click="close">{{ t.cancel }}</button></div>
 </form></FormDialog>
<EntryDetail v-if="detailId" :entry-id="detailId" allow-edit :edit-on-open="selectedExercise?.status==='open'&&can('accounting_write')" @close="detailId=null" @saved="entrySaved" />
</template>
