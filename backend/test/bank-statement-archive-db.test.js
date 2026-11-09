import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createBankImportService} from '../src/services/bank-import.js';
import {createBankReconciliationService} from '../src/services/bank-reconciliations.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup} from '../src/services/backup-format.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {journalPagesPdf} from '../test-support/journal-fixture.js';
const period={name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'};
const error=code=>cause=>cause.code===code;
const pdfStatement=()=>{
 const item=(text,x,y,width=20)=>({text,x,y,width});
 return journalPagesPdf([{page:1,items:[item('CaixaBank',20,780),item('Fecha extracto: 31/10/2026',20,750),
  item('Fecha',20,700),item('Concepto',80,700),item('Importe',465,700,32),item('Saldo',548,700,28),
  item('20/10/2026',20,675),item('Saldo recibido',80,675),item('900,00',465,675,32),item('900,00',548,675,28)]}]);
};
test('MySQL bank statement archive: bank/date filenames, full originals, history, safe deletion and restore',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[];let server;
 const name='Bank archive '+randomUUID();
 const create=async(companyName=name)=>{const company=await context.createCompany({name:companyName,exercise:period});ids.push(company.id);return {...company,year:(await context.getContext(company.id)).exercises[0].id};};
 try{
  const company=await create(),foreign=await create('Foreign '+name),accounting=createAccountingService(pool,company.id),imports=createBankImportService(pool,company.id),service=createBankReconciliationService(pool,company.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'CaixaBank'}),otherBank=await accounting.createAccount({code:'5720.0002',description:'Santander'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'}),expense=await accounting.createAccount({code:'6290.0001',description:'Cleaning'});
  await accounting.createEntry({exercise_id:company.year,entry_date:'2026-10-01',description:'Opening',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'1000.00',credit:'0.00'},{account_id:capital.id,description:'Capital',debit:'0.00',credit:'1000.00'}]});
  const csv=Buffer.from('CaixaBank\nFecha de emisión;31/10/2026\nFecha;Concepto;Importe;Saldo\n01/10/2026;Ingreso;1000,00;1000,00\n15/10/2026;SERVEI NETEJA;-100,00;900,00');
  const second=Buffer.from('Santander\nFecha de emisión;02/11/2026\nFecha;Concepto;Importe;Saldo\n01/11/2026;Ingreso;500,00;500,00');
  const pdf=pdfStatement();
  const upload=async(buffer,accountId,filename='original.csv')=>{const preview=await imports.preview(buffer,company.year,filename,filename.endsWith('.pdf')?'application/pdf':'text/csv');await imports.analyze({token:preview.token,account_id:accountId,replace_current:true});const saved=await imports.commit({token:preview.token});await imports.discard({token:preview.token});return saved.id;};
  const firstId=await upload(csv,bank.id,'download-123.csv');let secondId,pdfId;
  await t.test('bank and statement date appear in archive and original downloads',async()=>{
   const listed=await service.list({exercise_id:company.year});assert.equal(listed.length,1);assert.equal(listed[0].archive_name,'Extracte-CaixaBank-2026-10-31.csv');assert.equal(listed[0].statement_date,'2026-10-31');assert.equal(listed[0].period_to,'2026-10-15');assert.equal(listed[0].source_size,csv.length);assert.ok(!Object.hasOwn(listed[0],'source_pdf'));
   const source=await service.source(firstId);assert.deepEqual(source.source_pdf,csv);assert.equal(source.source_name,listed[0].archive_name);assert.equal(source.original_source_name,'download-123.csv');
  });
  await t.test('new banks and PDFs keep older originals and posted movements in the archive',async()=>{
   const report=await service.get(firstId);await service.postMovement(firstId,{version:report.version,movement_id:2,date:'2026-10-15',concept:'SERVEI NETEJA',remember:true,rule_concept:'SERVEI NETEJA',counter_lines:[{account_id:expense.id,debit:'100.00',credit:'0.00'}],request_id:randomUUID()});
   secondId=await upload(second,otherBank.id,'new.csv');pdfId=await upload(pdf,bank.id,'scan-name.pdf');
   const listed=await service.list({exercise_id:company.year});assert.equal(listed.length,3);assert.equal(listed.filter(row=>row.workflow==='direct').length,1);assert.equal(listed.find(row=>row.workflow==='direct').id,pdfId);
   assert.equal(listed.find(row=>row.id===secondId).archive_name,'Extracte-Santander-2026-11-02.csv');
   assert.equal(listed.find(row=>row.id===pdfId).archive_name,'Extracte-CaixaBank-2026-10-31.pdf');
   assert.equal((await service.get(firstId)).snapshot.workflow,'archived');assert.equal((await service.get(firstId)).snapshot.posted_movements.length,1);
   assert.deepEqual((await service.source(firstId)).source_pdf,csv);assert.deepEqual((await service.source(pdfId)).source_pdf,pdf);
  });
  await t.test('reloading a saved original reuses its record and activates only its worklist',async()=>{
   assert.equal(await upload(csv,bank.id),firstId);const listed=await service.list({exercise_id:company.year});
   assert.equal(listed.length,3);assert.equal(listed.filter(row=>row.workflow==='direct').length,1);assert.equal(listed.find(row=>row.workflow==='direct').id,firstId);
   assert.equal((await service.get(firstId)).snapshot.posted_movements.length,1);
  });
  await t.test('backups and restore preserve both archived and current bank originals',async()=>{
   const copy=await createDataBackupService(pool,company.id).export('all');assert.equal(readBackup(copy.file).tables.bank_reconciliations.length,3);
   const destination=await create(),restore=createDataBackupService(pool,destination.id),preview=await restore.preview(copy.file);assert.equal(preview.ready,true);await restore.restore({token:preview.token,confirm:true,request_id:randomUUID()});
   const restored=createBankReconciliationService(pool,destination.id),listed=await restored.list({exercise_id:destination.year});assert.equal(listed.length,3);assert.equal(listed.filter(row=>row.workflow==='direct').length,1);
   const restoredPdf=listed.find(row=>row.source_mime==='application/pdf');assert.deepEqual((await restored.source(restoredPdf.id)).source_pdf,pdf);assert.equal(restoredPdf.archive_name,'Extracte-CaixaBank-2026-10-31.pdf');
  });
  await t.test('deletion checks company, permission and version while preserving all journal entries and rules',async()=>{
   let writable=false;server=createApp(context,accounting,companyScope(pool,company.id),accessControl({current:async()=>({permissions:{accounting_write:writable}})})).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port+'/api/bank-reconciliations';
   const request=(path,options={},companyId=company.id)=>fetch(base+path,{...options,headers:{'Content-Type':'application/json','X-Company-Id':String(companyId)}});
   const before=await accounting.listEntries({exercise_id:company.year,view:'lines'}),[[rules]]=await pool.execute('SELECT COUNT(*) AS n FROM bank_reconciliation_rules WHERE company_id=?',[company.id]);
   let row=(await service.list({exercise_id:company.year})).find(row=>row.id===pdfId);
   const denied=await request('/'+pdfId,{method:'DELETE',body:JSON.stringify({version:row.version})});assert.equal(denied.status,403);await denied.arrayBuffer();
   const source=await request('/'+pdfId+'/source');assert.equal(source.status,200);assert.match(source.headers.get('content-disposition'),/Extracte-CaixaBank-2026-10-31\.pdf/);assert.deepEqual(Buffer.from(await source.arrayBuffer()),pdf);
   writable=true;const missing=await request('/'+pdfId,{method:'DELETE',body:JSON.stringify({version:row.version})},foreign.id);assert.equal(missing.status,404);await missing.arrayBuffer();
   await service.reanalyze(pdfId);await assert.rejects(service.remove(pdfId,{version:row.version}),error('RECONCILIATION_CHANGED'));
   row=(await service.list({exercise_id:company.year})).find(row=>row.id===pdfId);
   const removed=await request('/'+pdfId,{method:'DELETE',body:JSON.stringify({version:row.version})});assert.equal(removed.status,200);assert.equal((await removed.json()).deleted,true);
   await assert.rejects(service.source(pdfId),error('RECONCILIATION_NOT_FOUND'));assert.equal((await service.list({exercise_id:company.year})).length,2);
   assert.deepEqual(await accounting.listEntries({exercise_id:company.year,view:'lines'}),before);assert.equal((await service.get(firstId)).snapshot.workflow,'direct');
   const [[afterRules]]=await pool.execute('SELECT COUNT(*) AS n FROM bank_reconciliation_rules WHERE company_id=?',[company.id]);assert.equal(afterRules.n,rules.n);
  });
  await t.test('the current source can be deleted and later uploaded again without deleting its journal',async()=>{
   const before=await accounting.listEntries({exercise_id:company.year,view:'lines'}),current=(await service.list({exercise_id:company.year})).find(row=>row.id===firstId);
   await service.remove(firstId,{version:current.version});assert.equal((await service.list({exercise_id:company.year})).filter(row=>row.workflow==='direct').length,0);
   const fresh=await upload(csv,bank.id);assert.notEqual(fresh,firstId);assert.deepEqual((await service.source(fresh)).source_pdf,csv);
   assert.deepEqual(await accounting.listEntries({exercise_id:company.year,view:'lines'}),before);
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){for(const table of ['data_restores','bank_reconciliation_rules','bank_reconciliations','bank_connections','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
