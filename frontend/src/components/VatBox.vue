<script setup>
import {reportMoney} from '../services/report-format.js';
defineProps({code:String,value:String,label:String});
defineEmits(['select']);
</script>
<template><button type="button" class="vat-box" :data-vat-box="code" :aria-label="'Casilla '+code+' · '+label+' · '+reportMoney(value||'0.00')+' euros. Ver detalle'" @click="$emit('select',code)"><small>{{ code }}</small><strong>{{ reportMoney(value||'0.00') }}</strong></button></template>
