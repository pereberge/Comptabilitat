import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createExerciseOperationService} from '../src/services/exercise-operations.js';
import {createJournalImportService} from '../src/services/journal-import.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createInvoiceDocumentService} from '../src/services/invoice-documents.js';
import {createPortfolioService} from '../src/services/portfolio.js';
import {createDocumentationService} from '../src/services/documentation.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup,packBackup,sealBackup,TABLE_ORDER} from '../src/services/backup-format.js';
import {readReconciliationLedger,reconciliationLedgerHash} from '../src/services/bank-reconciliations.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';
import {journalPdf} from '../test-support/journal-fixture.js';
const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
const error=code=>cause=>cause.code===code;
function failingPool(pool,prefix='INSERT INTO portfolio_receipts'){return {async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith(prefix))throw new Error('Injected restore failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};}
async function cleanup(pool,ids){
 for(const companyId of ids){
  for(const table of ['data_restores','invoice_deletion_rows','invoice_deletions','exercise_clear_rows','exercise_clears','invoice_documents','bank_reconciliations','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','exercise_operations','journal_imports','bank_connections','suppliers','company_documents','company_logos','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
  const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);
  await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
 }
}
test('MySQL data backups: full company and year restore, PDFs, cross-year links, exact money and isolation',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),context=createContextService(pool,config.companyId),ids=[],tokens=[];let server;
 const name='Backup test '+randomUUID(),count=async(table,companyId)=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE '+(table==='companies'?'id':'company_id')+'=?',[companyId]))[0][0].n;
 const create=async(year=2026,companyName=name)=>{const company=await context.createCompany({name:companyName,exercise:period(year)});ids.push(company.id);return company;};
 const review=async(service,file,scope='all',replace=false)=>{const preview=await service.preview(file,scope,replace);tokens.push([service,preview.token]);return preview;};
 const commit=preview=>({token:preview.token,request_id:randomUUID(),confirm:true});
 try{
  const source=await create(),target=await create(),single=await create(2025),foreign=await create(2026,'Foreign '+name);
  const service=createDataBackupService(pool,source.id),restore=createDataBackupService(pool,target.id),annual=createDataBackupService(pool,single.id);
  const singleYear=(await context.getContext(single.id)).exercises[0],singleNext=await createExerciseService(pool,single.id).create(period(2026)),singleAccounting=createAccountingService(pool,single.id);
  const protectedBank=await singleAccounting.createAccount({code:'5720.0001',description:'Existing bank name'}),protectedCapital=await singleAccounting.createAccount({code:'1000.0001',description:'Existing capital'});
  const protectedEntry=await singleAccounting.createEntry({exercise_id:singleNext.id,entry_date:'2026-01-01',description:'Keep this year',request_id:randomUUID(),lines:[{account_id:protectedBank.id,description:'Bank',debit:'50',credit:'0'},{account_id:protectedCapital.id,description:'Capital',debit:'0',credit:'50'}]});
  const protectedSnapshot=await singleAccounting.getEntry(protectedEntry.id);
  const year=(await context.getContext(source.id)).exercises[0],years=createExerciseService(pool,source.id),prior=await years.create(period(2025)),next=await years.create(period(2027));
  const accounting=createAccountingService(pool,source.id),invoices=createInvoiceService(pool,source.id),portfolio=createPortfolioService(pool,source.id),documents=createInvoiceDocumentService(pool,source.id),operations=createExerciseOperationService(pool,source.id);
  const accounts={};for(const [key,code]of [['bank','5720.0001'],['cost','6280.0001'],['vat','4720.0021']])accounts[key]=await accounting.createAccount({code,description:key==='cost'?'Electricidad':key==='vat'?'IVA 21%':'Bank'});
  const journal=createJournalImportService(pool,source.id);await journal.commit((await journal.preview(journalPdf(name),prior.id,'original-diario.pdf')).token);
  await operations.execute(year.id,'opening',{request_id:randomUUID(),preview_hash:(await operations.preview(year.id,'opening')).preview_hash});
  const body=reference=>({exercise_id:year.id,direction:'received',reference,invoice_date:'2026-10-15',posting_date:'2026-10-15',party:{name:'Electric Supplies SL',tax_id:'B11111111'},party_parent:'4100',offset_account_id:accounts.cost.id,vat_account_id:accounts.vat.id,request_id:randomUUID(),lines:[{description:'Electricity',base:'16.33',tax_rate:'21'}],receipts:[{due_date:'2026-10-22',amount:'19.76'}]});
  const invoice=await invoices.create(body('BACKUP-1')),voided=await invoices.create(body('BACKUP-VOID'));
  const payment=(exerciseId,date,amount)=>({exercise_id:exerciseId,payment_date:date,amount,bank_account_id:accounts.bank.id,payment_method:'transfer',request_id:randomUUID()});
  const paid=await portfolio.settle(invoice.receipts[0].id,payment(year.id,'2026-10-22','5.00'));await portfolio.reverse(paid.settlement_id,{exercise_id:year.id,date:'2026-10-23',reason:'Correction',request_id:randomUUID()});
  await portfolio.settle(invoice.receipts[0].id,payment(next.id,'2027-01-05','3.00'));
  await invoices.void(voided.id,{exercise_id:next.id,date:'2027-01-06',reason:'Cross-year void',request_id:randomUUID()});
  const pdf=invoicePdf(name,'BACKUP-1'),document=await documents.archive({token:(await documents.preview(pdf,year.id,'original.pdf')).token}),saved=await documents.get(document.id);
  await documents.post(document.id,{version:saved.version,confirm:true,action:'attach'});
  await documents.archive({token:(await documents.preview(invoicePdf(name,'DRAFT'),year.id,'pending.pdf')).token});
  const attachment=randomBytes(96*1024);await createDocumentationService(pool,source.id).upload(attachment,{title:'Contracte català',description:'Original compartit entre exercicis',source_name:'contracte.bin',source_mime:'application/octet-stream',request_id:randomUUID()});
  const logo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64');
  await context.updateCompany(source.id,{name,tax_id:'B11111111',city:'Lleida',logo:'data:image/png;base64,'+logo.toString('base64')});
  await pool.execute('INSERT INTO bank_connections(company_id,account_id,iban,bank_code,bank_name) VALUES (?,?,?,?,?)',[source.id,accounts.bank.id,'ES9121000418450200051332','2100','Bank']);
  await operations.execute(year.id,'closing',{request_id:randomUUID(),preview_hash:(await operations.preview(year.id,'closing')).preview_hash});
  await operations.execute(next.id,'opening',{request_id:randomUUID(),preview_hash:(await operations.preview(next.id,'opening')).preview_hash});
  await operations.execute(year.id,'cancel_closing',{request_id:randomUUID(),reason:'Keep open',preview_hash:(await operations.preview(year.id,'cancel_closing')).preview_hash});
  await accounting.createEntry({exercise_id:year.id,entry_date:'2026-11-05',description:'Posting inside bank balance window',request_id:randomUUID(),lines:[{account_id:accounts.bank.id,description:'Bank',debit:'1',credit:'0'},{account_id:accounts.cost.id,description:'Cost',debit:'0',credit:'1'}]});
  const ledger=await readReconciliationLedger(pool,source.id,year.id,'2026-11-09'),snapshot={company:{id:source.id,name},exercise:{id:year.id},account:{id:accounts.bank.id,code:accounts.bank.code},source:{to:'2026-10-31'},scope:{ledger_read_through:'2026-11-09'}};
  await pool.execute('INSERT INTO bank_reconciliations(company_id,exercise_id,account_id,source_name,source_sha256,source_pdf,snapshot,ledger_hash) VALUES (?,?,?,?,?,?,?,?)',[source.id,year.id,accounts.bank.id,'bank.pdf',createHash('sha256').update(pdf).digest('hex'),pdf,JSON.stringify(snapshot),reconciliationLedgerHash(ledger)]);
  const stalePdf=Buffer.concat([pdf,Buffer.from('\n')]);
  await pool.execute('INSERT INTO bank_reconciliations(company_id,exercise_id,account_id,source_name,source_sha256,source_pdf,snapshot,ledger_hash) VALUES (?,?,?,?,?,?,?,?)',[source.id,year.id,accounts.bank.id,'stale-bank.pdf',createHash('sha256').update(stalePdf).digest('hex'),stalePdf,JSON.stringify(snapshot),'a'.repeat(64)]);
  let full,one,restored;
  await t.test('export is read-only and includes originals, closed years, signed lines and common documents',async()=>{
   full=await service.export('all');const data=readBackup(full.file);one=await service.export(prior.id);
   assert.equal(data.scope.kind,'company');assert.equal(data.tables.accounting_exercises.length,3);assert.equal(data.tables.invoice_documents.length,2);assert.equal(data.tables.company_documents.length,1);
   assert.ok(data.tables.journal_lines.some(row=>row.debit==='-1.50'));assert.ok(data.tables.journal_lines.some(row=>row.debit==='0.00'&&row.credit==='0.00'));
   assert.equal(await count('data_restores',source.id),0);assert.equal(readBackup(one.file).tables.accounting_exercises.length,1);
   await assert.rejects(createDataBackupService(pool,foreign.id).export(year.id),error('EXERCISE_NOT_FOUND'));
  });
  await t.test('invalid files, tampering, unbalanced lines, foreign rows and schemas are rejected before writes',async()=>{
   await assert.rejects(restore.preview(Buffer.from('not a copy'),'all'),error('BACKUP_INVALID_FILE'));
   const changed=structuredClone(full.data);changed.created_at='changed';await assert.rejects(restore.preview(packBackup(changed),'all'),error('BACKUP_CHECKSUM'));
   for(const [mutate,code]of [
    [data=>{data.tables.journal_lines[0].debit='0.01';},'BACKUP_INVALID_ACCOUNTING'],
    [data=>{data.tables.accounts[0].company_id=foreign.id;},'BACKUP_INVALID_FILE'],
    [data=>{data.tables.journal_lines[0].account_id=99999999;},'BACKUP_BROKEN_LINKS'],
    [data=>{data.tables.users=[];},'BACKUP_INVALID_FILE'],
    [data=>{data.schema.accounts.push('unexpected');},'BACKUP_SCHEMA_MISMATCH'],
   ]){
    const data=structuredClone(full.data);delete data.checksum;mutate(data);await assert.rejects(restore.preview(packBackup(sealBackup(data)),'all'),error(code));
   }
   assert.equal(await count('accounts',target.id),0);assert.equal(await count('journal_entries',target.id),0);
  });
  await t.test('preview identifies company, exercise, occupied destinations and cross-year dependencies',async()=>{
   assert.equal((await review(createDataBackupService(pool,foreign.id),full.file)).ready,false);
   const occupied=await review(service,full.file);assert.equal(occupied.ready,false);assert.ok(occupied.blockers.some(row=>row.code==='occupied'));
   const sourceNext=await service.export(next.id);
   const mismatched=await review(annual,sourceNext.file,singleYear.id);assert.equal(mismatched.ready,false);assert.ok(mismatched.blockers.some(row=>row.code==='dependency'));assert.ok(mismatched.blockers.some(row=>row.code==='period'));
   const legacy=await review(restore,one.file,'all');assert.equal(legacy.ready,true);
   for(const [owner,token]of tokens.splice(0))await owner.discard(token);
  });
  await t.test('failure halfway through restoration rolls back new years, accounts, documents and journals',async()=>{
   const preview=await review(restore,full.file);assert.equal(preview.ready,true);
   await assert.rejects(createDataBackupService(failingPool(pool),target.id).restore(commit(preview)),/Injected restore failure/);
   for(const table of ['accounts','journal_entries','journal_imports','trade_invoices','company_documents','company_logos','data_restores'])assert.equal(await count(table,target.id),0,table);
   assert.equal(await count('accounting_exercises',target.id),1);await restore.discard(preview.token);
  });
  await t.test('changed destinations invalidate preview and confirmation is required',async()=>{
   let preview=await review(restore,full.file);
   await assert.rejects(restore.restore({...commit(preview),confirm:false}),error('BACKUP_CONFIRM_REQUIRED'));
   await context.updateCompany(target.id,{name,city:'Changed after review'});
   await assert.rejects(restore.restore(commit(preview)),error('BACKUP_DESTINATION_CHANGED'));await restore.discard(preview.token);
   await context.updateCompany(target.id,{name,city:''});
  });
  await t.test('concurrent retries import exactly once and preserve every relationship with new IDs',async()=>{
   const preview=await review(restore,full.file);assert.equal(preview.ready,true);const body=commit(preview);
   const results=await Promise.all([restore.restore(body),restore.restore(body)]);assert.equal(results.filter(row=>row.replayed).length,1);restored=results[0];
   assert.equal(await count('data_restores',target.id),1);
   for(const table of TABLE_ORDER.filter(table=>!['companies','company_details','accounting_exercises'].includes(table)))assert.equal(await count(table,target.id),full.data.tables[table].length,table);
   const [[row]]=await pool.execute('SELECT id FROM trade_invoices WHERE company_id=? AND request_id=?',[target.id,invoice.request_id]);
   const recovered=await createInvoiceService(pool,target.id).get(row.id);assert.equal(recovered.receipts[0].remaining_amount,'16.76');assert.equal(recovered.total_amount,'19.76');
   const [[pending]]=await pool.execute("SELECT form FROM invoice_documents WHERE company_id=? AND status='draft'",[target.id]);assert.ok(restored.exercise_ids.includes(pending.form.exercise_id));
   const [ops]=await pool.execute('SELECT id,snapshot,result FROM exercise_operations WHERE company_id=?',[target.id]);
   for(const operation of ops){assert.equal(operation.result.operation_id,operation.id);assert.ok(restored.exercise_ids.includes(operation.snapshot.exercise.id));}
   const [[logoRow]]=await pool.execute('SELECT content FROM company_logos WHERE company_id=?',[target.id]);assert.deepEqual(logoRow.content,logo);
   const [[docRow]]=await pool.execute('SELECT content FROM company_documents WHERE company_id=?',[target.id]);assert.deepEqual(docRow.content,attachment);
   const [[pdfRow]]=await pool.execute("SELECT source_pdf FROM invoice_documents WHERE company_id=? AND source_name='original.pdf'",[target.id]);assert.deepEqual(pdfRow.source_pdf,pdf);
   const [[bank]]=await pool.execute("SELECT exercise_id,snapshot,ledger_hash FROM bank_reconciliations WHERE company_id=? AND source_name='bank.pdf'",[target.id]);assert.equal(bank.snapshot.company.id,target.id);assert.equal(bank.ledger_hash,reconciliationLedgerHash(await readReconciliationLedger(pool,target.id,bank.exercise_id,'2026-11-09')));
   const [[stale]]=await pool.execute("SELECT ledger_hash FROM bank_reconciliations WHERE company_id=? AND source_name='stale-bank.pdf'",[target.id]);assert.notEqual(stale.ledger_hash,bank.ledger_hash);
   assert.equal((await context.getCompany(target.id)).city,'Lleida');assert.equal(await count('journal_entries',source.id),full.data.tables.journal_entries.length);
  });
  await t.test('occupied years require explicit replacement and preview detects edits and external dependencies',async()=>{
   const existing=await review(restore,full.file);assert.equal(existing.ready,false);assert.equal(existing.replace_existing,false);assert.equal(existing.existing_counts.trade_invoices,2);await restore.discard(existing.token);
   const partial=await service.export(year.id),targetYear=(await context.getContext(target.id)).exercises.find(row=>row.name==='2026');
   const blocked=await review(restore,partial.file,targetYear.id,true);assert.equal(blocked.ready,false);assert.ok(blocked.blockers.some(row=>row.code==='external_payments'));await restore.discard(blocked.token);
   const following=await service.export(next.id),targetFollowing=(await context.getContext(target.id)).exercises.find(row=>row.name==='2027');
   const changes=await review(restore,following.file,targetFollowing.id,true);assert.equal(changes.ready,false);assert.ok(changes.blockers.some(row=>row.code==='external_changes'));await restore.discard(changes.token);
   const preview=await review(restore,full.file,'all',true);assert.equal(preview.ready,true);assert.equal(preview.replace_existing,true);
   assert.equal(await count('exercise_clears',target.id),0);assert.equal(await count('trade_invoices',target.id),2);
   await assert.rejects(restore.restore({...commit(preview),confirmation:'96',canReplace:true},{canReplace:false}),error('PERMISSION_DENIED'));
   await assert.rejects(restore.restore(commit(preview)),error('BACKUP_REPLACEMENT_CODE'));
   const [[entry]]=await pool.execute('SELECT id FROM journal_entries WHERE company_id=? ORDER BY id LIMIT 1',[target.id]);
   await pool.execute('UPDATE journal_entries SET description=? WHERE company_id=? AND id=?',['Edited after review',target.id,entry.id]);
   await assert.rejects(restore.restore({...commit(preview),confirmation:'96'}),error('BACKUP_DESTINATION_CHANGED'));await restore.discard(preview.token);
   assert.equal(await count('exercise_clears',target.id),0);assert.equal(await count('trade_invoices',target.id),2);
  });
  await t.test('replacement rolls back the backup and original data if archiving or importing fails',async()=>{
   const before=(await restore.export()).data.tables;
   for(const prefix of ['INSERT INTO exercise_clear_rows','INSERT INTO portfolio_receipts']){
    const preview=await review(restore,full.file,'all',true);assert.equal(preview.ready,true);
    await assert.rejects(createDataBackupService(failingPool(pool,prefix),target.id).restore({...commit(preview),confirmation:'96'}),/Injected restore failure/);
    assert.deepEqual((await restore.export()).data.tables,before);assert.equal(await count('exercise_clears',target.id),0);assert.equal(await count('exercise_clear_rows',target.id),0);assert.equal(await count('data_restores',target.id),1);await restore.discard(preview.token);
   }
  });
  await t.test('replacement archives originals, restores linked years once and preserves an extra destination year',async()=>{
   const targetAccounting=createAccountingService(pool,target.id),extra=await createExerciseService(pool,target.id).create(period(2028));
   const [recoveredAccounts]=await pool.execute('SELECT id,code FROM accounts WHERE company_id=?',[target.id]);const bank=recoveredAccounts.find(row=>row.code===accounts.bank.code),cost=recoveredAccounts.find(row=>row.code===accounts.cost.code);
   const protectedEntry=await targetAccounting.createEntry({exercise_id:extra.id,entry_date:extra.start_date,description:'Keep 2028',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'41.25',credit:'0'},{account_id:cost.id,description:'Cost',debit:'0',credit:'41.25'}]});
   const protectedSnapshot=await targetAccounting.getEntry(protectedEntry.id),[[protectedPeriod]]=await pool.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?',[target.id,extra.id]);
   const preview=await review(restore,full.file,'all',true);assert.equal(preview.ready,true);assert.equal(preview.existing_counts.journal_entries,full.data.tables.journal_entries.length);
   const body={...commit(preview),confirmation:'96'},result=await restore.restore(body);assert.equal(result.replaced,true);assert.equal(result.backups.length,3);
   const recovered=(await restore.export(result.exercise_ids)).data.tables;
   for(const table of TABLE_ORDER.filter(table=>!['companies','company_details','accounting_exercises'].includes(table)))assert.equal(recovered[table].length,full.data.tables[table].length,table);
   assert.deepEqual(await targetAccounting.getEntry(protectedEntry.id),protectedSnapshot);assert.deepEqual((await pool.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?',[target.id,extra.id]))[0][0],protectedPeriod);
   const [[saved]]=await pool.execute("SELECT row_data FROM exercise_clear_rows WHERE company_id=? AND table_name='journal_entries' AND JSON_UNQUOTE(JSON_EXTRACT(row_data,'$.description'))='Edited after review'",[target.id]);assert.ok(saved);
   const [[original]]=await pool.execute("SELECT row_data FROM exercise_clear_rows WHERE company_id=? AND table_name='invoice_documents' AND JSON_UNQUOTE(JSON_EXTRACT(row_data,'$.source_name'))='original.pdf'",[target.id]);assert.deepEqual(Buffer.from(original.row_data.source_pdf.$binary_base64,'base64'),pdf);
   await assert.rejects(restore.restore(body,{canReplace:false}),error('PERMISSION_DENIED'));
   assert.equal((await restore.restore(body)).replayed,true);assert.equal(await count('exercise_clears',target.id),3);assert.equal(await count('data_restores',target.id),2);
   await assert.rejects(restore.restore({...body,confirmation:''}),error('BACKUP_REPLACEMENT_CODE'));
  });
  await t.test('an annual copy restores only its year and retains signed/zero imported journal lines',async()=>{
   const year=singleYear,preview=await review(annual,one.file,year.id);assert.equal(preview.ready,true);
   const result=await annual.restore(commit(preview));assert.deepEqual(result.exercise_ids,[year.id]);assert.equal(await count('accounting_exercises',single.id),2);
   assert.deepEqual(await singleAccounting.getEntry(protectedEntry.id),protectedSnapshot);
   const [[existingAccount]]=await pool.execute('SELECT description FROM accounts WHERE company_id=? AND id=?',[single.id,protectedBank.id]);assert.equal(existingAccount.description,'Existing bank name');
   const [[period]]=await pool.execute('SELECT status,is_default FROM accounting_exercises WHERE company_id=? AND id=?',[single.id,year.id]);assert.equal(period.status,'closed');assert.equal(period.is_default,0);
   const [[negative]]=await pool.execute("SELECT COUNT(*) AS n FROM journal_lines WHERE company_id=? AND debit='-1.50'",[single.id]);assert.equal(negative.n,1);
  });
  await t.test('selected nonconsecutive years export and restore together while another year stays intact',async()=>{
   const multiName='Multiple years '+randomUUID(),from=await create(2026,multiName),to=await create(2026,multiName);
   const fromYears=createExerciseService(pool,from.id),toYears=createExerciseService(pool,to.id);
   const fromPrior=await fromYears.create(period(2025)),fromNext=await fromYears.create(period(2027)),toPrior=await toYears.create(period(2025)),toNext=await toYears.create(period(2027));
   const fromMiddle=(await context.getContext(from.id)).exercises.find(row=>row.name==='2026'),toMiddle=(await context.getContext(to.id)).exercises.find(row=>row.name==='2026');
   const a=createAccountingService(pool,from.id),b=createAccountingService(pool,to.id);
   const bank=await a.createAccount({code:'5720.0001',description:'Bank'}),capital=await a.createAccount({code:'1000.0001',description:'Capital'});
   const otherBank=await b.createAccount({code:'5720.0001',description:'Existing bank'}),otherCapital=await b.createAccount({code:'1000.0001',description:'Existing capital'});
   const entry=(accounting,year,bank,capital,amount)=>accounting.createEntry({exercise_id:year.id,entry_date:year.start_date,description:'Year '+year.name,request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:amount,credit:'0'},{account_id:capital.id,description:'Capital',debit:'0',credit:amount}]});
   await entry(a,fromPrior,bank,capital,'10.25');await entry(a,fromMiddle,bank,capital,'20.50');await entry(a,fromNext,bank,capital,'30.75');
   const protectedId=(await entry(b,toMiddle,otherBank,otherCapital,'75.00')).id,protectedYear=await b.getEntry(protectedId);
   const exporter=createDataBackupService(pool,from.id),importer=createDataBackupService(pool,to.id),copy=await exporter.export([fromNext.id,fromPrior.id]);
   const archive=readBackup(copy.file);assert.equal(archive.scope.kind,'exercises');assert.deepEqual(archive.scope.exercise_ids,[fromPrior.id,fromNext.id].sort((a,b)=>a-b));assert.equal(archive.tables.journal_entries.length,2);assert.ok(!archive.tables.accounting_exercises.some(row=>row.name==='2026'));
   await assert.rejects(exporter.export([fromPrior.id,toNext.id]),error('EXERCISE_NOT_FOUND'));
   await assert.rejects(exporter.export('invalid,selection'),error('BACKUP_INVALID_SCOPE'));
   assert.equal(readBackup((await exporter.export([fromPrior.id,fromPrior.id])).file).tables.accounting_exercises.length,1);
   await assert.rejects(importer.preview(copy.file,toPrior.id),error('BACKUP_SCOPE_MISMATCH'));
   const preview=await review(importer,copy.file,toPrior.id+','+toNext.id);assert.equal(preview.ready,true);
   const body=commit(preview),result=await importer.restore(body);assert.equal(result.counts.journal_entries,2);assert.deepEqual([...result.exercise_ids].sort((a,b)=>a-b),[toPrior.id,toNext.id].sort((a,b)=>a-b));
   assert.deepEqual(await b.getEntry(protectedId),protectedYear);assert.equal(await count('journal_entries',to.id),3);
   const [recovered]=await pool.execute('SELECT e.name,l.debit FROM journal_entries j JOIN accounting_exercises e ON e.company_id=j.company_id AND e.id=j.exercise_id JOIN journal_lines l ON l.company_id=j.company_id AND l.entry_id=j.id WHERE j.company_id=? AND j.exercise_id IN (?,?) AND l.debit>0 ORDER BY e.name',[to.id,toPrior.id,toNext.id]);assert.deepEqual(recovered.map(row=>row.debit),['10.25','30.75']);
   assert.equal((await importer.restore(body)).replayed,true);
   const [[record]]=await pool.execute('SELECT target_scope FROM data_restores WHERE company_id=?',[to.id]);assert.ok(record.target_scope.length<=20);
   const replace=await review(importer,copy.file,'all',true);assert.equal(replace.ready,true);assert.equal(replace.existing_counts.journal_entries,2);
   const replaced=await importer.restore({...commit(replace),confirmation:'96'});assert.equal(replaced.backups.length,2);assert.ok(replaced.backups.every(copy=>copy.exercise_id!==toMiddle.id));assert.equal(await count('journal_entries',to.id),3);assert.deepEqual(await b.getEntry(protectedId),protectedYear);
  });
  await t.test('HTTP downloads and binary uploads enforce company scope, large request bodies and replay',async()=>{
   const httpTarget=await create();server=createApp(context,accounting,(req,res,next)=>{req.user={permissions:{exercise_clear:true}};return companyScope(pool,source.id)(req,res,next);}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const base='http://127.0.0.1:'+server.address().port+'/api',headers=companyId=>({'X-Company-Id':String(companyId)});
   const response=await fetch(base+'/data-backups/export?exercise_id='+prior.id,{headers:headers(source.id)});assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);assert.equal(readBackup(Buffer.from(await response.arrayBuffer())).scope.kind,'exercise');
   assert.equal((await fetch(base+'/data-backups/export?exercise_id='+year.id,{headers:headers(foreign.id)})).status,404);
   const multiple=await fetch(base+'/data-backups/export?exercise_id='+year.id+','+next.id,{headers:headers(source.id)});assert.equal(multiple.status,200);assert.match(multiple.headers.get('content-disposition'),/2026-2027/);assert.equal(readBackup(Buffer.from(await multiple.arrayBuffer())).tables.accounting_exercises.length,2);
   assert.ok(full.file.length>32768);
   const upload=await fetch(base+'/data-backups/preview?exercise_id=all',{method:'POST',headers:{...headers(httpTarget.id),'Content-Type':'application/octet-stream'},body:full.file});assert.equal(upload.status,200);const preview=await upload.json();assert.equal(preview.ready,true);
   const body=commit(preview),request=companyId=>fetch(base+'/data-backups/restore',{method:'POST',headers:{...headers(companyId),'Content-Type':'application/json'},body:JSON.stringify(body)});
   assert.equal((await request(foreign.id)).status,409);
   const saved=await request(httpTarget.id);assert.equal(saved.status,200);assert.equal((await saved.json()).counts.journal_entries,full.data.tables.journal_entries.length);
   assert.equal((await(await request(httpTarget.id)).json()).replayed,true);
   const replaced=await fetch(base+'/data-backups/preview?exercise_id=all&replace_existing=1',{method:'POST',headers:{...headers(httpTarget.id),'Content-Type':'application/octet-stream'},body:full.file});assert.equal(replaced.status,200);const replacement=await replaced.json();assert.equal(replacement.ready,true);assert.equal(replacement.replace_existing,true);
   const replaceBody={...commit(replacement),confirmation:'96'},accepted=await fetch(base+'/data-backups/restore',{method:'POST',headers:{...headers(httpTarget.id),'Content-Type':'application/json'},body:JSON.stringify(replaceBody)});assert.equal(accepted.status,200);assert.equal((await accepted.json()).backups.length,3);
   assert.equal((await fetch(base+'/data-backups/export?exercise_id=all',{headers:headers(source.id)})).status,200);
  });
 }finally{for(const [owner,token]of tokens)await owner.discard(token).catch(()=>{});if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});
