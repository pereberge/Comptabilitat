<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { companyHeaders } from '../services/company.js';
import { reportMoney as money, reportDate as date, downloadCsv } from '../services/report-format.js';
import { errorText } from '../locales/accounting.js';
import EntryDetail from '../components/EntryDetail.vue';
import FormDialog from '../components/FormDialog.vue';
import BankImportDialog from '../components/BankImportDialog.vue';
import AccountingReviewButton from '../components/AccountingReviewButton.vue';
import PendingInvoiceMatches from '../components/PendingInvoiceMatches.vue';
import { bankDayNumber,bankReconciliationDates } from '../../../shared/bank-reconciliation.js';

const { company, selectedId, selectedExercise } = useContext();
const reports = ref([]), chosen = ref(''), report = ref(null), loading = ref(false), error = ref('');
const entryId = ref(null), pdfUrl = ref(''), pdfLoading = ref(false);
const importOpen = ref(false);
const data = computed(() => report.value?.snapshot);
const analysisDates = computed(() => data.value?bankReconciliationDates(data.value):null);
const analysisFrom = computed(() => analysisDates.value?.bankFrom||'');
const balanceOffset = computed(() => analysisDates.value?.bankCutoff?Math.abs(bankDayNumber(analysisDates.value.bookCutoff)-bankDayNumber(analysisDates.value.bankCutoff)):0);
// Apply the same date bounds when displaying reports saved before this restriction.
const bookUnmatched = computed(() => (data.value?.book_unmatched || []).filter(row =>
  row.entry_date >= analysisDates.value.bookFrom && row.entry_date <= analysisDates.value.bookThrough));
let generation = 0;
function closePdf() { if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value); pdfUrl.value = ''; }
function message(e) {
  if(e.code==='RECONCILIATION_REIMPORT_REQUIRED')return 'Vuelve a subir el extracto original para aplicar los nuevos criterios a este informe antiguo.';
  return ['RECONCILIATION_NOT_FOUND','EXERCISE_NOT_FOUND'].includes(e.code)
    ? 'Este informe no está disponible para la empresa y el ejercicio seleccionados.' : errorText(e);
}
async function load() {
  const ticket = ++generation;
  report.value = null; reports.value = []; error.value = ''; entryId.value = null; closePdf(); pdfLoading.value = false;
  if (!selectedId.value) { loading.value = false; return; }
  loading.value = true;
  try {
    const rows = await api('/bank-reconciliations?' + new URLSearchParams({exercise_id:selectedId.value}));
    if (ticket !== generation) return;
    reports.value = rows;
    chosen.value = String(rows.find(row => String(row.id) === chosen.value)?.id || rows[0]?.id || '');
    if (chosen.value) {
      const result = await api('/bank-reconciliations/' + chosen.value);
      if (ticket === generation && String(result.exercise_id) === selectedId.value) report.value = result;
    }
  } catch (e) { if (ticket === generation) error.value = message(e); }
  finally { if (ticket === generation) loading.value = false; }
}
watch(selectedId, () => { chosen.value = ''; importOpen.value=false; load(); }, {immediate:true});
async function imported(result) { importOpen.value=false; chosen.value=String(result.id); await load(); }
async function refreshAnalysis(){
 if(!report.value||!can('accounting_write'))return load();loading.value=true;error.value='';
 try{await api('/bank-reconciliations/'+report.value.id+'/reanalyze',{method:'POST',timeoutMs:90000});await load();}
 catch(cause){error.value=message(cause);}finally{loading.value=false;}
}
onBeforeUnmount(() => { generation++; closePdf(); });
function ledgerLink(accountId) {
  return {name:'ledger',query:{company_id:String(company.value.id),exercise_id:selectedId.value,
    account_id:String(accountId),from:analysisDates.value.bookFrom<=analysisDates.value.bookThrough?analysisDates.value.bookFrom:analysisDates.value.bookThrough,to:analysisDates.value.bookThrough,
    exclude_closing:'false',return_to:'/conciliacion-bancaria'}};
}
async function openPdf() {
  const ticket = generation, sourceId = report.value.id;
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(),15000);
  pdfLoading.value = true; error.value = '';
  try {
    const response = await fetch('/api/bank-reconciliations/' + sourceId + '/source', {headers:companyHeaders(),signal:controller.signal});
    if (!response.ok) throw Object.assign(new Error('PDF'),{code:'SERVICE_UNAVAILABLE'});
    const blob = await response.blob();
    if (ticket === generation) {
      closePdf(); const url=URL.createObjectURL(blob);
      if(report.value.source_mime==='text/csv'){const anchor=document.createElement('a');anchor.href=url;anchor.download=data.value.source.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
      else pdfUrl.value=url;
    }
  } catch (e) { if (ticket === generation) error.value = message(e); }
  finally { clearTimeout(timeout); if (ticket === generation) pdfLoading.value = false; }
}
function exportCsv() {
  const d = data.value, numeric = value => ({amount:value});
  const rows = [['PROPUESTAS PENDIENTES DE VALIDAR'],['Empresa',d.company.name],['Ejercicio',d.exercise.name],
    ['Banco',d.account.name_by_user,'Cuenta',d.account.code],['Extracto',d.source.name],
    ['Última fecha cuadrada',d.scope.last_matching_date?date(d.scope.last_matching_date):'Sin saldo coincidente','Saldo',d.scope.last_matching_balance?numeric(d.scope.last_matching_balance):''],
    ['Fecha del saldo coincidente en el mayor',analysisDates.value.bookCutoff?date(analysisDates.value.bookCutoff):'Sin saldo coincidente'],
    ['Fecha del saldo contable analizado',date(analysisDates.value.bookThrough)],
    ['Margen del saldo',numeric(d.scope.balance_match_tolerance||'0.00'),'Ventana de días',d.scope.balance_match_max_days||0],
    ['Saldo de partida del mayor',d.scope.last_matching_book_balance?numeric(d.scope.last_matching_book_balance):'','Diferencia contabilidad menos banco',d.scope.balance_match_difference?numeric(d.scope.balance_match_difference):''],
    ['Saldo contable analizado',numeric(d.current_book_balance)],['Saldo del extracto',numeric(d.bank_balance)],
    ['Saldo previsto al aplicar las propuestas',numeric(d.projected_balance)],
    ['Contabilidad modificada desde el análisis',report.value.current.ledger_changed?'Sí; revisar propuestas':'No'],
    ['Propuesta','Fecha','Concepto','Cuenta','Nombre','Debe','Haber','Criterio','Confianza','Estado']];
  for (const p of d.proposals) for (const line of p.lines) rows.push([p.id,date(p.date),p.concept,line.code,
    line.code === d.account.code ? d.account.name_by_user : line.name,numeric(line.debit),numeric(line.credit),
    p.basis,p.confidence,'PROPUESTA, NO ES UN ASIENTO CONTABILIZADO']);
  if(d.unresolved?.length){rows.push([],['MOVIMIENTOS PENDIENTES DE JUSTIFICANTE O CONTRAPARTIDA'],['Fecha','Concepto','Importe','Motivo']);for(const row of d.unresolved)rows.push([date(row.date),row.concept,numeric(row.amount),row.reason]);}
  if(d.scope.period_opening_balance!==undefined)rows.push([],['Saldo bancario anterior al tramo',numeric(d.scope.period_opening_balance)],['Diferencia tras las propuestas disponibles',numeric(d.unresolved_difference_book_minus_bank)]);
  const invoiceMatches=report.value.pending_invoice_matches||d.pending_invoice_matches||[];
  if(invoiceMatches.length){rows.push([],['POSIBLES FACTURAS PENDIENTES DE DOCUMENTACIÓN'],['Fecha banco','Concepto banco','Importe banco','Documento','Referencia','Proveedor / cliente','Total factura','Criterio']);for(const match of invoiceMatches)for(const candidate of match.candidates)rows.push([date(match.date),match.concept,numeric(match.amount),candidate.title,candidate.reference,candidate.party,numeric(candidate.total_amount),candidate.basis]);}
  downloadCsv('propuestas-conciliacion-' + d.account.code + '-' + d.source.to + '.csv',rows);
}
</script>

<template>
  <div class="page-heading"><div><h1>Conciliación bancaria</h1><p class="muted">{{ company?.name }} · Ejercicio {{ selectedExercise?.name }}</p></div>
    <div class="actions"><button class="button primary" :disabled="!can('data_import')||(!selectedExercise)" @click="importOpen=true">Subir extracto</button><button class="button" :disabled="loading || !selectedId" @click="refreshAnalysis">Actualizar conciliación</button><AccountingReviewButton :disabled="loading" /></div>
  </div>
  <p v-if="!selectedExercise" class="notice">Selecciona un ejercicio para consultar sus conciliaciones.</p>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p>
  <p v-if="loading" role="status">Cargando conciliación…</p>
  <section v-else-if="selectedExercise && !reports.length && !error" class="panel reconciliation-empty">
    <h2>Sin conciliaciones guardadas</h2><p>No hay informes para {{ company?.name }} en {{ selectedExercise.name }}. Pulsa Subir extracto para detectar el banco y preparar la conciliación.</p>
  </section>
  <label v-if="reports.length > 1" class="reconciliation-select">Extracto bancario
    <select v-model="chosen" :disabled="loading" @change="load"><option v-for="item in reports" :key="item.id" :value="String(item.id)">{{ item.bank_name }} · {{ item.account_code }} · {{ date(item.statement_date) }}</option></select>
  </label>
  <template v-if="report && data">
    <section class="panel reconciliation-intro">
      <div><p class="eyebrow">{{ data.account.code }}</p><h2>{{ data.account.name_by_user }}</h2>
        <p v-if="data.account.iban_masked" class="muted">{{ data.account.iban_masked }}</p>
        <p v-if="data.scope.last_matching_date">Punto de partida: <strong>{{ date(data.scope.last_matching_date) }} · {{ money(data.scope.last_matching_balance) }} €</strong></p>
        <p v-else><strong>{{ data.scope.initial_balance_matches?'El saldo anterior al tramo coincide':'Sin fecha con saldo coincidente' }}</strong></p>
        <p v-if="balanceOffset" class="muted">Saldo comparable en el mayor el <strong>{{ date(analysisDates.bookCutoff) }}</strong> · {{ balanceOffset }} días de diferencia. Se continúa después de cada fecha.</p>
        <p v-if="data.scope.balance_match_tolerance" class="muted">Margen del saldo: 0,03 € · hasta 10 días antes o después.<span v-if="data.scope.last_matching_date"> Saldo del mayor: {{ money(data.scope.last_matching_book_balance) }} € · diferencia contabilidad − banco: {{ money(data.scope.balance_match_difference) }} €.</span></p>
        <p v-if="report.last_matching_entry_id" class="muted">Hasta el asiento <button class="report-link" @click="entryId=report.last_matching_entry_id">{{ data.scope.last_book_entry }}</button> del ejercicio.</p>
      </div>
      <div class="actions"><RouterLink class="button" :to="ledgerLink(report.account_id)">Ver mayor</RouterLink>
        <button class="button" :disabled="pdfLoading" @click="openPdf">{{ pdfLoading ? 'Abriendo documento…' : report.source_mime==='text/csv'?'Descargar CSV original':'Ver PDF original' }}</button>
        <button class="button" @click="exportCsv">Exportar propuestas CSV</button></div>
    </section>
    <p v-if="report.current.ledger_changed" class="notice error-notice reconciliation-notice" role="alert"><strong>La contabilidad ha cambiado desde este análisis.</strong>
      Saldo contable actual a {{ date(report.current.as_of) }}: {{ money(report.current.book_balance) }} €; diferencia con el extracto: {{ money(report.current.difference_book_minus_bank) }} €.
      Revisa las propuestas y los movimientos del mayor antes de utilizarlos. Los importes del informe conservan el análisis original.</p>
    <p v-else class="notice reconciliation-notice" role="status"><strong>Propuestas pendientes de validar.</strong> Guardar este informe no contabiliza los apuntos.
      Saldo contable a {{ date(report.current.as_of) }}: {{ money(report.current.book_balance) }} €.</p>
    <div class="portfolio-summary reconciliation-summary">
      <section class="panel"><p class="muted">Saldo contable analizado</p><strong>{{ money(data.current_book_balance) }} €</strong><small>A {{ date(analysisDates.bookThrough) }}</small></section>
      <section class="panel"><p class="muted">Saldo del extracto</p><strong>{{ money(data.bank_balance) }} €</strong><small>A {{ date(data.source.to) }}</small></section>
      <section class="panel"><p class="muted">Diferencia contabilidad − banco</p><strong>{{ money(data.difference_book_minus_bank) }} €</strong><small>En el análisis original</small></section>
      <section class="panel" :class="{'reconciliation-projected':data.projected_balance===data.bank_balance}"><p>Saldo previsto con las propuestas</p><strong>{{ money(data.projected_balance) }} €</strong><small>{{ data.projected_balance===data.bank_balance?'Coincide con el extracto · Pendiente de validar':'Quedan diferencias pendientes de resolver' }}</small></section>
    </div>
    <section class="reconciliation-section"><h2>{{ data.scope.bank_pending.length }} movimientos bancarios pendientes en el análisis</h2>
      <p v-if="analysisFrom<=data.source.to" class="muted">Solo movimientos del extracto del {{ date(analysisFrom) }} al {{ date(data.source.to) }}. {{ data.scope.last_matching_date?balanceOffset?'En el mayor se continúa después del '+date(analysisDates.bookCutoff)+'.':'Se excluyen la fecha del último saldo cuadrado y todas las anteriores.':'Los apuntes anteriores al extracto solo se usan para calcular el saldo inicial.' }} Fechas de operación y valor según el extracto.</p>
      <p v-else class="muted">El saldo coincide al final del extracto. No hay movimientos posteriores que revisar.</p>
      <div class="table-wrap panel"><table><caption class="sr-only">Movimientos del extracto posteriores a la última fecha cuadrada</caption><thead><tr><th>Fecha</th><th>Valor</th><th>Concepto</th><th class="amount">Importe</th><th class="amount">Saldo</th><th>PDF</th></tr></thead>
        <tbody><tr v-for="row in data.scope.bank_pending" :key="row.id"><td>{{ date(row.date) }}</td><td>{{ date(row.value_date) }}</td><td class="bank-concept">{{ row.concept }}</td><td class="amount">{{ money(row.amount) }}</td><td class="amount">{{ money(row.balance) }}</td><td>Pág. {{ row.page }}</td></tr></tbody>
      </table></div>
    </section>
    <PendingInvoiceMatches :matches="report.pending_invoice_matches||data.pending_invoice_matches||[]" />
    <section class="reconciliation-section"><h2>{{ data.proposals.length }} propuestas de asientos</h2>
      <p v-if="data.analysis_version===2" class="muted">Se priorizan tus asientos anteriores. Las clasificaciones sin precedente se identifican como propuestas y necesitan justificante.</p>
      <p v-if="data.analysis_version===2 && data.proposals.length" class="muted">Referencia para las clasificaciones propuestas: <a href="https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884" target="_blank" rel="noopener noreferrer">Plan General de Contabilidad, BOE</a>.</p>
      <p v-else-if="data.analysis_version!==2" class="muted">Primero se siguen los criterios de tus asientos anteriores. P0 liquida el IVA y no modifica el banco; P1 a P4 explican los cuatro movimientos del extracto.</p>
      <details v-for="proposal in data.proposals" :key="proposal.id" class="panel reconciliation-proposal" open>
        <summary><span><strong>{{ proposal.id }} · {{ date(proposal.date) }}</strong> {{ proposal.concept }}</span><span class="proposal-status">Propuesta</span></summary>
        <div class="proposal-body"><p><strong>Criterio:</strong> {{ proposal.basis }}</p><p class="muted">Confianza: {{ proposal.confidence }} · Efecto en el banco: {{ money(proposal.bank_effect) }} €</p>
          <div class="table-wrap"><table><thead><tr><th>Cuenta</th><th>Nombre</th><th class="amount">Debe</th><th class="amount">Haber</th></tr></thead><tbody>
            <tr v-for="line in proposal.lines" :key="line.account_id"><td><RouterLink :to="ledgerLink(line.account_id)">{{ line.code }}</RouterLink></td><td>{{ line.code === data.account.code ? data.account.name_by_user : line.name }}</td><td class="amount">{{ money(line.debit) }}</td><td class="amount">{{ money(line.credit) }}</td></tr>
          </tbody></table></div>
        </div>
      </details>
    </section>
    <section v-if="data.analysis_version===2" class="panel reconciliation-review">
      <h2>Diferencias pendientes de resolver</h2>
      <p>Saldo bancario anterior al primer movimiento del tramo: <strong>{{ money(data.scope.period_opening_balance) }} €</strong> · Saldo contable anterior: {{ money(data.scope.book_opening_balance) }} €.</p>
      <p v-if="data.scope.last_matching_date&&data.scope.balance_match_difference&&data.scope.balance_match_difference!=='0.00'">Diferencia en el punto de partida: <strong>{{ money(data.scope.balance_match_difference) }} €</strong>, dentro del margen de 0,03 €. Se conserva en los saldos del informe.</p>
      <p v-else-if="!data.scope.last_matching_date&&data.scope.opening_difference_bank_minus_book!=='0.00'">Diferencia inicial banco − contabilidad: <strong>{{ money(data.scope.opening_difference_bank_minus_book) }} €</strong>. Hace falta el saldo o extracto anterior; no se ha creado un asiento de ajuste.</p>
      <p>Diferencia contabilidad − banco después de las propuestas disponibles: <strong>{{ money(data.unresolved_difference_book_minus_bank) }} €</strong>.</p>
      <p v-if="data.unresolved.length">{{ data.unresolved.length }} movimientos necesitan justificante o contrapartida.</p>
    </section>
    <section v-if="data.unresolved?.length" class="reconciliation-section">
      <h2>Movimientos pendientes de clasificar</h2><div class="table-wrap panel"><table><thead><tr><th>Fecha</th><th>Concepto</th><th class="amount">Importe</th><th>Comprobación pendiente</th></tr></thead><tbody><tr v-for="row in data.unresolved" :key="row.movement_id"><td>{{ date(row.date) }}</td><td class="bank-concept">{{ row.concept }}</td><td class="amount">{{ money(row.amount) }}</td><td class="bank-concept">{{ row.reason }}</td></tr></tbody></table></div>
    </section>
    <section v-if="data.scope.matched_movements?.length" class="reconciliation-section">
      <h2>Movimientos con coincidencia en el diario</h2><div class="table-wrap panel"><table><thead><tr><th>Fecha</th><th>Concepto</th><th class="amount">Importe</th><th>Fecha mayor</th><th>Asiento</th></tr></thead><tbody><tr v-for="row in data.scope.matched_movements" :key="row.id"><td>{{ date(row.date) }}</td><td>{{ row.concept }}</td><td class="amount">{{ money(row.amount) }}</td><td>{{ date(row.book_date||row.date) }}</td><td><button class="report-link" @click="entryId=row.entry_id">{{ row.entry_number }}</button></td></tr></tbody></table></div>
    </section>
    <section v-if="bookUnmatched.length" class="reconciliation-section">
      <h2>Apuntes contables sin coincidencia en el extracto</h2><p class="muted">Mayor del {{ date(analysisDates.bookFrom) }} al {{ date(analysisDates.bookThrough) }}.</p><div class="table-wrap panel"><table><thead><tr><th>Fecha</th><th>Concepto</th><th class="amount">Importe</th><th>Asiento</th></tr></thead><tbody><tr v-for="row in bookUnmatched" :key="row.entry_id+':'+row.position"><td>{{ date(row.entry_date) }}</td><td>{{ row.description }}</td><td class="amount">{{ money(row.amount) }}</td><td><button class="report-link" @click="entryId=row.entry_id">{{ row.number }}</button></td></tr></tbody></table></div>
    </section>
    <section v-if="data.vat" class="panel reconciliation-review"><h2>IVA {{ data.vat.period }}</h2>
      <p>IVA repercutido: <strong>{{ money(data.vat.output) }} €</strong> − IVA soportado: <strong>{{ money(data.vat.input) }} €</strong> = <strong>{{ money(data.vat.due) }} €</strong> a ingresar.</p>
      <p>El importe coincide con el cargo bancario. Hay que contrastarlo con el modelo 303 antes de validar P0 y P4.</p>
      <p class="notice">Quedan {{ money(data.vat.previous_output_residual) }} € de IVA repercutido del segundo trimestre pendientes de revisar por separado. No se incluyen en este ajuste bancario.</p>
    </section>
    <section v-if="data.review_notes?.length" class="panel reconciliation-review"><h2>Comprobaciones antes de contabilizar</h2>
      <p v-for="note in data.review_notes" :key="note.title"><strong>{{ note.title }}:</strong> {{ note.detail }}</p>
    </section>
    <section v-if="data.alternatives?.length" class="panel reconciliation-review"><h2>Alternativas propuestas para revisar</h2>
      <p v-for="note in data.alternatives" :key="note.title"><strong>{{ note.title }}:</strong> {{ note.detail }}</p>
      <p class="muted">Referencia: <a href="https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884" target="_blank" rel="noopener noreferrer">Plan General de Contabilidad, BOE</a>.</p>
    </section>
    <p class="muted reconciliation-source">Documento: {{ data.source.name }} · {{ data.source.pages }} páginas · {{ data.source.rows }} movimientos · {{ date(data.source.from) }} a {{ date(data.source.to) }}.</p>
  </template>
  <EntryDetail v-if="entryId" :entry-id="entryId" @close="entryId=null" />
  <BankImportDialog v-if="importOpen && selectedExercise" :exercise="selectedExercise" :company="company" @close="importOpen=false" @imported="imported" />
  <FormDialog v-if="pdfUrl && data" :title="data.source.name" @close="closePdf">
    <iframe class="reconciliation-pdf" :src="pdfUrl" title="Extracto bancario original"></iframe>
    <a class="button" :href="pdfUrl" :download="data.source.name">Descargar PDF</a>
  </FormDialog>
</template>

<style scoped>
.reconciliation-notice{display:block;line-height:1.65}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.reconciliation-intro{padding:22px;display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.reconciliation-intro h2{margin:5px 0 12px}.reconciliation-intro p+p{margin-top:8px}.reconciliation-summary small{display:block;margin-top:10px;font-size:12px;color:#52677f}.reconciliation-projected{background:#edf6f0}.reconciliation-section{margin:30px 0}.reconciliation-section h2{font-size:20px;margin-bottom:10px}.reconciliation-section>.muted{margin-bottom:16px}.bank-concept{max-width:440px;overflow-wrap:anywhere}.reconciliation-proposal{margin:12px 0;overflow:hidden}.reconciliation-proposal summary{display:flex;justify-content:space-between;gap:16px;padding:18px;cursor:pointer;background:#f7f9fc;list-style:revert}.reconciliation-proposal summary strong{margin-right:10px}.proposal-status{font-size:12px;white-space:nowrap;color:#836624;background:#fff5dc;padding:4px 8px;border-radius:5px;align-self:flex-start}.proposal-body{padding:18px}.proposal-body>p{margin-bottom:12px;line-height:1.6}.reconciliation-review{padding:22px;margin:18px 0}.reconciliation-review h2{font-size:19px;margin-bottom:12px}.reconciliation-review p{margin:12px 0;line-height:1.65}.reconciliation-source{font-size:12px;overflow-wrap:anywhere;line-height:1.6}.reconciliation-pdf{width:100%;height:65vh;border:1px solid #dce4ee;margin-bottom:14px}.reconciliation-empty{padding:28px;line-height:1.7}.reconciliation-empty h2{margin-bottom:12px}.reconciliation-select{max-width:600px;margin-bottom:20px}.reconciliation-intro+.notice{margin-top:20px}
@media(max-width:600px){.reconciliation-intro,.reconciliation-review{padding:16px}.reconciliation-proposal summary{padding:14px}.proposal-body{padding:12px}.reconciliation-summary strong{font-size:18px}.reconciliation-intro .actions{flex-direction:column;align-items:stretch;width:100%}}
</style>
