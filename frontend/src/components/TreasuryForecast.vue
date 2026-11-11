<script setup>
import {ref,onMounted,onBeforeUnmount} from 'vue';
import FormDialog from './FormDialog.vue';
import {api} from '../services/accounting.js';
import {reportMoney as money,reportDate as date} from '../services/report-format.js';
import {treasuryError} from '../locales/treasury.js';
import TreasuryPlanning from './TreasuryPlanning.vue';
const props=defineProps({exerciseId:[String,Number]}),emit=defineEmits(['close']);
const data=ref(null),error=ref(''),loading=ref(true),saving=ref(false);let disposed=false;
async function load(){loading.value=true;error.value='';try{const result=await api('/portfolio/forecast?'+new URLSearchParams({exercise_id:props.exerciseId}));if(!disposed)data.value=result;}catch(cause){if(!disposed)error.value=cause.code==='TREASURY_EXERCISE_DATE'?'Selecciona l’exercici que inclou la data d’avui per consultar aquesta previsió.':treasuryError(cause);}finally{if(!disposed)loading.value=false;}}
onMounted(load);
onBeforeUnmount(()=>{disposed=true;});
</script>
<template>
 <FormDialog title="Previsió de tresoreria" :busy="loading||saving" @close="emit('close')">
  <p v-if="loading" role="status">Preparant saldos i venciments…</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p>
  <button type="button" class="button" :disabled="loading||saving" @click="load">Actualitzar previsió</button>
  <template v-if="data">
   <p>Data de partida: {{ date(data.as_of) }} · Saldo comptable dels bancs: <strong>{{ money(data.opening_balance) }} €</strong>.</p>
   <p class="notice">Previsió orientativa: els venciments pendents no garanteixen el cobrament o pagament. Els d’avui o anteriors es projecten per demà i s’han de revisar.</p>
   <p v-if="data.unlinked_future_movements" class="notice">Hi ha {{ data.unlinked_future_movements }} moviments futurs registrats sense vincle amb un rebut. Revisa si corresponen a venciments pendents abans de donar la previsió per validada.</p>
   <div class="table-wrap"><table><thead><tr><th>Horitzó</th><th>Cobraments pendents</th><th>Pagaments pendents</th><th>Moviments futurs registrats (net)</th><th>Saldo previst de l’empresa</th><th>Necessitat de liquiditat</th></tr></thead><tbody><tr v-for="row in data.horizons" :key="row.days"><td>{{ row.days }} dies · {{ date(row.date) }}</td><td>{{ money(row.collections) }} €</td><td>{{ money(row.payments) }} €</td><td>{{ money(row.known_bank_net) }} €</td><td>{{ money(row.projected_balance) }} €</td><td><strong>{{ money(row.liquidity_need) }} €</strong><small v-if="row.first_negative_date">Des de {{ date(row.first_negative_date) }}</small></td></tr></tbody></table></div>
   <h3>Comptes bancaris</h3><p v-if="data.unassigned_receipts||data.unassigned_plans" class="notice">Hi ha {{ data.unassigned_receipts }} venciments i {{ data.unassigned_plans||0 }} previsions sense banc assignat. S’inclouen en la previsió de l’empresa, però no en els saldos per compte següents.</p>
   <div class="table-wrap"><table><thead><tr><th>Compte</th><th>Saldo de partida</th><th v-for="days in [30,60,90]" :key="days">{{ days }} dies · previst</th></tr></thead><tbody><tr v-for="account in data.accounts" :key="account.account_id"><td>{{ account.code }} · {{ account.description }}</td><td>{{ money(account.balance) }} €</td><td v-for="row in account.horizons" :key="row.days">{{ money(row.projected_balance) }} €</td></tr><tr v-if="!data.accounts.length"><td colspan="5">No hi ha subcomptes bancaris 572 configurats. Revisa els comptes i els saldos d’obertura.</td></tr></tbody></table></div>
   <TreasuryPlanning :data="data" :busy="loading||!!error" @busy="saving=$event" @changed="load" />
  </template>
 </FormDialog>
</template>
<style scoped>table{width:100%;border-collapse:collapse}td,th{padding:10px;text-align:left;vertical-align:top}small{display:block}p{line-height:1.6}</style>
