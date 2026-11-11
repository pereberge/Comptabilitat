<script setup>
import {generalTables as t} from '../locales/general-tables.js';
</script>
<template>
 <div class="page-heading"><div><h1>{{ t.title }}</h1><p class="muted">{{ t.intro }}</p></div><RouterLink class="button" to="/">Inicio</RouterLink></div>
 <section class="panel general-table-folder"><h2>{{ t.banks }}</h2><p class="muted">{{ t.banksHelp }}</p><RouterLink class="button" to="/tablas-generales/bancos">{{ t.banks }}</RouterLink></section>
</template>
<style scoped>.general-table-folder{padding:24px}.general-table-folder h2{font-size:18px}.general-table-folder p{margin:12px 0}</style>
