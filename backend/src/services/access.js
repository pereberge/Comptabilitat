import {randomBytes,createHash,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {HttpError} from '../middleware/errors.js';
import {editablePermissions,permissionsFor} from '../../../shared/access-permissions.js';
const scrypt=promisify(scryptCallback),lifetime=12*60*60*1000;
const fail=(status,code)=>{throw new HttpError(status,code);};
export async function passwordHash(password){
 if(typeof password!=='string'||password.length<8||password.length>128)fail(400,'ACCESS_PASSWORD_LENGTH');
 const salt=randomBytes(16).toString('hex'),key=await scrypt(password,salt,64);
 return 'scrypt:'+salt+':'+key.toString('hex');
}
export async function passwordMatches(password,hash){
 if(typeof password!=='string'||password.length>128||!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash||''))return false;
 const [,salt,expected]=hash.split(':'),actual=await scrypt(password,salt,64);
 return timingSafeEqual(Buffer.from(expected,'hex'),actual);
}
export function mysqlAccessStore(db){return {
 async users(){const [rows]=await db.execute('SELECT user_key,name,role,password_hash,permissions FROM app_users ORDER BY role,name');return rows;},
 async user(key){const [[row]]=await db.execute('SELECT user_key,name,role,password_hash,permissions FROM app_users WHERE user_key=?',[key]);return row;},
 async session(hash){const [[row]]=await db.execute('SELECT u.user_key,u.name,u.role,u.password_hash,u.permissions FROM app_sessions s JOIN app_users u ON u.user_key=s.user_key WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP()',[hash]);return row;},
 async saveSession(hash,key,expires,expectedPassword=null){await db.execute('DELETE FROM app_sessions WHERE expires_at<=UTC_TIMESTAMP()');const [result]=await db.execute('INSERT INTO app_sessions(token_hash,user_key,expires_at) SELECT ?,user_key,? FROM app_users WHERE user_key=? AND (? IS NULL OR password_hash=?)',[hash,expires,key,expectedPassword,expectedPassword]);return result.affectedRows===1;},
 async removeSession(hash){await db.execute('DELETE FROM app_sessions WHERE token_hash=?',[hash]);},
 async setup(hash){const [result]=await db.execute("UPDATE app_users SET password_hash=? WHERE user_key='master' AND password_hash IS NULL",[hash]);return result.affectedRows===1;},
 async update(key,name,permissions){await db.execute('UPDATE app_users SET name=?,permissions=? WHERE user_key=?',[name,JSON.stringify(permissions),key]);},
 async changePassword(previous,next){const [result]=await db.execute("UPDATE app_users SET password_hash=? WHERE user_key='master' AND password_hash=?",[next,previous]);if(result.affectedRows!==1)return false;await db.execute("DELETE FROM app_sessions WHERE user_key='master'");return true;},
};}
const publicUser=row=>({key:row.user_key,name:row.name,role:row.role,permissions:permissionsFor(row)});
const digest=token=>createHash('sha256').update(token).digest('hex');
export function createAccessService(store){
 const attempts=new Map();
 const checkAttempts=client=>{const item=attempts.get(client);if(item&&item.until>Date.now()&&item.count>=5)fail(429,'ACCESS_TOO_MANY_ATTEMPTS');};
 const failed=client=>{const now=Date.now(),old=attempts.get(client);attempts.set(client,{count:old&&old.until>now?old.count+1:1,until:old&&old.until>now?old.until:now+15*60*1000});if(attempts.size>1000)for(const [key,item]of attempts)if(item.until<now)attempts.delete(key);};
 async function current(token){const row=token?await store.session(digest(token)):null;return publicUser(row||await store.user('user'));}
 async function state(token){const user=await current(token),rows=await store.users();return {user,users:rows.map(row=>({key:row.user_key,name:row.name,role:row.role})),master_setup_required:!rows.find(row=>row.user_key==='master')?.password_hash};}
 async function switchTo(key,password,token,client='local'){
  if(!['master','user'].includes(key))fail(400,'ACCESS_INVALID_USER');
  const row=await store.user(key);if(!row)fail(404,'ACCESS_INVALID_USER');
  if(key==='master'){
   checkAttempts(client);if(!row.password_hash)fail(409,'ACCESS_SETUP_REQUIRED');
   if(!await passwordMatches(password,row.password_hash)){failed(client);fail(401,'ACCESS_BAD_PASSWORD');}
   attempts.delete(client);
  }
  // Rotate the session only after authentication succeeds.
  const next=randomBytes(32).toString('hex'),expires=new Date(Date.now()+lifetime).toISOString().slice(0,19).replace('T',' ');
  if(await store.saveSession(digest(next),key,expires,key==='master'?row.password_hash:null)===false)fail(401,'ACCESS_PASSWORD_CHANGED');if(token)await store.removeSession(digest(token));
  return {token:next,state:await state(next)};
 }
 return {state,current,
  async setup(password,token,client){
   const hash=await passwordHash(password);if(!await store.setup(hash))fail(409,'ACCESS_ALREADY_CONFIGURED');
   return switchTo('master',password,token,client);
  },switchTo,
  async users(user){if(!user.permissions.users_manage)fail(403,'PERMISSION_DENIED');return (await store.users()).map(publicUser);},
  async update(user,key,body){
   if(!user.permissions.users_manage)fail(403,'PERMISSION_DENIED');
   if(!['master','user'].includes(key)||!body||Object.keys(body).some(key=>!['name','permissions'].includes(key)))fail(400,'ACCESS_INVALID_USER');
   if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>60)fail(400,'ACCESS_INVALID_NAME');
   let permissions={};
   if(key==='user'){
    if(!body.permissions||typeof body.permissions!=='object'||Array.isArray(body.permissions)||Object.keys(body.permissions).length!==editablePermissions.length||editablePermissions.some(item=>typeof body.permissions[item.key]!=='boolean')||Object.keys(body.permissions).some(key=>!editablePermissions.some(item=>item.key===key)))fail(400,'ACCESS_INVALID_PERMISSIONS');
    permissions=body.permissions;
   }else if(body.permissions!==undefined)fail(400,'ACCESS_INVALID_PERMISSIONS');
   await store.update(key,body.name.trim(),permissions);return this.users(user);
  },
  async changePassword(user,currentPassword,nextPassword,token,client){
   if(!user.permissions.users_manage)fail(403,'PERMISSION_DENIED');
   checkAttempts(client);const row=await store.user('master');
   if(!await passwordMatches(currentPassword,row.password_hash)){failed(client);fail(401,'ACCESS_BAD_PASSWORD');}
   const next=await passwordHash(nextPassword);if(!await store.changePassword(row.password_hash,next))fail(409,'ACCESS_PASSWORD_CHANGED');
   attempts.delete(client);return switchTo('master',nextPassword,token,client);
  },
 };
}
