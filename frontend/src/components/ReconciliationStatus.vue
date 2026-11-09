<script setup>
import {computed} from 'vue';
import {reconciliationStatus} from '../../../shared/reconciliation-status.js';
import {reportMoney as money} from '../services/report-format.js';
const props=defineProps({movements:{type:Array,required:true},current:Object});
const status=computed(()=>reconciliationStatus(props.movements,props.current));
</script>
<template>
 <section class="reconciliation-status" :class="status.balanced?'is-balanced':'is-pending'" role="status" aria-live="polite">
  <span class="status-light" aria-hidden="true">{{ status.balanced?'✓':status.pending }}</span>
  <div><strong>{{ status.balanced?'Extracte quadrat':status.pending===1?'Falta 1 apunt':status.pending>1?'Falten '+status.pending+' apunts':'Cal revisar la conciliació' }}</strong>
   <p v-if="status.balanced">Tots els moviments conciliats i saldos quadrats dins del marge de 0,03 €.</p>
   <p v-else-if="status.pending">{{ status.pending===1?'1 moviment de l’extracte pendent de conciliar.':status.pending+' moviments de l’extracte pendents de conciliar.' }}</p>
   <p v-else>0 apunts pendents. Cal revisar el saldo o actualitzar el llistat.</p>
   <small v-if="status.difference!==null">Diferència major − extracte: <strong>{{ money(status.difference) }} €</strong>.</small>
   <small v-if="status.needsRefresh">El diari ha canviat. Prem «Actualitzar llistat» per comprovar la conciliació.</small>
  </div>
 </section>
</template>
<style scoped>
.reconciliation-status{display:flex;align-items:center;gap:16px;border:1px solid;border-radius:10px;padding:18px 20px;margin:20px 0}
.is-balanced{background:#f0faf3;border-color:#a8d5b4;color:#205c36}.is-pending{background:#fff4f3;border-color:#e8b1ac;color:#902d29}
.status-light{display:flex;align-items:center;justify-content:center;flex:0 0 auto;min-width:44px;height:44px;padding:0 10px;box-sizing:border-box;border-radius:50%;color:white;font-size:20px;font-weight:700}
.is-balanced .status-light{background:#248447}.is-pending .status-light{background:#bf3731}
p{margin:6px 0;font-size:13px;line-height:1.5}small{display:block;margin-top:5px;line-height:1.5}
@media(max-width:600px){.reconciliation-status{padding:14px;gap:12px;align-items:flex-start}}
</style>
