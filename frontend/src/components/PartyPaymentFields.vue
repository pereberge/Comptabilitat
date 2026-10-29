<script setup>
import {partyPaymentText as p} from '../locales/party-payments.js';
const profile=defineModel({type:Object,required:true});
</script>
<template><section class="party-payment-fields"><h3>{{ p.title }}</h3><p class="muted">{{ p.help }}</p><div class="form-grid">
 <label>{{ p.paymentMethod }}<select v-model="profile.payment_method" name="party_payment_method"><option value="">{{ p.companyMethod }}</option><option v-for="(label,key) in p.methods" :key="key" :value="key">{{ label }}</option></select></label>
 <label>{{ p.dueDays }}<input v-model.number="profile.due_days" name="party_due_days" type="number" min="0" max="3650" required></label>
 <label>{{ p.installments }}<input v-model.number="profile.installments" name="party_installments" type="number" min="1" max="60" required></label>
 <label>{{ p.intervalMonths }}<input v-model.number="profile.interval_months" name="party_interval_months" type="number" min="1" max="12" required></label>
 <label>{{ p.paymentDay }}<select v-model.number="profile.payment_day" name="party_payment_day"><option :value="0">{{ p.noFixedDay }}</option><option v-for="day in 31" :key="day" :value="day">{{ day }}</option></select></label>
 <label>{{ p.iban }}<input v-model="profile.iban" name="party_iban" maxlength="42" autocomplete="off" placeholder="ES…"></label>
 </div></section></template>
<style scoped>.party-payment-fields{border-top:1px solid #dce3ec;margin-top:20px;padding-top:14px}.party-payment-fields .muted{margin:8px 0 16px}.party-payment-fields input,.party-payment-fields select{width:100%;min-width:0}</style>
