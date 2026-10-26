<script setup>
import { t } from '../locales/exercises.js';
</script>
<template><nav class="management-tabs" :aria-label="t.management"><RouterLink to="/empresas">{{ t.companies }}</RouterLink><RouterLink to="/ejercicios">{{ t.title }}</RouterLink></nav></template>
