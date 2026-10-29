<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useRouter} from 'vue-router';
import {useAccess} from '../composables/access.js';
import {useContext} from '../composables/context.js';
import {api} from '../services/accounting.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {downloadFile,transferDocumentInvoice,documentationError} from '../services/documentation.js';
import {reconciliationProposalError} from '../services/reconciliation-proposals.js';
import {bankReconciliationDates} from '../../../shared/bank-reconciliation.js';
import BankImportDialog from '../components/BankImportDialog.vue';
import ReconciliationMovementRow from '../components/ReconciliationMovementRow.vue';
import ReconciliationProposalForm from '../components/ReconciliationProposalForm.vue';
import EntryDetail from '../components/EntryDetail.vue';
const {company,selectedId,selectedExercise}=useContext(),{can}=useAccess(),router=useRouter();
const report=ref(null),accounts=ref([]),loading=ref(false),saving=ref(false),error=ref(''),notice=ref(''),importOpen=ref(false),entryId=ref(null),splitMovement=ref(null),splitInitial=ref(null);let generation=0;
const data=computed(()=>report.value?.snapshot),busy=computed(()=>loading.value||saving.value),canWrite=computed(()=>can('accounting_write')&&selectedExercise.value?.status==='open');
const anchor=computed(()=>data.value?.work_anchor||{bank_date:data.value?.scope.last_matching_date,book_date:data.value?.scope.last_matching_book_date,bank_balance:data.value?.scope.last_matching_balance,book_balance:data.value?.scope.last_matching_book_balance,difference:data.value?.scope.balance_match_difference});
const movements=computed(()=>{
 if(!data.value)return [];
 const proposals=new Map(data.value.proposals.map(row=>[String(row.movement_id),row])),matched=new Map(data.value.scope.matched_movements.map(row=>[String(row.id),row]));
 const posts=new Map((data.value.posted_movements||[]).map(row=>[String(row.movement_id),row])),entries=new Map((report.value.posted_entries||[]).map(row=>[row.id,row])),invoices=new Map((report.value.pending_invoice_matches||[]).map(row=>[String(row.movement_id),row.candidates]));
 return data.value.bank_rows.filter(row=>row.date>=(data.value.work_start_date||data.value.scope.analysis_start_date)).map(row=>{
  const recorded=posts.get(String(row.id)),entry=recorded?entries.get(recorded.entry_id):null,match=matched.get(String(row.id)),settled=!!data.value.scope.last_matching_date&&row.date<=data.value.scope.last_matching_date;
  const hasEntry=entry?.status==='posted',posted=hasEntry&&entry.bank_amount===row.amount,modified=hasEntry&&!posted;return {...row,bank_account_id:report.value.account_id,proposal:proposals.get(String(row.id)),modified,done:!modified&&(posted||!!match||settled),entry_id:hasEntry?entry.id:match?.entry_id,entry_number:hasEntry?entry.number:match?.entry_number,invoices:invoices.get(String(row.id))||[]};
 });
});
const pending=computed(()=>movements.value.filter(row=>!row.done).length),counterAccounts=computed(()=>accounts.value.filter(row=>row.id!==report.value?.account_id));
async function load(){
 const ticket=++generation;loading.value=true;error.value='';
 try{
  const [rows,list]=await Promise.all([api('/bank-reconciliations?'+new URLSearchParams({exercise_id:selectedId.value})),api('/accounts?kind=subaccount')]);
  const current=rows.find(row=>row.workflow==='direct'),result=current?await api('/bank-reconciliations/'+current.id,{timeoutMs:90000}):null;
  if(ticket===generation){report.value=result;accounts.value=list;}
 }catch(cause){if(ticket===generation)error.value=reconciliationProposalError(cause);}finally{if(ticket===generation)loading.value=false;}
}
watch([()=>company.value?.id,selectedId],()=>{generation++;report.value=null;accounts.value=[];notice.value='';error.value='';importOpen.value=false;entryId.value=null;splitMovement.value=null;if(selectedId.value)void load();},{immediate:true});
onBeforeUnmount(()=>generation++);
async function imported(){importOpen.value=false;report.value=null;splitMovement.value=null;notice.value='Extracte preparat. Ja pots posar els comptes i guardar els assentaments del llistat.';await load();}
function split(value){const row=movements.value.find(item=>String(item.id)===String(value.movement_id));if(!row||row.done)return;splitMovement.value=row;splitInitial.value=value;}
async function entrySaved(result){splitMovement.value=null;notice.value='Assentament '+result.number+' guardat al diari.'+(result.remembered?' Es recordarà el concepte.':'');await load();}
async function save(value){if(busy.value||!canWrite.value)return;saving.value=true;error.value='';try{const result=await api('/bank-reconciliations/'+report.value.id+'/entries',{method:'POST',body:{...value,version:report.value.version},timeoutMs:90000});await entrySaved(result);}catch(cause){error.value=reconciliationProposalError(cause);}finally{saving.value=false;}}
async function refresh(){if(busy.value)return;loading.value=true;try{if(report.value&&can('accounting_write'))await api('/bank-reconciliations/'+report.value.id+'/reanalyze',{method:'POST',timeoutMs:90000});await load();}catch(cause){error.value=reconciliationProposalError(cause);}finally{loading.value=false;}}
async function source(){saving.value=true;error.value='';try{await downloadFile('/bank-reconciliations/'+report.value.id+'/source',report.value.source_name);}catch(cause){error.value=reconciliationProposalError(cause);}finally{saving.value=false;}}
async function invoice(candidate){if(busy.value)return;saving.value=true;error.value='';try{const result=await transferDocumentInvoice({id:candidate.documentation_id,version:candidate.version},selectedId.value);await router.push({name:'invoices',query:{document_id:String(result.id),exercise_id:String(result.exercise_id)}});}catch(cause){error.value=documentationError(cause);}finally{saving.value=false;}}
async function removeRule(rule){if(busy.value)return;saving.value=true;error.value='';try{await api('/bank-reconciliations/'+report.value.id+'/rules/'+rule.id,{method:'DELETE',body:{version:rule.version},timeoutMs:90000});await load();}catch(cause){error.value=reconciliationProposalError(cause);}finally{saving.value=false;}}
const ledgerLink=computed(()=>{if(!report.value)return {};const bounds=bankReconciliationDates(data.value);return {name:'ledger',query:{company_id:String(company.value.id),exercise_id:selectedId.value,account_id:String(report.value.account_id),from:bounds.bookFrom<=bounds.bookThrough?bounds.bookFrom:bounds.bookThrough,to:bounds.bookThrough,exclude_closing:'false',return_to:'/conciliacion-bancaria'}};});
</script>
<template>
 <div class="page-heading"><div><h1>Conciliació bancària</h1><p class="muted">{{ company?.name }} · {{ selectedExercise?.name }}</p></div><div class="actions"><button class="button primary" :disabled="busy||!selectedExercise||!can('data_import')" @click="importOpen=true">Pujar extracte</button><button v-if="report" class="button" :disabled="busy" @click="refresh">Actualitzar llistat</button></div></div>
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p><p v-if="loading" role="status" class="muted">Preparant el llistat…</p>
 <section v-if="!report&&!loading" class="panel reconciliation-start"><h2>Puja l’extracte per començar</h2><p>Buscarem el saldo de partida amb un marge de <strong>0,03 € i 10 dies abans o després</strong>. Des d’allà tindràs els moviments en un sol llistat per posar els comptes i guardar els assentaments.</p><button class="button primary" :disabled="!selectedExercise||!can('data_import')" @click="importOpen=true">Triar extracte</button></section>
 <template v-if="report&&data">
  <section class="panel reconciliation-anchor"><div><strong>{{ data.account.name_by_user }} · {{ report.account.code }}</strong><p v-if="anchor.bank_date">Punt de partida: <strong>{{ date(anchor.bank_date) }} · {{ money(anchor.bank_balance) }} €</strong><span v-if="anchor.book_date!==anchor.bank_date">. Al major: {{ date(anchor.book_date) }}</span>.</p><p v-else-if="data.scope.initial_balance_matches">Punt de partida: saldo anterior al primer moviment, <strong>{{ money(data.scope.period_opening_balance) }} €</strong>. Llistat des del {{ date(data.source.from) }}.</p><p v-else>Des de l’inici de l’extracte: {{ date(data.source.from) }}. No s’ha trobat un saldo coincident amb el major.</p><small>Marge de 0,03 € · ±10 dies<span v-if="anchor.bank_date&&anchor.difference&&anchor.difference!=='0.00'"> · Diferència al punt de partida: {{ money(anchor.difference) }} €</span></small></div><div class="actions"><button class="button" :disabled="busy" @click="source">Descarregar extracte</button><RouterLink class="button" :to="ledgerLink">Veure major</RouterLink></div></section>
  <div class="reconciliation-list-heading"><h2>Moviments de l’extracte</h2><p><strong>{{ pending }} {{ pending===1?'pendent':'pendents' }}</strong> de {{ movements.length }} {{ movements.length===1?'moviment':'moviments' }} · Saldo final {{ money(data.bank_balance) }} €</p></div>
  <p v-if="selectedExercise?.status!=='open'" class="notice">L’exercici està tancat. Obre’l per guardar assentaments.</p>
  <div class="table-wrap panel reconciliation-worklist"><table><thead><tr><th>Data</th><th>Concepte</th><th class="amount">Import</th><th>Compte / assentament</th><th>Recordar concepte</th><th>Acció</th></tr></thead><tbody><ReconciliationMovementRow v-for="row in movements" :key="report.id+'-'+row.id" :row="row" :accounts="counterAccounts" :busy="busy" :can-write="canWrite" @save="save" @split="split" @entry="entryId=$event" @invoice="invoice" /><tr v-if="!movements.length"><td colspan="6" class="empty-cell">El saldo ja coincideix al final de l’extracte. No hi ha moviments posteriors per introduir.</td></tr></tbody></table></div>
  <p v-if="movements.length&&!pending" class="success-note">Tots els moviments del llistat estan conciliats.</p>
  <details v-if="report.rules?.length" class="panel reconciliation-rules"><summary>Conceptes que es recorden per a aquest banc ({{ report.rules.length }})</summary><div v-for="rule in report.rules" :key="rule.id"><span><strong>{{ rule.concept }}</strong> · {{ rule.direction==='out'?'Pagaments':'Cobraments' }}<small>{{ rule.counter_lines.map(line=>line.code+' '+line.name).join(' / ') }}</small></span><button class="button" :disabled="busy||!can('accounting_write')" @click="removeRule(rule)">Deixar de recordar</button></div></details>
 </template>
 <BankImportDialog v-if="importOpen" :company="company" :exercise="selectedExercise" @close="importOpen=false" @imported="imported" />
 <ReconciliationProposalForm v-if="splitMovement&&report" :report="report" :movement="splitMovement" :initial="splitInitial" :post="true" @close="splitMovement=null" @saved="entrySaved" />
 <EntryDetail v-if="entryId" :entry-id="entryId" @close="entryId=null;refresh()" />
</template>
<style scoped>.reconciliation-start{padding:28px;line-height:1.7}.reconciliation-start h2{margin:0 0 12px}.reconciliation-start .button{margin-top:20px}.reconciliation-anchor{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px;margin:20px 0}.reconciliation-anchor p{margin:10px 0}.reconciliation-anchor small{color:#65748a}.reconciliation-list-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:24px 0 14px}.reconciliation-list-heading h2{font-size:20px}.reconciliation-list-heading p{font-size:13px;color:#65748a}.reconciliation-worklist table{width:100%}.reconciliation-rules{padding:20px;margin:24px 0}.reconciliation-rules summary{font-weight:600;cursor:pointer}.reconciliation-rules>div{display:flex;justify-content:space-between;align-items:center;gap:14px;border-top:1px solid #e0e6ed;padding:14px 0;margin-top:14px}.reconciliation-rules small{display:block;color:#65748a;margin-top:7px}.amount{text-align:right}@media(max-width:850px){.reconciliation-anchor{align-items:flex-start;flex-direction:column}.reconciliation-worklist{background:none;border:0;box-shadow:none;overflow:visible}.reconciliation-worklist table,.reconciliation-worklist tbody{display:block}.reconciliation-worklist thead{display:none}.reconciliation-rules>div{flex-wrap:wrap}.reconciliation-anchor{padding:16px}}
</style>
