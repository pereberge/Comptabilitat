<script setup>
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {useContext} from '../composables/context.js';
import {useAccess} from '../composables/access.js';
import {api} from '../services/accounting.js';
import {remittanceError} from '../locales/remittances.js';
import FormDialog from '../components/FormDialog.vue';
const {company}=useContext(),{can}=useAccess(),rows=ref([]),banks=ref([]),form=ref(null),busy=ref(false),loading=ref(false),error=ref(''),formError=ref('');
const chosenBank=computed(()=>banks.value.find(row=>String(row.id)===String(form.value?.bank_id)));
let generation=0;
async function load(){const ticket=++generation;rows.value=[];form.value=null;loading.value=true;error.value='';try{const [saved,catalog]=await Promise.all([api('/company-banks'),api('/general-tables/banks')]);if(ticket===generation){rows.value=saved;banks.value=catalog;}}catch(cause){if(ticket===generation)error.value=remittanceError(cause);}finally{if(ticket===generation)loading.value=false;}}
function edit(row){formError.value='';form.value=row?{...row}:{bank_id:'',iban:'',initiator_id:'',creditor_id:''};}
async function save(){if(busy.value)return;const ticket=generation;busy.value=true;formError.value='';try{await api('/company-banks'+(form.value.id?'/'+form.value.id:''),{method:form.value.id?'PUT':'POST',body:form.value});if(ticket===generation)await load();}catch(cause){if(ticket===generation)formError.value=remittanceError(cause);}finally{busy.value=false;}}
watch(()=>company.value?.id,()=>{if(company.value)load();else{generation++;rows.value=[];form.value=null;loading.value=false;}},{immediate:true});onBeforeUnmount(()=>generation++);
</script>
<template>
 <div class="page-heading"><div><h1>Bancos de la empresa</h1><p class="muted">{{ company?.name }} · Presentador y cuenta propios para cada banco</p></div><div class="actions"><RouterLink class="button" to="/empresas">Empresas</RouterLink><button class="button primary" :disabled="!company||loading||busy||!can('accounting_write')" @click="edit(null)">Añadir banco a esta empresa</button></div></div>
 <p class="muted">El nombre y SWIFT / BIC proceden del <RouterLink to="/tablas-generales/bancos">maestro general de bancos</RouterLink>. El IBAN y el ID del presentador se guardan solo para esta empresa y banco. En cobros se utiliza el acreedor SEPA; en pagos, el ID del presentador.</p>
 <p v-if="error" class="notice error-notice" role="alert">{{ error }}</p><p v-if="loading" role="status">Cargando bancos…</p>
 <div class="panel table-wrap"><table><thead><tr><th>Banco</th><th>SWIFT / BIC</th><th>IBAN de la empresa</th><th>ID del presentador</th><th></th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td>{{ row.name }}</td><td>{{ row.bic }}</td><td>{{ row.iban }}</td><td>{{ row.initiator_id }}</td><td><button class="button" :disabled="!can('accounting_write')||busy" @click="edit(row)">Editar</button></td></tr><tr v-if="!loading&&!rows.length"><td colspan="5">Todavía no hay bancos configurados para esta empresa.</td></tr></tbody></table></div>
 <FormDialog v-if="form" :title="'Banco · '+company.name" :busy="busy" @close="form=null"><p v-if="formError" class="notice error-notice" role="alert">{{ formError }}</p><form @submit.prevent="save"><fieldset :disabled="busy"><label>Banco<select v-model="form.bank_id" required><option value="">Selecciona banco</option><option v-for="bank in banks" :key="bank.id" :value="bank.id">{{ bank.name }}</option></select></label><p v-if="chosenBank" class="muted">SWIFT / BIC: {{ chosenBank.bic }}</p><label>IBAN de la empresa<input v-model="form.iban" maxlength="50" required></label><label>ID del presentador para esta empresa y banco (pagos)<input v-model="form.initiator_id" maxlength="35" placeholder="Identificador facilitado por el banco" required></label><label>Identificador de acreedor SEPA (cobros)<input v-model="form.creditor_id" maxlength="35" placeholder="ES63000B22299945"></label><small class="muted">Si el acreedor SEPA está vacío se utiliza el configurado en la ficha de esta empresa. No es el mismo campo que el ID del presentador.</small></fieldset><div class="actions"><button class="button primary" :disabled="busy">Guardar</button><button type="button" class="button" :disabled="busy" @click="form=null">Cancelar</button></div></form></FormDialog>
</template>
<style scoped>fieldset{border:0;padding:0;display:grid;gap:14px}.actions{margin-top:14px}td{overflow-wrap:anywhere}</style>
