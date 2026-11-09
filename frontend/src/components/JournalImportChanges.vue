<script setup>
import {computed,ref,watch} from 'vue';
import {t,entryLabels} from '../locales/exercises.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
const props=defineProps({changes:{type:Array,default:()=>[]}});
const search=ref(''),action=ref('all'),page=ref(1),opened=ref(new Set());
const pageSize=20,normalize=value=>String(value).toLocaleLowerCase('es').replace(/[.,\s]/g,'');
const indexed=computed(()=>props.changes.map(change=>({change,text:normalize(JSON.stringify(change))})));
const filtered=computed(()=>indexed.value.filter(row=>(action.value==='all'||row.change.action===action.value)&&row.text.includes(normalize(search.value))).map(row=>row.change));
const pages=computed(()=>Math.max(1,Math.ceil(filtered.value.length/pageSize)));
const visible=computed(()=>filtered.value.slice((page.value-1)*pageSize,page.value*pageSize));
watch([search,action],()=>{page.value=1;});
watch(()=>props.changes,changes=>{page.value=1;opened.value=new Set(changes.length?[changes[0].number]:[]);},{immediate:true});
function toggle(number){const next=new Set(opened.value);if(next.has(number))next.delete(number);else next.add(number);opened.value=next;}
const reference=entry=>[entry?.source_journal_code,entry?.source_entry_reference].filter(value=>value!=null).join(' / ')||'—';
function fields(change){return [
 {key:'entry_date',label:t.date,before:change.before?date(change.before.entry_date):'—',after:date(change.after.entry_date)},
 {key:'description',label:t.concept,before:change.before?.description??'—',after:change.after.description},
 {key:'entry_type',label:t.changeEntryType,before:change.before?entryLabels[change.before.entry_type]||change.before.entry_type:'—',after:entryLabels[change.after.entry_type]||change.after.entry_type},
 ...(change.after.source_journal_code||change.before?.source_journal_code?[{key:'reference',label:t.sourceReference,before:reference(change.before),after:reference(change.after)}]:[]),
 {key:'debit',label:t.debit,before:change.before?money(change.before.totals.debit)+' €':'—',after:money(change.after.totals.debit)+' €'},
 {key:'credit',label:t.credit,before:change.before?money(change.before.totals.credit)+' €':'—',after:money(change.after.totals.credit)+' €'},
 {key:'lines',label:t.changeLineCount,before:change.before?.totals.lines??'—',after:change.after.totals.lines},
 ];}
const versions=change=>[...(change.before?[{label:t.changeBefore,entry:change.before}]:[]),{label:t.changeAfter,entry:change.after}];
</script>
<template>
 <section class="journal-change-details" aria-labelledby="journal-change-title">
  <h3 id="journal-change-title">{{ t.changeDetails }}</h3>
  <p class="muted">{{ t.changeDetailsHelp }}</p>
  <form v-if="changes.length" class="journal-change-filters" @submit.prevent>
   <label>{{ t.changeSearch }}<input v-model="search" type="search" name="journal_change_search" :placeholder="t.changeSearchPlaceholder"></label>
   <label>{{ t.changeFilter }}<select v-model="action" name="journal_change_action"><option value="all">{{ t.changeAll }}</option><option value="updated">{{ t.changeUpdated }}</option><option value="added">{{ t.changeAdded }}</option></select></label>
  </form>
  <p v-if="!changes.length" class="notice">{{ t.changeNone }}</p>
  <p v-else-if="!filtered.length" class="notice">{{ t.changeNoMatches }}</p>
  <p v-else class="muted" role="status">{{ filtered.length }} {{ t.changeMatching }}</p>
  <article v-for="change in visible" :key="change.number" class="journal-entry-change" :data-change-number="change.number">
   <header><h4>{{ t.changeEntry }} {{ change.number }}</h4><span class="journal-change-badge">{{ change.action==='added'?t.changeAdded:t.changeUpdated }}</span></header>
   <p v-if="change.changed_fields.length" class="journal-changed-fields">{{ t.changeFields }} {{ change.changed_fields.map(field=>t.changeFieldLabels[field]||field).join(', ') }}.</p>
   <div class="table-wrap"><table class="journal-change-fields"><thead><tr><th>{{ t.changeField }}</th><th>{{ t.changeBefore }}</th><th>{{ t.changeAfter }}</th></tr></thead>
    <tbody><tr v-for="field in fields(change)" :key="field.key" :class="{'journal-field-changed':field.before!==field.after}"><th scope="row">{{ field.label }}</th><td>{{ field.before }}</td><td>{{ field.after }}</td></tr></tbody>
   </table></div>
   <p v-if="change.line_order_changed" class="notice">{{ t.changeLineOrder }}</p>
   <button type="button" class="button journal-change-toggle" :aria-expanded="opened.has(change.number)" :aria-controls="'journal-entry-lines-'+change.number" @click="toggle(change.number)">{{ opened.has(change.number)?t.changeHideLines:t.changeShowLines }}</button>
   <div v-if="opened.has(change.number)" :id="'journal-entry-lines-'+change.number" class="journal-change-versions" :class="{'journal-change-single':!change.before}">
    <section v-for="version in versions(change)" :key="version.label" class="journal-change-version">
     <h5>{{ version.label }}</h5>
     <div class="table-wrap journal-change-lines" tabindex="0" :aria-label="version.label+' · '+t.changeEntry+' '+change.number"><table><thead><tr><th>{{ t.changeLine }}</th><th>{{ t.changeAccount }}</th><th>{{ t.concept }}</th><th class="amount">{{ t.debit }}</th><th class="amount">{{ t.credit }}</th><th>{{ t.changeLineState }}</th></tr></thead>
      <tbody><tr v-for="line in version.entry.lines" :key="line.position" :class="'journal-line-'+line.change"><td>{{ line.position }}</td><td class="journal-change-account">{{ line.code }}<small>{{ line.account_name }}</small></td><td>{{ line.description||'—' }}</td><td class="amount">{{ money(line.debit) }}</td><td class="amount">{{ money(line.credit) }}</td><td><span v-if="line.change!=='unchanged'">{{ line.change==='added'?t.changeLineAdded:t.changeLineRemoved }}</span><span v-else>—</span></td></tr></tbody>
     </table></div>
    </section>
   </div>
  </article>
  <nav v-if="pages>1" class="journal-change-pagination" :aria-label="t.changePagination"><button type="button" class="button" :disabled="page===1" @click="page--">{{ t.changePrevious }}</button><span>{{ t.changePage }} {{ page }} / {{ pages }}</span><button type="button" class="button" :disabled="page===pages" @click="page++">{{ t.changeNext }}</button></nav>
 </section>
</template>
