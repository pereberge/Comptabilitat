import { reportController } from '../controllers/reports.js';
import { Router, raw } from 'express';
import { accountImportController } from '../controllers/account-import.js';
import { contextController } from '../controllers/context.js';
import { accountingController } from '../controllers/accounting.js';
export function apiRouter(service, accounting) {
 const router=Router(), controller=contextController(service);
 router.get('/companies',controller.companies);router.get('/health',controller.health);router.get('/context',controller.context);
 router.post('/account-import/preview',raw({type:'application/pdf',limit:'5mb'}),accountImportController.preview);
 router.post('/account-import/commit',accountImportController.commit);
 router.get('/accounting/ledger',reportController.ledger);
 router.get('/accounting/balance-sheet',reportController.balanceSheet);
 router.get('/accounting/trial-balance',reportController.trialBalance);
 if(accounting){
 const c=accountingController(accounting);
 router.get('/accounts',c.accounts);router.post('/accounts',c.createAccount);
 router.get('/accounts/:id/next-code',c.nextCode);
 router.get('/accounts/:id',c.account);router.patch('/accounts/:id',c.updateAccount);
 router.get('/entries',c.entries);router.post('/entries',c.createEntry);router.get('/entries/:id',c.entry);
 }
 return router;
}
