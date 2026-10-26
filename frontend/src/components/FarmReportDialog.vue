<script setup>
import {computed,ref,watch} from 'vue';
import {companyHeaders} from '../services/company.js';
import {downloadFile} from '../services/documentation.js';
import {farmProductionError} from '../services/farms.js';
import FormDialog from './FormDialog.vue';
const props=defineProps({farms:Array,lots:Array,farmId:String,lotId:String}),emit=defineEmits(['close']);
const farm=ref(props.farmId||''),lot=ref(props.lotId||''),html=ref(''),busy=ref(false),error=ref('');
const lots=computed(()=>props.lots.filter(row=>String(row.farm_id)===farm.value)),valid=computed(()=>!!farm.value&&lots.value.some(row=>String(row.id)===lot.value));
watch(farm,()=>{html.value='';if(!lots.value.some(row=>String(row.id)===lot.value))lot.value=lots.value.length===1?String(lots.value[0].id):'';});watch(lot,()=>html.value='');
const params=()=>new URLSearchParams({farm_id:farm.value,lot_id:lot.value});
async function preview(){if(!valid.value)return;busy.value=true;error.value='';try{const response=await fetch('/api/farms/report-preview?'+params(),{headers:companyHeaders()});if(!response.ok){const data=await response.json();throw {code:data.error?.code};}html.value=await response.text();}catch(cause){error.value=farmProductionError(cause);}finally{busy.value=false;}}
async function download(){if(!valid.value)return;busy.value=true;error.value='';try{await downloadFile('/farms/report.pdf?'+params(),'informe-granja-lote-'+lot.value+'.pdf');}catch(cause){error.value=farmProductionError(cause);}finally{busy.value=false;}}
</script>
<template><FormDialog title="Informe de granja y lote" :busy="busy" @close="emit('close')"><p class="muted">Ciclo completo: entrada, despeses detalladas, salidas, bajas, pienso e índice de conversión.</p><form class="report-selectors" @submit.prevent="preview"><label for="report-farm">Granja<select id="report-farm" v-model="farm" :disabled="busy" required><option value="">Selecciona granja</option><option v-for="row in farms" :key="row.id" :value="String(row.id)">{{ row.name }}</option></select></label><label for="report-lot">Lote<select id="report-lot" v-model="lot" :disabled="busy" required><option value="">Selecciona lote</option><option v-for="row in lots" :key="row.id" :value="String(row.id)">{{ row.code }} · {{ row.exit_date?'cerrado':'abierto' }}</option></select></label><button class="button primary" :disabled="busy||!valid">Ver informe</button><button type="button" class="button" :disabled="busy||!valid" @click="download">Descargar PDF</button></form><p v-if="farm&&!lots.length" class="notice">Esta granja todavía no tiene lotes. Registra su entrada para preparar el informe.</p><p v-if="error" role="alert" class="notice error-notice">{{ error }}</p><iframe v-if="html" class="report-preview" sandbox="" title="Vista previa del informe de lote" :srcdoc="html"></iframe></FormDialog></template>
<style scoped>.report-selectors{display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin:20px 0}.report-selectors label{flex:1;min-width:180px}.report-preview{width:100%;height:65vh;background:white;border:1px solid #e0e6ed;border-radius:7px}</style>
