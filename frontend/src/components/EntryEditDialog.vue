<script setup>
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {onBeforeRouteLeave} from 'vue-router';
import {useAccess} from '../composables/access.js';
import {api} from '../services/accounting.js';
import {t,errorText} from '../locales/accounting.js';
import {cents,displayMoney} from '../../../shared/money.js';
import FormDialog from './FormDialog.vue';
import SubaccountInput from './SubaccountInput.vue';
import JournalSource from './JournalSource.vue';
const props=defineProps({entry:{type:Object,required:true}}),emit=defineEmits(['close','saved']);
const {can}=useAccess();let key=0,disposed=false;
const form=ref({entry_date:props.entry.entry_date,description:props.entry.description,lines:props.entry.lines.map(line=>({key:++key,id:line.id,account_id:line.account_id,description:line.description,debit:line.debit,credit:line.credit}))});
const original=JSON.stringify(form.value),dirty=computed(()=>JSON.stringify(form.value)!==original);
const accounts=ref([]),loading=ref(true),busy=ref(false),error=ref('');
const totals=computed(()=>{let debit=0n,credit=0n;try{for(const line of form.value.lines){debit+=cents(line.debit||'0');credit+=cents(line.credit||'0');}return {debit,credit,difference:debit-credit,valid:true};}catch{return {debit:0n,credit:0n,difference:0n,valid:false};}});
const canSave=computed(()=>can('accounting_write')&&props.entry.editable&&!loading.value&&!busy.value&&totals.value.valid&&totals.value.debit>0n&&totals.value.difference===0n&&form.value.lines.length>=2&&form.value.lines.every(line=>accounts.value.some(account=>String(account.id)===String(line.account_id))));
onMounted(async()=>{try{const rows=await api('/accounts?kind=subaccount');if(!disposed)accounts.value=rows;}catch(cause){if(!disposed)error.value=errorText(cause);}finally{if(!disposed)loading.value=false;}});
function close(){if(!busy.value&&(!dirty.value||window.confirm(t.confirmDiscard)))emit('close');}
function accountName(id){return accounts.value.find(account=>String(account.id)===String(id))?.description||'';}
function addLine(){form.value.lines.push({key:++key,account_id:'',description:form.value.description,debit:'',credit:''});}
async function save(){if(!canSave.value)return;busy.value=true;error.value='';try{const saved=await api('/entries/'+props.entry.id,{method:'PATCH',body:{exercise_id:props.entry.exercise_id,revision:props.entry.revision,entry_date:form.value.entry_date,description:form.value.description,lines:form.value.lines.map(({key,...line})=>({...line,debit:line.debit||'0',credit:line.credit||'0'}))}});emit('saved',saved);}catch(cause){error.value=errorText(cause);}finally{busy.value=false;}}
function unload(event){if(dirty.value){event.preventDefault();event.returnValue='';}}
window.addEventListener('beforeunload',unload);onBeforeUnmount(()=>{disposed=true;window.removeEventListener('beforeunload',unload);});onBeforeRouteLeave(()=>!dirty.value||(!busy.value&&window.confirm(t.confirmDiscard)));
</script>
<template>
 <FormDialog :title="t.editEntry+' · '+entry.number" :busy="busy" @close="close"><form @submit.prevent="save">
  <JournalSource :entry="entry" />
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
  <div class="form-grid"><label>{{ t.number }}<input :value="entry.number" disabled></label><label>{{ t.date }}<input v-model="form.entry_date" type="date" :min="entry.exercise.start_date" :max="entry.exercise.end_date" required :disabled="busy"></label></div>
  <label>{{ t.concept }}<input v-model="form.description" maxlength="200" required :disabled="busy"></label>
  <div class="table-wrap"><table class="entry-grid"><thead><tr><th>{{ t.subaccount }}</th><th>{{ t.concept }}</th><th>{{ t.debit }}</th><th>{{ t.credit }}</th><th>{{ t.remove }}</th></tr></thead><tbody><tr v-for="(line,index) in form.lines" :key="line.key">
   <td><SubaccountInput v-model="line.account_id" :accounts="accounts" :label="t.subaccount+' '+(index+1)" :disabled="busy||loading" /><small>{{ accountName(line.account_id) }}</small></td>
   <td><input v-model="line.description" :aria-label="t.concept+' '+(index+1)" maxlength="200" required :disabled="busy"></td>
   <td><input v-model="line.debit" :aria-label="t.debit+' '+(index+1)" inputmode="decimal" :disabled="busy"></td><td><input v-model="line.credit" :aria-label="t.credit+' '+(index+1)" inputmode="decimal" :disabled="busy"></td>
   <td><button v-if="form.lines.length>2" type="button" class="button" :disabled="busy" :aria-label="t.remove+' '+(index+1)" @click="form.lines.splice(index,1)">×</button></td>
  </tr></tbody></table></div>
  <button type="button" class="button" :disabled="busy||form.lines.length>=100" @click="addLine">{{ t.addLine }}</button>
  <div class="entry-totals" aria-live="polite"><template v-if="totals.valid"><span>{{ t.debit }}<strong>{{ displayMoney(totals.debit) }}</strong></span><span>{{ t.credit }}<strong>{{ displayMoney(totals.credit) }}</strong></span><span>{{ t.difference }}<strong>{{ displayMoney(totals.difference) }}</strong></span><span>{{ totals.difference===0n&&totals.debit>0n?t.balanced:t.unbalanced }}</span></template><span v-else role="alert">{{ t.invalidTotals }}</span></div>
  <div class="actions"><button class="button primary" :disabled="!canSave">{{ t.save }}</button><button type="button" class="button" :disabled="busy" @click="close">{{ t.cancel }}</button></div>
 </form></FormDialog>
</template>
