<script setup>
import { es } from '../locales/es.js';
defineProps({ status: String });
</script>
<template><span class="badge" :class="status === 'open' ? 'badge-open' : 'badge-closed'"><span class="dot"></span>{{ status === 'open' ? es.open : es.closed }}</span></template>