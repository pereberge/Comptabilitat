<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { displayAccountCode } from '../../../shared/account-codes.js';
import { useContext } from '../composables/context.js';
import { computed, onMounted, ref,watch } from 'vue';
import {accountPartyType,emptyPartyProfile} from '../../../shared/account-party.js';
import {partyText} from '../locales/parties.js';
import PartyProfileFields from '../components/PartyProfileFields.vue';
import PartyPaymentFields from '../components/PartyPaymentFields.vue';
import PartyPaymentSummary from '../components/PartyPaymentSummary.vue';
import {emptyPartyPaymentProfile} from '../../../shared/party-payments.js';
import {emptySepaMandate} from '../../../shared/sepa.js';
import SepaMandateFields from '../components/SepaMandateFields.vue';
import { t,errorText } from '../locales/accounting.js';
import { api } from '../services/accounting.js';
import AccountImportDialog from '../components/AccountImportDialog.vue';
import {imp} from '../locales/account-import.js';
import FormDialog from '../components/FormDialog.vue';
const importing=ref(false);
const { company } = useContext();
const accounts=ref([]),search=ref(''),kind=ref(''),loading=ref(false),error=ref(''),notice=ref('');
const form=ref(null),busy=ref(false),formError=ref(''),selected=ref(null);
const rows=computed(()=>accounts.value.filter(a=>(!kind.value||a.kind===kind.value)&&(!search.value||a.code.includes(search.value.replaceAll('.',''))||[a.description,a.party_profile?.name,a.party_profile?.tax_id].some(value=>value?.toLocaleLowerCase('es').includes(search.value.toLocaleLowerCase('es'))))));
const formPartyType=computed(()=>{const code=(form.value?.code||'').replaceAll('.','');return accountPartyType({code,kind:code.length===(company.value?.subaccount_length||8)?'subaccount':'account'});});
watch(()=>form.value?.description,(value,previous)=>{if(form.value?.party_profile&&(!form.value.party_profile.name||form.value.party_profile.name===previous))form.value.party_profile.name=value||'';});
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
function open(){selected.value=null;formError.value='';form.value={code:'',description:'',party_profile:emptyPartyProfile(),payment_profile:emptyPartyPaymentProfile(),sepa_mandate:emptySepaMandate()};}
async function detail(row){formError.value='';try{selected.value=await api('/accounts/'+row.id);form.value=null;}catch(e){error.value=errorText(e);}}
function edit(){const row=selected.value;form.value={id:row.id,code:row.code,description:row.description,party_profile:{...emptyPartyProfile(),name:row.description,...row.party_profile},payment_profile:{...emptyPartyPaymentProfile(),...row.payment_profile},sepa_mandate:{...emptySepaMandate(),...row.sepa_mandate}};selected.value=null;formError.value='';}
async function fiscal(row){await detail(row);if(selected.value?.id===row.id)edit();}
async function suggest(){busy.value=true;formError.value='';try{const parent=proposedParent.value;const next=(await api('/accounts/'+parent.id+'/next-code')).code;form.value.code=parent.code+'.'+next.slice(parent.code.length);}catch(e){formError.value=errorText(e);}finally{busy.value=false;}}
async function save(){busy.value=true;formError.value='';try{
 const f=form.value;
 const body={description:f.description,...(!f.id?{code:f.code}:{}),...(formPartyType.value?{party_profile:f.party_profile,payment_profile:f.payment_profile}:{}),...(formPartyType.value==='customer'?{sepa_mandate:f.sepa_mandate}:{})};
 await api('/accounts'+(f.id?'/'+f.id:''),{method:f.id?'PATCH':'POST',body});
 form.value=null;notice.value=t.saved;await load();
}catch(e){formError.value=errorText(e);}finally{busy.value=false;}}
onMounted(load);
</script>
<template>
 <div class="page-heading"><div><h1>{{ t.accounts }}</h1><p class="muted">{{ t.accountHelp }}</p></div><div class="actions"><button :disabled="!can('data_import')" class="button" @click="importing=true">{{ imp.title }}</button><button :disabled="!can('accounting_write')" class="button primary" @click="open">{{ t.newAccount }}</button></div></div>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p>
 <div class="filters"><label>{{ partyText.search }}<input v-model="search" type="search"></label><label>{{ t.kind }}<select v-model="kind"><option value="">{{ t.all }}</option><option value="account">{{ t.account }}</option><option value="subaccount">{{ t.subaccount }}</option></select></label><button class="button" :disabled="loading" @click="load">{{ t.retry }}</button></div>
 <p v-if="loading" role="status">{{ t.loading }}</p>
 <div v-else class="table-wrap panel"><table><thead><tr><th>{{ t.account }}</th><th>{{ t.subaccount }}</th><th>{{ t.description }}</th><th>{{ t.kind }}</th><th>{{ t.parent }}</th><th>{{ t.detail }}</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td class="account-code">{{ displayAccountCode(row).split('.')[0] }}</td><td class="account-code">{{ displayAccountCode(row).split('.')[1] || '' }}</td><td :style="{paddingLeft:(row.kind==='subaccount'?36:12+Math.min(row.code.length-1,5)*12)+'px'}">{{ row.description }}<small v-if="row.party_profile?.tax_id" class="account-fiscal-tax">{{ row.party_profile.tax_id }}</small></td><td>{{ accountPartyType(row)?partyText[accountPartyType(row)]:row.kind==='account'?t.account:t.subaccount }}</td><td>{{ row.parent_code || '—' }}</td><td><div class="actions"><button class="button" @click="detail(row)">{{ t.detail }}</button><button v-if="accountPartyType(row)&&can('accounting_write')" class="button" @click="fiscal(row)">{{ partyText.title }}</button></div></td></tr><tr v-if="!rows.length"><td colspan="6" class="empty-cell">{{ t.empty }}</td></tr></tbody></table></div>
 <FormDialog class="account-dialog" v-if="form" :title="form.id?partyText.edit:t.newAccount" :busy="busy" @close="form=null"><form @submit.prevent="save"><fieldset :disabled="busy">
 <p v-if="formError" class="notice error-notice" role="alert">{{ formError }}</p>
 <template v-if="!form.id"><p class="muted account-form-help">{{ t.autoKindHelp }}</p>

 <label>{{ t.code }}<input v-model="form.code" inputmode="decimal" pattern="[1-9][0-9]*(\.[0-9]+)?" maxlength="21" placeholder="4300.0001" required></label><button type="button" class="button" :disabled="busy||!proposedParent||proposedParent.code.length<3" @click="suggest">{{ t.suggestSubaccount }}</button>
 <p v-if="codeParts" class="notice account-code-preview"><strong>{{ t.account }}: {{ codeParts.parent }}</strong><span>{{ t.subaccount }}: {{ codeParts.suffix }}</span></p></template>
 <p v-if="form.id" class="account-code">{{ form.code }}</p><label>{{ t.description }}<input v-model="form.description" name="account_description" maxlength="200" required></label>
 <section v-if="formPartyType" class="account-fiscal-profile"><h3>{{ partyText.title }} · {{ partyText[formPartyType] }}</h3><p class="muted">{{ partyText.help }}</p><PartyProfileFields v-model="form.party_profile" /></section>
 <PartyPaymentFields v-if="formPartyType" v-model="form.payment_profile" />
 <SepaMandateFields v-if="formPartyType==='customer'" v-model="form.sepa_mandate" />
 </fieldset><div class="actions"><button class="button primary" :disabled="busy">{{ t.save }}</button><button type="button" class="button" :disabled="busy" @click="form=null">{{ t.cancel }}</button></div></form></FormDialog>
 <FormDialog v-if="selected" :title="t.detail" @close="selected=null"><dl><dt>{{ t.code }}</dt><dd>{{ displayAccountCode(selected) }}</dd><dt>{{ t.description }}</dt><dd>{{ selected.description }}</dd><dt>{{ t.kind }}</dt><dd>{{ selected.kind==='account'?t.account:t.subaccount }}</dd><dt>{{ t.parent }}</dt><dd>{{ selected.parent_code || '—' }}</dd></dl><section v-if="accountPartyType(selected)" class="account-fiscal-profile"><h3>{{ partyText.title }} · {{ partyText[accountPartyType(selected)] }}</h3><dl v-if="selected.party_profile"><template v-for="(label,key) in partyText.labels" :key="key"><template v-if="selected.party_profile[key]"><dt>{{ label }}</dt><dd>{{ selected.party_profile[key] }}</dd></template></template></dl><p v-else class="muted">{{ partyText.empty }}</p></section><PartyPaymentSummary v-if="accountPartyType(selected)" :profile="selected.payment_profile" /><p class="muted">{{ t.immutable }}</p><button :disabled="!can('accounting_write')" class="button" @click="edit">{{ partyText.edit }}</button></FormDialog>
<AccountImportDialog v-if="importing" @close="importing=false" @imported="load" />
</template>
<style scoped>
.account-fiscal-profile{border-top:1px solid var(--border,#dce3ec);margin-top:20px;padding-top:12px}.account-fiscal-tax{display:block;color:#65748a;margin-top:4px}
.account-dialog fieldset{border:0;padding:0;margin:0;min-width:0}.account-dialog input{width:100%;max-width:100%;min-width:0}
</style>
