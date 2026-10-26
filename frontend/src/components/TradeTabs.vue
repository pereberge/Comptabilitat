<script setup>import {t} from '../locales/treasury.js';</script>
<template><nav class="management-tabs" :aria-label="t.invoices+' / '+t.portfolio"><RouterLink to="/facturas">{{ t.invoices }}</RouterLink><RouterLink to="/cartera">{{ t.portfolio }}</RouterLink></nav></template>
