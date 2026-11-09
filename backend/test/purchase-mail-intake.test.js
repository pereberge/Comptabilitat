import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import express from 'express';
import {createPurchaseMailIntake} from '../src/services/purchase-mail-intake.js';
import {purchaseRouter} from '../src/routes/purchases.js';
import {errorHandler,HttpError} from '../src/middleware/errors.js';

const attachment=()=>({mailbox:'purchases',messageId:'<message-1@example.test>',attachmentId:'part-1',filename:'factura.pdf',content:Buffer.from('%PDF-1.7\n%%EOF')});
function simulatedOcr(){
 const calls=[],jobs=new Map();return {calls,async start(content,filename,key){
  calls.push({content,filename,key});const hash=createHash('sha256').update(content).digest('hex');
  if(jobs.has(key)){const prior=jobs.get(key);if(prior.hash!==hash)throw new HttpError(409,'REQUEST_CONFLICT');return prior.job;}
  const job={id:jobs.size+1,status:'queued',request_id:key};jobs.set(key,{hash,job});return job;
 }};
}
test('mail attachments reuse OCR with stable retry IDs scoped by company, mailbox, message and attachment',async()=>{
 const ocr=simulatedOcr(),input=attachment(),before=Buffer.from(input.content),intake=createPurchaseMailIntake(85,ocr);
 const first=await intake.receive(input),retry=await intake.receive(input);assert.equal(first.id,retry.id);assert.equal(first.intake_channel,'email');assert.equal(first.status,'queued');assert.deepEqual(input.content,before);
 assert.match(first.request_id,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
 await createPurchaseMailIntake(86,ocr).receive(input);await intake.receive({...input,mailbox:'other'});await intake.receive({...input,messageId:'message-2'});await intake.receive({...input,attachmentId:'part-2'});
 assert.equal(new Set(ocr.calls.map(call=>call.key)).size,5);
 await assert.rejects(intake.receive({...input,content:Buffer.from('%PDF-1.7\nchanged')}),error=>error.code==='REQUEST_CONFLICT');
});
test('bad metadata, disguised files and oversized content fail before reaching OCR',async()=>{
 const ocr=simulatedOcr(),intake=createPurchaseMailIntake(85,ocr);
 for(const patch of [{messageId:''},{mailbox:'box\nheader'},{attachmentId:'x'.repeat(201)},{filename:'../file.pdf'},{filename:'file.exe'},{filename:'file.png'},{content:Buffer.from('not a PDF')},{content:Buffer.alloc(10*1024*1024+1)}])await assert.rejects(intake.receive({...attachment(),...patch}));
 assert.equal(ocr.calls.length,0);
});
test('attachment endpoint requires write permission and uses authenticated company scope',async()=>{
 const ocr=simulatedOcr(),app=express();let write=false;
 app.use((req,res,next)=>{req.companyId=85;req.purchaseOcr=ocr;req.user={permissions:{purchases_read:true,purchases_write:write}};next();});app.use('/api/purchases',purchaseRouter());app.use(errorHandler);
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{
  const request=()=>fetch('http://127.0.0.1:'+server.address().port+'/api/purchases/email/attachments',{method:'POST',headers:{'Content-Type':'application/pdf','X-Mailbox-Id':'purchases','X-Message-Id':'message-1','X-Attachment-Id':'part-1','X-File-Name':'factura.pdf'},body:attachment().content});
  assert.equal((await request()).status,403);assert.equal(ocr.calls.length,0);write=true;
  const response=await request();assert.equal(response.status,202);assert.equal((await response.json()).intake_channel,'email');assert.equal(ocr.calls[0].key,(await createPurchaseMailIntake(85,ocr).receive({...attachment(),messageId:'message-1'})).request_id);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
