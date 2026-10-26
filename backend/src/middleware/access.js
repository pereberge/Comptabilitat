import {Router,json} from 'express';
import {HttpError} from './errors.js';
const cookieName='accounting_session';
function token(req){const value=(req.headers.cookie||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(cookieName+'='))?.slice(cookieName.length+1);return /^[a-f0-9]{64}$/.test(value||'')?value:null;}
export const requirePermission=(user,key)=>{if(!user?.permissions[key])throw new HttpError(403,'PERMISSION_DENIED');};
export const requireMaster=user=>{if(user?.role!=='master')throw new HttpError(403,'PERMISSION_DENIED');};
function normalizedPath(path){return path.toLowerCase().split('/').filter(Boolean).join('/');}
export function requiredPermission(method,path){
 const normalized=normalizedPath(path),parts=normalized.split('/'),[area,,action,detail]=parts;
 if(area==='master')return 'users_manage';
 if(area==='invoices'&&['delete','delete-preview'].includes(action))return 'invoice_delete';
 if(['GET','HEAD','OPTIONS'].includes(method))return area==='exercises'&&action==='clear'&&detail==='preview'||area==='exercise-clears'&&action==='backup'?'exercise_clear':null;
 if(area==='farms'&&['preview','import'].includes(parts[1]))return 'data_import';
 if(area==='exercises'&&action==='clear')return 'exercise_clear';
 if(normalized==='exercises')return 'exercise_create';
 if(area==='exercises'&&action==='operations')return 'exercise_operations';
 if(area==='data-backups'&&parts[1]==='automatic')return 'accounting_write';
 if(['data-backups','journal-import','account-import','bank-import'].includes(area))return normalized.endsWith('/discard')?null:'data_import';
 if(area==='invoices'&&action==='email-draft')return null;
 return 'accounting_write';
}
export function accessControl(service){
 const router=Router();router.use(json({limit:'8kb'}));
 const sameSite=(req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('Sec-Fetch-Site')==='cross-site')throw new HttpError(403,'PERMISSION_DENIED');next();};
 const cookie=(req,res,result)=>{res.cookie(cookieName,result.token,{httpOnly:true,sameSite:'strict',secure:req.secure,path:'/api',maxAge:12*60*60*1000});return res.json(result.state);};
 router.use(sameSite);
 router.get('/session',async(req,res)=>res.json(await service.state(token(req))));
 router.post('/switch',async(req,res)=>cookie(req,res,await service.switchTo(req.body?.key,req.body?.password,token(req),req.ip)));
 router.post('/setup-master',async(req,res)=>cookie(req,res,await service.setup(req.body?.password,token(req),req.ip)));
 router.get('/users',async(req,res)=>res.json(await service.users(await service.current(token(req)))));
 router.patch('/users/:key',async(req,res)=>res.json(await service.update(await service.current(token(req)),req.params.key,req.body)));
 router.post('/password',async(req,res)=>cookie(req,res,await service.changePassword(await service.current(token(req)),req.body?.current_password,req.body?.new_password,token(req),req.ip)));
 return {router,async middleware(req,res,next){
  sameSite(req,res,()=>{});
  if(req.path==='/health')return next();
  req.user=await service.current(token(req));
  const permission=requiredPermission(req.method,req.path);if(permission)requirePermission(req.user,permission);
  if(req.method==='POST'&&normalizedPath(req.path)==='exercises'&&req.body?.opening_from_exercise_id)requirePermission(req.user,'exercise_operations');
  if(req.method==='POST'&&normalizedPath(req.path)==='data-backups/preview'&&req.query.replace_existing==='1')requirePermission(req.user,'exercise_clear');
  next();
 }};
}
