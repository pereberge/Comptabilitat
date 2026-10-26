import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createVerifactuService} from '../src/services/verifactu.js';
import {createInvoiceDeletionService} from '../src/services/invoice-deletion.js';
import {createExerciseClearService} from '../src/services/exercise-clear.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {fiscalSettings,fiscalResponse} from '../test-support/verifactu-fixture.js';
import {readBackup,sealBackup,packBackup} from '../src/services/backup-format.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
const period={name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'},error=code=>cause=>cause.code===code;
const configuration={enabled:true,environment:'test',...Object.fromEntries(['producer_name','producer_nif','software_name','software_id','version','installation_id'].map(field=>[field,fiscalSettings[field]]))};
async function cleanup(pool,ids){for(const companyId of ids){
 for(const table of ['verifactu_attempts','verifactu_deliveries','verifactu_records','verifactu_settings','data_restores','invoice_deletion_rows','invoice_deletions','exercise_clear_rows','exercise_clears','invoice_documents','bank_reconciliations','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','exercise_operations','journal_imports','bank_connections','suppliers','company_documents','company_logos','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
 const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
}}
test('MySQL VERI*FACTU preparation: atomic chained records, protected history, test transport and complete backups',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[],name='Fiscal test '+randomUUID();let server;
 const create=async()=>{const company=await context.createCompany({name,tax_id:'B12345674',exercise:period});ids.push(company.id);return company;};
 const count=async(table,companyId)=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[companyId]))[0][0].n;
 try{
  const source=await create(),target=await create(),foreign=await create(),year=(await context.getContext(source.id)).exercises[0],invoices=createInvoiceService(pool,source.id),fiscal=createVerifactuService(pool,source.id),accounting=createAccountingService(pool,source.id);
  const revenue=await accounting.createAccount({code:'7000.0001',description:'Ventas'}),vat=await accounting.createAccount({code:'4770.0021',description:'IVA repercutido'}),retained=await accounting.createAccount({code:'4730.0001',description:'Retenciones'});
  const body=reference=>({exercise_id:year.id,direction:'issued',reference,invoice_date:'2026-10-21',party:{name:'Cliente de pruebas',tax_id:'89890001K'},offset_account_id:revenue.id,vat_account_id:vat.id,withholding_account_id:retained.id,withholding_rate:'15',request_id:randomUUID(),lines:[{description:'Servicio de pruebas',base:'100.00',tax_rate:'21'}],receipts:[{due_date:'2026-10-21',amount:'106.00'}]});
  let first,second,third,records,full;
  await t.test('existing billing stays inactive until this company explicitly enables preparation',async()=>{
   const state=await fiscal.get();assert.equal(state.settings.enabled,false);assert.equal(state.production_available,false);assert.equal(state.certificate.configured,false);assert.equal(state.can_prepare,true);assert.equal(state.settings.producer_source,'company');
   const old=await invoices.create(body('OFF-1'));assert.equal(old.verifactu,null);assert.equal(await count('verifactu_records',source.id),0);
   await assert.rejects(fiscal.configure({...configuration,environment:'production'}),error('VERIFACTU_SETTINGS'));
   const enabled=await fiscal.configure(configuration);assert.equal(enabled.settings.enabled,true);assert.equal(enabled.can_prepare,true);assert.equal((await createVerifactuService(pool,foreign.id).get()).settings.enabled,false);
   assert.equal((await invoices.get(old.id)).verifactu,null);
   assert.equal((await createDataBackupService(pool,source.id).export(year.id)).data.fiscal_archive,undefined);
  });
  await t.test('issued invoices register atomically, concurrent requests form one chain and retries keep one record',async()=>{
   const request=body('VF-1');first=await invoices.create(request);assert.equal(first.verifactu.records.length,1);assert.equal(first.verifactu.invoice_total,'121.00');assert.ok(first.verifactu.qr_image.startsWith('data:image/png;base64,'));assert.match(first.verifactu.qr_url,/prewww2\.aeat\.es/);
   assert.equal((await invoices.create(request)).replayed,true);
   [second,third]=await Promise.all([invoices.create(body('VF-2')),invoices.create(body('VF-3'))]);
   [records]=await pool.execute('SELECT * FROM verifactu_records WHERE company_id=? ORDER BY sequence_no',[source.id]);assert.deepEqual(records.map(row=>row.sequence_no),[1,2,3]);assert.equal(records[0].previous_hash,'');assert.equal(records[1].previous_hash,records[0].hash);assert.equal(records[2].previous_hash,records[1].hash);assert.equal(records[0].payload.ImporteTotal,'121.00');assert.equal(await count('verifactu_deliveries',source.id),3);
   const registered=await invoices.list({exercise_id:year.id});assert.equal(registered.filter(row=>row.fiscal_registered).length,3);
  });
  await t.test('invalid fiscal data and a failed outbox write roll back invoices, accounts, journals, receipts and records',async()=>{
   const before=Object.fromEntries(await Promise.all(['trade_invoices','accounts','journal_entries','journal_lines','portfolio_receipts','verifactu_records','verifactu_deliveries'].map(async table=>[table,await count(table,source.id)])));
   await assert.rejects(invoices.create({...body('INVALID-NIF'),party:{name:'Invalid',tax_id:'B11111111'}}),error('VERIFACTU_RECIPIENT'));
   await assert.rejects(invoices.create({...body('ZERO-VAT'),lines:[{description:'Unsupported',base:'100',tax_rate:'0'}],receipts:[{due_date:'2026-10-21',amount:'85'}]}),error('VERIFACTU_UNSUPPORTED_TAX'));
   const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('INSERT INTO verifactu_deliveries'))throw new Error('Injected fiscal failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   await assert.rejects(createInvoiceService(failing,source.id).create(body('FAIL-OUTBOX')),/Injected fiscal failure/);
   for(const [table,n]of Object.entries(before))assert.equal(await count(table,source.id),n,table);
   const oldPdf=await invoices.create(body('PDF-ACCOUNTING'),{accounting_only:true});assert.equal(oldPdf.verifactu,null);
   const received=await invoices.create({...body('RECEIVED'),direction:'received',offset_account_id:null,vat_account_id:null,withholding_account_id:null,withholding_rate:'0',receipts:[{due_date:'2026-10-21',amount:'121'}]});assert.equal(received.verifactu,null);assert.equal(await count('verifactu_records',source.id),3);
  });
  await t.test('the certificate is required, delivery order and wait are enforced, and network retries reuse unchanged XML',async()=>{
   await assert.rejects(fiscal.send(records[0].id,{confirm_test:true}),error('VERIFACTU_CERTIFICATE_REQUIRED'));
   const sent=[];let scenario='network';
   const transport=async xml=>{sent.push(xml);const row=records.find(row=>row.xml===xml);assert.ok(row);if(scenario==='network')throw new Error('Network failure');if(scenario==='wrong')return fiscalResponse(row.payload,{key:{reference:'OTHER'}});return fiscalResponse(row.payload,{status:scenario==='warning'?'AceptadoConErrores':scenario==='reject'?'Incorrecto':'Correcto',wait:scenario==='accepted'?15:0});};
   const testing=createVerifactuService(pool,source.id,{transport,credentials:()=>({})});
   await assert.rejects(testing.send(records[1].id,{confirm_test:true}),error('VERIFACTU_SEND_ORDER'));
   assert.equal((await testing.send(records[0].id,{confirm_test:true})).status,'error');await pool.execute('UPDATE verifactu_deliveries SET next_attempt_at=NULL WHERE company_id=?',[source.id]);
   scenario='wrong';assert.equal((await testing.send(records[0].id,{confirm_test:true})).status,'error');await pool.execute('UPDATE verifactu_deliveries SET next_attempt_at=NULL WHERE company_id=?',[source.id]);
   scenario='accepted';assert.equal((await testing.send(records[0].id,{confirm_test:true})).status,'accepted');assert.equal(new Set(sent).size,1);assert.equal(sent.length,3);assert.equal((await testing.send(records[0].id,{confirm_test:true})).replayed,true);assert.equal(sent.length,3);
   await assert.rejects(testing.send(records[1].id,{confirm_test:true}),error('VERIFACTU_WAIT'));await pool.execute('UPDATE verifactu_deliveries SET next_attempt_at=NULL WHERE company_id=?',[source.id]);
   scenario='warning';assert.equal((await testing.send(records[1].id,{confirm_test:true})).status,'accepted_with_errors');scenario='reject';assert.equal((await testing.send(records[2].id,{confirm_test:true})).status,'rejected');await assert.rejects(testing.send(records[2].id,{confirm_test:true}),error('VERIFACTU_NEEDS_CORRECTION'));
   assert.equal(await count('verifactu_attempts',source.id),5);assert.equal(await count('verifactu_records',source.id),3);
  });
  await t.test('cancellation appends a record, while deletion, clearing, replacement and identity changes are blocked',async()=>{
   const cancelled=await invoices.void(first.id,{exercise_id:year.id,date:'2026-10-21',reason:'Emitida por error',request_id:randomUUID()});assert.equal(cancelled.status,'void');assert.equal(cancelled.verifactu.records.length,2);
   const [chain]=await pool.execute('SELECT * FROM verifactu_records WHERE company_id=? ORDER BY sequence_no',[source.id]);assert.equal(chain.length,4);assert.equal(chain[3].kind,'anulacion');assert.equal(chain[3].previous_hash,chain[2].hash);
   const deletion=createInvoiceDeletionService(pool,source.id),preview=await deletion.preview(second.id);assert.equal(preview.ready,false);assert.ok(preview.blockers.some(row=>row.code==='verifactu'));await assert.rejects(deletion.remove(second.id,{confirmation:'96',preview_hash:preview.preview_hash,request_id:randomUUID()}),error('INVOICE_DELETE_DEPENDENCIES'));
   const clear=createExerciseClearService(pool,source.id),summary=await clear.preview(year.id);assert.ok(summary.blockers.some(row=>row.code==='verifactu'));await assert.rejects(clear.clear(year.id,{confirmation:'96',preview_hash:summary.preview_hash,request_id:randomUUID()}),error('EXERCISE_CLEAR_DEPENDENCIES'));
   await assert.rejects(fiscal.configure({...configuration,enabled:false}),error('VERIFACTU_SETTINGS_LOCKED'));await assert.rejects(fiscal.configure({...configuration,producer_name:'Changed'}),error('VERIFACTU_SETTINGS_LOCKED'));await assert.rejects(context.updateCompany(source.id,{name,tax_id:'89890001K'}),error('VERIFACTU_ISSUER_CHANGED'));
   full=await createDataBackupService(pool,source.id).export();const replacement=await createDataBackupService(pool,source.id).preview(full.file,'all',true);assert.equal(replacement.ready,false);assert.ok(replacement.blockers.some(row=>row.code==='verifactu'));await createDataBackupService(pool,source.id).discard(replacement.token);
  });
  await t.test('a failure restoring fiscal records rolls back every imported invoice and the chain',async()=>{
   const restore=createDataBackupService(pool,target.id),preview=await restore.preview(full.file);assert.equal(preview.ready,true);
   const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('INSERT INTO verifactu_records'))throw new Error('Injected fiscal restore failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   await assert.rejects(createDataBackupService(failing,target.id).restore({token:preview.token,request_id:randomUUID(),confirm:true}),/Injected fiscal restore failure/);
   for(const table of ['trade_invoices','journal_entries','accounts','verifactu_settings','verifactu_records','verifactu_deliveries','data_restores'])assert.equal(await count(table,target.id),0,table);await restore.discard(preview.token);
  });
  await t.test('complete backups preserve XML, chain, QR, delivery receipts and history with remapped invoice IDs',async()=>{
   const data=readBackup(full.file);assert.equal(data.fiscal_archive.verifactu_records.length,4);assert.equal(data.fiscal_archive.verifactu_attempts.length,5);
   const restore=createDataBackupService(pool,target.id),preview=await restore.preview(full.file);assert.equal(preview.ready,true);const body={token:preview.token,request_id:randomUUID(),confirm:true},result=await restore.restore(body);assert.equal(result.fiscal_restored,true);
   const recovered=await createVerifactuService(pool,target.id).get();assert.equal(recovered.counts.total,4);assert.equal(recovered.settings.enabled,false);assert.equal(recovered.settings.installation_id,fiscalSettings.installation_id);
   const [chain]=await pool.execute('SELECT * FROM verifactu_records WHERE company_id=? ORDER BY sequence_no',[target.id]);for(let i=0;i<chain.length;i++){const original=data.fiscal_archive.verifactu_records[i];assert.equal(chain[i].hash,original.hash);assert.equal(chain[i].xml,original.xml);assert.deepEqual(chain[i].payload,original.payload);assert.notEqual(chain[i].invoice_id,original.invoice_id);}
   assert.equal(await count('verifactu_attempts',target.id),5);assert.equal((await restore.restore(body)).replayed,true);assert.equal(await count('verifactu_records',target.id),4);
   const annual=await createDataBackupService(pool,source.id).export(year.id),blocked=await createDataBackupService(pool,foreign.id).preview(annual.file);assert.equal(blocked.ready,false);assert.ok(blocked.blockers.some(row=>row.code==='verifactu_full'));await createDataBackupService(pool,foreign.id).discard(blocked.token);
   const tampered=structuredClone(data);delete tampered.checksum;tampered.fiscal_archive.verifactu_records[0].hash='A'.repeat(64);await assert.rejects(createDataBackupService(pool,foreign.id).preview(packBackup(sealBackup(tampered))),error('BACKUP_INVALID_FILE'));
   const [[invoice]]=await pool.execute("SELECT id FROM trade_invoices WHERE company_id=? AND reference='VF-2'",[target.id]);await assert.rejects(createInvoiceService(pool,target.id).void(invoice.id,{exercise_id:result.exercise_ids[0],date:'2026-10-21',reason:'Requires active chain',request_id:randomUUID()}),error('VERIFACTU_DISABLED'));
  });
  await t.test('HTTP scope protects another company and rejects production settings and unconfirmed sends',async()=>{
   server=createApp(context,accounting,companyScope(pool,source.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api',headers=companyId=>({'X-Company-Id':String(companyId),'Content-Type':'application/json'});
   const state=await(await fetch(base+'/verifactu',{headers:headers(source.id)})).json();assert.equal(state.settings.environment,'test');assert.equal(state.production_available,false);
   assert.equal((await fetch(base+'/verifactu/records/'+records[0].id+'/xml',{headers:headers(foreign.id)})).status,404);
   assert.equal((await fetch(base+'/verifactu/records/'+records[0].id+'/send',{method:'POST',headers:headers(foreign.id),body:JSON.stringify({confirm_test:true})})).status,404);
   assert.equal((await fetch(base+'/verifactu/records/'+records[0].id+'/send',{method:'POST',headers:headers(source.id),body:'{}'})).status,400);
   assert.equal((await fetch(base+'/verifactu/settings',{method:'PUT',headers:headers(source.id),body:JSON.stringify({...configuration,environment:'production'})})).status,400);
   const xml=await fetch(base+'/verifactu/records/'+records[0].id+'/xml',{headers:headers(source.id)});assert.equal(xml.status,200);assert.match(xml.headers.get('content-type'),/application\/xml/);assert.equal(await xml.text(),records[0].xml);
  });
  await t.test('each own-software producer follows its company and freezes once its first record exists',async()=>{
   const own=async(suffix,tax_id)=>{const company=await context.createCompany({name:name+' '+suffix,tax_id,exercise:period});ids.push(company.id);return company;};
   const a=await own('Own A','B12345674'),b=await own('Own B','89890001K'),blank=await own('Missing NIF',''),aService=createVerifactuService(pool,a.id),bService=createVerifactuService(pool,b.id),blankService=createVerifactuService(pool,blank.id);
   const companyConfig={...configuration,producer_source:'company',installation_id:'',producer_name:'Ignored client name',producer_nif:'B11111111'};
   const aInitial=await aService.get();assert.equal(aInitial.settings.producer_source,'company');assert.equal(aInitial.settings.producer_name,a.name);assert.equal(aInitial.settings.producer_nif,'B12345674');
   const aSaved=await aService.configure(companyConfig),bSaved=await bService.configure(companyConfig);assert.equal(aSaved.settings.producer_name,a.name);assert.equal(aSaved.settings.producer_nif,'B12345674');assert.equal(bSaved.settings.producer_name,b.name);assert.equal(bSaved.settings.producer_nif,'89890001K');assert.notEqual(aSaved.settings.installation_id,bSaved.settings.installation_id);
   const renamed=name+' Own A corrected';await context.updateCompany(a.id,{name:renamed,tax_id:'12345678Z'});const updated=await aService.get();assert.equal(updated.settings.producer_name,renamed);assert.equal(updated.settings.producer_nif,'12345678Z');assert.equal(updated.settings.issuer_nif,'12345678Z');assert.equal((await bService.get()).settings.producer_nif,'89890001K');
   const aYear=(await context.getContext(a.id)).exercises[0],bYear=(await context.getContext(b.id)).exercises[0];
   const ownInvoice=(year,reference)=>({...body(reference),exercise_id:year.id,offset_account_id:null,vat_account_id:null,withholding_account_id:null,party:{name:'Cliente de pruebas',tax_id:'B12345674'}});
   const aInvoice=await createInvoiceService(pool,a.id).create(ownInvoice(aYear,'OWN-A')),bInvoice=await createInvoiceService(pool,b.id).create(ownInvoice(bYear,'OWN-B'));
   const [[aRecord]]=await pool.execute('SELECT payload,sequence_no FROM verifactu_records WHERE company_id=? AND invoice_id=?',[a.id,aInvoice.id]),[[bRecord]]=await pool.execute('SELECT payload,sequence_no FROM verifactu_records WHERE company_id=? AND invoice_id=?',[b.id,bInvoice.id]);assert.equal(aRecord.payload.system.producer_name,renamed);assert.equal(aRecord.payload.system.producer_nif,'12345678Z');assert.equal(bRecord.payload.system.producer_nif,'89890001K');assert.equal(aRecord.sequence_no,1);assert.equal(bRecord.sequence_no,1);
   await context.updateCompany(a.id,{name:name+' Own A later name'});const frozen=await aService.get();assert.equal(frozen.settings.producer_name,renamed);assert.notEqual(frozen.company.name,renamed);await assert.rejects(aService.configure({...configuration,producer_source:'custom',installation_id:frozen.settings.installation_id}),error('VERIFACTU_SETTINGS_LOCKED'));await assert.rejects(context.updateCompany(a.id,{name:frozen.company.name,tax_id:'B12345674'}),error('VERIFACTU_ISSUER_CHANGED'));
   const draft=await blankService.configure({...companyConfig,enabled:false});assert.equal(draft.settings.producer_source,'company');assert.equal(draft.settings.producer_name,blank.name);assert.equal(draft.settings.producer_nif,'');assert.equal(draft.settings.enabled,false);assert.equal(draft.can_prepare,false);assert.equal(draft.missing.length,1);await assert.rejects(blankService.configure(companyConfig),error('VERIFACTU_ISSUER'));await context.updateCompany(blank.id,{name:blank.name,tax_id:'B12345674'});const completed=await blankService.get();assert.equal(completed.settings.producer_nif,'B12345674');assert.equal(completed.settings.enabled,false);assert.equal(completed.can_prepare,true);
   const archive=await createDataBackupService(pool,a.id).export(),clone=await own('Own A clone','12345678Z'),restore=createDataBackupService(pool,clone.id),preview=await restore.preview(archive.file);assert.equal(preview.ready,true);await restore.restore({token:preview.token,request_id:randomUUID(),confirm:true});const copied=await createVerifactuService(pool,clone.id).get();assert.equal(copied.settings.producer_source,'company');assert.equal(copied.settings.producer_name,renamed);assert.equal(copied.settings.producer_nif,'12345678Z');assert.equal(copied.settings.enabled,false);
  });
  await t.test('archives made before producer-source tracking retain the original explicit producer',async()=>{
   const data=structuredClone(readBackup(full.file));delete data.checksum;delete data.fiscal_archive.verifactu_settings[0].producer_source;const clone=await create(),restore=createDataBackupService(pool,clone.id),preview=await restore.preview(packBackup(sealBackup(data)));assert.equal(preview.ready,true);await restore.restore({token:preview.token,request_id:randomUUID(),confirm:true});const state=await createVerifactuService(pool,clone.id).get();assert.equal(state.settings.producer_source,'custom');assert.equal(state.settings.producer_name,fiscalSettings.producer_name);assert.equal(state.settings.producer_nif,fiscalSettings.producer_nif);assert.equal(state.counts.total,4);
  });
  await t.test('clearing a later cancellation year cannot undo an older registered invoice',async()=>{
   const next=await createExerciseService(pool,source.id).create({name:'2027',start_date:'2027-01-01',end_date:'2027-12-31'});
   await invoices.void(second.id,{exercise_id:next.id,date:'2027-01-01',reason:'Cross-year test cancellation',request_id:randomUUID()});
   const clear=createExerciseClearService(pool,source.id),preview=await clear.preview(next.id);assert.equal(preview.ready,false);assert.ok(preview.blockers.some(row=>row.code==='verifactu'));await assert.rejects(clear.clear(next.id,{confirmation:'96',preview_hash:preview.preview_hash,request_id:randomUUID()}),error('EXERCISE_CLEAR_DEPENDENCIES'));
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});