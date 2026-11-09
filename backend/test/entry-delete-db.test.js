import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createCompanyService} from '../src/services/companies.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createReportService} from '../src/services/reports.js';
import {createContextService} from '../src/services/context.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {createApp} from '../src/app.js';
const error=code=>cause=>cause.code===code;

test('MySQL entry deletion: explicit confirmation, permissions, linked documents, rollback and ledger update',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[];let server;
 try{
  const companies=createCompanyService(pool),company=await companies.createCompany({name:'Delete entries '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(company.id);
  const foreign=await companies.createCompany({name:'Foreign delete '+randomUUID(),exercise:{name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'}});ids.push(foreign.id);
  const [[year]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=?',[company.id]);
  const service=createAccountingService(pool,company.id),reports=createReportService(pool,company.id);
  const bank=await service.createAccount({code:'5720.0001',description:'Test bank'}),expense=await service.createAccount({code:'6260.0001',description:'Test expense'});
  const create=()=>service.createEntry({exercise_id:year.id,entry_date:'2026-01-02',description:'Manual delete test',request_id:randomUUID(),lines:[{account_id:expense.id,description:'Expense',debit:'10.00',credit:'0.00'},{account_id:bank.id,description:'Bank',debit:'0.00',credit:'10.00'}]});
  const body=entry=>({revision:entry.revision,confirm_number:String(entry.number)});
  let created=await create(),entry=await service.getEntry(created.id);
  await t.test('confirmation, stale revisions and company scope cannot remove records',async()=>{
   assert.equal(entry.deletable,true);
   await assert.rejects(service.removeEntry(entry.id,{...body(entry),confirm_number:'wrong'}),error('ENTRY_DELETE_CONFIRMATION'));
   await assert.rejects(service.removeEntry(entry.id,{...body(entry),revision:'0'.repeat(64)}),error('ENTRY_CHANGED'));
   await assert.rejects(createAccountingService(pool,foreign.id).removeEntry(entry.id,body(entry)),error('ENTRY_NOT_FOUND'));
   assert.equal((await service.getEntry(entry.id)).lines.length,2);
  });
  await t.test('HTTP requires the delete permission, then removes the header and lines and refreshes the ledger',async()=>{
   let allowed=false;
   const access=accessControl({current:async()=>({permissions:{accounting_write:true,entries_delete:allowed}})});
   server=createApp(createContextService(pool,company.id),service,companyScope(pool,company.id),access).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
   const request=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/entries/'+entry.id,{method:'DELETE',headers:{'Content-Type':'application/json','X-Company-Id':String(company.id)},body:JSON.stringify(body(entry))});
   assert.equal((await request()).status,403);allowed=true;
   const response=await request();assert.equal(response.status,200);assert.equal((await response.json()).deleted,true);
   await assert.rejects(service.getEntry(entry.id),error('ENTRY_NOT_FOUND'));
   const [[count]]=await pool.execute('SELECT COUNT(*) AS n FROM journal_lines WHERE company_id=? AND entry_id=?',[company.id,entry.id]);assert.equal(count.n,0);
   assert.equal((await reports.ledger({exercise_id:year.id,account_id:bank.id})).totals.closing,'0.00');
  });
  created=await create();entry=await service.getEntry(created.id);
  await t.test('failure after deleting lines rolls back the entire transaction',async()=>{
   const trigger='delete_entry_test_'+company.id;
   await pool.query(`CREATE TRIGGER ${trigger} BEFORE DELETE ON journal_entries FOR EACH ROW BEGIN IF OLD.company_id=${company.id} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Test rollback'; END IF; END`);
   try{await assert.rejects(service.removeEntry(entry.id,body(entry)));assert.equal((await service.getEntry(entry.id)).lines.length,2);}finally{await pool.query('DROP TRIGGER '+trigger);}
  });
  await t.test('invoice journals and reconciliation links are protected',async()=>{
   const invoice=await createInvoiceService(pool,company.id).create({exercise_id:year.id,direction:'received',reference:randomUUID(),invoice_date:'2026-01-02',party:{name:'Supplier'},request_id:randomUUID(),payment_method:'transfer',lines:[{description:'Test',base:'10.00',tax_rate:'0'}],receipts:[{due_date:'2026-01-03',amount:'10.00'}]});
   const linked=await service.getEntry(invoice.entry_id);assert.equal(linked.deletable,false);assert.equal(linked.delete_blocked_reason,'ENTRY_LINKED_DOCUMENT');await assert.rejects(service.removeEntry(linked.id,body(linked)),error('ENTRY_LINKED_DOCUMENT'));
   const source=Buffer.from('Test archive'),snapshot={posted_movements:[{entry_id:entry.id}],scope:{matched_movements:[]}};
   const [saved]=await pool.execute('INSERT INTO bank_reconciliations(company_id,exercise_id,account_id,source_name,source_sha256,source_pdf,snapshot,ledger_hash) VALUES (?,?,?,?,?,?,?,?)',[company.id,year.id,bank.id,'test.pdf',createHash('sha256').update(source).digest('hex'),source,JSON.stringify(snapshot),'0'.repeat(64)]);
   const reconciled=await service.getEntry(entry.id);assert.equal(reconciled.deletable,false);assert.equal(reconciled.delete_blocked_reason,'ENTRY_LINKED_RECONCILIATION');await assert.rejects(service.removeEntry(entry.id,body(reconciled)),error('ENTRY_LINKED_RECONCILIATION'));
   await pool.execute('DELETE FROM bank_reconciliations WHERE company_id=? AND id=?',[company.id,saved.insertId]);
  });
  await t.test('closed exercises prevent deletion',async()=>{
   await pool.execute("UPDATE accounting_exercises SET status='closed',is_default=0 WHERE company_id=? AND id=?",[company.id,year.id]);
   const closed=await service.getEntry(entry.id);assert.equal(closed.deletable,false);await assert.rejects(service.removeEntry(entry.id,body(closed)),error('EXERCISE_CLOSED'));
  });
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of ids){
   for(const table of ['bank_reconciliations','portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','company_details','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);
   const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const account of accounts)await pool.execute('DELETE FROM accounts WHERE id=?',[account.id]);
   await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);
  }
  await pool.end();
 }
});
