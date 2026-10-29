import {HttpError} from '../middleware/errors.js';
import {withTransaction} from '../db/transaction.js';
const columns='user_key,username,name,email,role,password_hash,permissions,active,version';
export function mysqlAccessStore(db){
 async function hydrate(connection,row){if(!row)return null;if(row.role==='master')return {...row,company_ids:null};const [links]=await connection.execute('SELECT company_id FROM app_user_companies WHERE user_key=? ORDER BY company_id',[row.user_key]);return {...row,company_ids:links.map(link=>link.company_id)};}
 async function companies(connection,ids){if(!ids.length)return;const [rows]=await connection.execute('SELECT id FROM companies WHERE id IN ('+ids.map(()=>'?').join(',')+')',ids);if(rows.length!==ids.length)throw new HttpError(400,'ACCESS_INVALID_COMPANIES');}
 async function links(connection,key,ids){await connection.execute('DELETE FROM app_user_companies WHERE user_key=?',[key]);for(const companyId of ids)await connection.execute('INSERT INTO app_user_companies(user_key,company_id) VALUES (?,?)',[key,companyId]);}
 function conflict(error){if(error.code==='ER_DUP_ENTRY')throw new HttpError(409,'ACCESS_USERNAME_TAKEN');throw error;}
 return {
  async users(){const [rows]=await db.execute('SELECT '+columns+' FROM app_users ORDER BY role,name,user_key');const [assigned]=await db.execute('SELECT user_key,company_id FROM app_user_companies ORDER BY company_id');return rows.map(row=>({...row,company_ids:row.role==='master'?null:assigned.filter(link=>link.user_key===row.user_key).map(link=>link.company_id)}));},
  async user(key){const [[row]]=await db.execute('SELECT '+columns+' FROM app_users WHERE user_key=?',[key]);return hydrate(db,row);},
  async byUsername(username){const [[row]]=await db.execute('SELECT '+columns+' FROM app_users WHERE username=?',[username]);return hydrate(db,row);},
  async session(hash){const [[row]]=await db.execute('SELECT '+columns.split(',').map(field=>'u.'+field).join(',')+' FROM app_sessions s JOIN app_users u ON u.user_key=s.user_key WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND u.active=1 AND u.password_hash IS NOT NULL',[hash]);return hydrate(db,row);},
  async saveSession(hash,key,expires,expectedPassword){await db.execute('DELETE FROM app_sessions WHERE expires_at<=UTC_TIMESTAMP()');const [result]=await db.execute('INSERT INTO app_sessions(token_hash,user_key,expires_at) SELECT ?,user_key,? FROM app_users WHERE user_key=? AND active=1 AND password_hash=?',[hash,expires,key,expectedPassword]);return result.affectedRows===1;},
  async removeSession(hash){await db.execute('DELETE FROM app_sessions WHERE token_hash=?',[hash]);},
  async setup(hash){const [result]=await db.execute("UPDATE app_users SET password_hash=?,version=version+1 WHERE user_key='master' AND password_hash IS NULL AND active=1",[hash]);return result.affectedRows===1;},
  async upgradePassword(key,previous,next){const [result]=await db.execute('UPDATE app_users SET password_hash=? WHERE user_key=? AND password_hash=? AND active=1',[next,key,previous]);return result.affectedRows===1;},
  async create(data){try{return await withTransaction(db,async connection=>{await companies(connection,data.company_ids);await connection.execute("INSERT INTO app_users(user_key,username,name,email,role,password_hash,permissions,active) VALUES (?,?,?,?,'user',?,?,?)",[data.user_key,data.username,data.name,data.email,data.password_hash,JSON.stringify(data.permissions),data.active?1:0]);await links(connection,data.user_key,data.company_ids);});}catch(error){conflict(error);}},
  async update(key,data,version){try{return await withTransaction(db,async connection=>{
   const [[previous]]=await connection.execute('SELECT version FROM app_users WHERE user_key=? FOR UPDATE',[key]);if(!previous)throw new HttpError(404,'ACCESS_USER_NOT_FOUND');if(previous.version!==version)throw new HttpError(409,'ACCESS_USER_CHANGED');
   if(key!=='master')await companies(connection,data.company_ids);
   await connection.execute('UPDATE app_users SET username=?,name=?,email=?,permissions=?,active=?,password_hash=COALESCE(?,password_hash),version=version+1 WHERE user_key=?',[data.username,data.name,data.email,JSON.stringify(data.permissions),data.active?1:0,data.password_hash||null,key]);
   if(key!=='master')await links(connection,key,data.company_ids);
   if(data.password_hash||!data.active)await connection.execute('DELETE FROM app_sessions WHERE user_key=?',[key]);
  });}catch(error){conflict(error);}},
  async remove(key,version){return withTransaction(db,async connection=>{const [[row]]=await connection.execute('SELECT role,version FROM app_users WHERE user_key=? FOR UPDATE',[key]);if(!row)throw new HttpError(404,'ACCESS_USER_NOT_FOUND');if(row.role==='master')throw new HttpError(409,'ACCESS_MASTER_PROTECTED');if(row.version!==version)throw new HttpError(409,'ACCESS_USER_CHANGED');await connection.execute('DELETE FROM app_sessions WHERE user_key=?',[key]);await connection.execute('DELETE FROM app_user_companies WHERE user_key=?',[key]);await connection.execute('DELETE FROM app_users WHERE user_key=?',[key]);});},
  async changePassword(key,previous,next){return withTransaction(db,async connection=>{const [result]=await connection.execute('UPDATE app_users SET password_hash=?,version=version+1 WHERE user_key=? AND password_hash=? AND active=1',[next,key,previous]);if(result.affectedRows!==1)return false;await connection.execute('DELETE FROM app_sessions WHERE user_key=?',[key]);return true;});},
 };
}
