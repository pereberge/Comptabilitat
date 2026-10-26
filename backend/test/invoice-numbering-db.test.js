import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import {config} from '../src/config.js';
import {createContextService} from '../src/services/context.js';
import {createExerciseService} from '../src/services/exercises.js';
import {createInvoiceService} from '../src/services/invoices.js';
import {createAccountingService} from '../src/services/accounting.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
const period=year=>({name:String(year),start_date:year+'-01-01',end_date:year+'-12-31'});
const error=code=>cause=>cause.code===code;
async function cleanup(pool,ids){for(const companyId of ids){for(const table of ['portfolio_settlements','portfolio_receipts','trade_invoice_lines','trade_invoices','journal_lines','journal_entries','accounting_exercises'])await pool.execute('DELETE FROM '+table+' WHERE company_id=?',[companyId]);const [accounts]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of accounts)await pool.execute('DELETE FROM accounts WHERE company_id=? AND id=?',[companyId,row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}}
function failingPool(pool){return {async getConnection(){const db=await pool.getConnection();return {execute(sql,args){if(sql.startsWith('INSERT INTO portfolio_receipts'))throw new Error('Injected numbering failure');return db.execute(sql,args);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};}
test('MySQL invoice numbers are consecutive, scoped, atomic and idempotent',{skip:process.env.TEST_MYSQL!=='1'},async t=>{
 const pool=mysql.createPool(config.database),ids=[],context=createContextService(pool,85);let server;
 try{
  const company=await context.createCompany({name:'Numbering '+randomUUID(),exercise:period(2026)}),foreign=await context.createCompany({name:'Other numbering '+randomUUID(),exercise:period(2026)}),imported=await context.createCompany({name:'Journal numbering '+randomUUID(),exercise:period(2026)});ids.push(company.id,foreign.id,imported.id);
  const year=(await context.getContext(company.id)).exercises[0],foreignYear=(await context.getContext(foreign.id)).exercises[0],importedYear=(await context.getContext(imported.id)).exercises[0],service=createInvoiceService(pool,company.id);
  const body=(reference,auto=false)=>({exercise_id:year.id,direction:'issued',reference,auto_reference:auto,invoice_date:'2026-10-15',party:{name:'Client',tax_id:'B12345674',address:'Address'},request_id:randomUUID(),lines:[{description:'Service',base:'100',tax_rate:'21'}],receipts:[{due_date:'2026-11-15',amount:'121'}]});
  let first,automatic;
  await t.test('opening the form proposes the first number without writing rows or reserving it',async()=>{
   const next=await service.nextReference(year.id);assert.equal(next.reference,'2026/0001');assert.equal(next.previous,null);assert.deepEqual(await service.nextReference(year.id),next);assert.deepEqual(await service.list({exercise_id:year.id}),[]);
   first=await service.create(body('F-0098'));assert.equal((await service.nextReference(year.id)).reference,'F-0099');
  });
  await t.test('simultaneous automatic invoices receive different consecutive numbers with receipts',async()=>{
   const a=body('F-0099',true),b=body('F-0099',true),results=await Promise.all([service.create(a),service.create(b)]);assert.deepEqual(results.map(row=>row.reference).sort(),['F-0099','F-0100']);assert.ok(results.every(row=>row.receipts.length===1));automatic={body:a,invoice:results[0]};
   const replay=await service.create({...a,reference:'F-9999'});assert.equal(replay.id,results[0].id);assert.equal(replay.reference,results[0].reference);assert.equal(replay.replayed,true);await assert.rejects(service.create({...a,party:{name:'Changed'}}),error('REQUEST_CONFLICT'));
  });
  await t.test('failed creation consumes no number and voided invoice numbers remain reserved',async()=>{
   assert.equal((await service.nextReference(year.id)).reference,'F-0101');await assert.rejects(createInvoiceService(failingPool(pool),company.id).create(body('',true)),/Injected numbering failure/);assert.equal((await service.nextReference(year.id)).reference,'F-0101');
   const created=await service.create(body('',true));assert.equal(created.reference,'F-0101');await service.void(created.id,{exercise_id:year.id,date:'2026-10-16',reason:'Correction',request_id:randomUUID()});assert.equal((await service.nextReference(year.id)).reference,'F-0102');
  });
  await t.test('manual numbers keep their exact format and received invoices do not alter issued numbering',async()=>{
   await service.create(body('ALT-0049'));assert.equal((await service.nextReference(year.id)).reference,'ALT-0050');await service.create({...body('SUP-9999'),direction:'received',party_parent:'4000',party:{name:'Supplier'}});assert.equal((await service.nextReference(year.id)).reference,'ALT-0050');
   await assert.rejects(service.create({...body('',true),direction:'received'}),error('INVALID_INVOICE_NUMBERING'));await assert.rejects(service.create({...body('',true),auto_reference:'true'}),error('INVALID_INVOICE_NUMBERING'));
  });
  await t.test('company and year scopes are independent and the suggestion route cannot be mistaken for an invoice ID',async()=>{
   const other=createInvoiceService(pool,foreign.id);assert.equal((await other.nextReference(foreignYear.id)).reference,'2026/0001');await assert.rejects(other.nextReference(year.id),error('EXERCISE_NOT_FOUND'));
   const next=await createExerciseService(pool,company.id).create(period(2027));assert.equal((await service.nextReference(next.id)).reference,'2027/0001');
   server=createApp(context,createAccountingService(pool,company.id),companyScope(pool,company.id)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port+'/api';
   const response=await fetch(base+'/invoices/next-reference?exercise_id='+year.id,{headers:{'X-Company-Id':String(company.id)}});assert.equal(response.status,200);assert.equal((await response.json()).reference,'ALT-0050');assert.equal((await fetch(base+'/invoices/next-reference?exercise_id='+year.id,{headers:{'X-Company-Id':String(foreign.id)}})).status,404);
   const created=await fetch(base+'/invoices',{method:'POST',headers:{'X-Company-Id':String(company.id),'Content-Type':'application/json'},body:JSON.stringify(body('ignored',true))});assert.equal(created.status,201);assert.equal((await created.json()).reference,'ALT-0050');
  });
  await t.test('journal imports supply known issued numbers and warn about unidentified newer invoices',async()=>{
   const accounting=createAccountingService(pool,imported.id),client=await accounting.createAccount({code:'4300.0001',description:'Imported client'}),sales=await accounting.createAccount({code:'7000.0001',description:'Sales'}),post=(description,date)=>accounting.createEntry({exercise_id:importedYear.id,entry_date:date,description,request_id:randomUUID(),lines:[{account_id:client.id,description:'Client',debit:'100',credit:'0'},{account_id:sales.id,description:'Sales',debit:'0',credit:'100'}]});
   await post('N/ FAC. Nº A-0240. CLIENT','2026-08-27');await post('N/ FAC. Nº . CLIENT','2026-09-26');const legacy=createInvoiceService(pool,imported.id),next=await legacy.nextReference(importedYear.id);assert.equal(next.reference,'A-0241');assert.equal(next.previous.source,'journal');assert.equal(next.warnings.length,1);
   const manual=await legacy.create({...body('MANUAL'),exercise_id:importedYear.id,party_account_id:client.id});await legacy.void(manual.id,{exercise_id:importedYear.id,date:'2026-10-16',reason:'Discard manual reference',request_id:randomUUID()});assert.equal((await legacy.nextReference(importedYear.id)).reference,'A-0241');
   const saved=await legacy.create({...body('',true),exercise_id:importedYear.id,party_account_id:client.id});assert.equal(saved.reference,'A-0241');assert.equal((await legacy.nextReference(importedYear.id)).reference,'A-0242');
  });
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await cleanup(pool,ids);await pool.end();}
});
