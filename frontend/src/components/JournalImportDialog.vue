<script setup>
import { ref } from 'vue';
import FormDialog from './FormDialog.vue';
import { t, exerciseError } from '../locales/exercises.js';
import { reportMoney as money, reportDate as date } from '../services/report-format.js';
import { previewJournal, commitJournal } from '../services/journal-import.js';
const props=defineProps({exercise:Object});
const emit=defineEmits(['close','imported']);
const file=ref(null), preview=ref(null), busy=ref(false), error=ref('');
function choose(event) { file.value=event.target.files[0] || null; preview.value=null; error.value=''; }
async function review() {
  if (!file.value || busy.value) return;
  busy.value=true; error.value=''; preview.value=null;
  try { if(file.value.size>5*1024*1024)throw {code:'PDF_JOURNAL_INVALID'}; preview.value=await previewJournal(file.value,props.exercise.id); }
  catch(cause) { error.value=exerciseError(cause); }
  finally { busy.value=false; }
}
async function commit() {
  if(!preview.value || busy.value)return;
  busy.value=true; error.value='';
  try { const result=await commitJournal(preview.value.token); emit('imported',result); }
  catch(cause) { error.value=exerciseError(cause); }
  finally { busy.value=false; }
}
</script>
<template>
  <FormDialog class="journal-import-dialog" :title="t.import + ' · ' + exercise.name" :busy="busy" @close="emit('close')">
    <p class="muted">{{ t.importHelp }}</p>
    <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
    <form @submit.prevent="review">
      <label>{{ t.choosePdf }}<input type="file" accept="application/pdf,.pdf" :disabled="busy" required @change="choose"></label>
      <button class="button" :disabled="busy || !file">{{ t.review }}</button>
    </form>
    <p v-if="busy" role="status">{{ preview ? t.importing : t.reading }}</p>
    <section v-if="preview" class="journal-preview" aria-live="polite">
      <h3>{{ preview.source_company }}</h3>
      <p>{{ date(preview.start_date) }} — {{ date(preview.end_date) }} · {{ preview.pages }} {{ t.pages.toLowerCase() }}</p>
      <p>{{ t.sourceFormat }}: {{ preview.source_layout==='listado_diario'?'LISTADO DEL DIARIO':t.sourceFormats[preview.source_format]||preview.source_format }}</p>
      <p v-if="preview.period_inferred" class="notice">{{ t.calendarPeriod }} {{ date(preview.covered_from) }} — {{ date(preview.covered_to) }}.</p>
      <p v-if="preview.numbering==='sequential'" class="notice">{{ t.sequentialNumbering }}</p>
      <p>{{ preview.totals.entries }} {{ t.entries }} · {{ preview.totals.lines }} {{ t.lines }} · {{ preview.totals.accounts }} {{ t.accounts }}</p>
      <dl class="import-totals"><div><dt>{{ t.debit }}</dt><dd>{{ money(preview.totals.debit) }} €</dd></div><div><dt>{{ t.credit }}</dt><dd>{{ money(preview.totals.credit) }} €</dd></div></dl>
      <p v-if="preview.totals.negative_lines || preview.totals.zero_lines" class="notice">{{ t.signed }} {{ t.negative }}: {{ preview.totals.negative_lines }}. {{ t.zero }}: {{ preview.totals.zero_lines }}.</p>
      <p v-if="preview.totals.ignored_empty_lines" class="notice">{{ preview.totals.ignored_empty_lines }} filas vacías sin cuenta y con Debe/Haber a cero se omiten. Se conserva el PDF original y la posición de las líneas restantes.</p>
      <p v-if="preview.has_closing" class="notice">{{ t.closing }}</p>
      <p v-if="preview.already_imported" class="notice">{{ t.already }}</p>
      <h3>{{ t.firstLast }}</h3>
      <div class="table-wrap"><table><thead><tr><th>{{ t.number }}</th><th v-if="preview.source_format==='diari_ca'">{{ t.sourceReference }}</th><th>{{ t.date }}</th><th>{{ t.concept }}</th><th>{{ t.debit }}</th></tr></thead><tbody><tr v-for="row in preview.sample" :key="row.number"><td>{{ row.number }}</td><td v-if="preview.source_format==='diari_ca'">{{ row.source_journal_code }} / {{ row.source_entry_reference }}</td><td>{{ date(row.entry_date) }}</td><td>{{ row.description }}</td><td class="amount">{{ money(row.debit) }}</td></tr></tbody></table></div>
      <div class="actions"><button type="button" class="button primary" :disabled="busy" @click="commit">{{ preview.already_imported ? t.replay : t.commit }}</button></div>
    </section>
  </FormDialog>
</template>
