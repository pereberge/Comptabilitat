<script setup>
import {sepaSequences} from '../../../shared/sepa.js';
const model=defineModel({type:Object,required:true});
const labels={RCUR:'Recurrente',OOFF:'Único',FRST:'Primero',FNAL:'Último'};
</script>
<template><section class="account-fiscal-profile"><h3>Mandato de domiciliación SEPA CORE</h3><p class="muted">Datos del mandato firmado por el cliente para las remesas de cobro.</p><div class="party-profile-fields"><label>Referencia del mandato<input v-model="model.reference" name="sepa_mandate_reference" maxlength="35"></label><label>Fecha de firma<input v-model="model.signed_on" name="sepa_mandate_signed_on" type="date" min="1000-01-01" max="9999-12-31"></label><label>Secuencia de cobro<select v-model="model.sequence" name="sepa_mandate_sequence"><option v-for="sequence in sepaSequences" :key="sequence" :value="sequence">{{ sequence }} · {{ labels[sequence] }}</option></select></label></div></section></template>
