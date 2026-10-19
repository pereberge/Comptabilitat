<script setup>
import { es } from '../locales/es.js';
import { useContext } from '../composables/context.js';
import AppIcon from '../components/AppIcon.vue';
import StatusBadge from '../components/StatusBadge.vue';
const { company, selectedExercise, loading, error, refresh } = useContext();
function date(value) { return value ? value.split('-').reverse().join('/') : '—'; }
</script>
<template>
  <div class="page-heading"><div><p class="eyebrow">{{ es.overview }}</p><h1>{{ es.welcome }}</h1><p class="muted">{{ es.intro }}</p></div>
    <button class="button" :disabled="loading" @click="refresh"><span aria-hidden="true">↻</span>{{ es.reload }}</button>
  </div>
  <section v-if="error" class="notice error-notice" role="alert"><div><h2>{{ es.unavailable }}</h2><p>{{ es.errors[error] || es.errors.SERVICE_UNAVAILABLE }}</p></div><button class="button" @click="refresh">{{ es.retry }}</button></section>
  <p v-else-if="loading" class="notice" role="status">{{ es.loading }}</p>
  <template v-else-if="company">
    <section class="company-card"><div class="company-icon"><AppIcon name="building" /></div><div><p class="eyebrow">{{ es.company }}</p><h2>{{ company.name }}</h2></div><span class="connection-pill"><span class="dot"></span>{{ es.connected }}</span></section>
    <div v-if="selectedExercise" class="summary-grid">
      <section class="panel metric"><p class="metric-label"><AppIcon name="calendar" />{{ es.selected }}</p><h2>{{ selectedExercise.name }}</h2><p class="muted">{{ es.exerciseHelp }}</p></section>
      <section class="panel metric"><p class="metric-label">{{ es.period }}</p><h2 class="period">{{ date(selectedExercise.start_date) }}<span>—</span>{{ date(selectedExercise.end_date) }}</h2><p class="muted">{{ es.period }}</p></section>
      <section class="panel metric"><p class="metric-label">{{ es.status }}</p><StatusBadge :status="selectedExercise.status" /><p class="muted">{{ selectedExercise.status === 'open' ? es.openHelp : es.closedHelp }}</p></section>
    </div>
    <section v-else class="notice" role="status"><h2>{{ es.noExercise }}</h2><p>{{ es.noExercisesHelp }}</p></section>
  </template>
  <section class="workspace"><div class="section-heading"><h2>{{ es.workspace }}</h2><p class="muted">{{ es.workspaceHelp }}</p></div>
    <div class="module-grid">
      <article class="panel module"><span class="module-icon"><AppIcon name="book" /></span><span class="phase">{{ es.phase2 }}</span><h3>{{ es.accounts }}</h3><p>{{ es.accountsHelp }}</p><RouterLink class="module-footer module-link" to="/cuentas">{{ es.accounts }}</RouterLink></article>
      <article class="panel module"><span class="module-icon"><AppIcon name="list" /></span><span class="phase">{{ es.phase3 }}</span><h3>{{ es.entries }}</h3><p>{{ es.entriesHelp }}</p><RouterLink class="module-footer module-link" to="/asientos">{{ es.entries }}</RouterLink></article>
    </div>
  </section>
  <div v-if="company && !loading && !error" class="connection-note"><AppIcon name="check" /><div><strong>{{ es.connection }}</strong><p>{{ es.connectionHelp }}</p></div></div>
</template>