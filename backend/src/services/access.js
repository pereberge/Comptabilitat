import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {HttpError} from '../middleware/errors.js';
import {editablePermissions,permissionsFor} from '../../../shared/access-permissions.js';
import {normalizePassword} from '../../../shared/access-passwords.js';
export {mysqlAccessStore} from './access-store.js';
const scrypt=promisify(scryptCallback),lifetime=12*60*60*1000;
const fail=(status,code)=>{throw new HttpError(status,code);};
export async function passwordHash(password){
 if(typeof password!=='string'||password.length<1||password.length>128)fail(400,'ACCESS_PASSWORD_LENGTH');
 const salt=randomBytes(16).toString('hex'),key=await scrypt(normalizePassword(password),salt,64);return 'scrypt-ci:'+salt+':'+key.toString('hex');
}
export async function passwordMatches(password,hash){
 if(typeof password!=='string'||password.length<1||password.length>128||!/^(scrypt|scrypt-ci):[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash||''))return false;
 const [kind,salt,expected]=hash.split(':'),actual=await scrypt(kind==='scrypt-ci'?normalizePassword(password):password,salt,64);return timingSafeEqual(Buffer.from(expected,'hex'),actual);
}
const publicUser=row=>({key:row.user_key,username:row.username,name:row.name,email:row.email||'',role:row.role,active:!!row.active,version:row.version,password_set:!!row.password_hash,company_ids:row.role==='master'?null:[...(row.company_ids||[])],permissions:permissionsFor(row)});
const digest=token=>createHash('sha256').update(token).digest('hex');
function administrator(user){if(!user)fail(401,'ACCESS_LOGIN_REQUIRED');if(user.role!=='master')fail(403,'PERMISSION_DENIED');}
function username(value){if(typeof value!=='string')fail(400,'ACCESS_INVALID_USERNAME');const name=value.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._@+-]{2,79}$/.test(name))fail(400,'ACCESS_INVALID_USERNAME');return name;}
function displayName(value){if(typeof value!=='string'||!value.trim()||value.trim().length>60||/[\u0000-\u001f\u007f]/.test(value))fail(400,'ACCESS_INVALID_NAME');return value.trim();}
function email(value){if(value===undefined||value===null)return null;if(typeof value!=='string')fail(400,'ACCESS_INVALID_EMAIL');const normalized=value.trim().toLowerCase();if(!normalized)return null;if(normalized.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)||/[\u0000-\u001f\u007f]/.test(normalized))fail(400,'ACCESS_INVALID_EMAIL');return normalized;}
function permissions(value){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==editablePermissions.length||editablePermissions.some(item=>typeof value[item.key]!=='boolean')||Object.keys(value).some(key=>!editablePermissions.some(item=>item.key===key)))fail(400,'ACCESS_INVALID_PERMISSIONS');return Object.fromEntries(editablePermissions.map(item=>[item.key,value[item.key]]));}
function companyIds(value){if(!Array.isArray(value)||value.length>1000||value.some(id=>!Number.isSafeInteger(id)||id<1||id>4294967295)||new Set(value).size!==value.length)fail(400,'ACCESS_INVALID_COMPANIES');return [...value].sort((a,b)=>a-b);}
export function createAccessService(store){
 const attempts=new Map();let dummy;
 const checkAttempts=client=>{const item=attempts.get(client);if(item&&item.until>Date.now()&&item.count>=5)fail(429,'ACCESS_TOO_MANY_ATTEMPTS');};
 const failed=client=>{const now=Date.now(),old=attempts.get(client);attempts.set(client,{count:old&&old.until>now?old.count+1:1,until:old&&old.until>now?old.until:now+15*60*1000});if(attempts.size>2000)for(const [key,item]of attempts)if(item.until<now)attempts.delete(key);};
 async function current(token){const row=token?await store.session(digest(token)):null;return row&&row.active&&row.password_hash?publicUser(row):null;}
 async function state(token){const user=await current(token),master=await store.user('master');return {user,users:user?.role==='master'?(await store.users()).map(row=>({key:row.user_key,username:row.username,name:row.name,role:row.role,active:!!row.active})):[],master_setup_required:!master?.password_hash};}
 async function login(value,password,token,client='local'){
  let name;try{name=username(value);}catch{name='';}const attemptKey=client+':'+name;checkAttempts(attemptKey);
  let row=name?await store.byUsername(name):null;
  dummy??=passwordHash(randomBytes(32).toString('hex'));
  const valid=await passwordMatches(password,row?.password_hash||await dummy);
  if(!row||!row.active||!row.password_hash||!valid){failed(attemptKey);fail(401,'ACCESS_BAD_PASSWORD');}
  if(row.password_hash.startsWith('scrypt:')){
   const upgraded=await passwordHash(password);
   if(await store.upgradePassword(row.user_key,row.password_hash,upgraded))row={...row,password_hash:upgraded};
   else{row=await store.user(row.user_key);if(!row?.active||!await passwordMatches(password,row.password_hash))fail(401,'ACCESS_PASSWORD_CHANGED');}
  }
  attempts.delete(attemptKey);
  const next=randomBytes(32).toString('hex'),expires=new Date(Date.now()+lifetime).toISOString().slice(0,19).replace('T',' ');
  if(await store.saveSession(digest(next),row.user_key,expires,row.password_hash)===false)fail(401,'ACCESS_PASSWORD_CHANGED');
  if(token)await store.removeSession(digest(token));return {token:next,state:await state(next)};
 }
 return {state,current,login,
  switchTo:(key,password,token,client)=>login(key,password,token,client),
  async logout(token){if(token)await store.removeSession(digest(token));return state();},
  async setup(password,token,client){const master=await store.user('master');if(master?.password_hash)fail(409,'ACCESS_ALREADY_CONFIGURED');checkAttempts(client||'setup');const hash=await passwordHash(password);if(!await store.setup(hash))fail(409,'ACCESS_ALREADY_CONFIGURED');return login(master.username,password,token,client);},
  async users(user){administrator(user);return (await store.users()).map(publicUser);},
  async create(user,body){
   administrator(user);if(!body||Object.keys(body).some(key=>!['username','name','email','password','active','permissions','company_ids'].includes(key))||typeof body.active!=='boolean')fail(400,'ACCESS_INVALID_USER');
   const data={user_key:randomBytes(8).toString('hex'),username:username(body.username),name:displayName(body.name),email:email(body.email),password_hash:await passwordHash(body.password),active:body.active,permissions:permissions(body.permissions),company_ids:companyIds(body.company_ids)};
   await store.create(data);return publicUser(await store.user(data.user_key));
  },
  async update(user,key,body){
   administrator(user);if(!body||Object.keys(body).some(field=>!['username','name','email','password','active','permissions','company_ids','version'].includes(field)))fail(400,'ACCESS_INVALID_USER');
   const previous=await store.user(key);if(!previous)fail(404,'ACCESS_USER_NOT_FOUND');if(previous.version!==body.version)fail(409,'ACCESS_USER_CHANGED');
   if(previous.role==='master'){
    if(Object.keys(body).some(field=>!['name','email','version'].includes(field)))fail(409,'ACCESS_MASTER_PROTECTED');
    await store.update(key,{username:previous.username,name:body.name===undefined?previous.name:displayName(body.name),email:body.email===undefined?previous.email??null:email(body.email),active:true,permissions:{},company_ids:[],password_hash:null},body.version);
   }else{
    const active=body.active===undefined?!!previous.active:body.active;if(typeof active!=='boolean')fail(400,'ACCESS_INVALID_USER');
    const password=body.password===undefined||body.password===''?null:await passwordHash(body.password);
    await store.update(key,{username:body.username===undefined?previous.username:username(body.username),name:body.name===undefined?previous.name:displayName(body.name),email:body.email===undefined?previous.email??null:email(body.email),active,permissions:body.permissions===undefined?Object.fromEntries(editablePermissions.map(item=>[item.key,permissionsFor(previous)[item.key]])):permissions(body.permissions),company_ids:body.company_ids===undefined?previous.company_ids:companyIds(body.company_ids),password_hash:password},body.version);
   }
   return publicUser(await store.user(key));
  },
  async remove(user,key,body){administrator(user);if(key==='master')fail(409,'ACCESS_MASTER_PROTECTED');await store.remove(key,body?.version);return {deleted:true};},
  async changePassword(user,currentPassword,nextPassword,token,client='password'){
   if(!user)fail(401,'ACCESS_LOGIN_REQUIRED');const attemptKey=client+':'+user.username;checkAttempts(attemptKey);const row=await store.user(user.key);
   if(!row||!await passwordMatches(currentPassword,row.password_hash)){failed(attemptKey);fail(401,'ACCESS_BAD_PASSWORD');}
   const next=await passwordHash(nextPassword);if(!await store.changePassword(user.key,row.password_hash,next))fail(409,'ACCESS_PASSWORD_CHANGED');attempts.delete(attemptKey);return login(row.username,nextPassword,token,client);
  },
 };
}
