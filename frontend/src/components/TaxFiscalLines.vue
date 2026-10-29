<script setup>
import {computed} from 'vue';
import {groupVatDetails} from '../../../shared/vat-details.js';
import {vatCategories} from '../../../shared/vat-model.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {useAccess} from '../composables/access.js';
const props=defineProps({records:{type:Array,default:()=>[]},box:String,contributions:{type:Array,default:()=>[]},busy:Boolean});
defineEmits(['invoice','entry','source','edit']);
const {can}=useAccess(),groups=computed(()=>groupVatDetails(props.records,{box:props.box,contributions:props.contributions}));
const showContribution=computed(()=>!['all','review'].includes(props.box));
</script>
<template>
 <p v-if="!groups.length" class="empty-cell">No hay operaciones para este detalle.</p>
 <section v-for="group in groups" :key="group.code" class="tax-fiscal-group" :data-vat-group="group.code">
  <header class="tax-fiscal-group-heading"><div><h3>{{ group.label }}</h3><small>{{ group.count }} operaciones · sumas de las líneas visibles</small></div><div class="tax-fiscal-summary"><span>Base<strong>{{ money(group.totals.base) }} €</strong></span><span>IVA registrado<strong>{{ money(group.totals.tax) }} €</strong></span><span v-if="group.code!=='other'">{{ group.code==='472'?'IVA deducible':'IVA devengado' }} · modelo<strong>{{ money(group.totals.included) }} €</strong></span><span v-if="showContribution">Aporta a {{ box }}<strong>{{ money(group.totals.contribution) }} €</strong></span></div></header>
  <p v-if="!group.accounts.length" class="empty-cell">No hay líneas de este grupo en el detalle seleccionado.</p>
  <div v-for="account in group.accounts" :key="account.code||'other'" class="tax-fiscal-account" :data-vat-account="account.code">
   <h4 v-if="account.code"><span>{{ account.code }}</span> · {{ account.description }}</h4>
   <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Factura / asiento</th><th>Tercero y concepto</th><th>Tratamiento fiscal</th><th class="amount">Base</th><th class="amount">IVA registrado</th><th v-if="group.code!=='other'" class="amount">{{ group.code==='472'?'Deducible':'Devengado' }}</th><th v-if="showContribution" class="amount">Aporta a {{ box }}</th><th>Revisión</th></tr></thead>
    <tbody><tr v-for="row in account.rows" :key="row.detail_key"><td>{{ date(row.date) }}</td><td><button class="report-link" @click="row.invoice_id?$emit('invoice',row.invoice_id):$emit('entry',row.entry_id)">{{ row.reference }}</button><button v-if="row.source_available" class="report-link tax-source" @click="$emit('source',row)">Ver diario original</button><small class="tax-source">{{ row.kind==='invoice'?'Factura registrada':'Diario contable' }}{{ row.reversal?' · Rectificación':'' }}</small></td><td><strong>{{ row.party_name }}</strong><p>{{ row.description }}</p></td><td>{{ vatCategories[row.category].label }}<small class="tax-source">{{ money(row.rate) }} %<template v-if="group.code==='472'"> · {{ money(row.deductible_percent) }} % deducible</template></small></td><td class="amount">{{ money(row.base) }}</td><td class="amount">{{ money(row.tax_amount) }}</td><td v-if="group.code!=='other'" class="amount">{{ money(row.included_tax) }}</td><td v-if="showContribution" class="amount">{{ money(row.contribution) }}</td><td><button v-if="can('accounting_write')" class="button" :disabled="busy" @click="$emit('edit',row)">{{ row.category==='pending'?'Clasificar':row.reviewed?'Editar criterio':'Revisar' }}</button><span v-else>{{ row.category==='pending'||!row.reviewed?'Pendiente':'Revisado' }}</span></td></tr></tbody>
    <tfoot><tr><th colspan="4">Subtotal {{ account.code||'sin cuota de IVA' }}</th><th class="amount">{{ money(account.totals.base) }}</th><th class="amount">{{ money(account.totals.tax) }}</th><th v-if="group.code!=='other'" class="amount">{{ money(account.totals.included) }}</th><th v-if="showContribution" class="amount">{{ money(account.totals.contribution) }}</th><th></th></tr></tfoot>
   </table></div>
  </div>
  <div v-if="group.accounts.length>1" class="tax-fiscal-total"><strong>Total {{ group.code }}</strong><span>Base: {{ money(group.totals.base) }} €</span><span>IVA registrado: {{ money(group.totals.tax) }} €</span><span>IVA modelo: {{ money(group.totals.included) }} €</span></div>
 </section>
</template>
