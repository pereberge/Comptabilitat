import { reportController } from '../controllers/reports.js';
import { Router, raw } from 'express';
import { accountImportController } from '../controllers/account-import.js';
import { contextController } from '../controllers/context.js';
import { accountingController } from '../controllers/accounting.js';
import { requireMaster } from '../middleware/access.js';
export function apiRouter(service, accounting) {
 const router=Router(), controller=contextController(service);
 router.get('/tax/vat',async(req,res)=>res.json(await req.vat.get(req.query)));
 router.get('/tax/vat/entries/:id/source',async(req,res)=>{const source=await req.vat.source(req.params.id);res.set('Content-Type','application/pdf').set('X-Content-Type-Options','nosniff').set('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(source.source_name)).send(source.source_pdf);});
 router.post('/tax/vat/preview',async(req,res)=>res.json(await req.vat.preview(req.query,req.body)));
 router.post('/tax/vat/settlement-preview',async(req,res)=>res.json(await req.vat.settlementPreview(req.query,req.body)));
 router.put('/tax/vat/draft',async(req,res)=>res.json(await req.vat.save(req.query,req.body)));
 router.post('/tax/vat/filing',async(req,res)=>{const file=await req.vat.filing(req.query,req.body);res.set('Content-Type','application/octet-stream').set('X-Content-Type-Options','nosniff').set('Content-Disposition','attachment; filename="'+file.filename+'"').send(file.file);});
 router.get('/farms',async(req,res)=>res.json(await req.farms.list(req.query)));
 router.post('/farms',async(req,res)=>res.status(201).json(await req.farms.saveFarm(req.body)));
 router.patch('/farms/:id',async(req,res)=>res.json(await req.farms.saveFarm(req.body,req.params.id)));
 router.patch('/farms/costs/:id',async(req,res)=>res.json(await req.farms.updateCost(req.params.id,req.body)));
 router.post('/farms/lots',async(req,res)=>res.status(201).json(await req.farms.saveLot(req.body)));
 router.patch('/farms/lots/:id',async(req,res)=>res.json(await req.farms.saveLot(req.body,req.params.id)));
 router.post('/farms/sales',async(req,res)=>res.status(201).json(await req.farms.saveSale(req.body)));
 router.patch('/farms/sales/:id',async(req,res)=>res.json(await req.farms.saveSale(req.body,req.params.id)));
 router.delete('/farms/sales/:id',async(req,res)=>res.json(await req.farms.removeSale(req.params.id,req.body)));
 for(const [path,kind]of [['deaths','death'],['feed-transfers','transfer'],['care-costs','care']]){
  router.post('/farms/'+path,async(req,res)=>res.status(201).json(await req.farms.saveProductionEvent(kind,req.body)));
  router.patch('/farms/'+path+'/:id',async(req,res)=>res.json(await req.farms.saveProductionEvent(kind,req.body,req.params.id)));
  router.delete('/farms/'+path+'/:id',async(req,res)=>res.json(await req.farms.removeProductionEvent(kind,req.params.id,req.body)));
 }
 router.get('/farms/report-preview',async(req,res)=>res.type('html').set('X-Content-Type-Options','nosniff').send(await req.farms.reportPreview(req.query)));
 router.post('/farms/preview',raw({type:'application/pdf',limit:'15mb'}),async(req,res)=>{
  let filename='facturas.pdf';try{filename=decodeURIComponent(req.get('X-File-Name')||filename);}catch{}
  res.json(await req.farms.preview(req.body,req.query.exercise_id,filename));
 });
 router.post('/farms/import',async(req,res)=>res.json(await req.farms.commit(req.body?.token)));
 router.post('/farms/discard',async(req,res)=>res.json(await req.farms.discard(req.body?.token)));
 router.get('/farms/documents/:id/source',async(req,res)=>{const source=await req.farms.source(req.params.id);res.set('Content-Type','application/pdf').set('X-Content-Type-Options','nosniff').set('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(source.source_name)).send(source.source_pdf);});
 router.get('/farms/report.pdf',async(req,res)=>res.set('Content-Type','application/pdf').set('Content-Disposition','attachment; filename="costes-granjas.pdf"').send(await req.farms.report(req.query)));
 router.get('/master/company-evolution',async(req,res)=>{requireMaster(req.user);res.json(await req.companyEvolution.get(req.query));});
 router.get('/companies',controller.companies);router.get('/health',controller.health);router.get('/context',controller.context);
 router.post('/companies',controller.createCompany);
 router.patch('/companies/:id',controller.updateCompany);
 router.get('/companies/:id',controller.company);
 router.get('/companies/:id/logo',controller.companyLogo);
 router.get('/exercises',async(req,res)=>res.json(await req.exercises.list()));
 router.get('/verifactu',async(req,res)=>res.json(await req.verifactu.get()));
 router.put('/verifactu/settings',async(req,res)=>res.json(await req.verifactu.configure(req.body)));
 router.get('/verifactu/records',async(req,res)=>res.json(await req.verifactu.list()));
 router.get('/verifactu/records/:id/xml',async(req,res)=>res.set('Content-Type','application/xml; charset=utf-8').set('X-Content-Type-Options','nosniff').set('Content-Disposition','attachment; filename="verifactu-pruebas-'+req.companyId+'-'+Number(req.params.id)+'.xml"').send(await req.verifactu.xml(req.params.id)));
 router.post('/verifactu/records/:id/send',async(req,res)=>res.json(await req.verifactu.send(req.params.id,req.body)));
 router.get('/verifactu/archive',async(req,res)=>res.set('Content-Disposition','attachment; filename="archivo-verifactu-pruebas-'+req.companyId+'.json"').json(await req.verifactu.archive()));
 router.get('/data-backups/automatic/settings',async(req,res)=>res.json(await req.automaticBackups.settings()));
 router.put('/data-backups/automatic/settings',async(req,res)=>res.json(await req.automaticBackups.saveSettings(req.body)));
 router.get('/data-backups/automatic/copies',async(req,res)=>res.json(await req.automaticBackups.list(req.query)));
 router.post('/data-backups/automatic/run',async(req,res)=>res.status(201).json(await req.automaticBackups.run(req.body)));
 router.get('/data-backups/automatic/copies/:id/download',async(req,res)=>{const copy=await req.automaticBackups.download(req.params.id);res.set('Content-Type','application/gzip').set('X-Content-Type-Options','nosniff').set('Content-Disposition','attachment; filename="'+copy.name+'"').send(copy.file);});
 router.post('/data-backups/automatic/delete-preview',async(req,res)=>res.json(await req.automaticBackups.previewDelete(req.body)));
 router.post('/data-backups/automatic/delete',async(req,res)=>res.json(await req.automaticBackups.delete(req.body)));
 router.get('/data-backups/export',async(req,res)=>{
  const backup=await req.dataBackup.export(req.query.exercise_id||'all');
  const years=backup.data.tables.accounting_exercises.map(row=>row.start_date.slice(0,4)).sort();
  const suffix=backup.data.scope.kind==='company'?'todos':years.length<=4?years.join('-'):years.length+'-ejercicios';
  res.set('Content-Type','application/gzip').set('X-Content-Type-Options','nosniff').set('Content-Disposition','attachment; filename="copia-empresa-'+req.companyId+'-'+suffix+'-'+backup.data.created_at.slice(0,10)+'.json.gz"').send(backup.file);
 });
 router.post('/data-backups/preview',async(req,res)=>res.json(await req.dataBackup.preview(req.body,req.query.exercise_id||'all',req.query.replace_existing==='1')));
 router.post('/data-backups/restore',async(req,res)=>res.json(await req.dataBackup.restore(req.body,{canReplace:req.user?.permissions.exercise_clear===true})));
 router.post('/data-backups/discard',async(req,res)=>res.json(await req.dataBackup.discard(req.body?.token)));
 router.post('/exercises',async(req,res)=>res.status(201).json(await req.exercises.create(req.body)));
 router.get('/exercises/:id/clear/preview',async(req,res)=>res.json(await req.exerciseClear.preview(req.params.id)));
 router.post('/exercises/:id/clear',async(req,res)=>res.json(await req.exerciseClear.clear(req.params.id,req.body)));
 router.get('/exercise-clears/:id/backup',async(req,res)=>{
  const backup=await req.exerciseClear.backup(req.params.id);
  res.set('Content-Type','application/json; charset=utf-8').set('X-Content-Type-Options','nosniff')
   .set('Content-Disposition','attachment; filename="contabilidad-periodo-'+backup.record.exercise_id+'-copia-'+backup.record.id+'.json"');
  res.write(JSON.stringify({format:'contabilitat-exercise-clear',version:1,record:backup.record}).slice(0,-1)+',"rows":[');
  let first=true;
  for await(const row of backup.rows()){
   if(res.destroyed)return;
   if(!res.write((first?'':',')+JSON.stringify(row)))await new Promise(resolve=>{
    const finish=()=>{res.off('drain',finish);res.off('close',finish);resolve();};res.once('drain',finish);res.once('close',finish);
   });
   first=false;
  }
  if(!res.destroyed)res.end(']}');
 });
 router.get('/exercises/:id/carry-forward',async(req,res)=>res.json(await req.exerciseOperations.carry(req.params.id)));
 router.get('/exercises/:id/operations',async(req,res)=>res.json(await req.exercises.history(req.params.id)));
 router.get('/exercises/:id/operations/:kind/preview',async(req,res)=>res.json(await req.exerciseOperations.preview(req.params.id,req.params.kind,req.query)));
 router.post('/exercises/:id/operations/:kind',async(req,res)=>res.json(await req.exerciseOperations.execute(req.params.id,req.params.kind,req.body)));
 router.get('/invoices/parties',async(req,res)=>res.json(await req.invoices.parties()));
 router.get('/invoices/next-reference',async(req,res)=>res.json(await req.invoices.nextReference(req.query.exercise_id)));
 router.get('/invoice-deletions',async(req,res)=>res.json(await req.invoiceDeletion.history()));
 router.get('/invoice-deletions/:id/backup',async(req,res)=>res.set('Content-Disposition','attachment; filename="copia-factura-'+req.params.id+'.json"').set('X-Content-Type-Options','nosniff').json(await req.invoiceDeletion.backup(req.params.id)));
 router.get('/invoices/:id/delete-preview',async(req,res)=>res.json(await req.invoiceDeletion.preview(req.params.id)));
 router.post('/invoices/:id/delete',async(req,res)=>res.json(await req.invoiceDeletion.remove(req.params.id,req.body)));
 router.get('/documentation',async(req,res)=>res.json(await req.documentation.list(req.query)));
 router.post('/documentation/preview',async(req,res)=>res.json(await req.documentation.previewEncoded(req.body)));
 router.post('/documentation/:id/company-check',async(req,res)=>res.json(await req.documentation.checkCompany(req.params.id,req.body)));
 router.post('/documentation',async(req,res)=>res.status(201).json(await req.documentation.uploadEncoded(req.body)));
 router.get('/documentation/:id',async(req,res)=>res.json(await req.documentation.get(req.params.id)));
 router.patch('/documentation/:id',async(req,res)=>res.json(await req.documentation.update(req.params.id,req.body)));
 router.post('/documentation/:id/manage',async(req,res)=>res.json(await req.documentation.manage(req.params.id,req.body)));
 router.post('/documentation/:id/to-invoices',async(req,res)=>res.json(await req.documentation.toInvoices(req.params.id,req.body)));
 router.delete('/documentation/:id',async(req,res)=>res.json(await req.documentation.remove(req.params.id,req.body)));
 router.get('/documentation/:id/source',async(req,res)=>{
  const source=await req.documentation.source(req.params.id);
  res.set('Content-Type','application/octet-stream').set('X-Content-Type-Options','nosniff').set('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(source.source_name)).send(source.content);
 });
 router.post('/invoice-documents/preview',raw({type:'application/pdf',limit:'5mb'}),async(req,res)=>{
  let filename='factura.pdf';try{filename=decodeURIComponent(req.get('X-File-Name')||filename);}catch{}
  res.json(await req.invoiceDocuments.preview(req.body,req.query.exercise_id,filename));
 });
 router.post('/invoice-documents/archive',async(req,res)=>res.json(await req.invoiceDocuments.archive(req.body)));
 router.post('/invoice-documents/discard',async(req,res)=>res.json(await req.invoiceDocuments.discard(req.body)));
 router.get('/invoice-documents',async(req,res)=>res.json(await req.invoiceDocuments.list(req.query)));
 router.get('/invoice-documents/:id',async(req,res)=>res.json(await req.invoiceDocuments.get(req.params.id)));
 router.patch('/invoice-documents/:id',async(req,res)=>res.json(await req.invoiceDocuments.update(req.params.id,req.body)));
 router.delete('/invoice-documents/:id',async(req,res)=>res.json(await req.invoiceDocuments.remove(req.params.id,req.body)));
 router.post('/invoice-documents/:id/post',async(req,res)=>res.json(await req.invoiceDocuments.post(req.params.id,req.body)));
 router.get('/invoice-documents/:id/source',async(req,res)=>{
  const source=await req.invoiceDocuments.source(req.params.id);
  res.set('Content-Type','application/pdf').set('X-Content-Type-Options','nosniff').set('Content-Disposition',"inline; filename*=UTF-8''"+encodeURIComponent(source.source_name)).send(source.source_pdf);
 });
 router.get('/invoices',async(req,res)=>res.json(await req.invoices.list(req.query)));
 router.post('/invoices',async(req,res)=>res.status(201).json(await req.invoices.create(req.body)));
 router.get('/invoices/:id/print',async(req,res)=>res.set('Content-Type','text/html; charset=utf-8').set('X-Content-Type-Options','nosniff').send(await req.invoiceDelivery.print(req.params.id)));
 router.get('/invoices/:id/pdf',async(req,res)=>{const file=await req.invoiceDelivery.pdf(req.params.id,req.query);res.set('Content-Type','application/pdf').set('X-Content-Type-Options','nosniff').set('Content-Disposition','attachment; filename="'+file.filename+'"').send(file.file);});
 router.post('/invoices/:id/email-draft',async(req,res)=>{const file=await req.invoiceDelivery.draft(req.params.id,req.body);res.set('Content-Type','message/rfc822').set('X-Content-Type-Options','nosniff').set('Content-Disposition','attachment; filename="'+file.filename+'"').send(file.file);});
 router.get('/invoices/:id',async(req,res)=>res.json(await req.invoices.get(req.params.id)));
 router.post('/invoices/:id/void',async(req,res)=>res.json(await req.invoices.void(req.params.id,req.body)));
 router.get('/portfolio',async(req,res)=>res.json(await req.portfolio.list(req.query)));
 router.get('/bank-remittances',async(req,res)=>res.json(await req.bankRemittances.list(req.query)));
 router.get('/bank-remittances/options',async(req,res)=>res.json(await req.bankRemittances.options(req.query)));
 router.post('/bank-remittances/preview',async(req,res)=>res.json(await req.bankRemittances.preview(req.body)));
 router.post('/bank-remittances',async(req,res)=>res.json(await req.bankRemittances.create(req.body)));
 router.get('/bank-remittances/:id/file',async(req,res)=>{const file=await req.bankRemittances.file(req.params.id);res.set('Content-Type','application/xml; charset=utf-8').set('X-Content-Type-Options','nosniff').set('Content-Disposition','attachment; filename="'+file.filename+'"').send(file.file);});
 router.post('/bank-remittances/:id/cancel',async(req,res)=>res.json(await req.bankRemittances.cancel(req.params.id)));
 router.get('/portfolio/receipts/:id',async(req,res)=>res.json(await req.portfolio.get(req.params.id)));
 router.patch('/portfolio/receipts/:id',async(req,res)=>res.json(await req.portfolio.update(req.params.id,req.body)));
 router.post('/portfolio/receipts/:id/split',async(req,res)=>res.json(await req.portfolio.split(req.params.id,req.body)));
 router.post('/portfolio/receipts/:id/settle',async(req,res)=>res.json(await req.portfolio.settle(req.params.id,req.body)));
 router.post('/portfolio/settlements/:id/reverse',async(req,res)=>res.json(await req.portfolio.reverse(req.params.id,req.body)));
 router.post('/journal-import/preview',raw({type:'application/pdf',limit:'5mb'}),async(req,res)=>{
   let filename='diario.pdf';try{filename=decodeURIComponent(req.get('X-File-Name')||filename);}catch{}
   res.json(await req.journalImport.preview(req.body,req.query.exercise_id,filename));
 });
 router.post('/journal-import/commit',async(req,res)=>res.json(await req.journalImport.commit(req.body?.token)));
 router.post('/account-import/preview',raw({type:'application/pdf',limit:'5mb'}),accountImportController.preview);
 router.post('/account-import/commit',accountImportController.commit);
 router.get('/accounting/ledger',reportController.ledger);
 router.get('/accounting/review',async(req,res)=>res.json(await req.accountingReview.review(req.query)));
 router.get('/bank-reconciliations',async(req,res)=>res.json(await req.bankReconciliations.list(req.query)));
 router.post('/bank-import/preview',raw({type:['application/pdf','text/csv','application/csv','text/plain'],limit:'5mb'}),async(req,res)=>{
   let filename='extracto.pdf';try{filename=decodeURIComponent(req.get('X-File-Name')||filename);}catch{}
   res.json(await req.bankImport.preview(req.body,req.query.exercise_id,filename,req.get('Content-Type')?.split(';')[0]));
 });
 router.post('/bank-import/analyze',async(req,res)=>res.json(await req.bankImport.analyze(req.body)));
 router.post('/bank-import/commit',async(req,res)=>res.json(await req.bankImport.commit(req.body)));
 router.post('/bank-import/discard',async(req,res)=>res.json(await req.bankImport.discard(req.body)));
 router.get('/bank-reconciliations/:id',async(req,res)=>res.json(await req.bankReconciliations.get(req.params.id)));
 router.post('/bank-reconciliations/:id/reanalyze',async(req,res)=>res.json(await req.bankReconciliations.reanalyze(req.params.id)));
 router.post('/bank-reconciliations/:id/proposals',async(req,res)=>res.json(await req.bankReconciliations.saveProposal(req.params.id,req.body)));
 router.post('/bank-reconciliations/:id/entries',async(req,res)=>res.json(await req.bankReconciliations.postMovement(req.params.id,req.body)));
 router.delete('/bank-reconciliations/:id/rules/:ruleId',async(req,res)=>res.json(await req.bankReconciliations.removeRule(req.params.id,req.params.ruleId,req.body)));
 router.get('/bank-reconciliations/:id/source',async(req,res)=>{
   const source=await req.bankReconciliations.source(req.params.id);
   res.set('Content-Type',source.source_mime).set('X-Content-Type-Options','nosniff')
     .set('Content-Disposition',(source.source_mime==='application/pdf'?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(source.source_name)).send(source.source_pdf);
 });
 router.get('/accounting/profit-loss',reportController.profitLoss);
 router.get('/accounting/balance-sheet',reportController.balanceSheet);
 router.get('/accounting/trial-balance',reportController.trialBalance);
 if(accounting){
 const c=accountingController(accounting);
 router.get('/accounts',c.accounts);router.post('/accounts',c.createAccount);
 router.get('/accounts/:id/next-code',c.nextCode);
 router.get('/accounts/:id',c.account);router.patch('/accounts/:id',c.updateAccount);
 router.get('/entries',c.entries);router.post('/entries',c.createEntry);router.get('/entries/:id',c.entry);router.patch('/entries/:id',c.updateEntry);
 }
 return router;
}
