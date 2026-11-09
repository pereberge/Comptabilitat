<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import {api} from '../services/accounting.js';
import {errorText,t} from '../locales/accounting.js';
import {detailText as d} from '../locales/report-amount-detail.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {buildReportAmountDetail,reportDetailLedgerQuery} from '../services/report-amount-detail.js';
import FormDialog from './FormDialog.vue';
import EntryDetail from './EntryDetail.vue';
const props=defineProps({detail:{type:Object,required:true}}),emit=defineEmits(['close']);
const data=ref(null),loading=ref(true),error=ref(''),ledger=ref(null),ledgerLoading=ref(false),active=ref(null),entryId=ref(null);let generation=0,ledgerGeneration=0;
async function load(){const ticket=++generation;try{
 const sheets=await Promise.all(props.detail.sheets.map(sheet=>props.detail.selection.kind==='generated_result'?api('/accounting/profit-loss?'+new URLSearchParams({company_id:String(sheet.company.id),exercise_id:String(sheet.exercise.id),from:sheet.from,to:sheet.to||sheet.date,compare_previous:'false'})):sheet));
 if(ticket!==generation)return;data.value=buildReportAmountDetail(sheets,props.detail.selection);
 if(data.value.rows.length===1&&sheets.length===1)void openLedger(data.value.rows[0].values[0]);
 }catch(cause){if(ticket===generation)error.value=errorText(cause);}finally{if(ticket===generation)loading.value=false;}}
async function openLedger(value){if(!value)return;const ticket=++ledgerGeneration;active.value=value;ledger.value=null;ledgerLoading.value=true;error.value='';
 try{const result=await api('/accounting/ledger?'+new URLSearchParams(reportDetailLedgerQuery(value.sheet,value.account,props.detail.selection)));if(ticket===ledgerGeneration)ledger.value=result;}
 catch(cause){if(ticket===ledgerGeneration)error.value=errorText(cause);}finally{if(ticket===ledgerGeneration)ledgerLoading.value=false;}}
function back(){ledgerGeneration++;active.value=null;ledger.value=null;ledgerLoading.value=false;error.value='';}
onMounted(load);onBeforeUnmount(()=>{generation++;ledgerGeneration++;});
</script>
<template><FormDialog class="report-amount-dialog" :title="d.title+' · '+detail.label" @close="emit('close')">
 <p><strong>{{ detail.label }} · {{ money(detail.amount) }} €</strong></p><p class="muted">{{ detail.sheets[0].company.name }}</p>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" role="status">{{ t.loading }}</p>
 <template v-if="data"><p v-for="(period,index) in data.periods" :key="index" class="muted">{{ period.sheet.exercise.name }} · {{ date(period.sheet.from) }} — {{ date(period.sheet.to||period.sheet.date) }}</p>
 <p v-if="data.total!==detail.amount" class="notice" role="status">{{ d.changed }}</p>
 <p class="muted">{{ data.periods[0].sheet.report==='profit_loss'?d.profitScope:d.balanceScope }}</p>
 <template v-if="!active"><div class="table-wrap"><table><thead><tr><th scope="col">{{ d.account }}</th><th scope="col">{{ d.description }}</th><th v-for="(period,index) in data.periods" :key="index" scope="col" class="amount">{{ period.sheet.exercise.name }}</th><th v-if="data.periods.length===2" scope="col" class="amount">{{ d.difference }}</th></tr></thead><tbody>
 <tr v-for="row in data.rows" :key="row.code"><td>{{ row.code }}</td><td>{{ row.description }}</td><td v-for="(value,index) in row.values" :key="index" class="amount"><button v-if="value" type="button" class="report-link" :title="d.openMovements+' '+row.code" @click="openLedger(value)">{{ money(value.amount) }}</button><span v-else>{{ money('0.00') }}</span></td><td v-if="data.periods.length===2" class="amount">{{ money(row.difference) }}</td></tr>
 <tr v-if="!data.rows.length"><td :colspan="2+data.periods.length+(data.periods.length===2?1:0)" class="empty-cell">{{ d.empty }}</td></tr>
 </tbody><tfoot><tr><th colspan="2" scope="row">{{ d.total }}</th><td v-for="(total,index) in data.totals" :key="index" class="amount">{{ money(total) }}</td><td v-if="data.periods.length===2" class="amount">{{ money(data.total) }}</td></tr></tfoot></table></div></template>
 <section v-else class="report-amount-ledger"><button class="button" @click="back">{{ d.back }}</button><h3>{{ d.movements }} · {{ active.account.code }} · {{ active.sheet.exercise.name }}</h3><p>{{ active.account.description }} · {{ d.contribution }}: <strong>{{ money(active.amount) }} €</strong></p><p class="muted">{{ d.sign }}</p>
 <p v-if="ledgerLoading" role="status">{{ t.loading }}</p><template v-if="ledger"><p>{{ d.opening }}: {{ money(ledger.totals.opening) }} €</p><div class="table-wrap"><table><thead><tr><th scope="col">{{ d.date }}</th><th scope="col">{{ d.entry }}</th><th scope="col">{{ d.concept }}</th><th scope="col" class="amount">{{ d.debit }}</th><th scope="col" class="amount">{{ d.credit }}</th><th scope="col" class="amount">{{ d.balance }}</th></tr></thead><tbody>
 <tr v-for="row in ledger.rows" :key="row.id"><td>{{ date(row.entry_date) }}</td><td><button class="report-link" @click="entryId=row.entry_id">{{ row.number }}</button></td><td>{{ row.description }}</td><td class="amount">{{ money(row.debit) }}</td><td class="amount">{{ money(row.credit) }}</td><td class="amount">{{ money(row.balance) }}</td></tr><tr v-if="!ledger.rows.length"><td colspan="6" class="empty-cell">{{ d.noMovements }}</td></tr>
 </tbody><tfoot><tr><th colspan="3" scope="row">{{ d.movementTotal }}</th><td class="amount">{{ money(ledger.totals.debit) }}</td><td class="amount">{{ money(ledger.totals.credit) }}</td><td class="amount">{{ money(ledger.totals.closing) }}</td></tr></tfoot></table></div></template></section>
 </template><EntryDetail v-if="entryId" :entry-id="entryId" @close="entryId=null" />
</FormDialog></template>
<style>.report-amount-dialog{width:min(1100px,calc(100vw - 32px));max-width:calc(100vw - 32px)}.report-amount-dialog .table-wrap{max-height:55vh;overflow:auto;margin:16px 0}.report-amount-dialog table{min-width:540px}.report-amount-dialog .amount{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}.report-amount-dialog h3{margin:16px 0 10px}.report-amount-dialog thead th{position:sticky;top:0;z-index:1}.report-amount-dialog tfoot th,.report-amount-dialog tfoot td{font-weight:700;background:#edf3f7}</style>
