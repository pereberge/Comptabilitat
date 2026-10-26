<script setup>
import { useRoute } from 'vue-router';
import { onMounted, ref, watch } from 'vue';
import { es } from './locales/es.js';
import {useAccess} from './composables/access.js';
import UserSwitch from './components/UserSwitch.vue';
import './assets/access.css';
import { useContext } from './composables/context.js';
import { companyTheme } from './services/company-theme.js';
import {companyHasCapability} from '../../shared/company-formats.js';
import AppIcon from './components/AppIcon.vue';
import StatusBadge from './components/StatusBadge.vue';
import './assets/companies.css';
import './assets/exercises.css';
import './assets/treasury.css';
import './assets/documentation.css';
import './assets/data-backup.css';
import './assets/verifactu.css';
const { company, companies, error, exercises, selectedId, selectedExercise, loading, refresh, selectExercise } = useContext();
const {user,loading:accessLoading,error:accessError,revision,refresh:refreshAccess,can}=useAccess();
const menuOpen = ref(false);
const route = useRoute();
watch(() => company.value?.id, id => {
  for (const [key, value] of Object.entries(companyTheme(id))) document.documentElement.style.setProperty(key, value);
}, { immediate: true });
onMounted(()=>Promise.all([refreshAccess(),refresh()]));
function switchCompany(id) {
  if (loading.value) return;
  menuOpen.value = false;
  if (String(company.value?.id) !== String(id)) refresh(String(id));
}
function changeCompany(event) { switchCompany(event.target.value); }
</script>
<template>
  <a class="skip-link" href="#main">{{ es.skip }}</a>
  <button v-if="menuOpen" class="scrim" :aria-label="es.closeMenu" @click="menuOpen = false"></button>
  <aside id="sidebar" class="sidebar" :class="{ 'is-open': menuOpen }" @keydown.esc="menuOpen = false">
    <div class="brand"><span class="brand-mark"><AppIcon name="book" /></span><div><strong>{{ es.app }}</strong><small>{{ es.tagline }}</small></div></div>
    <nav :aria-label="es.navigation">
      <p class="nav-label">{{ es.navigation }}</p>
      <RouterLink class="nav-item" to="/" @click="menuOpen = false"><AppIcon name="home" />{{ es.home }}</RouterLink>
      <RouterLink class="nav-item" to="/ejercicios" @click="menuOpen = false"><AppIcon name="calendar" />{{ es.exercises }}</RouterLink>
      <RouterLink class="nav-item" to="/cuentas" @click="menuOpen=false"><AppIcon name="list" />{{ es.accounts }}</RouterLink>
      <RouterLink class="nav-item" to="/asientos" @click="menuOpen=false"><AppIcon name="book" />{{ es.entries }}</RouterLink>
      <RouterLink class="nav-item" to="/facturas" @click="menuOpen=false"><AppIcon name="list" />{{ es.invoices }}</RouterLink>
      <RouterLink v-if="companyHasCapability(company,'pig_production')" class="nav-item" to="/granjas" @click="menuOpen=false"><AppIcon name="building" />Gestión de granjas</RouterLink>
      <RouterLink class="nav-item" to="/verifactu" @click="menuOpen=false"><AppIcon name="check" />VERI*FACTU</RouterLink>
      <RouterLink class="nav-item" to="/cartera" @click="menuOpen=false"><AppIcon name="calendar" />{{ es.portfolio }}</RouterLink>
      <RouterLink class="nav-item" to="/documentacion" @click="menuOpen=false"><AppIcon name="book" />{{ es.documentation }}</RouterLink>
      <RouterLink class="nav-item" to="/conciliacion-bancaria" @click="menuOpen=false"><AppIcon name="check" />{{ es.bankReconciliation }}</RouterLink>
      <RouterLink class="nav-item" to="/mayor" @click="menuOpen=false"><AppIcon name="book" />{{ es.ledger }}</RouterLink>
      <RouterLink class="nav-item" to="/sumas-saldos" @click="menuOpen=false"><AppIcon name="list" />{{ es.trialBalance }}</RouterLink>
      <RouterLink class="nav-item" to="/balance-situacion" @click="menuOpen=false"><AppIcon name="list" />{{ es.balanceSheet }}</RouterLink>
      <RouterLink class="nav-item" to="/perdidas-ganancias" @click="menuOpen=false"><AppIcon name="list" />{{ es.profitLoss }}</RouterLink>
      <RouterLink class="nav-item" to="/usuarios" @click="menuOpen=false"><AppIcon name="list" />Usuarios y permisos</RouterLink>
    </nav>
    <div class="sidebar-footer"><span class="local-dot"></span>{{ es.local }}<small>{{ es.version }}</small></div>
  </aside>
  <div class="app-shell">
    <header class="topbar">
      <button class="menu-toggle button" :aria-label="es.menu" :aria-expanded="menuOpen" aria-controls="sidebar" @click="menuOpen = !menuOpen"><AppIcon name="menu" /></button>
      <span class="topbar-title">{{ es.app }} <span>/ {{ es[route.name] || es.home }}</span></span>
      <div class="context-pickers">
      <div class="exercise-picker company-picker">
        <img v-if="company?.logo_url" class="company-picker-logo" :src="company.logo_url" alt=""><AppIcon v-else name="building" /><label for="company">{{ es.company }}</label>
        <select id="company" :value="company?.id || ''" :disabled="loading || !companies.length" @change="changeCompany">
          <option v-if="!company" value="">{{ loading ? es.loading : es.noCompany }}</option>
          <option v-for="item in companies" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </div>
      <div class="exercise-picker">
        <AppIcon name="calendar" /><label for="exercise">{{ es.exercise }}</label>
        <select id="exercise" :value="selectedId" :disabled="loading || !exercises.length" @change="selectExercise($event.target.value)">
          <option v-if="!exercises.length" value="">{{ loading ? es.loading : es.noExercise }}</option>
          <option v-for="exercise in exercises" :key="exercise.id" :value="String(exercise.id)">{{ exercise.name }}</option>
        </select>
        <StatusBadge v-if="selectedExercise" :status="selectedExercise.status" />
      </div>
      </div>
      <div class="topbar-user-controls"><RouterLink v-if="user?.role==='master'" class="button master-evolution-link" to="/evolucion-empresas">{{ es.companyEvolution }}</RouterLink><UserSwitch /></div>
    </header>
    <main id="main" tabindex="-1">
      <p v-if="loading || accessLoading" role="status">{{ es.loading }}</p>
      <div v-else-if="error && route.name !== 'companies'" class="notice error-notice" role="alert">{{ es.errors[error] || es.unavailable }}<button class="button" @click="refresh">{{ es.retry }}</button></div>
      <div v-else-if="accessError" class="notice error-notice" role="alert">{{ accessError }}<button class="button" @click="refreshAccess">{{ es.retry }}</button></div>
      <template v-else-if="user && (company || route.name === 'companies' || route.name === 'users')">
        <p v-if="!can('accounting_write')" class="notice access-readonly">Tu usuario tiene desactivada la edición contable. Puedes consultar los datos y los informes.</p>
        <RouterView :key="(company?.id || 'companies') + ':' + revision" />
      </template>
    </main>
    <footer class="page-footer"><span>{{ company?.name || es.app }}</span><span>{{ es.version }}</span></footer>
  </div>
</template>
