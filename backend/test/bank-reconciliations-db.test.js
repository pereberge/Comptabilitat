import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createContextService } from '../src/services/context.js';
import { createExerciseService } from '../src/services/exercises.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createBankReconciliationService, reconciliationLedgerHash, storeBankReconciliation } from '../src/services/bank-reconciliations.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';
import { journalPdf } from '../test-support/journal-fixture.js';

test('MySQL bank reconciliation: immutable proposals, source PDF, exact balances, isolation and stale analysis', {skip:process.env.TEST_MYSQL !== '1'}, async () => {
  const pool = mysql.createPool(config.database), ids = [], context = createContextService(pool,config.companyId);
  let server;
  try {
    const period = year => ({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
    const company = await context.createCompany({name:'Bank reconciliation '+randomUUID(),exercise:period(2026)}); ids.push(company.id);
    const foreign = await context.createCompany({name:'Foreign bank '+randomUUID(),exercise:period(2026)}); ids.push(foreign.id);
    const year = (await context.getContext(company.id)).exercises[0], foreignYear = (await context.getContext(foreign.id)).exercises[0];
    const otherYear = await createExerciseService(pool,company.id).create(period(2025));
    const accounting = createAccountingService(pool,company.id), service = createBankReconciliationService(pool,company.id);
    const bank = await accounting.createAccount({code:'5720.0005',description:'Bank'});
    const capital = await accounting.createAccount({code:'1000.0000',description:'Capital'});
    const expense = await accounting.createAccount({code:'6220.0000',description:'Expenses'});
    const foreignExpense = await createAccountingService(pool,foreign.id).createAccount({code:'6220.0000',description:'Foreign expense'});
    async function post(when, debit, credit, value) {
      return accounting.createEntry({exercise_id:year.id,entry_date:when,description:'Bank test',request_id:randomUUID(),lines:[
        {account_id:debit.id,description:'Test',debit:value,credit:'0.00'},
        {account_id:credit.id,description:'Test',debit:'0.00',credit:value},
      ]});
    }
    const opening = await post('2026-10-12',bank,capital,'1000.05');
    const [lines] = await pool.execute(`SELECT e.exercise_id,e.id AS entry_id,e.number,e.entry_date,e.status,e.entry_type,
      a.code,a.description AS account_name,l.position,l.description,l.debit,l.credit FROM journal_entries e
      JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
      WHERE e.company_id=? AND e.exercise_id=? ORDER BY e.entry_date,e.number,l.position`,[company.id,year.id]);
    const hash = reconciliationLedgerHash(lines), pdf = journalPdf('BANK TEST');
    const snapshot = {company:{id:company.id,name:company.name},exercise:{id:year.id,name:year.name},
      account:{code:bank.code,name_by_user:'Bank',stored_name:'Bank'},posted:false,
      source:{name:'statement.pdf',sha256:createHash('sha256').update(pdf).digest('hex'),from:'2026-10-12',to:'2026-10-20',pages:2,rows:1},
      scope:{last_matching_date:'2026-10-12',last_matching_balance:'1000.05',last_book_entry:opening.number,bank_pending:[
        {id:1,page:2,date:'2026-10-20',value_date:'2026-10-19',concept:'Test payment',amount:'-100.01',balance:'900.04'}]},
      current_book_balance:'1000.05',bank_balance:'900.04',difference_book_minus_bank:'100.01',projected_balance:'900.04',
      proposals:[{id:'P1',date:'2026-10-20',concept:'Expense payment',basis:'Test evidence',confidence:'Pending document',bank_effect:'-100.01',lines:[
        {account_id:expense.id,code:expense.code,name:'Expenses',debit:'100.01',credit:'0.00'},
        {account_id:bank.id,code:bank.code,name:'Bank',debit:'0.00',credit:'100.01'}]}]};
    const rejects = (data, source, fingerprint, code) => assert.rejects(storeBankReconciliation(pool,company.id,data,source,fingerprint),e => e.code === code);
    await rejects(snapshot,Buffer.concat([pdf,Buffer.from('changed')]),hash,'INVALID_RECONCILIATION_SOURCE');
    await rejects(snapshot,pdf,'0'.repeat(64),'RECONCILIATION_LEDGER_CHANGED');
    const unbalanced = structuredClone(snapshot); unbalanced.proposals[0].lines[0].debit='100.02';
    await rejects(unbalanced,pdf,hash,'INVALID_RECONCILIATION_BALANCE');
    const foreignAccount = structuredClone(snapshot); foreignAccount.proposals[0].lines[0].account_id=foreignExpense.id;
    await rejects(foreignAccount,pdf,hash,'INVALID_RECONCILIATION_ACCOUNT');
    const inconsistentStatement = structuredClone(snapshot); inconsistentStatement.scope.bank_pending[0].balance='900.03';
    await rejects(inconsistentStatement,pdf,hash,'INVALID_RECONCILIATION_BALANCE');
    const saved = await storeBankReconciliation(pool,company.id,snapshot,pdf,hash);
    assert.equal(saved.replayed,false);
    assert.deepEqual(await storeBankReconciliation(pool,company.id,snapshot,pdf,hash),{id:saved.id,replayed:true});
    assert.equal((await service.list({exercise_id:year.id})).length,1);
    assert.deepEqual(await service.list({exercise_id:otherYear.id}),[]);
    await assert.rejects(service.list({exercise_id:foreignYear.id}),e=>e.code==='EXERCISE_NOT_FOUND');
    const detail = await service.get(saved.id);
    assert.deepEqual(detail.snapshot,snapshot);
    assert.equal(detail.last_matching_entry_id,opening.id);
    assert.deepEqual(detail.current,{as_of:'2026-10-20',ledger_changed:false,book_balance:'1000.05',cutoff_balance:'1000.05',difference_book_minus_bank:'100.01'});
    const [[entryCount]] = await pool.execute('SELECT COUNT(*) AS total FROM journal_entries WHERE company_id=?',[company.id]);
    assert.equal(entryCount.total,1,'saving proposals must not post financial entries');
    server = createApp(context,{},companyScope(pool,config.companyId)).listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base = 'http://127.0.0.1:'+server.address().port+'/api/bank-reconciliations';
    const request = (path,companyId=company.id) => fetch(base+path,{headers:{'X-Company-Id':String(companyId)}});
    for (const suffix of ['', '/source']) {
      const response = await request('/'+saved.id+suffix,foreign.id);
      assert.equal(response.status,404); assert.equal((await response.json()).error.code,'RECONCILIATION_NOT_FOUND');
    }
    assert.deepEqual(await (await request('?exercise_id='+foreignYear.id,foreign.id)).json(),[]);
    assert.equal((await request('?exercise_id='+year.id,foreign.id)).status,404);
    const source = await request('/'+saved.id+'/source');
    assert.equal(source.status,200);
    assert.equal(source.headers.get('content-type'),'application/pdf');
    assert.equal(source.headers.get('cache-control'),'no-store');
    assert.equal(source.headers.get('x-content-type-options'),'nosniff');
    assert.match(source.headers.get('content-disposition'),/statement\.pdf/);
    assert.deepEqual(Buffer.from(await source.arrayBuffer()),pdf);
    await post('2026-10-21',bank,capital,'50.00');
    assert.equal((await service.get(saved.id)).current.ledger_changed,false,'future activity must not change an analysis through 20 October');
    const payment = await post('2026-10-20',expense,bank,'100.01');
    const changed = await service.get(saved.id);
    assert.equal(changed.current.ledger_changed,true);
    assert.equal(changed.current.book_balance,'900.04');
    assert.equal(changed.current.difference_book_minus_bank,'0.00');
    assert.deepEqual(changed.snapshot,snapshot,'proposals retain original evidence even after a matching payment is posted');
    assert.equal(changed.snapshot.posted,false);
    await pool.execute("UPDATE journal_entries SET status='cancelled' WHERE company_id=? AND id=?",[company.id,payment.id]);
    const cancelled = await service.get(saved.id);
    assert.equal(cancelled.current.ledger_changed,true);
    assert.equal(cancelled.current.book_balance,'1000.05','cancelled entries do not affect the balance');
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    for(const companyId of ids){
      for(const table of ['bank_reconciliations','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
      const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);
      for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);
      await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
    }
    await pool.end();
  }
});
