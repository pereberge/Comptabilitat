<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { fiscalStatus } from '../services/verifactu.js';
import { printInvoice,invoiceDeliveryError } from '../services/invoice-delivery.js';
import InvoiceEmailDialog from './InvoiceEmailDialog.vue';
import { ref,onMounted,computed } from 'vue';
import {invoiceFiscalIdentities} from '../../../shared/account-party.js';
import InvoiceFiscalIdentity from './InvoiceFiscalIdentity.vue';
import { api } from '../services/accounting.js';
import { reportMoney as money,reportDate as date } from '../services/report-format.js';
import { t,treasuryError } from '../locales/treasury.js';
import FormDialog from './FormDialog.vue';
import EntryDetail from './EntryDetail.vue';
import InvoicePdf from './InvoicePdf.vue';
const props=defineProps({invoiceId:[String,Number],readOnly:Boolean}),emit=defineEmits(['close','void','delete']);
const invoice=ref(null),error=ref(''),entryId=ref(null),pdf=ref(null),logoUrl=ref(''),logoFailed=ref(false),logoImage=ref(null),printing=ref(false),emailing=ref(false),deliveryError=ref('');
const identities=computed(()=>invoice.value?invoiceFiscalIdentities(invoice.value):null);
onMounted(async()=>{try{const loaded=await api('/invoices/'+props.invoiceId);if(loaded.direction==='issued'){logoUrl.value=loaded.issuer_snapshot.logo_url||'';if(!logoUrl.value){const issuer=await api('/companies/'+loaded.company_id).catch(()=>null);logoUrl.value=issuer?.logo_url||'';}}invoice.value=loaded;}catch(cause){error.value=treasuryError(cause);}});
async function print(){if(printing.value)return;printing.value=true;deliveryError.value='';try{await printInvoice(invoice.value.id);}catch(cause){deliveryError.value=invoiceDeliveryError(cause);}finally{printing.value=false;}}
function viewPdf(){pdf.value={invoiceId:invoice.value.id};}
</script>
<template><Teleport to="body">
 <FormDialog class="print-document invoice-detail-dialog" :busy="printing" :title="invoice?t.invoices+' · '+invoice.reference:t.invoices" @close="emit('close')">
  <p v-if="error" role="alert">{{ error }}</p><p v-else-if="!invoice" role="status">{{ t.loading }}</p>
  <template v-else>
   <div class="actions document-controls invoice-delivery-controls"><button class="button primary" :disabled="printing" @click="print">{{ printing?'Preparando impresión…':'Imprimir' }}</button><button class="button" :disabled="printing" @click="viewPdf">Ver PDF</button><button class="button" :disabled="printing" @click="emailing=true">Preparar correo</button></div><p v-if="deliveryError" class="notice error-notice document-controls" role="alert">{{ deliveryError }}</p>
   <div class="trade-document-heading"><div><img v-if="logoUrl&&!logoFailed" ref="logoImage" class="invoice-document-logo" :src="logoUrl" :alt="'Anagrama de '+identities.issuer.name" @error="logoFailed=true"><InvoiceFiscalIdentity :person="identities.issuer" :label="invoice.direction==='issued'?'Datos fiscales del emisor':'Datos fiscales del proveedor'" /></div><div><span class="badge" :class="invoice.status==='void'?'trade-void':'badge-open'">{{ invoice.status==='void'?t.void:invoice.direction==='issued'?t.issued:t.received }}</span><h3>{{ invoice.reference }}</h3><p>{{ t.invoiceDate }}: {{ date(invoice.invoice_date) }}</p><p>{{ t.postingDate }}: {{ date(invoice.posting_date) }} · {{ invoice.exercise_name }}</p></div></div>
   <section class="trade-document-party"><InvoiceFiscalIdentity :person="identities.recipient" :label="invoice.direction==='issued'?'Datos fiscales del cliente':'Datos fiscales del destinatario'" /></section><p class="muted document-controls"><small>{{ t.partyAccount }}: {{ invoice.party_code }}</small></p>
   <div v-if="!identities.company.tax_id||!identities.company.address||!identities.party.tax_id||!identities.party.address" class="notice document-controls"><p v-if="!identities.company.tax_id||!identities.company.address">Faltan el NIF o el domicilio fiscal de la empresa. <RouterLink to="/empresas" @click="emit('close')">Completar ficha de la empresa</RouterLink></p><p v-if="!identities.party.tax_id||!identities.party.address">Faltan el NIF o el domicilio fiscal del cliente o proveedor. <RouterLink to="/cuentas" @click="emit('close')">Completar datos fiscales de la subcuenta {{ invoice.party_code }}</RouterLink></p></div>
   <div class="table-wrap"><table><thead><tr><th>{{ t.concept }}</th><th class="amount">{{ t.base }}</th><th class="amount">{{ t.vatRate }}</th><th class="amount">{{ t.vat }}</th></tr></thead><tbody><tr v-for="line in invoice.lines" :key="line.id"><td>{{ line.description }}</td><td class="amount">{{ money(line.base) }}</td><td class="amount">{{ money(line.tax_rate) }}</td><td class="amount">{{ money(line.tax_amount) }}</td></tr></tbody></table></div>
   <section v-if="invoice.verifactu" class="vf-invoice-status"><strong>VERI*FACTU · Pruebas</strong><p v-for="record in invoice.verifactu.records" :key="record.id">{{ record.kind==='alta'?'Alta':'Anulación' }} · {{ fiscalStatus[record.status] }}<span v-if="record.csv"> · CSV {{ record.csv }}</span></p><RouterLink to="/verifactu" @click="emit('close')">Ver registros de pruebas</RouterLink></section>
   <div class="trade-document-totals"><p v-if="invoice.verifactu?.invoice_total&&invoice.withholding_total!=='0.00'"><span>Total factura antes de retención</span><strong>{{ money(invoice.verifactu.invoice_total) }} €</strong></p><p v-for="[key,label] in [['base_total',t.base],['tax_total',t.vat],['withholding_total',t.withholding],['total_amount',t.total]]" :key="key"><span>{{ label }}</span><strong>{{ money(invoice[key]) }} €</strong></p></div>
   <h3>{{ t.receipts }}</h3><div class="table-wrap"><table><thead><tr><th>{{ t.receipt }}</th><th>{{ t.dueDate }}</th><th class="amount">{{ t.amount }}</th><th class="amount">{{ t.remaining }}</th><th>{{ t.status }}</th></tr></thead><tbody><tr v-for="receipt in invoice.receipts" :key="receipt.id"><td>{{ receipt.id }} · {{ receipt.position }}/{{ invoice.receipts.length }}</td><td>{{ date(receipt.due_date) }}</td><td class="amount">{{ money(receipt.amount) }}</td><td class="amount">{{ money(receipt.remaining_amount) }}</td><td>{{ t[receipt.status] }}<span v-if="receipt.overdue"> · {{ t.overdue }}</span></td></tr></tbody></table></div>
   <p>{{ t.paymentMethod }}: {{ t.methods[invoice.payment_method] }}</p><p v-if="invoice.issuer_snapshot.iban&&invoice.direction==='issued'">{{ invoice.issuer_snapshot.bank_name }} · IBAN {{ invoice.issuer_snapshot.iban }}</p><p v-if="invoice.notes" class="trade-document-notes">{{ invoice.notes }}</p><p v-if="invoice.issuer_snapshot.invoice_notes" class="trade-document-notes">{{ invoice.issuer_snapshot.invoice_notes }}</p><p v-if="invoice.status==='void'" class="notice">{{ t.void }} · {{ date(invoice.void_date) }} · {{ invoice.void_reason }}</p>
   <div class="actions document-controls"><button v-for="document in invoice.documents" :key="document.id" class="button" @click="pdf=document">Ver PDF · {{ document.source_name }}</button><button class="button" @click="entryId=invoice.entry_id">{{ t.entry }}</button><RouterLink class="button" :to="{name:'portfolio',query:{company_id:String(invoice.company_id),invoice_id:String(invoice.id)}}" @click="emit('close')">{{ t.viewReceipts }}</RouterLink><button :disabled="!can('accounting_write')" v-if="!readOnly&&invoice.status!=='void'" class="button" @click="emit('void',invoice)">{{ t.voidInvoice }}</button><button v-if="!readOnly&&!invoice.verifactu&&can('invoice_delete')" class="button clear-danger" @click="emit('delete',invoice)">Borrar factura y recibos · 96</button></div>
  </template>
 </FormDialog><EntryDetail v-if="entryId" :entry-id="entryId" @close="entryId=null" />
<InvoiceEmailDialog v-if="emailing&&invoice" :invoice="invoice" @close="emailing=false" />
<InvoicePdf v-if="pdf" :document-id="pdf.id" :invoice-id="pdf.invoiceId" :filename="pdf.source_name" @close="pdf=null" /></Teleport></template>
