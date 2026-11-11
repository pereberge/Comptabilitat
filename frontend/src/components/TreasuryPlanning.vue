<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {api} from '../services/accounting.js';
import {useAccess} from '../composables/access.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {treasuryError} from '../locales/treasury.js';
const props=defineProps({data:Object,busy:Boolean}),emit=defineEmits(['changed','busy']);const {can}=useAccess();
const saving=ref(false),error=ref(''),banks=ref({}),links=ref({}),history=ref(false);
let disposed=false;onBeforeUnmount(()=>{disposed=true;});
const writable=computed(()=>can('accounting_write')&&props.data.planning_available&&!props.busy&&!saving.value);
const blank=()=>({id:null,version:0,direction:'received',description:'',expected_date:props.data.as_of,amount:'',bank_account_id:'',request_id:crypto.randomUUID()});
const form=ref(blank()),requests=new Map();
watch(()=>props.data,()=>{banks.value=Object.fromEntries((props.data.receipts||[]).map(row=>[row.id,String(row.forecast_account_id||'')]));},{immediate:true});
const shownPlans=computed(()=>(props.data.plans||[]).filter(row=>history.value||row.status!=='cancelled'));
function key(action,payload){const serialized=JSON.stringify([action,payload]);if(!requests.has(serialized))requests.set(serialized,crypto.randomUUID());return requests.get(serialized);}
async function mutate(path,method,body){if(!writable.value)return false;saving.value=true;error.value='';emit('busy',true);try{await api(path,{method,body});if(disposed)return false;emit('changed');return true;}catch(cause){if(!disposed)error.value=treasuryError(cause);return false;}finally{if(!disposed){saving.value=false;emit('busy',false);}}}
function edit(plan){form.value={...plan,bank_account_id:String(plan.bank_account_id||''),request_id:crypto.randomUUID()};}
async function save(){const value={...form.value,bank_account_id:form.value.bank_account_id?Number(form.value.bank_account_id):null};if(await mutate('/portfolio/forecast-plans'+(value.id?'/'+value.id:''),value.id?'PATCH':'POST',value))form.value=blank();}
async function assign(receipt){const value={version:receipt.assignment_version,bank_account_id:banks.value[receipt.id]?Number(banks.value[receipt.id]):null};await mutate('/portfolio/receipts/'+receipt.id+'/forecast-account','PATCH',{...value,request_id:key('assign:'+receipt.id,value)});}
async function cancel(plan){const value={version:plan.version};await mutate('/portfolio/forecast-plans/'+plan.id+'/cancel','POST',{...value,request_id:key('cancel:'+plan.id,value)});}
function candidates(plan){return (props.data.receipts||[]).filter(row=>row.direction===plan.direction&&row.amount===plan.amount);}
async function link(plan){const value={version:plan.version,receipt_id:Number(links.value[plan.id])};await mutate('/portfolio/forecast-plans/'+plan.id+'/link','POST',{...value,request_id:key('link:'+plan.id,value)});}
</script>
<template>
 <section aria-label="Planificació de tresoreria">
  <p v-if="!data.planning_available" class="notice">Cal aplicar la migració de planificació de tresoreria per poder guardar bancs i previsions.</p>
  <p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
  <h3>Banc previst dels venciments</h3><p>Assignar un banc només modifica la previsió. No paga el rebut ni canvia el venciment. Els rebuts inclosos en remeses s’han de revisar des de Remeses.</p>
  <div class="table-wrap"><table><thead><tr><th>Rebut</th><th>Venciment</th><th>Pendent</th><th>Banc previst</th><th></th></tr></thead><tbody><tr v-for="receipt in data.receipts||[]" :key="receipt.id"><td>{{ receipt.reference }} · {{ receipt.party_name }}</td><td>{{ date(receipt.due_date) }}</td><td>{{ money(receipt.remaining_amount) }} €</td><td><select v-model="banks[receipt.id]" :aria-label="'Banc del rebut '+receipt.id" :disabled="!writable||!!receipt.remittance_id"><option value="">Sense assignar</option><option v-for="account in data.accounts" :key="account.account_id" :value="String(account.account_id)">{{ account.code }} · {{ account.description }}</option></select></td><td><button type="button" class="button" :disabled="!writable||!!receipt.remittance_id" @click="assign(receipt)">Guardar banc</button></td></tr></tbody></table></div>
  <h3>{{ form.id?'Editar previsió sense factura':'Nova previsió sense factura' }}</h3>
  <form @submit.prevent="save"><fieldset :disabled="!writable"><div class="fields"><label>Tipus<select v-model="form.direction" name="plan_direction"><option value="received">Pagament</option><option value="issued">Cobrament</option></select></label><label>Concepte<input v-model="form.description" name="plan_description" maxlength="200" required></label><label>Data prevista<input v-model="form.expected_date" name="plan_date" type="date" required></label><label>Import<input v-model="form.amount" name="plan_amount" inputmode="decimal" required></label><label>Banc previst<select v-model="form.bank_account_id" name="plan_bank"><option value="">Sense assignar</option><option v-for="account in data.accounts" :key="account.account_id" :value="String(account.account_id)">{{ account.code }} · {{ account.description }}</option></select></label></div><button class="button primary">Guardar previsió</button><button v-if="form.id" type="button" class="button" @click="form=blank()">Cancel·lar edició</button></fieldset></form>
  <p>Quan arribi la factura, substitueix la previsió pel seu rebut validat. Així només comptarà el pendent real. Si el moviment no té factura i ja s’ha registrat al diari, retira la previsió per no tornar-lo a preveure.</p>
  <label><input v-model="history" type="checkbox"> Mostrar previsions retirades</label>
  <div v-for="plan in shownPlans" :key="plan.id" class="plan"><strong>{{ plan.description }}</strong> · {{ date(plan.expected_date) }} · {{ money(plan.amount) }} € · {{ plan.direction==='issued'?'Cobrament':'Pagament' }}<small>{{ plan.status==='pending'?'Pendent':plan.status==='linked'?'Substituïda pel rebut '+plan.linked_receipt_id:'Retirada' }}</small>
   <div v-if="plan.status==='pending'" class="actions"><button type="button" class="button" :disabled="!writable" @click="edit(plan)">Editar previsió</button><button type="button" class="button" :disabled="!writable" @click="cancel(plan)">Retirar previsió</button><select v-model="links[plan.id]" :aria-label="'Rebut per a la previsió '+plan.id" :disabled="!writable"><option :value="undefined">Selecciona el rebut</option><option v-for="receipt in candidates(plan)" :key="receipt.id" :value="String(receipt.id)">{{ receipt.reference }} · {{ receipt.party_name }} · pendent {{ money(receipt.remaining_amount) }} €</option></select><button type="button" class="button" :disabled="!writable||!links[plan.id]" @click="link(plan)">Substituir pel rebut</button></div>
   <button v-else-if="plan.status==='linked'" type="button" class="button" :disabled="!writable" @click="cancel(plan)">Retirar vincle de la previsió</button>
  </div>
 </section>
</template>
<style scoped>.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}label{display:block;margin:10px 0}input:not([type=checkbox]),select{width:100%;box-sizing:border-box}fieldset{border:0;padding:0}table{width:100%}td,th{padding:8px;text-align:left}small{display:block}.plan{padding:14px 0;border-top:1px solid #ddd}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.actions select{width:auto;max-width:100%}p{line-height:1.6}</style>
