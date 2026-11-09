<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import { api } from '../services/accounting.js';
import { t, errorText } from '../locales/accounting.js';
import { reportMoney, reportDate } from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
import EntryEditDialog from './EntryEditDialog.vue';
import JournalSource from './JournalSource.vue';
import {useAccess} from '../composables/access.js';
const props=defineProps({entryId:[String,Number],allowEdit:Boolean,editOnOpen:Boolean});
const emit=defineEmits(['close','saved','deleted']),{can}=useAccess();
const entry=ref(null),error=ref(''),editing=ref(false),notice=ref(''),confirming=ref(false),confirmNumber=ref(''),deleting=ref(false);let generation=0;
watch(()=>props.entryId,()=>{confirming.value=false;confirmNumber.value='';});
watch(()=>props.entryId,async id=>{const ticket=++generation;entry.value=null;error.value='';editing.value=false;notice.value='';try{const data=await api('/entries/'+id);if(ticket===generation){entry.value=data;editing.value=props.editOnOpen&&props.allowEdit&&can('accounting_write')&&data.editable;}}catch(e){if(ticket===generation)error.value=errorText(e);}},{immediate:true});
function saved(data){entry.value=data;editing.value=false;notice.value=t.entryUpdated;emit('saved',data);}
onBeforeUnmount(()=>generation++);
function confirmDelete(){editing.value=false;confirmNumber.value='';error.value='';confirming.value=true;}
async function remove(){if(deleting.value||!entry.value?.deletable||!can('entries_delete')||confirmNumber.value!==String(entry.value.number))return;deleting.value=true;error.value='';try{const result=await api('/entries/'+entry.value.id,{method:'DELETE',body:{revision:entry.value.revision,confirm_number:confirmNumber.value}});emit('deleted',result);emit('close');}catch(cause){error.value=errorText(cause);}finally{deleting.value=false;}}
</script>
<template>
 <EntryEditDialog v-if="editing" :entry="entry" @close="editing=false" @saved="saved" @delete="confirmDelete" />
 <FormDialog v-else-if="confirming&&entry" :title="t.deleteEntry" :busy="deleting" @close="confirming=false">
  <h3>{{ t.entryNumber }} {{ entry.number }} · {{ reportDate(entry.entry_date) }}</h3><p>{{ entry.description }}</p><p>{{ entry.lines.length }} líneas · {{ entry.exercise.name }}</p>
  <p class="notice error-notice">{{ t.deleteEntryHelp }}</p><p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <form @submit.prevent="remove"><label>{{ t.deleteEntryNumber }}: <strong>{{ entry.number }}</strong><input v-model="confirmNumber" name="confirm_entry_number" autocomplete="off" inputmode="numeric" required :disabled="deleting"></label><div class="actions"><button class="button danger" :disabled="deleting||confirmNumber!==String(entry.number)">{{ t.confirmDeleteEntry }}</button><button type="button" class="button" :disabled="deleting" @click="confirming=false">{{ t.cancel }}</button></div></form>
 </FormDialog>
 <FormDialog v-else :title="t.detail" @close="$emit('close')">
  <p v-if="error" role="alert">{{ error }}</p><p v-else-if="!entry">{{ t.loading }}</p>
  <template v-else><p v-if="notice" role="status" class="success-note">{{ notice }}</p><div v-if="allowEdit&&can('accounting_write')" class="actions"><button class="button" :disabled="!entry.editable" @click="editing=true">{{ t.editEntry }}</button></div><p v-if="allowEdit&&entry.edit_blocked_reason" class="notice">{{ t.errors[entry.edit_blocked_reason] }}</p><h3>{{ t.entryNumber }} {{ entry.number }} · {{ reportDate(entry.entry_date) }}</h3><p>{{ entry.description }}</p>
   <JournalSource :entry="entry" />
   <p v-if="entry.status==='cancelled'" class="notice">Asiento anulado. Se conserva para consulta y no se incluye en los saldos ni en los informes.</p>
   <div class="table-wrap"><table><thead><tr><th>{{ t.code }}</th><th>{{ t.accountName }}</th><th>{{ t.concept }}</th><th class="amount">{{ t.debit }}</th><th class="amount">{{ t.credit }}</th></tr></thead>
   <tbody><tr v-for="line in entry.lines" :key="line.id"><td>{{ line.code }}</td><td>{{ line.account_description }}</td><td>{{ line.description }}</td><td class="amount">{{ reportMoney(line.debit) }}</td><td class="amount">{{ reportMoney(line.credit) }}</td></tr></tbody></table></div>
  </template>
  <template v-if="entry&&allowEdit&&can('entries_delete')"><div class="actions"><button class="button danger" :disabled="!entry.deletable" @click="confirmDelete">{{ t.deleteEntry }}</button></div><p v-if="entry.delete_blocked_reason" class="notice">{{ t.errors[entry.delete_blocked_reason] }}</p></template>
 </FormDialog>
</template>
<style scoped>.danger{color:#a12c28;border-color:#d79b97}form label{display:grid;gap:8px;margin:18px 0}.actions{margin-top:16px;flex-wrap:wrap}</style>
