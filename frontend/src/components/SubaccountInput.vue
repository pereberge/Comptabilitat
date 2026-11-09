<script setup>
import { computed, ref, nextTick, watch } from 'vue';
import FormDialog from './FormDialog.vue';
import AppIcon from './AppIcon.vue';
import { t } from '../locales/accounting.js';
import {reportMoney} from '../services/report-format.js';
import {findSubaccount,displayAccountCode,parseAccountCode} from '../../../shared/account-codes.js';
const props=defineProps({modelValue:[String,Number],accounts:{type:Array,required:true},label:String,disabled:Boolean,showBalances:Boolean});
const emit=defineEmits(['update:modelValue']);
const code=ref(''),focused=ref(false),search=ref(''),searching=ref(false),touched=ref(false),input=ref(null),searchInput=ref(null);
const chosen=computed(()=>props.accounts.find(a=>String(a.id)===String(props.modelValue)));
const shown=account=>displayAccountCode({...account,kind:'subaccount'});
watch(chosen,account=>{if(!focused.value)code.value=account?shown(account):'';},{immediate:true});
const results=computed(()=>{
 const query=search.value.trim().toLocaleLowerCase('es');
 const resolved=findSubaccount(query,props.accounts);
 return props.accounts.filter(a=>a===resolved||shown(a).includes(query)||a.code.includes(query.replaceAll('.',''))||a.description.toLocaleLowerCase('es').includes(query));
});
function resolveAccount(){
 touched.value=true;
 const account=findSubaccount(code.value,props.accounts);
 emit('update:modelValue',account?.id||'');
 return account;
}
function enterCode(event){code.value=event.target.value;resolveAccount();}
function commit(){
 const account=resolveAccount();
 if(account)code.value=shown(account);
 else{
  const lengths=[...new Set(props.accounts.map(row=>row.code.length))];
  if(lengths.length===1)try{const parsed=parseAccountCode(code.value.trim(),lengths[0]);if(parsed.parentCode)code.value=shown({...parsed,parent_code:parsed.parentCode});}catch{}
 }
 focused.value=false;
 return account;
}
function enter(){const account=commit();if(account)input.value?.blur();else void openSearch();}
async function openSearch(){if(props.disabled)return;search.value=code.value;searching.value=true;await nextTick();searchInput.value?.focus();}
async function closeSearch(){searching.value=false;await nextTick();input.value?.focus();}
function choose(account){code.value=shown(account);touched.value=true;emit('update:modelValue',account.id);closeSearch();}
</script>
<template>
 <div class="subaccount-input">
  <div class="subaccount-code-entry">
   <label><input ref="input" :placeholder="t.accountCodeHint" :value="code" :aria-label="t.subaccount+' '+(label||'')" :aria-invalid="touched&&!chosen" :title="touched&&!chosen?t.unknownSubaccount:t.shortSubaccountHelp" inputmode="decimal" maxlength="21" required :disabled="disabled" autocomplete="off" @focus="focused=true" @input="enterCode" @blur="commit" @keydown.f2.prevent="openSearch" @keydown.enter.prevent="enter"></label>
   <button type="button" class="button" :disabled="disabled" :aria-label="t.searchAccount+' '+label" :title="t.searchAccount" @click="openSearch"><AppIcon name="search" /></button>
  </div>
  <small v-if="touched&&!chosen" class="subaccount-validation-message" role="status">{{ t.unknownSubaccount }}</small>
  <small v-if="showBalances&&chosen" class="subaccount-balance" title="Deure menys haver, sense l’assentament de tancament">Saldo de l’exercici: <strong>{{ chosen.reconciliation_balance==null?'No disponible':reportMoney(chosen.reconciliation_balance)+' €' }}</strong></small>
  <Teleport to="body"><FormDialog v-if="searching" class="subaccount-search-dialog" :title="t.searchAccount" @close="closeSearch">
   <div class="subaccount-search-heading"><input ref="searchInput" v-model="search" type="search" :aria-label="t.searchAccountsHint" :placeholder="t.searchAccountsHint" @keydown.enter.prevent></div>
   <p v-if="showBalances" class="subaccount-balance-help">Saldo de l’exercici, sense tancament. Positiu: deutor. Negatiu: creditor.</p>
   <div class="subaccount-results"><table><thead><tr><th>{{ t.subaccount }}</th><th>{{ t.description }}</th><th v-if="showBalances" class="subaccount-balance-amount">Saldo €</th><th>{{ t.useAccount }}</th></tr></thead><tbody>
    <tr v-for="account in results" :key="account.id" class="subaccount-result" @click="choose(account)"><td>{{ shown(account) }}</td><td>{{ account.description }}</td><td v-if="showBalances" class="subaccount-balance-amount">{{ account.reconciliation_balance==null?'No disponible':reportMoney(account.reconciliation_balance) }}</td><td><button type="button" class="button" @click.stop="choose(account)">{{ t.useAccount }}</button></td></tr>
    <tr v-if="!results.length"><td :colspan="showBalances?4:3">{{ t.empty }}</td></tr>
   </tbody></table></div>
  </FormDialog></Teleport>
 </div>
</template>
<style scoped>
.subaccount-code-entry{flex-wrap:nowrap;align-items:center}.subaccount-code-entry label{min-width:0;flex:1}.subaccount-code-entry input{width:100%;min-width:0!important}.subaccount-code-entry>.button{flex:0 0 auto}
.subaccount-balance{display:block;margin-top:7px;font-size:12px;color:#65748a}
.subaccount-balance-help{font-size:12px;color:#65748a;margin:12px 0}
.subaccount-balance-amount{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
</style>
