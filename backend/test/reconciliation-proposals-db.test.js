import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createBankImportService} from '../src/services/bank-import.js';
import {createBankReconciliationService} from '../src/services/bank-reconciliations.js';
import {createDataBackupService} from '../src/services/data-backup.js';
import {readBackup,packBackup,sealBackup} from '../src/services/backup-format.js';
import {readReconciliationRules} from '../src/services/reconciliation-rules.js';
const error=code=>cause=>cause.code===code;
test('MySQL manual reconciliation: criteria reuse, edits, bank isolation, exact splits, backup and rollback',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),companies=createCompanyService(pool),ids=[],tokens=[],name='Reconciliation criteria '+randomUUID();
 const create=async(companyName=name)=>{const company=await companies.createCompany({name:companyName,exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);return {...company,year:year.id};};
 const count=async(table,companyId)=>(await pool.execute('SELECT COUNT(*) AS n FROM '+table+' WHERE company_id=?',[companyId]))[0][0].n;
 try{
  const company=await create(),target=await create(),legacyTarget=await create(),foreign=await create('Foreign '+name),accounting=createAccountingService(pool,company.id),service=createBankReconciliationService(pool,company.id),imports=createBankImportService(pool,company.id);
  const bank=await accounting.createAccount({code:'5720.0001',description:'Bank one'}),otherBank=await accounting.createAccount({code:'5720.0002',description:'Bank two'}),capital=await accounting.createAccount({code:'1000.0001',description:'Capital'}),principal=await accounting.createAccount({code:'1700.0001',description:'Loan principal'}),interest=await accounting.createAccount({code:'6620.0001',description:'Interest'});
  const foreignAccount=await createAccountingService(pool,foreign.id).createAccount({code:'6290.0001',description:'Foreign cost'});
  await accounting.createEntry({exercise_id:company.year,entry_date:'2026-01-01',description:'Opening deposit',request_id:randomUUID(),lines:[{account_id:bank.id,description:'Bank',debit:'1000.00',credit:'0.00'},{account_id:capital.id,description:'Capital',debit:'0.00',credit:'1000.00'}]});
  const csv='Fecha;Concepto;Importe;Saldo\n10/01/2026;Opening;1000,00;1000,00\n12/01/2026;PRESTEC FINANCERA ref gener;-100,00;900,00\n20/01/2026;PRESTEC FINANCERA ref febrer;-200,00;700,00';
  const prepare=async(content,accountId=bank.id,year=company.year)=>{const preview=await imports.preview(Buffer.from(content),year,'test.csv','text/csv');const analysis=await imports.analyze({token:preview.token,account_id:accountId});return {preview,analysis};};
  const initial=await prepare(csv),saved=await imports.commit({token:initial.preview.token});await imports.discard({token:initial.preview.token});let report=await service.get(saved.id);
  const first=report.snapshot.scope.bank_pending[0],body={version:report.version,movement_id:first.id,date:first.date,concept:'Loan installment',remember:true,rule_concept:'PRESTEC FINANCERA',counter_lines:[{account_id:principal.id,debit:'80.00',credit:'0.00'},{account_id:interest.id,debit:'20.00',credit:'0.00'}]};
  await t.test('manual split becomes a proposal and is remembered for variable amounts without posting journals',async()=>{
   assert.equal(report.snapshot.proposals.length,0);assert.equal(report.snapshot.unresolved.length,2);
   const result=await service.saveProposal(report.id,body);assert.equal(result.remembered,true);report=await service.get(report.id);
   assert.equal(report.snapshot.proposals.length,2);assert.equal(report.snapshot.proposals[0].source,'manual');assert.equal(report.snapshot.proposals[1].source,'saved_rule');assert.equal(report.snapshot.proposals[1].lines[0].debit,'160.00');assert.equal(report.snapshot.proposals[1].lines[1].debit,'40.00');
   assert.equal(report.rules.length,1);assert.equal(report.rules[0].concept_key,'PRESTEC FINANCERA');assert.equal(await count('journal_entries',company.id),1);
   await service.reanalyze(report.id);report=await service.get(report.id);assert.equal(report.snapshot.manual_proposals.length,1);assert.equal(report.snapshot.proposals[0].concept,'Loan installment');
   const future=await prepare(csv+'\n');assert.equal(future.analysis.snapshot.proposals.length,2);assert.ok(future.analysis.snapshot.proposals.every(row=>row.source==='saved_rule'));await imports.discard({token:future.preview.token});
  });
  await t.test('criteria stay within their company, bank and direction and can be reused in a later year',async()=>{
   assert.deepEqual(await readReconciliationRules(pool,foreign.id,bank.id),[]);assert.deepEqual(await readReconciliationRules(pool,company.id,otherBank.id),[]);
   const other=await prepare(csv+'\n\n',otherBank.id);assert.equal(other.analysis.snapshot.proposals.length,0);await imports.discard({token:other.preview.token});
   const incoming=await prepare('Fecha;Concepto;Importe;Saldo\n12/01/2026;PRESTEC FINANCERA refund;100,00;1100,00');assert.equal(incoming.analysis.snapshot.proposals.length,0);await imports.discard({token:incoming.preview.token});
   const next=await createExerciseService(pool,company.id).create({name:'2027',start_date:'2027-01-01',end_date:'2027-12-31'});
   const annual=await prepare(csv.replaceAll('2026','2027'),bank.id,next.id);assert.equal(annual.analysis.snapshot.proposals.length,2);await imports.discard({token:annual.preview.token});
  });
  await t.test('stale versions, unbalanced amounts, invalid accounts and foreign reports are rejected',async()=>{
   await assert.rejects(service.saveProposal(report.id,body),error('RECONCILIATION_CHANGED'));
   await assert.rejects(createBankReconciliationService(pool,foreign.id).saveProposal(report.id,{...body,version:report.version}),error('RECONCILIATION_NOT_FOUND'));
   await assert.rejects(service.saveProposal(report.id,{...body,version:report.version,counter_lines:[{account_id:foreignAccount.id,debit:'100.00',credit:'0.00'}]}),error('RECONCILIATION_INVALID_ACCOUNT'));
   await assert.rejects(service.saveProposal(report.id,{...body,version:report.version,counter_lines:[{account_id:bank.id,debit:'100.00',credit:'0.00'}]}),error('RECONCILIATION_INVALID_ACCOUNT'));
   await assert.rejects(service.saveProposal(report.id,{...body,version:report.version,counter_lines:[{account_id:principal.id,debit:'99.99',credit:'0.00'}]}),error('RECONCILIATION_UNBALANCED_PROPOSAL'));
   assert.equal((await service.get(report.id)).version,report.version);
  });
  await t.test('criteria and manual proposals survive backup with account IDs remapped; pre-criteria archives still restore',async()=>{
   const archive=await createDataBackupService(pool,company.id).export(),data=readBackup(archive.file);assert.equal(data.tables.bank_reconciliation_rules.length,1);
   const restore=createDataBackupService(pool,target.id),ready=await restore.preview(archive.file);tokens.push([restore,ready.token]);assert.equal(ready.ready,true);await restore.restore({token:ready.token,confirm:true,request_id:randomUUID()});
   const [restoredBank]=await pool.execute('SELECT id FROM accounts WHERE company_id=? AND code=?',[target.id,bank.code]),rules=await readReconciliationRules(pool,target.id,restoredBank[0].id);assert.equal(rules.length,1);assert.notEqual(rules[0].counter_lines[0].account_id,principal.id);
   const [[restoredReport]]=await pool.execute('SELECT id FROM bank_reconciliations WHERE company_id=?',[target.id]);const recovered=await createBankReconciliationService(pool,target.id).get(restoredReport.id);assert.equal(recovered.snapshot.manual_proposals[0].counter_lines[0].account_id,rules[0].counter_lines[0].account_id);
   const old=structuredClone(data);delete old.checksum;for(const key of ['tables','schema','references'])delete old[key].bank_reconciliation_rules;old.schema.bank_reconciliations=old.schema.bank_reconciliations.filter(field=>field!=='version');for(const row of old.tables.bank_reconciliations)delete row.version;
   const legacy=createDataBackupService(pool,legacyTarget.id),oldReady=await legacy.preview(packBackup(sealBackup(old)));tokens.push([legacy,oldReady.token]);assert.equal(oldReady.ready,true);await legacy.restore({token:oldReady.token,confirm:true,request_id:randomUUID()});assert.equal(await count('bank_reconciliation_rules',legacyTarget.id),0);
  });
  await t.test('an error while storing the report rolls back its newly saved criterion',async()=>{
   const before=await service.get(report.id),ruleCount=await count('bank_reconciliation_rules',company.id);
   const failing={async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('UPDATE bank_reconciliations SET snapshot='))throw new Error('Injected proposal failure');return db.execute(sql,args);},query:(...args)=>db.query(...args),beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
   await assert.rejects(createBankReconciliationService(failing,company.id).saveProposal(report.id,{...body,version:before.version,rule_concept:'FINANCERA ref gener'}),/Injected proposal failure/);
   assert.equal(await count('bank_reconciliation_rules',company.id),ruleCount);assert.deepEqual((await service.get(report.id)).snapshot,before.snapshot);
  });
  await t.test('removing a criterion preserves the explicit manual choice and leaves other installments unresolved',async()=>{
   const rule=report.rules[0];await assert.rejects(service.removeRule(report.id,rule.id,{version:0}),error('RECONCILIATION_CHANGED'));await service.removeRule(report.id,rule.id,{version:rule.version});report=await service.get(report.id);
   assert.equal(report.rules.length,0);assert.equal(report.snapshot.proposals.length,1);assert.equal(report.snapshot.proposals[0].source,'manual');assert.equal(report.snapshot.unresolved.length,1);assert.equal(await count('journal_entries',company.id),1);
  });
 }finally{
  for(const [owner,token]of tokens)await owner.discard(token);
  for(const companyId of ids){for(const table of ['data_restores','bank_reconciliation_rules','bank_reconciliations','bank_connections','journal_lines','journal_entries','exercise_operations','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
