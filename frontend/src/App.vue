<script setup>
import { useRoute,useRouter } from 'vue-router';
import { onMounted, ref, watch } from 'vue';
import { es } from './locales/es.js';
import {useAccess} from './composables/access.js';
import UserSwitch from './components/UserSwitch.vue';
import LoginView from './components/LoginView.vue';
import './assets/access.css';
import { useContext } from './composables/context.js';
import {workspace} from './services/workspace-state.js';
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
const { company, companies, error, exercises, selectedId, selectedExercise, loading, refresh, clear,selectCompany,selectExercise } = useContext();
const {user,loading:accessLoading,error:accessError,revision,refresh:refreshAccess,can}=useAccess();
const menuOpen = ref(false);
const route = useRoute(),router=useRouter(),restoringWorkspace=ref(false);
let workspaceGeneration=0,workspaceOpened=false;
watch(() => company.value?.id, id => {
  for (const [key, value] of Object.entries(companyTheme(id))) document.documentElement.style.setProperty(key, value);
}, { immediate: true });
onMounted(refreshAccess);
watch([()=>user.value?.key,revision],async([key],previous)=>{
 const ticket=++workspaceGeneration;menuOpen.value=false;restoringWorkspace.value=true;
 clear({forget:!!previous?.[0]&&key!==previous[0]});const saved=workspace.activate(key);
 if(!key){restoringWorkspace.value=false;return;}
 try{
  await router.isReady();if(ticket!==workspaceGeneration)return;
  const changedUser=previous?.[0]&&key!==previous[0];
  const returningLogin=workspaceOpened&&!previous?.[0];workspaceOpened=true;
  if(route.fullPath==='/'||changedUser||returningLogin){
   const destination=saved.route||'/',target=router.resolve(destination);
   if(target.matched.length&&target.name!=='notFound')await router.replace(destination);
  }
  if(ticket!==workspaceGeneration)return;
  const query=route.query,requested=typeof query.company_id==='string'&&/^[1-9]\d*$/.test(query.company_id)?query.company_id:undefined;
  await refresh(requested,{exerciseId:requested&&typeof query.exercise_id==='string'?query.exercise_id:''});
 }finally{if(ticket===workspaceGeneration){restoringWorkspace.value=false;rememberWorkspace();}}
},{immediate:true});
function rememberWorkspace(){
 if(!user.value||restoringWorkspace.value||loading.value||!company.value||!selectedId.value||route.name==='notFound')return;
 const query=route.query,stale=query.company_id&&query.company_id!==String(company.value.id)||query.exercise_id&&query.exercise_id!==selectedId.value;
 workspace.remember({company_id:String(company.value.id),exercise_id:selectedId.value,route:stale?route.path:route.fullPath});
 if(stale)void router.replace({path:route.path,hash:route.hash});
}
watch([()=>route.fullPath,()=>company.value?.id,selectedId,loading],rememberWorkspace,{flush:'post'});
function switchCompany(id) {
  if (loading.value) return;
  menuOpen.value = false;
  if (String(company.value?.id) !== String(id)) void selectCompany(String(id));
}
function changeCompany(event) { switchCompany(event.target.value); }
</script>
<template>
  <div v-if="accessLoading" class="login-page" role="status">Comprovant la sessió…</div>
  <LoginView v-else-if="!user" />
  <template v-else>
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
      <RouterLink class="nav-item" to="/hacienda" @click="menuOpen=false"><AppIcon name="building" />{{ es.tax }}</RouterLink>
      <RouterLink v-if="companyHasCapability(company,'pig_production')" class="nav-item" to="/granjas" @click="menuOpen=false"><AppIcon name="building" />Gestión de granjas</RouterLink>
      <RouterLink class="nav-item" to="/verifactu" @click="menuOpen=false"><AppIcon name="check" />VERI*FACTU</RouterLink>
      <RouterLink class="nav-item" :class="{'router-link-active':route.name==='bankRemittances','router-link-exact-active':route.name==='bankRemittances'}" to="/cartera" @click="menuOpen=false"><AppIcon name="calendar" />{{ es.portfolio }}</RouterLink>
      <RouterLink class="nav-item" to="/documentacion" @click="menuOpen=false"><AppIcon name="book" />{{ es.documentation }}</RouterLink>
      <RouterLink class="nav-item" to="/conciliacion-bancaria" @click="menuOpen=false"><AppIcon name="check" />{{ es.bankReconciliation }}</RouterLink>
      <RouterLink class="nav-item" to="/mayor" @click="menuOpen=false"><AppIcon name="book" />{{ es.ledger }}</RouterLink>
      <RouterLink class="nav-item" to="/sumas-saldos" @click="menuOpen=false"><AppIcon name="list" />{{ es.trialBalance }}</RouterLink>
      <RouterLink class="nav-item" to="/balance-situacion" @click="menuOpen=false"><AppIcon name="list" />{{ es.balanceSheet }}</RouterLink>
      <RouterLink class="nav-item" to="/perdidas-ganancias" @click="menuOpen=false"><AppIcon name="list" />{{ es.profitLoss }}</RouterLink>
      <RouterLink v-if="can('users_manage')" class="nav-item" to="/usuarios" @click="menuOpen=false"><AppIcon name="list" />Usuaris</RouterLink>
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
      <p v-if="loading || accessLoading || restoringWorkspace" role="status">{{ es.loading }}</p>
      <div v-else-if="error && route.name !== 'companies'" class="notice error-notice" role="alert">{{ es.errors[error] || es.unavailable }}<button class="button" @click="refresh">{{ es.retry }}</button></div>
      <div v-else-if="accessError" class="notice error-notice" role="alert">{{ accessError }}<button class="button" @click="refreshAccess">{{ es.retry }}</button></div>
      <template v-else-if="user && (company || route.name === 'companies' || route.name === 'users')">
        <p v-if="!can('accounting_write')" class="notice access-readonly">Tu usuario tiene desactivada la edición contable. Puedes consultar los datos y los informes.</p>
        <RouterView :key="(company?.id || 'companies') + ':' + revision" />
      </template>
      <section v-else class="panel no-company-access"><h1>Cap empresa assignada</h1><p>Demana al màster que t’assigni les empreses amb què pots treballar.</p><RouterLink v-if="can('companies_manage')" class="button primary" to="/empresas">Crear o gestionar empreses</RouterLink></section>
    </main>
    <footer class="page-footer"><span>{{ company?.name || es.app }}</span><span>{{ es.version }}</span></footer>
  </div>
  </template>
</template>
