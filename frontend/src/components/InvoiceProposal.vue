<script setup>
import { ref } from 'vue';
import { reportMoney as money,reportDate as date } from '../services/report-format.js';
import EntryDetail from './EntryDetail.vue';
import InvoiceFiscalIdentity from './InvoiceFiscalIdentity.vue';
defineProps({proposal:Object,extraction:Object});
const entry=ref(null);
</script>
<template>
 <template v-if="proposal">
  <div class="invoice-proposal-facts"><div><p><strong>{{ proposal.form.reference || 'Referencia pendiente' }}</strong></p><InvoiceFiscalIdentity :person="proposal.form.party" :label="proposal.form.direction==='issued'?'Datos fiscales del cliente':'Datos fiscales del proveedor'" /></div><p>Factura: {{ date(proposal.form.invoice_date) }}<br>Contabilización: {{ date(proposal.form.posting_date) }}<br><strong>Total: {{ proposal.totals ? money(proposal.totals.total_amount)+' €' : 'Pendiente' }}</strong></p></div>
  <p class="muted">{{ proposal.basis }}</p>
  <ul v-if="proposal.warnings.length" class="invoice-proposal-warnings"><li v-for="warning in proposal.warnings" :key="warning">{{ warning }}</li></ul>
  <p v-if="proposal.needs_amount_review" class="notice">Comprueba las bases, los tipos de IVA y las retenciones con el original. Los importes impresos no han quedado completamente verificados.</p>
  <h3>Propuesta de asiento</h3><div class="table-wrap"><table><thead><tr><th>Cuenta</th><th>Descripción</th><th class="amount">Debe</th><th class="amount">Haber</th></tr></thead><tbody><tr v-for="(line,index) in proposal.journal" :key="index"><td>{{ line.code }}</td><td>{{ line.description }}</td><td class="amount">{{ money(line.debit) }}</td><td class="amount">{{ money(line.credit) }}</td></tr><tr v-if="!proposal.journal.length"><td colspan="4">Completa los importes para preparar el asiento.</td></tr></tbody></table></div>
  <h3>Recibos propuestos</h3><div class="table-wrap"><table><thead><tr><th>Vencimiento</th><th class="amount">Importe</th><th>Estado previsto</th></tr></thead><tbody><tr v-for="(receipt,index) in proposal.form.receipts" :key="index"><td>{{ date(receipt.due_date) }}</td><td class="amount">{{ money(receipt.amount) }}</td><td>Pendiente de {{ proposal.form.direction==='received'?'pago':'cobro' }}</td></tr></tbody></table></div>
  <div v-if="proposal.candidates.length" class="notice"><strong>Coincidencias en tu contabilidad</strong><p v-for="candidate in proposal.candidates" :key="candidate.entry_id">Asiento {{ candidate.number }} · {{ date(candidate.entry_date) }} · {{ candidate.description }} <button type="button" class="button" @click="entry=candidate.entry_id">Ver asiento {{ candidate.number }}</button></p></div>
  <p v-if="proposal.existing_invoice" class="notice">La factura {{ proposal.existing_invoice.reference }} ya existe en Facturas. Se puede asociar este PDF a esa factura.</p>
  <details v-if="proposal.alternatives.length" class="trade-account-settings"><summary>Mejoras contables a valorar</summary><p v-for="(alternative,index) in proposal.alternatives" :key="index">{{ alternative.detail }} <a :href="alternative.reference" target="_blank" rel="noopener noreferrer">Consultar PGC</a></p></details>
 </template>
 <EntryDetail v-if="entry" :entry-id="entry" @close="entry=null" />
</template>
