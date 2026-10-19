<script setup>
import { displayAccountCode } from '../../../shared/account-codes.js';
import { useContext } from '../composables/context.js';
import { computed, onMounted, ref } from 'vue';
import { t,errorText } from '../locales/accounting.js';
import { api } from '../services/accounting.js';
import AccountImportDialog from '../components/AccountImportDialog.vue';
import {imp} from '../locales/account-import.js';
import FormDialog from '../components/FormDialog.vue';
const importing=ref(false);
const { company } = useContext();
const accounts=ref([]),search=ref(''),kind=ref(''),loading=ref(false),error=ref(''),notice=ref('');
const form=ref(null),busy=ref(false),formError=ref(''),selected=ref(null);
const rows=computed(()=>accounts.value.filter(a=>(!kind.value||a.kind===kind.value)&&(!search.value||a.code.includes(search.value.replaceAll('.',''))||a.description.toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es')))));
const proposedParent=computed(()=>{
 const code=form.value?.code?.split('.')[0];
 return accounts.value.find(a=>a.kind==='account' && a.code===code);
});
const codeParts=computed(()=>{
 const code=form.value?.code||'';
 if(code.includes('.')){const [parent,suffix]=code.split('.');return {parent,suffix};}
 if(code.length===(company.value?.subaccount_length||8)){
 const parent=accounts.value.filter(a=>a.kind==='account'&&a.code.length<code.length&&code.startsWith(a.code)).sort((a,b)=>b.code.length-a.code.length)[0];
 if(parent)return {parent:parent.code,suffix:code.slice(parent.code.length)};
 }
 return null;
});
async function load(){loading.value=true;error.value='';try{accounts.value=await api('/accounts');}catch(e){error.value=errorText(e);accounts.value=[];}finally{loading.value=false;}}
function open(){selected.value=null;formError.value='';form.value={code:'',description:''};}
async function detail(row){formError.value='';try{selected.value=await api('/accounts/'+row.id);form.value=null;}catch(e){error.value=errorText(e);}}
function edit(){form.value={id:selected.value.id,description:selected.value.description};selected.value=null;formError.value='';}
async function suggest(){busy.value=true;formError.value='';try{const parent=proposedParent.value;const next=(await api('/accounts/'+parent.id+'/next-code')).code;form.value.code=parent.code+'.'+next.slice(parent.code.length);}catch(e){formError.value=errorText(e);}finally{busy.value=false;}}
async function save(){busy.value=true;formError.value='';try{
 const f=form.value;
 await api('/accounts'+(f.id?'/'+f.id:''),{method:f.id?'PATCH':'POST',body:f.id?{description:f.description}:{code:f.code,description:f.description}});
 form.value=null;notice.value=t.saved;await load();
}catch(e){formError.value=errorText(e);}finally{busy.value=false;}}
onMounted(load);
</script>
<template>
 <div class="page-heading"><div><h1>{{ t.accounts }}</h1><p class="muted">{{ t.accountHelp }}</p></div><div class="actions"><button class="button" @click="importing=true">{{ imp.title }}</button><button class="button primary" @click="open">{{ t.newAccount }}</button></div></div>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p>
 <div class="filters"><label>{{ t.search }}<input v-model="search" type="search"></label><label>{{ t.kind }}<select v-model="kind"><option value="">{{ t.all }}</option><option value="account">{{ t.account }}</option><option value="subaccount">{{ t.subaccount }}</option></select></label><button class="button" :disabled="loading" @click="load">{{ t.retry }}</button></div>
 <p v-if="loading" role="status">{{ t.loading }}</p>
 <div v-else class="table-wrap panel"><table><thead><tr><th>{{ t.account }}</th><th>{{ t.subaccount }}</th><th>{{ t.description }}</th><th>{{ t.kind }}</th><th>{{ t.parent }}</th><th>{{ t.detail }}</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td class="account-code">{{ displayAccountCode(row).split('.')[0] }}</td><td class="account-code">{{ displayAccountCode(row).split('.')[1] || '' }}</td><td :style="{paddingLeft:(row.kind==='subaccount'?36:12+Math.min(row.code.length-1,5)*12)+'px'}">{{ row.description }}</td><td>{{ row.kind==='account'?t.account:t.subaccount }}</td><td>{{ row.parent_code || '—' }}</td><td><button class="button" @click="detail(row)">{{ t.detail }}</button></td></tr><tr v-if="!rows.length"><td colspan="6" class="empty-cell">{{ t.empty }}</td></tr></tbody></table></div>
 <FormDialog class="account-dialog" v-if="form" :title="form.id?t.edit:t.newAccount" :busy="busy" @close="form=null"><form @submit.prevent="save">
 <p v-if="formError" class="notice error-notice" role="alert">{{ formError }}</p>
 <template v-if="!form.id"><p class="muted account-form-help">{{ t.autoKindHelp }}</p>

 <label>{{ t.code }}<input v-model="form.code" inputmode="decimal" pattern="[1-9][0-9]*(\.[0-9]+)?" maxlength="21" placeholder="4300.0001" required></label><button type="button" class="button" :disabled="busy||!proposedParent||proposedParent.code.length<3" @click="suggest">{{ t.suggestSubaccount }}</button>
 <p v-if="codeParts" class="notice account-code-preview"><strong>{{ t.account }}: {{ codeParts.parent }}</strong><span>{{ t.subaccount }}: {{ codeParts.suffix }}</span></p></template>
 <label>{{ t.description }}<input v-model="form.description" maxlength="200" required></label><div class="actions"><button class="button primary" :disabled="busy">{{ t.save }}</button><button type="button" class="button" :disabled="busy" @click="form=null">{{ t.cancel }}</button></div></form></FormDialog>
 <FormDialog v-if="selected" :title="t.detail" @close="selected=null"><dl><dt>{{ t.code }}</dt><dd>{{ displayAccountCode(selected) }}</dd><dt>{{ t.description }}</dt><dd>{{ selected.description }}</dd><dt>{{ t.kind }}</dt><dd>{{ selected.kind==='account'?t.account:t.subaccount }}</dd><dt>{{ t.parent }}</dt><dd>{{ selected.parent_code || '—' }}</dd></dl><p class="muted">{{ t.immutable }}</p><button class="button" @click="edit">{{ t.edit }}</button></FormDialog>
<AccountImportDialog v-if="importing" @close="importing=false" @imported="load" />
</template>
