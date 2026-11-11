import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {purchaseRouter} from '../src/routes/purchases.js';
import {requiredPermission,requirePermission} from '../src/middleware/access.js';
import {errorHandler} from '../src/middleware/errors.js';

test('supplier preparation requires purchase write and accounting write permissions',async()=>{
 let permissions={purchases_read:true,purchases_write:true},created=0;
 const app=express();app.use(express.json());app.use('/api',(req,res,next)=>{req.user={permissions};requirePermission(req.user,requiredPermission(req.method,req.path));req.purchases={createSupplier:async()=>{created++;return {id:21};}};next();});app.use('/api/purchases',purchaseRouter());app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const request=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/purchases/suppliers',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal((await request()).status,403);assert.equal(created,0);
  permissions.accounting_write=true;assert.equal((await request()).status,201);assert.equal(created,1);
  permissions.purchases_write=false;assert.equal((await request()).status,403);assert.equal(created,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('purchase mutations and dependency inspection use the intended permissions',()=>{
 for(const [method,path,permission] of [['GET','/purchases/orders/7/dependencies','purchases_read'],['POST','/purchases/email/attachments','purchases_write'],['POST','/purchases/ocr/7/retry','purchases_write'],['POST','/purchases/invoices/7/confirm','purchases_confirm']])assert.equal(requiredPermission(method,path),permission);
});
test('upload forwards explicit Tesseract mode and rejects unknown modes',async()=>{
 const received=[],app=express();app.use((req,res,next)=>{req.user={permissions:{purchases_read:true}};req.purchaseOcr={async start(buffer,name,key,options){received.push({name,options});return {id:1,status:'queued'};}};next();});
 app.use('/api/purchases',purchaseRouter());app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{for(const mode of ['tesseract','auto','invalid']){const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/purchases/ocr',{method:'POST',headers:{'Content-Type':'application/pdf','X-File-Name':'invoice.pdf','X-Ocr-Mode':mode},body:Buffer.from('%PDF-1.7\n%%EOF')});assert.equal(response.status,mode==='invalid'?400:202);}
  assert.deepEqual(received,[{name:'invoice.pdf',options:{forceOcr:true}},{name:'invoice.pdf',options:{forceOcr:false}}]);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('invoice confirmation requires both purchase confirmation and accounting write permission',async()=>{
 let permissions={purchases_read:true},confirmations=0;const app=express();app.use(express.json());
 app.use('/api',(req,res,next)=>{req.user={permissions};const permission=requiredPermission(req.method,req.path);if(permission)requirePermission(req.user,permission);req.purchases={catalog:async()=>({}),save:async()=>({status:'draft'}),confirm:async()=>{confirmations++;return {status:'confirmed'};}};next();});app.use('/api/purchases',purchaseRouter());app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const request=(path,method='POST')=>fetch('http://127.0.0.1:'+server.address().port+'/api/purchases'+path,{method,headers:{'Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});
  assert.equal((await request('/catalog','GET')).status,200);assert.equal((await request('/orders')).status,403);assert.equal((await request('/invoices/7/confirm')).status,403);
  permissions={purchases_read:true,purchases_confirm:true};assert.equal((await request('/invoices/7/confirm')).status,403);assert.equal(confirmations,0);
  permissions.accounting_write=true;assert.equal((await request('/invoices/7/confirm')).status,200);assert.equal(confirmations,1);
  permissions.purchases_read=false;assert.equal((await request('/invoices/7/confirm')).status,403);assert.equal(confirmations,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
