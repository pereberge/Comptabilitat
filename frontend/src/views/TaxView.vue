<script setup>
import {computed,nextTick,onBeforeUnmount,ref,watch} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useContext} from '../composables/context.js';
import {useAccess} from '../composables/access.js';
import {api} from '../services/accounting.js';
import {reportMoney as money,reportDate as date,downloadCsv} from '../services/report-format.js';
import {errorText} from '../locales/accounting.js';
import {tax as t} from '../locales/tax.js';
import {vatCategories,vatModelRows,vatPeriod} from '../../../shared/vat-model.js';
import VatBox from '../components/VatBox.vue';
import FormDialog from '../components/FormDialog.vue';
import InvoiceDetail from '../components/InvoiceDetail.vue';
import EntryDetail from '../components/EntryDetail.vue';
import TaxJournalPdf from '../components/TaxJournalPdf.vue';
import TaxFilingDialog from '../components/TaxFilingDialog.vue';
import TaxFiscalLines from '../components/TaxFiscalLines.vue';
import TaxSettlementProposal from '../components/TaxSettlementProposal.vue';
import {appendVatDetailCsv} from '../services/vat-details.js';
import '../assets/tax.css';

const {company,exercises,selectedExercise}=useContext(),{can}=useAccess(),route=useRoute(),router=useRouter();
const current=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit'}).formatToParts(new Date());
const currentYear=Number(current.find(part=>part.type==='year').value),currentMonth=Number(current.find(part=>part.type==='month').value);
const filters=ref({year:String(currentYear),frequency:'quarterly',period:'1'}),result=ref(null),input=ref({}),loading=ref(false),busy=ref(false),error=ref(''),notice=ref(''),dirty=ref(false);
const selectedBox=ref(null),search=ref(''),editing=ref(null),editError=ref(''),invoiceId=ref(null),entryId=ref(null);let generation=0;
const journalPdf=ref(null);
const filingOpen=ref(false);
const settlementOpen=ref(false);
const years=computed(()=>{const set=new Set([currentYear,Number(filters.value.year)]);for(const exercise of exercises.value){const first=Number(exercise.start_date.slice(0,4)),last=Number(exercise.end_date.slice(0,4));for(let year=first;year<=last&&year<=first+20;year++)set.add(year);}return [...set].sort((a,b)=>b-a);});
const periods=computed(()=>filters.value.frequency==='monthly'?t.months.map((label,index)=>({id:String(index+1),label})):Array.from({length:4},(_,index)=>({id:String(index+1),label:(index+1)+'T · '+t.months[index*3]+' – '+t.months[index*3+2]})));
const matches=computed(()=>result.value&&String(result.value.period.year)===filters.value.year&&result.value.period.frequency===filters.value.frequency&&String(result.value.period.period)===filters.value.period);
const ready=computed(()=>matches.value&&!loading.value&&!busy.value);
const calculationDirty=computed(()=>result.value&&JSON.stringify(input.value)!==JSON.stringify(result.value.input));
const rows=section=>vatModelRows.filter(row=>row.section===section);
const outputRows=computed(()=>rows('output')),deductibleRows=computed(()=>rows('deductible')),informationRows=computed(()=>rows('information'));
const contributionMap=computed(()=>new Map((result.value?.contributions[selectedBox.value]||[]).map(row=>[row.key,row.amount])));
const detailRows=computed(()=>{
 const term=search.value.toLocaleLowerCase('es-ES').trim();
 return (result.value?.records||[]).filter(row=>selectedBox.value==='all'||selectedBox.value==='review'?(selectedBox.value==='all'||row.category==='pending'||!row.reviewed):contributionMap.value.has(row.key)).filter(row=>!term||[row.reference,row.party_name,row.description,row.party_tax_id].some(value=>value?.toLocaleLowerCase('es-ES').includes(term)));
});
const detailTitle=computed(()=>selectedBox.value==='all'?'Todas las operaciones del período':selectedBox.value==='review'?'Operaciones pendientes de revisión':'Detalle de la casilla '+selectedBox.value);
const manualDetail=computed(()=>contributionMap.value.has('manual:compensation')?'Al total de las facturas se resta la compensación anterior aplicada: '+money(result.value.boxes['78'])+' €. Este ajuste procede del saldo introducido en los criterios.':'');
const cleanOverrides=()=>input.value.overrides.filter(override=>result.value.records.some(row=>row.key===override.key&&row.fingerprint===override.fingerprint));
function query(){return new URLSearchParams(filters.value).toString();}
function message(cause){return t.errors[cause.code]||errorText(cause);}
async function consult(){
 if(busy.value)return;
 const ticket=++generation;loading.value=true;error.value='';notice.value='';result.value=null;selectedBox.value=null;editing.value=null;invoiceId.value=null;entryId.value=null;journalPdf.value=null;settlementOpen.value=false;
 try{vatPeriod(filters.value);const data=await api('/tax/vat?'+query(),{timeoutMs:45000});if(ticket!==generation)return;result.value=data;input.value=structuredClone(data.input);dirty.value=false;await router.replace({query:{year:filters.value.year,frequency:filters.value.frequency,period:filters.value.period}});}
 catch(cause){if(ticket===generation)error.value=message(cause);}
 finally{if(ticket===generation)loading.value=false;}
}
async function calculate(nextInput=input.value,{save=false}={}){
 if(!ready.value)return false;const ticket=++generation,draftBefore=result.value.draft;busy.value=true;error.value='';notice.value='';
 try{
  const data=await api('/tax/vat/'+(save?'draft':'preview')+'?'+query(),{method:save?'PUT':'POST',body:save?{version:result.value.draft.version,input:nextInput}:nextInput,timeoutMs:45000});
  if(ticket!==generation)return false;if(!save)data.draft=draftBefore;result.value=data;input.value=structuredClone(data.input);dirty.value=!save;notice.value=save?'Borrador guardado.':'Cálculo actualizado. Guarda el borrador para conservar los cambios.';return true;
 }catch(cause){if(ticket===generation)error.value=message(cause);return false;}finally{if(ticket===generation)busy.value=false;}
}
function settingsChanged(){dirty.value=true;}
function frequencyChanged(){filters.value.period='1';}
async function showDetail(box){selectedBox.value=box;search.value='';await nextTick();document.getElementById('vat-detail')?.scrollIntoView({behavior:'smooth',block:'start'});}
async function showSettlement(){settlementOpen.value=true;await nextTick();document.getElementById('vat-settlement')?.scrollIntoView({behavior:'smooth',block:'start'});}
function edit(row){editing.value={...row};editError.value='';}
function override(row){return {key:row.key,fingerprint:row.fingerprint,category:row.category,base:row.base,rate:row.rate,deductible_percent:row.deductible_percent};}
async function applyEdit(){
 if(editing.value.category==='pending'){editError.value='Selecciona el tratamiento fiscal de la operación.';return;}
 const next={...input.value,overrides:[...cleanOverrides().filter(row=>row.key!==editing.value.key),override(editing.value)]};
 if(await calculate(next))editing.value=null;else editError.value=error.value;
}
async function confirmProposals(){
 const proposals=result.value.records.filter(row=>row.category!=='pending'&&!row.reviewed),keys=new Set(proposals.map(row=>row.key));
 await calculate({...input.value,overrides:[...cleanOverrides().filter(row=>!keys.has(row.key)),...proposals.map(override)]});
}
function exportCsv(){
 const data=result.value,amount=value=>({amount:value||'0.00'}),rows=[['Modelo 303',data.provisional?'Borrador pendiente de revisión':'Borrador revisado'],['Empresa',data.company.name,'NIF',data.company.tax_id||''],['Ejercicio',data.period.year,'Período',data.period.code],['Desde',data.period.from,'Hasta',data.period.to],[],['Casilla','Concepto','Importe']];
 for(const row of vatModelRows){if(row.base)rows.push([row.base,row.label+' · Base',amount(data.boxes[row.base])]);if(row.tax)rows.push([row.tax,row.label+' · Cuota',amount(data.boxes[row.tax])]);}
 for(const [box,label]of [['27','Total IVA devengado'],['45','Total IVA deducible'],['46','Resultado régimen general'],['110','Compensaciones anteriores'],['78','Compensación aplicada'],['87','Compensación anterior pendiente'],['71','Resultado']])rows.push([box,label,amount(data.boxes[box])]);
 appendVatDetailCsv(rows,data.records);
 downloadCsv('modelo-303-'+data.period.year+'-'+data.period.code+'.csv',rows);
}
function print(){window.print();}
watch(()=>selectedExercise.value?.id,()=>{
 const year=Number(selectedExercise.value?.start_date.slice(0,4)||currentYear),q=route.query;
 const candidate={year:String(q.year||year),frequency:q.frequency||'quarterly',period:String(q.period||(year===currentYear?Math.ceil(currentMonth/3):4))};
 try{vatPeriod(candidate);filters.value=candidate;}catch{filters.value={year:String(year),frequency:'quarterly',period:String(year===currentYear?Math.ceil(currentMonth/3):4)};}
 void consult();
},{immediate:true});
onBeforeUnmount(()=>generation++);
</script>

<template>
 <div class="tax-page">
  <div class="page-heading tax-controls"><div><p class="eyebrow">{{ company?.name }}</p><h1>{{ t.title }}</h1><p class="muted">{{ t.model }} · {{ t.subtitle }}</p></div><div class="actions"><button v-if="can('accounting_write')" class="button primary" :disabled="!ready||calculationDirty||!result?.filing?.ready" @click="filingOpen=true">Archivo de presentación .303</button><button class="button" :disabled="!ready||calculationDirty" @click="exportCsv">Descargar CSV</button><button class="button" :disabled="!ready||calculationDirty" @click="print">Imprimir / guardar PDF</button></div></div>
  <form class="filters tax-controls tax-filters" @submit.prevent="consult">
   <label>Año natural<select v-model="filters.year" aria-label="Año natural" :disabled="busy||loading"><option v-for="year in years" :key="year" :value="String(year)">{{ year }}</option></select></label>
   <label>Liquidación<select v-model="filters.frequency" aria-label="Liquidación" :disabled="busy||loading" @change="frequencyChanged"><option value="quarterly">Trimestral</option><option value="monthly">Mensual</option></select></label>
   <label>Período<select v-model="filters.period" aria-label="Período" :disabled="busy||loading"><option v-for="period in periods" :key="period.id" :value="period.id">{{ period.label }}</option></select></label>
   <button class="button primary" :disabled="loading||busy">{{ loading?'Calculando…':'Ver modelo' }}</button>
  </form>
  <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="notice" class="notice tax-controls" role="status">{{ notice }}</p>
  <p v-if="loading" class="notice" role="status">Consultando facturas y apuntes de IVA…</p>
  <p v-if="result&&!matches" class="notice tax-controls">Pulsa «Ver modelo» para consultar el período seleccionado.</p>
  <p v-if="result&&matches&&result.filing?.issues.length" class="muted tax-controls">Para preparar el archivo de presentación: {{ result.filing.issues.map(code=>t.errors[code]).join(' ') }}</p>
  <template v-if="result&&matches">
   <div class="tax-toolbar tax-controls"><div><strong>{{ dirty?'Cambios sin guardar':result.draft.version?'Borrador guardado':'Cálculo sin guardar' }}</strong><span v-if="result.draft.updated_at" class="muted"> · {{ String(result.draft.updated_at).slice(0,10) }}</span></div><button v-if="can('accounting_write')" class="button primary" :disabled="!ready" @click="calculate(input,{save:true})">{{ busy?'Procesando…':'Guardar borrador' }}</button></div>
   <section class="panel tax-settings tax-controls" aria-label="Criterios del borrador">
    <div><h2>Criterios de la liquidación</h2><p class="muted">Emitidas: fecha de factura. Recibidas: fecha contable. Los diarios importados usan la fecha del asiento. El período incluye todos los ejercicios contables de este año natural.</p></div>
    <label class="checkbox-label"><input v-model="input.confirmed_general" type="checkbox" :disabled="!can('accounting_write')||busy" @change="settingsChanged">Confirmo régimen general, tributación al Estado al 100 % y clasificación fiscal de las operaciones. Reviso la deducibilidad de las compras.</label>
    <div class="tax-compensation"><label>Compensación pendiente anterior · casilla 110<input v-model="input.compensation_pending" inputmode="decimal" :disabled="!can('accounting_write')||busy" @input="settingsChanged"></label><label class="checkbox-label"><input v-model="input.apply_compensation" type="checkbox" :disabled="!can('accounting_write')||busy" @change="settingsChanged">Aplicar la compensación máxima posible</label><button v-if="can('accounting_write')" class="button" :disabled="!ready" @click="calculate()">Recalcular</button></div>
    <p class="muted">La compensación se introduce desde la última declaración presentada. Mensual y trimestral son borradores alternativos; guardar uno no presenta ni arrastra saldos al siguiente.</p>
   </section>
   <div class="tax-review-controls tax-controls"><button class="button" :disabled="!ready" @click="showDetail('all')">Ver las {{ result.records.length }} líneas fiscales</button><button class="button" :disabled="!ready||calculationDirty" @click="showSettlement">Proponer asiento de IVA</button><button v-if="result.pending_count||result.unreviewed_count" class="button" :disabled="!ready" @click="showDetail('review')">Revisar {{ result.pending_count+result.unreviewed_count }} operaciones</button><button v-if="result.unreviewed_count&&can('accounting_write')" class="button" :disabled="!ready" @click="confirmProposals">Confirmar {{ result.unreviewed_count }} clasificaciones propuestas</button></div>
   <button v-if="result.stale_keys.length&&can('accounting_write')" class="button tax-controls" :disabled="!ready" @click="calculate({...input,overrides:cleanOverrides()})">Descartar revisiones obsoletas y recalcular</button>
   <p v-if="calculationDirty" class="notice tax-controls">Hay criterios modificados. Recalcula o guarda para actualizar los importes del modelo.</p>
   <p v-if="result.provisional" class="notice tax-warning" role="status"><strong>Borrador pendiente de revisión.</strong> <span v-if="!result.input.confirmed_general">Confirma los criterios y recalcula. </span><span v-if="result.pending_count">{{ result.pending_count }} operaciones sin clasificar están fuera de las casillas. </span><span v-if="result.unreviewed_count">{{ result.unreviewed_count }} propuestas de apuntes pendientes de confirmar. </span><span v-if="result.stale_keys.length">Han cambiado o desaparecido {{ result.stale_keys.length }} operaciones revisadas; vuelve a revisarlas. </span><span v-if="!result.layout_supported">Las casillas están verificadas para 2025 y 2026; contrasta el diseño del ejercicio elegido. </span></p>
   <article class="vat-model" aria-label="Borrador del modelo 303">
    <header class="vat-model-heading"><div><p class="eyebrow">HACIENDA · BORRADOR DE TRABAJO</p><h2>Impuesto sobre el Valor Añadido</h2><p>Autoliquidación · Régimen general</p></div><div class="vat-model-number">Modelo<strong>303</strong></div></header>
    <div class="vat-identification"><div><small>NIF</small><strong>{{ result.company.tax_id||'Sin NIF configurado' }}</strong></div><div><small>Razón social</small><strong>{{ result.company.name }}</strong></div><div><small>Ejercicio</small><strong>{{ result.period.year }}</strong></div><div><small>Período</small><strong>{{ result.period.code }}</strong></div></div>
    <p class="vat-period">{{ date(result.period.from) }} — {{ date(result.period.to) }} · Importes en euros. Pulsa una casilla para ver su origen.</p>
    <section v-for="[section,label,modelRows] in [['output','IVA devengado',outputRows],['deductible','IVA deducible',deductibleRows]]" :key="section" class="vat-section">
     <h3>{{ label }}</h3><div class="table-wrap"><table class="vat-table"><thead><tr><th>Concepto</th><th>Base imponible</th><th v-if="section==='output'">Tipo %</th><th>Cuota</th></tr></thead><tbody><tr v-for="row in modelRows" :key="row.base||row.tax"><th scope="row">{{ row.label }}</th><td><VatBox v-if="row.base" :code="row.base" :value="result.boxes[row.base]" :label="row.label+' · Base imponible'" @select="showDetail" /></td><td v-if="section==='output'" class="vat-rate"><template v-if="row.rate"><small>{{ row.type }}</small>{{ money(row.rate) }} %</template><span v-else>—</span></td><td><VatBox :code="row.tax" :value="result.boxes[row.tax]" :label="row.label+' · Cuota'" @select="showDetail" /></td></tr></tbody></table></div>
     <div class="vat-total"><strong>{{ section==='output'?'Total cuota devengada':'Total a deducir' }}</strong><VatBox :code="section==='output'?'27':'45'" :value="result.boxes[section==='output'?'27':'45']" :label="label+' · Total'" @select="showDetail" /></div>
    </section>
    <section v-if="informationRows.some(row=>result.contributions[row.base]?.length)" class="vat-section"><h3>Información adicional</h3><div v-for="row in informationRows.filter(row=>result.contributions[row.base]?.length)" :key="row.base" class="vat-total"><span>{{ row.label }}</span><VatBox :code="row.base" :value="result.boxes[row.base]" :label="row.label" @select="showDetail" /></div></section>
    <section class="vat-section"><h3>Resultado</h3><div v-for="[box,label] in [['46','Resultado del régimen general'],['64','Suma de resultados'],['66','Atribuible a la Administración del Estado · 100 %']]" :key="box" class="vat-total"><span>{{ label }}</span><VatBox :code="box" :value="result.boxes[box]" :label="label" @select="showDetail" /></div><div v-for="[box,label] in [['110','Cuotas a compensar de períodos anteriores'],['78','Compensación aplicada en este período'],['87','Saldo anterior pendiente para períodos posteriores']]" :key="box" class="vat-total"><span>{{ label }}</span><div class="vat-static-box"><small>{{ box }}</small><strong>{{ money(result.boxes[box]) }}</strong></div></div><div class="vat-total vat-result"><div><strong>{{ result.provisional?'Resultado provisional':'Resultado del borrador' }}</strong><p>{{ result.result_kind==='pay'?'Saldo a ingresar':result.result_kind==='credit'?'Saldo a favor · compensación o devolución según corresponda':'Resultado cero' }}</p></div><VatBox code="71" :value="result.result" label="Resultado de la liquidación" @select="showDetail" /></div></section>
    <footer class="vat-model-footer"><strong>{{ result.provisional?'PENDIENTE DE REVISIÓN':'BORRADOR REVISADO' }}</strong><p>Preparación del modelo 303. La presentación se realiza en la Sede de la AEAT. Revisa los regímenes especiales, el recargo de equivalencia y las regularizaciones que no figuren en este borrador.</p><a href="https://sede.agenciatributaria.gob.es/Sede/iva/presentar-declaracion-iva-modelo-303.html" target="_blank" rel="noopener noreferrer">Instrucciones y presentación oficial · AEAT ↗</a></footer>
   </article>
   <section v-if="selectedBox" id="vat-detail" class="tax-detail panel">
    <div class="tax-detail-heading"><div><h2>{{ detailTitle }}</h2><p v-if="manualDetail" class="notice">{{ manualDetail }}</p><p class="muted">{{ detailRows.length }} operaciones agrupadas por IVA repercutido (477), soportado (472) y subcuenta.</p></div><button class="button" @click="selectedBox=null">Cerrar detalle</button></div>
    <label class="tax-search">Buscar factura, tercero o concepto<input v-model="search" type="search"></label>
    <TaxFiscalLines :records="detailRows" :box="selectedBox" :contributions="result.contributions[selectedBox]||[]" :busy="!ready" @invoice="invoiceId=$event" @entry="entryId=$event" @source="journalPdf=$event" @edit="edit" />
   </section>
   <TaxSettlementProposal v-if="settlementOpen" :model="result" :disabled="!ready||calculationDirty" @entry="entryId=$event" @close="settlementOpen=false" />
   <details v-if="result.settlements.length" class="panel tax-settlements tax-controls"><summary>{{ result.settlements.length }} asientos de liquidación de IVA excluidos</summary><p class="muted">Los traspasos de 472/477 contra 4700/4750 no son facturas y no vuelven a sumar IVA.</p><button v-for="entry in result.settlements" :key="entry.entry_id" class="report-link" @click="entryId=entry.entry_id">Asiento {{ entry.number }} · {{ date(entry.date) }}</button></details>
  </template>
  <Teleport to="body"><FormDialog v-if="editing" class="tax-review-dialog" title="Revisar tratamiento de IVA" :busy="busy" @close="editing=null"><form class="tax-edit-form" @submit.prevent="applyEdit"><p><strong>{{ editing.reference }}</strong> · {{ editing.party_name }}</p><p class="notice">{{ editing.review_reason||'Revisa el tratamiento fiscal de esta operación.' }}</p><p>Cuota contabilizada: <strong>{{ money(editing.tax_amount) }} €</strong>. La clasificación fiscal conserva el asiento original.</p><label>Tratamiento fiscal<select v-model="editing.category" required :disabled="busy"><option v-for="[key,category] in Object.entries(vatCategories).filter(([,item])=>!item.direction||item.direction===editing.direction)" :key="key" :value="key">{{ category.label }}</option></select></label><div class="form-grid"><label>Base imponible<input v-model="editing.base" inputmode="decimal" required :disabled="busy"></label><label>Tipo de IVA (%)<input v-model="editing.rate" inputmode="decimal" required :disabled="busy"></label><label v-if="editing.direction==='received'">Cuota deducible (%)<input v-model="editing.deductible_percent" inputmode="decimal" required :disabled="busy"></label></div><p v-if="editError" class="notice error-notice" role="alert">{{ editError }}</p><div class="actions"><button type="button" class="button" @click="editing.invoice_id?invoiceId=editing.invoice_id:entryId=editing.entry_id">Ver documento / asiento</button><button class="button primary" :disabled="busy">Aplicar al borrador</button></div></form></FormDialog><InvoiceDetail v-if="invoiceId" :key="invoiceId" :invoice-id="invoiceId" read-only @close="invoiceId=null" /><EntryDetail v-if="entryId" :key="entryId" :entry-id="entryId" @close="entryId=null" /><TaxJournalPdf v-if="journalPdf" :key="journalPdf.key" :entry-id="journalPdf.entry_id" :page="journalPdf.source_page" @close="journalPdf=null" /><TaxFilingDialog v-if="filingOpen&&result" :model="result" @close="filingOpen=false" /></Teleport>
 </div>
</template>
