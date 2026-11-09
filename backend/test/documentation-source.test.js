import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {invoicePdf} from '../test-support/invoice-fixture.js';

test('document source previews verified PDFs, downloads originals and preserves company access',async()=>{
 const pdf=invoicePdf('Test company','PDF-TEST'),fake=Buffer.from('<html>Not a PDF</html>');
 const documents=[{id:219,company_id:1,source_name:'Factura "novembre".pdf',source_mime:'application/octet-stream',content:pdf},
  {id:220,company_id:2,source_name:'empresa-2.pdf',source_mime:'application/pdf',content:pdf},
  {id:221,company_id:1,source_name:'false.pdf',source_mime:'application/pdf',content:fake}];
 const db={async execute(sql,args){
  if(sql==='SELECT id FROM companies WHERE id=?')return [[{id:args[0]}]];
  assert.match(sql,/FROM company_documents WHERE company_id=\? AND id=\?/);
  return [documents.filter(row=>row.company_id===args[0]&&row.id===args[1])];
 }};
 let user={role:'user',key:'test',company_ids:[1,2],permissions:{}};
 const access=accessControl({current:async()=>user});
 const server=createApp({},null,companyScope(db,1,{automaticBackups:{forCompany:()=>({})}}),access).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const get=(id,company,download='')=>fetch('http://127.0.0.1:'+server.address().port+'/api/documentation/'+id+'/source'+download,{headers:{'X-Company-Id':String(company)}});
 try{
  for(const [id,company] of [[219,1],[220,2]])for(const download of ['', '?download=1']){
   const response=await get(id,company,download);assert.equal(response.status,200);
   assert.equal(response.headers.get('content-type'),'application/pdf');
   assert.match(response.headers.get('content-disposition'),download?/^attachment; filename="factura.pdf"/:/^inline; filename="factura.pdf"/);
   assert.equal(response.headers.get('x-content-type-options'),'nosniff');
   assert.equal(response.headers.get('cache-control'),'no-store');
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),pdf);
  }
  const forged=await get(221,1);assert.equal(forged.headers.get('content-type'),'application/octet-stream');assert.match(forged.headers.get('content-disposition'),/^attachment;/);assert.deepEqual(Buffer.from(await forged.arrayBuffer()),fake);
  for(const download of ['', '?download=1']){
   user={...user,company_ids:[1,2]};
   assert.equal((await get(219,2,download)).status,404);
   user={...user,company_ids:[1]};assert.equal((await get(220,2,download)).status,403);
  }
  user=null;assert.equal((await get(219,1)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
