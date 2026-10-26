<script setup>
import { computed, ref, nextTick, watch } from 'vue';
import FormDialog from './FormDialog.vue';
import AppIcon from './AppIcon.vue';
import { t } from '../locales/accounting.js';
const props=defineProps({modelValue:[String,Number],accounts:{type:Array,required:true},label:String,disabled:Boolean});
const emit=defineEmits(['update:modelValue']);
const accountCode=ref(''),subaccountCode=ref(''),suffixInput=ref(null),search=ref(''),searching=ref(false),touched=ref(false),input=ref(null),searchInput=ref(null);
const chosen=computed(()=>props.accounts.find(a=>String(a.id)===String(props.modelValue)));
watch(chosen, account=>{if(account){accountCode.value=account.parent_code;subaccountCode.value=account.code.slice(account.parent_code.length);}},{immediate:true});
const results=computed(()=>{
 const query=search.value.trim().toLocaleLowerCase('es');
 return props.accounts.filter(a=>a.code.includes(query.replaceAll('.',''))||a.description.toLocaleLowerCase('es').includes(query));
});
function resolveAccount(){
 touched.value=true;
 const parent=accountCode.value.trim(),suffix=subaccountCode.value.trim();
 const account=/^[1-9]\d*$/.test(parent)&&/^\d+$/.test(suffix)
  ? props.accounts.find(a=>a.parent_code===parent&&a.code===parent+suffix) : null;
 emit('update:modelValue',account?.id||'');
}
async function enterAccount(event){
 const value=event.target.value.trim();
 if(value.includes('.')){
  const [parent,...suffix]=value.split('.');
  accountCode.value=parent;subaccountCode.value=suffix.join('.');
  event.target.value=parent;
  resolveAccount();
  await nextTick();suffixInput.value?.focus();
 }else{accountCode.value=value;resolveAccount();}
}
function enterSubaccount(event){subaccountCode.value=event.target.value;resolveAccount();}
async function openSearch(){search.value=accountCode.value+(subaccountCode.value?'.'+subaccountCode.value:'');searching.value=true;await nextTick();searchInput.value?.focus();}
async function closeSearch(){searching.value=false;await nextTick();input.value?.focus();}
function choose(account){accountCode.value=account.parent_code;subaccountCode.value=account.code.slice(account.parent_code.length);touched.value=true;emit('update:modelValue',account.id);closeSearch();}
</script>
<template>
 <div class="subaccount-input">
  <div class="subaccount-code-entry">
   <label><input ref="input" :placeholder="t.accountPlaceholder" :value="accountCode" :aria-label="t.account+' '+label" :aria-invalid="touched&&!chosen" :title="touched&&!chosen?t.unknownSubaccount:undefined" maxlength="21" required :disabled="disabled" autocomplete="off" @input="enterAccount" @keydown.f2.prevent="openSearch" @keydown.enter.prevent="suffixInput?.focus()"></label>
   <label><input ref="suffixInput" :placeholder="t.subaccountPlaceholder" :value="subaccountCode" :aria-label="t.subaccount+' '+label" :aria-invalid="touched&&!chosen" :title="touched&&!chosen?t.unknownSubaccount:undefined" inputmode="numeric" pattern="[0-9]+" maxlength="20" required :disabled="disabled" autocomplete="off" @input="enterSubaccount" @keydown.f2.prevent="openSearch" @keydown.enter.prevent="chosen ? $event.target.blur() : openSearch()"></label>
   <button type="button" class="button" :disabled="disabled" :aria-label="t.searchAccount+' '+label" :title="t.searchAccount" @click="openSearch"><AppIcon name="search" /></button>
  </div>
  <small v-if="touched&&!chosen" class="subaccount-validation-message" role="status">{{ t.unknownSubaccount }}</small>
  <Teleport to="body"><FormDialog v-if="searching" class="subaccount-search-dialog" :title="t.searchAccount" @close="closeSearch">
   <div class="subaccount-search-heading"><input ref="searchInput" v-model="search" type="search" :aria-label="t.searchAccountsHint" :placeholder="t.searchAccountsHint" @keydown.enter.prevent></div>
   <div class="subaccount-results"><table><thead><tr><th>{{ t.account }}</th><th>{{ t.subaccount }}</th><th>{{ t.description }}</th><th>{{ t.useAccount }}</th></tr></thead><tbody>
    <tr v-for="account in results" :key="account.id" class="subaccount-result" @click="choose(account)"><td>{{ account.parent_code }}</td><td>{{ account.code.slice(account.parent_code.length) }}</td><td>{{ account.description }}</td><td><button type="button" class="button" @click.stop="choose(account)">{{ t.useAccount }}</button></td></tr>
    <tr v-if="!results.length"><td colspan="4">{{ t.empty }}</td></tr>
   </tbody></table></div>
  </FormDialog></Teleport>
 </div>
</template>
