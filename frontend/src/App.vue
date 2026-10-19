<script setup>
import { useRoute } from 'vue-router';
import { onMounted, ref } from 'vue';
import { es } from './locales/es.js';
import { useContext } from './composables/context.js';
import AppIcon from './components/AppIcon.vue';
import StatusBadge from './components/StatusBadge.vue';
const { company, companies, error, exercises, selectedId, selectedExercise, loading, refresh, selectExercise } = useContext();
const menuOpen = ref(false);
const route = useRoute();
onMounted(refresh);
function changeCompany(event) { refresh(event.target.value); }
</script>
<template>
  <a class="skip-link" href="#main">{{ es.skip }}</a>
  <button v-if="menuOpen" class="scrim" :aria-label="es.closeMenu" @click="menuOpen = false"></button>
  <aside id="sidebar" class="sidebar" :class="{ 'is-open': menuOpen }" @keydown.esc="menuOpen = false">
    <div class="brand"><span class="brand-mark"><AppIcon name="book" /></span><div><strong>{{ es.app }}</strong><small>{{ es.tagline }}</small></div></div>
    <nav :aria-label="es.navigation">
      <p class="nav-label">{{ es.navigation }}</p>
      <RouterLink class="nav-item" to="/" @click="menuOpen = false"><AppIcon name="home" />{{ es.home }}</RouterLink>
      <RouterLink class="nav-item" to="/cuentas" @click="menuOpen=false"><AppIcon name="list" />{{ es.accounts }}</RouterLink>
      <RouterLink class="nav-item" to="/asientos" @click="menuOpen=false"><AppIcon name="book" />{{ es.entries }}</RouterLink>
      <RouterLink class="nav-item" to="/mayor" @click="menuOpen=false"><AppIcon name="book" />{{ es.ledger }}</RouterLink>
      <RouterLink class="nav-item" to="/sumas-saldos" @click="menuOpen=false"><AppIcon name="list" />{{ es.trialBalance }}</RouterLink>
      <RouterLink class="nav-item" to="/balance-situacion" @click="menuOpen=false"><AppIcon name="list" />{{ es.balanceSheet }}</RouterLink>
    </nav>
    <div class="sidebar-footer"><span class="local-dot"></span>{{ es.local }}<small>{{ es.version }}</small></div>
  </aside>
  <div class="app-shell">
    <header class="topbar">
      <button class="menu-toggle button" :aria-label="es.menu" :aria-expanded="menuOpen" aria-controls="sidebar" @click="menuOpen = !menuOpen"><AppIcon name="menu" /></button>
      <span class="topbar-title">{{ es.app }} <span>/ {{ es[route.name] || es.home }}</span></span>
      <div class="context-pickers">
      <div class="exercise-picker company-picker">
        <AppIcon name="building" /><label for="company">{{ es.company }}</label>
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
    </header>
    <main id="main" tabindex="-1">
      <p v-if="loading" role="status">{{ es.loading }}</p>
      <div v-else-if="error" class="notice error-notice" role="alert">{{ es.errors[error] || es.unavailable }}<button class="button" @click="refresh">{{ es.retry }}</button></div>
      <RouterView v-else-if="company" :key="company.id" />
    </main>
    <footer class="page-footer"><span>{{ company?.name || es.app }}</span><span>{{ es.version }}</span></footer>
  </div>
</template>