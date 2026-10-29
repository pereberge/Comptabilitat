<script setup>
import {computed} from 'vue';
import {emptyPartyPaymentProfile} from '../../../shared/party-payments.js';
import {partyPaymentText as p} from '../locales/party-payments.js';
const props=defineProps({profile:Object});
const settings=computed(()=>({...emptyPartyPaymentProfile(),...props.profile}));
</script>
<template><div class="party-payment-summary"><h3>{{ p.title }}</h3><p v-if="!profile" class="muted">{{ p.defaults }}</p><dl><div><dt>{{ p.paymentMethod }}</dt><dd>{{ p.methods[settings.payment_method]||p.companyMethod }}</dd></div><div><dt>{{ p.dueDays }}</dt><dd>{{ settings.due_days }} {{ settings.due_days===1?p.day:p.days }}</dd></div><div><dt>{{ p.installments }}</dt><dd>{{ settings.installments }}</dd></div><div><dt>{{ p.intervalMonths }}</dt><dd>{{ settings.interval_months }} {{ settings.interval_months===1?p.month:p.months }}</dd></div><div><dt>{{ p.paymentDay }}</dt><dd>{{ settings.payment_day||p.noFixedDay }}</dd></div><div v-if="settings.iban"><dt>{{ p.iban }}</dt><dd>{{ settings.iban }}</dd></div></dl></div></template>
<style scoped>.party-payment-summary{margin:16px 0}.party-payment-summary dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px;margin-top:12px}.party-payment-summary dd{overflow-wrap:anywhere}@media(max-width:600px){.party-payment-summary dl{grid-template-columns:1fr}}</style>
