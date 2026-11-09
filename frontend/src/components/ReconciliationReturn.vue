<script setup>
import {computed} from 'vue';
import {useRoute,useRouter} from 'vue-router';
import {useContext} from '../composables/context.js';
import {t} from '../locales/reconciliation-matches.js';
const route=useRoute(),router=useRouter(),{company,exercises,selectExercise}=useContext();
const visible=computed(()=>route.query.return_to==='/conciliacion-bancaria'&&route.query.bank_company_id===String(company.value?.id)&&exercises.value.some(row=>String(row.id)===route.query.bank_exercise_id));
function back(){if(!visible.value)return;selectExercise(route.query.bank_exercise_id);void router.push({name:'bankReconciliation'});}
</script>
<template><p v-if="visible" class="reconciliation-return"><button type="button" class="button" @click="back">{{ t.back }}</button></p></template>
<style scoped>.reconciliation-return{margin:16px 0}</style>
