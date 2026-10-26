import UsersView from '../views/UsersView.vue';
import CompanyEvolutionView from '../views/CompanyEvolutionView.vue';
import ReportsView from '../views/ReportsView.vue';
import ProfitLossView from '../views/ProfitLossView.vue';
import BalanceSheetView from '../views/BalanceSheetView.vue';
import CompaniesView from '../views/CompaniesView.vue';
import ExercisesView from '../views/ExercisesView.vue';
import InvoicesView from '../views/InvoicesView.vue';
import DocumentationView from '../views/DocumentationView.vue';
import VerifactuView from '../views/VerifactuView.vue';
import DataBackupView from '../views/DataBackupView.vue';
import PortfolioView from '../views/PortfolioView.vue';
import BankReconciliationView from '../views/BankReconciliationView.vue';
import { createRouter, createWebHistory } from 'vue-router';
import AccountsView from '../views/AccountsView.vue';
import EntriesView from '../views/EntriesView.vue';
import HomeView from '../views/HomeView.vue';
import NotFoundView from '../views/NotFoundView.vue';
export const router = createRouter({
  history: createWebHistory(),
  // Documentation belongs to the company and is shared by its fiscal years.
  // Fiscal years and companies have dedicated management screens.
  // Company and exercise remain in the shared application context.
  routes: [{path:'/evolucion-empresas',name:'companyEvolution',component:CompanyEvolutionView},{path:'/usuarios',name:'users',component:UsersView},{path:'/verifactu',name:'verifactu',component:VerifactuView},{path:'/copias-seguridad',name:'dataBackup',component:DataBackupView},{path:'/documentacion',name:'documentation',component:DocumentationView},{path:'/conciliacion-bancaria',name:'bankReconciliation',component:BankReconciliationView},{path:'/facturas',name:'invoices',component:InvoicesView},{path:'/cartera',name:'portfolio',component:PortfolioView},{path:'/ejercicios',name:'exercises',component:ExercisesView},{path:'/empresas',name:'companies',component:CompaniesView},{path:'/perdidas-ganancias',name:'profitLoss',component:ProfitLossView},{path:'/balance-situacion',name:'balanceSheet',component:BalanceSheetView},{path:'/mayor',name:'ledger',component:ReportsView},{path:'/sumas-saldos',name:'trialBalance',component:ReportsView},{ path: '/proveedores', redirect: '/cuentas' },{ path: '/cuentas', name: 'accounts', component: AccountsView },{ path: '/asientos', name: 'entries', component: EntriesView },{ path: '/', name: 'home', component: HomeView }, { path: '/:pathMatch(.*)*', component: NotFoundView }],
});
router.addRoute({path:'/granjas',name:'farms',component:()=>import('../views/FarmManagementView.vue')});
