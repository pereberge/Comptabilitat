<script setup>
import { ref, watch } from 'vue';
import { api } from '../services/accounting.js';
import { t, errorText } from '../locales/accounting.js';
import { reportMoney, reportDate } from '../services/report-format.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({entryId:[String,Number]});
defineEmits(['close']);
const entry=ref(null),error=ref('');
watch(()=>props.entryId,async id=>{entry.value=null;error.value='';try{entry.value=await api('/entries/'+id);}catch(e){error.value=errorText(e);}},{immediate:true});
</script>
<template>
 <FormDialog :title="t.detail" @close="$emit('close')">
  <p v-if="error" role="alert">{{ error }}</p><p v-else-if="!entry">{{ t.loading }}</p>
  <template v-else><h3>{{ t.entryNumber }} {{ entry.number }} · {{ reportDate(entry.entry_date) }}</h3><p>{{ entry.description }}</p>
   <div class="table-wrap"><table><thead><tr><th>{{ t.code }}</th><th>{{ t.accountName }}</th><th>{{ t.concept }}</th><th class="amount">{{ t.debit }}</th><th class="amount">{{ t.credit }}</th></tr></thead>
   <tbody><tr v-for="line in entry.lines" :key="line.id"><td>{{ line.code }}</td><td>{{ line.account_description }}</td><td>{{ line.description }}</td><td class="amount">{{ reportMoney(line.debit) }}</td><td class="amount">{{ reportMoney(line.credit) }}</td></tr></tbody></table></div>
  </template>
 </FormDialog>
</template>
