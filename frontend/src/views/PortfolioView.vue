<script setup>
import {useAccess} from '../composables/access.js';
const {can}=useAccess();
import { onBeforeUnmount,ref,watch } from 'vue';
import { useRoute,useRouter } from 'vue-router';
import { useContext } from '../composables/context.js';
import { api } from '../services/accounting.js';
import { reportMoney as money,reportDate as date,downloadCsv } from '../services/report-format.js';
import { t,treasuryError } from '../locales/treasury.js';
import TradeTabs from '../components/TradeTabs.vue';
import PortfolioTabs from '../components/PortfolioTabs.vue';
import ReceiptDetail from '../components/ReceiptDetail.vue';
import InvoiceDetail from '../components/InvoiceDetail.vue';
import PortfolioActionDialog from '../components/PortfolioActionDialog.vue';
const {company,exercises}=useContext(),route=useRoute(),router=useRouter();
const data=ref(null),loading=ref(false),error=ref(''),notice=ref(''),detail=ref(null),invoice=ref(null),action=ref(null),voiding=ref(null),applied=ref('');let generation=0;
const filters=ref({direction:'all',status:'open',exercise_id:'',from:'',to:'',search:'',as_of:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date())});
function query(){return {...filters.value,...(route.query.company_id===String(company.value.id)&&route.query.invoice_id?{invoice_id:route.query.invoice_id}:{})};}
async function load(){const ticket=++generation;error.value='';loading.value=true;const q=query();try{const result=await api('/portfolio?'+new URLSearchParams(q));if(ticket===generation){data.value=result;applied.value=JSON.stringify(q);}}catch(cause){if(ticket===generation)error.value=treasuryError(cause);}finally{if(ticket===generation)loading.value=false;}}
watch(()=>route.fullPath,()=>{detail.value=null;invoice.value=null;action.value=null;if(route.query.invoice_id&&route.query.company_id===String(company.value.id))filters.value.status='all';load();},{immediate:true});
function open(mode,receipt,settlement){detail.value=null;action.value={mode,receipt,settlement};}
async function saved(receipt){action.value=null;notice.value=t.operationSaved;await load();detail.value=receipt.id;}
function viewInvoice(id){detail.value=null;invoice.value=id;}
function openVoid(value){invoice.value=null;voiding.value=value;}
async function voided(value){voiding.value=null;notice.value=t.operationSaved;await load();invoice.value=value.id;}
function exportCsv(){if(!data.value||loading.value||applied.value!==JSON.stringify(query()))return;
 const rows=[[t.portfolio],['Empresa',company.value.name],[t.currency],[t.asOf,date(data.value.as_of)],[t.direction,filters.value.direction],[t.status,filters.value.status],[t.exercise,filters.value.exercise_id || t.all],[t.from,filters.value.from?date(filters.value.from):'',t.to,filters.value.to?date(filters.value.to):''],[t.search,filters.value.search],['Factura filtrada',query().invoice_id || t.all],
 [t.receipt,t.reference,t.direction,t.party,t.taxId,t.invoiceDate,t.dueDate,t.amount,t.paid,t.remaining,t.status,t.overdue,t.paymentMethod]];
 for(const row of data.value.rows)rows.push([row.id,row.reference,row.direction==='issued'?t.collection:t.payment,row.party_name,row.party_tax_id,date(row.invoice_date),date(row.due_date),{amount:row.amount},{amount:row.paid_amount},{amount:row.remaining_amount},t[row.status],row.overdue?t.overdue:'',t.methods[row.payment_method]]);
 for(const [key,label]of [['receivable',t.pendingCollections],['payable',t.pendingPayments],['overdue_receivable',t.overdueCollections],['overdue_payable',t.overduePayments]])rows.push([label,{amount:data.value.totals[key]}]);downloadCsv('cartera-'+data.value.as_of+'.csv',rows);
}
onBeforeUnmount(()=>generation++);
</script>
<template>
 <TradeTabs /><div class="page-heading"><div><h1>{{ t.portfolio }}</h1><p class="muted">{{ t.portfolioIntro }}</p></div><button class="button" :disabled="!data||loading||applied!==JSON.stringify(query())" @click="exportCsv">{{ t.export }}</button></div><PortfolioTabs />
 <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><p v-if="notice" role="status" class="success-note">{{ notice }}</p>
 <div v-if="data" class="portfolio-summary"><section v-for="[key,label] in [['receivable',t.pendingCollections],['payable',t.pendingPayments],['overdue_receivable',t.overdueCollections],['overdue_payable',t.overduePayments]]" :key="key" class="panel"><p class="muted">{{ label }}</p><strong>{{ money(data.totals[key]) }} €</strong></section></div>
 <p v-if="route.query.invoice_id&&route.query.company_id===String(company.id)" class="notice">{{ t.originalInvoice }} · {{ route.query.invoice_id }} <button class="button" @click="router.replace({name:'portfolio'})">{{ t.resetInvoice }}</button></p>
 <form class="filters portfolio-filters" @submit.prevent="load"><label>{{ t.direction }}<select v-model="filters.direction"><option value="all">{{ t.all }}</option><option value="issued">{{ t.issued }}</option><option value="received">{{ t.received }}</option></select></label><label>{{ t.status }}<select v-model="filters.status"><option value="all">{{ t.all }}</option><option v-for="key in ['open','pending','partial','settled','overdue','void']" :key="key" :value="key">{{ t[key] }}</option></select></label><label>{{ t.exercise }}<select v-model="filters.exercise_id"><option value="">{{ t.all }}</option><option v-for="exercise in exercises" :key="exercise.id" :value="exercise.id">{{ exercise.name }}</option></select></label><label>{{ t.from }}<input v-model="filters.from" type="date"></label><label>{{ t.to }}<input v-model="filters.to" type="date"></label><label>{{ t.asOf }}<input v-model="filters.as_of" type="date" min="1000-01-01" max="9999-12-31" required></label><label>{{ t.search }}<input v-model="filters.search" type="search" maxlength="200"></label><button class="button primary" :disabled="loading">{{ t.filter }}</button></form>
 <p v-if="loading" role="status">{{ t.loading }}</p><div v-else-if="data" class="table-wrap panel"><table class="portfolio-table"><thead><tr><th>{{ t.receipt }}</th><th>{{ t.direction }}</th><th>{{ t.reference }}</th><th>{{ t.party }}</th><th>{{ t.dueDate }}</th><th class="amount">{{ t.amount }}</th><th class="amount">{{ t.paid }}</th><th class="amount">{{ t.remaining }}</th><th>{{ t.status }}</th><th>{{ t.detail }}</th></tr></thead><tbody><tr v-for="row in data.rows" :key="row.id" :data-receipt-id="row.id"><td><button class="report-link" @click="detail=row.id">{{ row.id }}</button></td><td>{{ row.direction==='issued'?t.collection:t.payment }}</td><td>{{ row.reference }}<small class="trade-cell-note">{{ row.exercise_name }}</small></td><td>{{ row.party_name }}</td><td>{{ date(row.due_date) }}</td><td class="amount">{{ money(row.amount) }}</td><td class="amount">{{ money(row.paid_amount) }}</td><td class="amount">{{ money(row.remaining_amount) }}</td><td><span class="badge" :class="'trade-'+row.status">{{ t[row.status] }}</span><small v-if="row.overdue" class="trade-overdue-note">{{ t.overdue }}</small></td><td><div class="actions"><button class="button" @click="detail=row.id">{{ t.detail }}</button><template v-if="row.status==='pending'||row.status==='partial'"><button :disabled="!can('accounting_write')" class="button" @click="open('settle',row)">{{ row.direction==='issued'?t.recordCollection:t.recordPayment }}</button><button :disabled="!can('accounting_write')||!!row.remittance_id" class="button" @click="open('reschedule',row)">{{ t.reschedule }}</button><button :disabled="!can('accounting_write')||!!row.remittance_id" class="button" @click="open('split',row)">{{ t.splitReceipt }}</button><RouterLink v-if="row.remittance_id" :to="{name:'bankRemittances',params:{party:row.direction==='issued'?'clientes':'proveedores'}}" class="trade-cell-note">{{ t.inRemittance }} {{ row.remittance_id }}</RouterLink></template></div></td></tr><tr v-if="!data.rows.length"><td colspan="10" class="empty-cell">{{ t.emptyReceipts }}</td></tr></tbody></table></div>
 <ReceiptDetail v-if="detail" :receipt-id="detail" @close="detail=null" @settle="open('settle',$event)" @reschedule="open('reschedule',$event)" @split="open('split',$event)" @reverse="open('reverse',$event.receipt,$event.movement)" @invoice="viewInvoice" />
 <PortfolioActionDialog v-if="action" :mode="action.mode" :receipt="action.receipt" :settlement="action.settlement" @close="action=null" @saved="saved" />
 <InvoiceDetail v-if="invoice" :invoice-id="invoice" @close="invoice=null" @void="openVoid" /><PortfolioActionDialog v-if="voiding" mode="void" :invoice="voiding" @close="voiding=null" @saved="voided" />
</template>
