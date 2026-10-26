<script setup>
import { ref, watch } from 'vue';
import { api } from '../services/accounting.js';
import { t, errorText } from '../locales/accounting.js';
import { reportMoney, reportDate } from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
import EntryEditDialog from './EntryEditDialog.vue';
import JournalSource from './JournalSource.vue';
import {useAccess} from '../composables/access.js';
const props=defineProps({entryId:[String,Number],allowEdit:Boolean,editOnOpen:Boolean});
const emit=defineEmits(['close','saved']),{can}=useAccess();
const entry=ref(null),error=ref(''),editing=ref(false),notice=ref('');let generation=0;
watch(()=>props.entryId,async id=>{const ticket=++generation;entry.value=null;error.value='';editing.value=false;notice.value='';try{const data=await api('/entries/'+id);if(ticket===generation){entry.value=data;editing.value=props.editOnOpen&&props.allowEdit&&can('accounting_write')&&data.editable;}}catch(e){if(ticket===generation)error.value=errorText(e);}},{immediate:true});
function saved(data){entry.value=data;editing.value=false;notice.value=t.entryUpdated;emit('saved',data);}
</script>
<template>
 <EntryEditDialog v-if="editing" :entry="entry" @close="editing=false" @saved="saved" />
 <FormDialog v-else :title="t.detail" @close="$emit('close')">
  <p v-if="error" role="alert">{{ error }}</p><p v-else-if="!entry">{{ t.loading }}</p>
  <template v-else><p v-if="notice" role="status" class="success-note">{{ notice }}</p><div v-if="allowEdit&&can('accounting_write')" class="actions"><button class="button" :disabled="!entry.editable" @click="editing=true">{{ t.editEntry }}</button></div><p v-if="allowEdit&&entry.edit_blocked_reason" class="notice">{{ t.errors[entry.edit_blocked_reason] }}</p><h3>{{ t.entryNumber }} {{ entry.number }} · {{ reportDate(entry.entry_date) }}</h3><p>{{ entry.description }}</p>
   <JournalSource :entry="entry" />
   <p v-if="entry.status==='cancelled'" class="notice">Asiento anulado. Se conserva para consulta y no se incluye en los saldos ni en los informes.</p>
   <div class="table-wrap"><table><thead><tr><th>{{ t.code }}</th><th>{{ t.accountName }}</th><th>{{ t.concept }}</th><th class="amount">{{ t.debit }}</th><th class="amount">{{ t.credit }}</th></tr></thead>
   <tbody><tr v-for="line in entry.lines" :key="line.id"><td>{{ line.code }}</td><td>{{ line.account_description }}</td><td>{{ line.description }}</td><td class="amount">{{ reportMoney(line.debit) }}</td><td class="amount">{{ reportMoney(line.credit) }}</td></tr></tbody></table></div>
  </template>
 </FormDialog>
</template>
