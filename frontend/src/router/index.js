import ReportsView from '../views/ReportsView.vue';
import BalanceSheetView from '../views/BalanceSheetView.vue';
import { createRouter, createWebHistory } from 'vue-router';
import AccountsView from '../views/AccountsView.vue';
import EntriesView from '../views/EntriesView.vue';
import HomeView from '../views/HomeView.vue';
import NotFoundView from '../views/NotFoundView.vue';
export const router = createRouter({
  history: createWebHistory(),
  // Company and exercise remain in the shared application context.
  routes: [{path:'/balance-situacion',name:'balanceSheet',component:BalanceSheetView},{path:'/mayor',name:'ledger',component:ReportsView},{path:'/sumas-saldos',name:'trialBalance',component:ReportsView},{ path: '/proveedores', redirect: '/cuentas' },{ path: '/cuentas', name: 'accounts', component: AccountsView },{ path: '/asientos', name: 'entries', component: EntriesView },{ path: '/', name: 'home', component: HomeView }, { path: '/:pathMatch(.*)*', component: NotFoundView }],
});
