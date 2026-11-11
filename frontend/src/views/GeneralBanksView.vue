<script setup>
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import {useAccess} from '../composables/access.js';
import {api} from '../services/accounting.js';
import {generalTables as t} from '../locales/general-tables.js';
import FormDialog from '../components/FormDialog.vue';
const {user}=useAccess(),editable=computed(()=>user.value?.role==='master');
const banks=ref([]),search=ref(''),form=ref(null),loading=ref(false),busy=ref(false),error=ref(''),formError=ref(''),notice=ref('');
const normalized=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const filtered=computed(()=>banks.value.filter(bank=>normalized(bank.name+' '+bank.bic).includes(normalized(search.value.trim()))));
let generation=0;
async function load(){const ticket=++generation;loading.value=true;error.value='';try{const rows=await api('/general-tables/banks');if(ticket===generation)banks.value=rows;}catch(cause){if(ticket===generation)error.value=t.errors[cause.code]||t.unavailable;}finally{if(ticket===generation)loading.value=false;}}
function edit(bank){formError.value='';form.value=bank?{...bank}:{name:'',bic:''};}
async function save(){if(busy.value||!editable.value)return;busy.value=true;formError.value='';try{await api('/general-tables/banks'+(form.value.id?'/'+form.value.id:''),{method:form.value.id?'PUT':'POST',body:form.value});form.value=null;notice.value=t.saved;await load();}catch(cause){formError.value=t.errors[cause.code]||t.unavailable;}finally{busy.value=false;}}
onMounted(load);onBeforeUnmount(()=>generation++);
</script>
<template>
 <div class="page-heading"><div><h1>{{ t.banks }}</h1><p class="muted">{{ t.banksHelp }}</p></div><div class="actions"><RouterLink class="button" to="/tablas-generales">{{ t.title }}</RouterLink><button v-if="editable" class="button primary" @click="edit(null)">{{ t.newBank }}</button></div></div>
 <p class="muted">{{ t.presenterHelp }}</p><p v-if="!editable" class="muted">{{ t.masterHelp }}</p>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }} <button class="button" :disabled="loading" @click="load">Actualizar</button></p><p v-if="notice" class="notice" role="status">{{ notice }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
 <label class="bank-search">{{ t.search }}<input v-model="search" type="search" maxlength="160"></label>
 <div class="panel table-wrap"><table><thead><tr><th>{{ t.bankName }}</th><th>{{ t.bic }}</th><th v-if="editable">{{ t.edit }}</th></tr></thead><tbody><tr v-for="bank in filtered" :key="bank.id"><td>{{ bank.name }}</td><td><code>{{ bank.bic }}</code></td><td v-if="editable"><button class="button" @click="edit(bank)">{{ t.edit }}</button></td></tr><tr v-if="!loading&&!filtered.length"><td :colspan="editable?3:2">{{ t.empty }}</td></tr></tbody></table></div>
 <FormDialog v-if="form&&editable" :title="form.id?t.editTitle:t.newTitle" :busy="busy" @close="form=null"><p v-if="formError" class="notice error-notice" role="alert">{{ formError }}</p><form @submit.prevent="save"><fieldset :disabled="busy"><label>{{ t.bankName }}<input v-model="form.name" required maxlength="160" autofocus></label><label>{{ t.bic }}<input v-model="form.bic" required maxlength="11" minlength="8" pattern="[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?" autocapitalize="characters" spellcheck="false"></label></fieldset><div class="actions"><button class="button primary" :disabled="busy">{{ t.save }}</button><button type="button" class="button" :disabled="busy" @click="form=null">{{ t.cancel }}</button></div></form></FormDialog>
</template>
<style scoped>.bank-search{max-width:480px;margin:20px 0}code{white-space:nowrap}fieldset{border:0;padding:0;display:grid;gap:16px}.actions{margin-top:16px}</style>
