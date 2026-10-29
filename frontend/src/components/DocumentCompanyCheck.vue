<script setup>
import {computed} from 'vue';
import {documentCompanyMessage,needsCompanyReview} from '../services/documentation.js';
const props=defineProps({check:Object,checking:Boolean});
const target=defineModel('target',{type:String}),confirmed=defineModel('confirmed',{type:Boolean});
const choices=computed(()=>{if(!props.check)return [];return [props.check.current_company,...props.check.matches.filter(row=>row.id!==props.check.current_company.id)];});
const override=computed(()=>props.check&&target.value===String(props.check.current_company.id)&&needsCompanyReview(props.check));
</script>
<template><section class="document-company-check" aria-label="Empresa de la factura">
 <p v-if="checking" class="muted" role="status">Comprobando la empresa de la factura…</p>
 <template v-else-if="check"><p :class="['notice',needsCompanyReview(check)?'error-notice':check.status==='unknown'?'':'success-note']" role="status">{{ documentCompanyMessage(check) }}</p>
  <p v-if="needsCompanyReview(check)" class="muted">Empresa actual: {{ check.current_company.name }}<template v-if="check.current_company.tax_id"> · {{ check.current_company.tax_id }}</template>.</p>
  <p v-if="check.status!=='current'&&(check.parties.customer.name||check.parties.customer.tax_id)" class="muted">Destinatario leído: {{ check.parties.customer.name||'Nombre sin identificar' }}<template v-if="check.parties.customer.tax_id"> · {{ check.parties.customer.tax_id }}</template>.</p>
  <label>Empresa de destino<select v-model="target" name="documentation_target_company" required @change="confirmed=false"><option v-if="!target" value="">Selecciona la empresa</option><option v-for="item in choices" :key="item.id" :value="String(item.id)">{{ item.name }}{{ item.tax_id?' · '+item.tax_id:'' }}{{ item.id===check.current_company.id?' (empresa actual)':'' }}</option></select></label>
  <label v-if="override" class="document-company-confirm"><input v-model="confirmed" type="checkbox" name="documentation_confirm_company" required>He revisado el original y quiero conservar esta factura en la empresa actual.</label>
  <p v-if="target&&target!==String(check.current_company.id)" class="muted">Se guardará en las facturas pendientes de la empresa de destino, conservando el original. Esta acción no contabiliza la factura.</p>
 </template>
</section></template>
<style scoped>
.document-company-check{margin:16px 0;padding:14px;border:1px solid #dce3ec;border-radius:8px}.document-company-check p{margin-bottom:10px}.document-company-confirm{display:flex;flex-direction:row;align-items:flex-start;gap:10px}.document-company-confirm input{min-height:18px;width:18px;flex-shrink:0}
</style>
