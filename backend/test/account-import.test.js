import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { extractPdf, extractPage } from '../src/services/pdf-accounts.js';
import { createAccountImportService, classifyImport } from '../src/services/account-import.js';
import { createAccountingService } from '../src/services/accounting.js';
import { createContextService } from '../src/services/context.js';
import { createApp } from '../src/app.js';
import { companyScope } from '../src/middleware/company-scope.js';

// Small real text PDF, generated without another PDF library or business data.
function pdf(rows) {
 const text=(value,x,y)=>`BT /F1 9 Tf ${x} ${y} Td (${value.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)')}) Tj ET`;
 const content=[text('LISTADO DE SUBCUENTAS',325,534),text('Empresa :',46,519),text('Test company',100,519),text('Subcuenta',36,475),text('Concepto',145,474),text('NIF / CIF',302,474),...rows.flatMap((row,i)=>[text(row.code,32,457-i*11),text(row.description,81,457-i*11),text('B12345678',289,457-i*11)])].join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
 let document='%PDF-1.4\n',offsets=[0];
 for(const [i,object] of objects.entries()){offsets.push(Buffer.byteLength(document));document+=`${i+1} 0 obj\n${object}\nendobj\n`;}
 const xref=Buffer.byteLength(document);document+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return Buffer.from(document);
}
const source=pdf([{code:'43000001',description:'First customer'},{code:'43000002',description:'Second customer'}]);

test('PDF adapter extracts codes/names, ignores tax fields and preserves zeros',async()=>{
 const result=await extractPdf(source);
 assert.equal(result.pages,1);assert.equal(result.source_company,'Test company');
 assert.deepEqual(result.rows,[{code:'43000001',description:'First customer',page:1},{code:'43000002',description:'Second customer',page:1}]);
 await assert.rejects(extractPdf(Buffer.from('invalid')),/PDF_INVALID/);
 assert.throws(()=>extractPage([],1),/PDF_UNSUPPORTED_LAYOUT/);
});
test('preview classifies duplicate codes, existing names and invalid hierarchy',()=>{
 const rows=[{code:'43000001',description:'New name'},{code:'43000002',description:'Two'},{code:'43000002',description:'Two'},{code:'43000002',description:'Different'},{code:'bad',description:'Bad'}];
 const result=classifyImport(rows,[{code:'43000001',description:'Original',kind:'subaccount'}],8,4);
 assert.deepEqual(result.map(row=>row.status),['existing','new','duplicate','invalid','invalid']);
 assert.equal(result[0].reason,'DIFFERENT_DESCRIPTION');assert.equal(result[1].suffix,'0002');
 assert.equal(classifyImport([rows[1]],[{code:'4300',kind:'subaccount'}],8,4)[0].reason,'INVALID_PARENT');
});
const supplied=new URL('../../Informe.pdf',import.meta.url);
test('supplied PDF: all 202 accounts on 5 pages are readable',{skip:!existsSync(supplied)},async()=>{
 const result=await extractPdf(readFileSync(supplied));assert.equal(result.pages,5);assert.equal(result.rows.length,202);
 assert.equal(new Set(result.rows.map(row=>row.code)).size,202);
 assert.ok(result.rows.every(row=>/^\d{8}$/.test(row.code)&&row.description));
 assert.equal(result.rows[0].code,'10000000');assert.equal(result.rows.at(-1).code,'77100000');
});
test('MySQL PDF import: preview, company isolation, idempotence and atomic rollback',{skip:process.env.TEST_MYSQL!=='1'},async()=>{
 const pool=mysql.createPool(config.database);const companies=[];let server;
 try{
  for(let i=0;i<3;i++){const [row]=await pool.execute('INSERT INTO companies(name) VALUES (?)',['PDF integration '+i]);companies.push(row.insertId);}
  const [first,second,third]=companies;
  const imports=createAccountImportService(pool,first),accounting=createAccountingService(pool,first);
  const existing=await accounting.createAccount({code:'430.00001',description:'Original name'});
  const before=(await accounting.listAccounts()).length;
  const preview=await imports.preview(source,'4');
  assert.equal((await accounting.listAccounts()).length,before);
  assert.deepEqual(preview.rows.map(row=>row.status),['existing','new']);
  await assert.rejects(createAccountImportService(pool,second).commit(preview.token),e=>e.code==='PDF_PREVIEW_EXPIRED');
  const results=await Promise.all([imports.commit(preview.token),imports.commit(preview.token)]);
  assert.deepEqual(results,[{imported:1,skipped:1},{imported:1,skipped:1}]);
  const preserved=await accounting.getAccount(existing.id);assert.equal(preserved.description,'Original name');assert.equal(preserved.parent_code,'430');
  const added=(await accounting.listAccounts()).find(a=>a.code==='43000002');assert.equal(added.parent_code,'4300');
  const repeated=await imports.preview(source,'4');assert.deepEqual(await imports.commit(repeated.token),{imported:0,skipped:2});
  const bad=await imports.preview(pdf([{code:'45000001',description:'Valid'},{code:'bad',description:'Invalid'}]),'4');
  const count=(await accounting.listAccounts()).length;
  await assert.rejects(imports.commit(bad.token),e=>e.code==='PDF_INVALID_ROWS');assert.equal((await accounting.listAccounts()).length,count);
  const failingPool={execute:pool.execute.bind(pool),async getConnection(){const db=await pool.getConnection();return {execute(sql,params){if(sql.includes("'subaccount'")&&params?.[1]==='43000002')throw new Error('Injected failure');return db.execute(sql,params);},beginTransaction:()=>db.beginTransaction(),commit:()=>db.commit(),rollback:()=>db.rollback(),release:()=>db.release()};}};
  const failing=createAccountImportService(failingPool,second);const failed=await failing.preview(source,'4');await assert.rejects(failing.commit(failed.token),/Injected failure/);
  assert.equal((await createAccountingService(pool,second).listAccounts()).length,0);
  await assert.rejects(imports.preview(source,'8'),e=>e.code==='PDF_INVALID_PREFIX');
  await assert.rejects(imports.preview(Buffer.from('not pdf'),'4'),e=>e.code==='PDF_INVALID');
  if(existsSync(supplied)){
   const actual=createAccountImportService(pool,third);const data=await actual.preview(readFileSync(supplied),'4');
   assert.equal(data.rows.filter(row=>row.status==='new').length,202);assert.equal(data.rows.filter(row=>row.status==='invalid').length,0);
   assert.equal((await actual.commit(data.token)).imported,202);
   const subaccounts=await createAccountingService(pool,third).listAccounts({kind:'subaccount'});assert.equal(subaccounts.length,202);
   assert.ok(subaccounts.every(row=>row.parent_code.length===4));
  }
  server=createApp(createContextService(pool,first),accounting,companyScope(pool,first)).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port+'/api/account-import/';
  const response=await fetch(url+'preview?prefix_length=4',{method:'POST',headers:{'Content-Type':'application/pdf'},body:source});assert.equal(response.status,200);
  const data=await response.json();const imported=await fetch(url+'commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:data.token,rows:[{code:'99999999'}]})});
  assert.equal(imported.status,200);assert.equal((await imported.json()).imported,0);
  const wrong=await fetch(url+'preview',{method:'POST',headers:{'Content-Type':'application/pdf'},body:'invalid'});assert.equal(wrong.status,400);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const companyId of companies){const [rows]=await pool.execute('SELECT id FROM accounts WHERE company_id=? ORDER BY LENGTH(code) DESC',[companyId]);for(const row of rows)await pool.execute('DELETE FROM accounts WHERE id=?',[row.id]);await pool.execute('DELETE FROM companies WHERE id=?',[companyId]);}
  await pool.end();
 }
});
