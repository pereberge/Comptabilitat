<script setup>
import { es } from '../locales/es.js';
import { computed,onMounted } from 'vue';
import { useContext } from '../composables/context.js';
import { companyTheme } from '../services/company-theme.js';
import AppIcon from '../components/AppIcon.vue';
import StatusBadge from '../components/StatusBadge.vue';
import AccountingReviewButton from '../components/AccountingReviewButton.vue';
import HomeEntries from '../components/HomeEntries.vue';
import {latestExercise} from '../../../shared/report-periods.js';
const { company, companies, exercises, selectedExercise, loading, error, refresh, selectCompany, selectExercise } = useContext();
const initialExercise=latestExercise(exercises.value.filter(exercise=>exercise.status==='open'))||latestExercise(exercises.value);
if(initialExercise)selectExercise(String(initialExercise.id));
onMounted(()=>window.scrollTo({top:0,behavior:'instant'}));
const shortcutCompanies = computed(() => {
  const withLogo = companies.value.filter(item => item.logo_url);
  return withLogo.length ? withLogo : companies.value;
});
function switchCompany(id) {
  selectCompany(String(id));
}
function companyInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('es-ES');
}
function date(value) { return value ? value.split('-').reverse().join('/') : '—'; }
</script>
<template>
  <div class="page-heading home-page-heading"><div class="home-heading-copy"><p class="eyebrow">{{ es.overview }}</p><h1>{{ es.welcome }}</h1><p class="muted">{{ es.intro }}</p></div>
    <div class="home-heading-actions">
      <div v-if="shortcutCompanies.length" class="company-shortcuts" role="group" :aria-label="es.quickCompanySwitch" :aria-busy="loading">
        <button v-for="item in shortcutCompanies" :key="item.id" type="button" class="company-shortcut" :style="companyTheme(item.id)" :class="{ 'is-selected': item.id === company?.id }" :data-switch-company="item.id" :aria-pressed="item.id === company?.id" :aria-label="(item.id === company?.id ? es.currentCompany : es.switchToCompany) + ': ' + item.name" :title="item.name" :disabled="loading" @click="switchCompany(item.id)">
          <img v-if="item.logo_url" :src="item.logo_url" alt=""><span v-else aria-hidden="true">{{ companyInitials(item.name) }}</span>
          <AppIcon v-if="item.id === company?.id" name="check" />
        </button>
      </div>
      <button class="button" :disabled="loading" @click="refresh"><span aria-hidden="true">↻</span>{{ es.reload }}</button>
      <AccountingReviewButton :disabled="loading" />
      <RouterLink class="button" to="/copias-seguridad">{{ es.dataBackup }}</RouterLink>
    </div>
  </div>
  <section v-if="error" class="notice error-notice" role="alert"><div><h2>{{ es.unavailable }}</h2><p>{{ es.errors[error] || es.errors.SERVICE_UNAVAILABLE }}</p></div><button class="button" @click="refresh">{{ es.retry }}</button></section>
  <p v-else-if="loading" class="notice" role="status">{{ es.loading }}</p>
  <template v-else-if="company">
    <section class="company-card home-company-card"><div class="company-icon"><img v-if="company.logo_url" :src="company.logo_url" alt=""><AppIcon v-else name="building" /></div><div class="home-company-name"><p class="eyebrow">{{ es.company }}</p><h2>{{ company.name }}</h2></div><div v-if="selectedExercise" class="home-company-exercise"><p class="eyebrow">{{ selectedExercise.status==='open'?'Ejercicio abierto':es.selected }}</p><div><strong>{{ selectedExercise.name }}</strong><StatusBadge :status="selectedExercise.status" /></div><small>{{ date(selectedExercise.start_date) }} — {{ date(selectedExercise.end_date) }}</small></div><span class="connection-pill"><span class="dot"></span>{{ es.connected }}</span><RouterLink class="button" to="/empresas">{{ es.manageCompanies }}</RouterLink></section>
    <HomeEntries v-if="selectedExercise" :key="selectedExercise.id" :exercise="selectedExercise" />
    <section v-else class="notice" role="status"><h2>{{ es.noExercise }}</h2><p>{{ es.noExercisesHelp }}</p></section>
  </template>
  <div v-if="company && !loading && !error" class="connection-note"><AppIcon name="check" /><div><strong>{{ es.connection }}</strong><p>{{ es.connectionHelp }}</p></div></div>
</template>

<style scoped>
.home-company-card{gap:18px;flex-wrap:wrap;padding:18px 22px}.home-company-name{flex:1;min-width:180px}.home-company-exercise{border-left:1px solid #e0e6ed;padding-left:20px}.home-company-exercise>div{display:flex;align-items:center;gap:10px}.home-company-exercise strong{font-size:23px}.home-company-exercise small{display:block;margin-top:5px;color:#65748a;font-size:11px}.home-company-card .connection-pill{margin-left:0}@media(max-width:600px){.home-company-exercise{border-left:0;padding-left:0;flex-basis:100%}.home-company-name{min-width:0}.home-company-card h2{font-size:18px;overflow-wrap:anywhere}}
</style>
