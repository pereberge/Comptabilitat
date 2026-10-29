<script setup>
import {useRoute} from 'vue-router';
import {t} from '../locales/treasury.js';
const route=useRoute();
</script>
<template><nav class="management-tabs" :aria-label="t.invoices+' / '+t.portfolio"><RouterLink to="/facturas">{{ t.invoices }}</RouterLink><RouterLink to="/cartera" :class="{'router-link-active':route.name==='bankRemittances'}">{{ t.portfolio }}</RouterLink></nav></template>
