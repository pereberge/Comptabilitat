<script setup>
defineProps({person:{type:Object,required:true},label:String});
</script>
<template><div class="invoice-fiscal-identity"><p v-if="label" class="invoice-fiscal-label">{{ label }}</p><h3>{{ person.name }}</h3><p v-if="person.tax_id">NIF / CIF: {{ person.tax_id }}</p><p v-if="person.address">{{ person.address }}</p><p v-if="person.postal_code||person.city||person.province">{{ [person.postal_code,person.city,person.province].filter(Boolean).join(' ') }}</p><p v-if="person.country">{{ person.country }}</p><p v-if="person.email">{{ person.email }}</p><p v-if="person.phone">{{ person.phone }}</p></div></template>
<style scoped>
.invoice-fiscal-identity{min-width:0;overflow-wrap:anywhere}.invoice-fiscal-label{font-size:12px;font-weight:600;color:#53647b;margin-bottom:8px}.invoice-fiscal-identity p{font-size:13px;margin-top:5px}
</style>
