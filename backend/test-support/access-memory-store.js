import {HttpError} from '../src/middleware/errors.js';
import {editablePermissions} from '../../shared/access-permissions.js';
import {scryptSync} from 'node:crypto';
export function legacyPasswordHash(password){const salt='a'.repeat(32);return 'scrypt:'+salt+':'+scryptSync(password,salt,64).toString('hex');}
export const defaultPermissions=()=>Object.fromEntries(editablePermissions.map(item=>[item.key,true]));
export function memoryAccessStore({companyIds=[1,2]}={}){
 const rows=new Map([['master',{user_key:'master',username:'administrador',email:null,name:'Master',role:'master',password_hash:null,permissions:{},active:1,version:1,company_ids:null}],['user',{user_key:'user',username:'user',email:null,name:'Usuario',role:'user',password_hash:null,permissions:defaultPermissions(),active:1,version:1,company_ids:[]}]]),sessions=new Map();
 const clone=row=>row?structuredClone(row):null;
 const fail=(status,code)=>{throw new HttpError(status,code);};
 const existing=(key,version)=>{const row=rows.get(key);if(!row)fail(404,'ACCESS_USER_NOT_FOUND');if(row.version!==version)fail(409,'ACCESS_USER_CHANGED');return row;};
 const validate=data=>{if([...rows.values()].some(row=>row.username===data.username&&row.user_key!==data.user_key))fail(409,'ACCESS_USERNAME_TAKEN');if(data.company_ids.some(id=>!companyIds.includes(id)))fail(400,'ACCESS_INVALID_COMPANIES');};
 const revoke=key=>{for(const [hash,item]of sessions)if(item.key===key)sessions.delete(hash);};
 return {rows,sessions,
  users:async()=>[...rows.values()].map(clone),user:async key=>clone(rows.get(key)),byUsername:async name=>clone([...rows.values()].find(row=>row.username===name)),
  session:async hash=>{const item=sessions.get(hash),row=item&&rows.get(item.key);return item&&item.expires>Date.now()&&row?.active&&row.password_hash?clone(row):null;},
  saveSession:async(hash,key,expires,expected)=>{const row=rows.get(key);if(!row?.active||row.password_hash!==expected)return false;sessions.set(hash,{key,expires:Date.parse(expires.replace(' ','T')+'Z')});return true;},
  removeSession:async hash=>sessions.delete(hash),
  setup:async hash=>{const row=rows.get('master');if(row.password_hash)return false;row.password_hash=hash;row.version++;return true;},
  upgradePassword:async(key,previous,next)=>{const row=rows.get(key);if(!row?.active||row.password_hash!==previous)return false;row.password_hash=next;return true;},
  create:async data=>{validate(data);rows.set(data.user_key,{...structuredClone(data),role:'user',active:data.active?1:0,version:1});},
  update:async(key,data,version)=>{const row=existing(key,version);if(key!=='master')validate({...data,user_key:key});Object.assign(row,structuredClone(data),{password_hash:data.password_hash||row.password_hash,active:data.active?1:0,version:version+1,company_ids:key==='master'?null:data.company_ids});if(data.password_hash||!data.active)revoke(key);},
  remove:async(key,version)=>{const row=existing(key,version);if(row.role==='master')fail(409,'ACCESS_MASTER_PROTECTED');revoke(key);rows.delete(key);},
  changePassword:async(key,previous,next)=>{const row=rows.get(key);if(!row?.active||row.password_hash!==previous)return false;row.password_hash=next;row.version++;revoke(key);return true;},
 };
}
