import {Router,json} from 'express';
import {randomUUID} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {authenticateIntegration} from './auth.js';
import {createIntegrationReceptionService,integrationEvent} from './received-invoices.js';

export function integrationRouter(pool,options){
 const router=Router(),service=createIntegrationReceptionService(pool,{companyDatabases:options.companyDatabases}),limits=new Map();
 router.use((req,res,next)=>{
  req.integrationRequestId=randomUUID();res.set('X-Request-Id',req.integrationRequestId).set('Cache-Control','no-store');
  res.on('finish',()=>{void integrationEvent(pool,{requestId:req.integrationRequestId,clientId:req.integrationClient?.clientId,companyId:req.integrationCompanyId,actor:'service',action:'api_access',status:res.statusCode,code:res.locals.integrationError||null}).catch(()=>console.error('Integration audit unavailable'));});
  const key=req.ip||'unknown',now=Date.now(),item=limits.get(key);const bucket=item&&item.until>now?item:{count:0,until:now+60000};bucket.count++;limits.set(key,bucket);
  if(limits.size>10000)for(const [ip,value]of limits)if(value.until<=now)limits.delete(ip);
  if(bucket.count>120){res.set('Retry-After','60');return next(new HttpError(429,'INTEGRATION_RATE_LIMIT'));}
  try{req.integrationClient=authenticateIntegration(req,options.clients,{production:options.production});next();}catch(error){next(error);}
 });
 router.use(json({limit:'128kb',strict:true}));
 router.post('/invoices/received',async(req,res)=>{
  if(!req.is('application/json'))throw new HttpError(415,'INTEGRATION_JSON_REQUIRED');
  const result=await service.receive(req.integrationClient,req.body,req.integrationRequestId);req.integrationCompanyId=result.companyId;
  res.status(result.replayed?200:201).json({data:result,requestId:req.integrationRequestId});
 });
 router.use((req,res,next)=>next(new HttpError(404,'INTEGRATION_ENDPOINT_NOT_FOUND')));
 router.use((error,req,res,next)=>{
  if(res.headersSent)return next(error);
  let status=error instanceof HttpError?error.status:error.type==='entity.too.large'?413:error.type==='entity.parse.failed'?400:503;
  const code=error instanceof HttpError?error.code:error.type==='entity.too.large'?'INTEGRATION_PAYLOAD_TOO_LARGE':error.type==='entity.parse.failed'?'INTEGRATION_INVALID_JSON':'INTEGRATION_DATABASE_UNAVAILABLE';
  if(status===401)res.set('WWW-Authenticate','Bearer realm="integrations"');
  res.locals.integrationError=code;
  res.status(status).json({error:{code,...(error.field?{field:error.field}:{})},requestId:req.integrationRequestId});
 });
 return router;
}
