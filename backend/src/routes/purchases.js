import {Router,raw} from 'express';
import {requirePermission} from '../middleware/access.js';
import {HttpError} from '../middleware/errors.js';
import {createPurchaseMailIntake} from '../services/purchase-mail-intake.js';
export function purchaseRouter(){
 const router=Router();router.use((req,res,next)=>{requirePermission(req.user,'purchases_read');next();});
 router.get('/catalog',async(req,res)=>res.json(await req.purchases.catalog()));
 router.post('/units',async(req,res)=>res.status(201).json(await req.purchases.createUnit(req.body)));
 router.post('/items',async(req,res)=>res.status(201).json(await req.purchases.createItem(req.body)));
 router.get('/items/:id/prices',async(req,res)=>res.json(await req.purchases.prices(req.params.id)));
 router.post('/email/attachments',(req,res,next)=>{requirePermission(req.user,'purchases_write');next();},raw({type:['application/pdf','image/jpeg','image/png','application/octet-stream'],limit:'10mb'}),async(req,res)=>{
  const header=name=>{try{return decodeURIComponent(req.get(name)||'');}catch{throw new HttpError(400,'PURCHASE_MAIL_METADATA_INVALID');}};
  const job=await createPurchaseMailIntake(req.companyId,req.purchaseOcr).receive({mailbox:header('X-Mailbox-Id'),messageId:header('X-Message-Id'),attachmentId:header('X-Attachment-Id'),filename:header('X-File-Name'),content:req.body});
  res.status(202).json(job);
 });
 router.post('/ocr',raw({type:['application/pdf','image/jpeg','image/png','application/octet-stream'],limit:'10mb'}),async(req,res)=>{
  let name;try{name=decodeURIComponent(req.get('X-File-Name')||'document.pdf');}catch{throw new HttpError(400,'PURCHASE_INVALID_FILE');}
  const mode=req.get('X-Ocr-Mode');if(mode&&!['auto','tesseract'].includes(mode))throw new HttpError(400,'PURCHASE_INVALID_FILE');
  res.status(202).json(await req.purchaseOcr.start(req.body,name,req.get('X-Request-Id'),{forceOcr:mode==='tesseract'}));
 });
 router.get('/ocr/:id',async(req,res)=>res.json(await req.purchaseOcr.get(req.params.id)));
 router.post('/ocr/:id/retry',async(req,res)=>res.json(await req.purchaseOcr.retry(req.params.id)));
 router.get('/:kind/:id/audit',async(req,res)=>res.json(await req.purchases.audit(req.params.kind,req.params.id)));
 router.get('/:kind/:id/dependencies',async(req,res)=>res.json(await req.purchases.dependencies(req.params.kind,req.params.id)));
 router.get('/:kind',async(req,res)=>res.json(await req.purchases.list(req.params.kind)));
 router.get('/:kind/:id',async(req,res)=>res.json(await req.purchases.get(req.params.kind,req.params.id)));
 router.post('/:kind',async(req,res)=>res.status(201).json(await req.purchases.save(req.params.kind,null,req.body)));
 router.patch('/:kind/:id',async(req,res)=>res.json(await req.purchases.save(req.params.kind,req.params.id,req.body)));
 router.post('/:kind/:id/confirm',async(req,res)=>{if(req.params.kind==='invoices')requirePermission(req.user,'accounting_write');res.json(await req.purchases.confirm(req.params.kind,req.params.id,req.body));});
 router.post('/:kind/:id/cancel',async(req,res)=>res.json(await req.purchases.cancel(req.params.kind,req.params.id,req.body)));
 router.use((error,req,res,next)=>{if(error.code==='ER_DUP_ENTRY')return next(new HttpError(409,'PURCHASE_DUPLICATE'));next(error);});
 return router;
}
