// Applies only the new central bank catalog; no company migrations or data edits.
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {config} from '../backend/src/config.js';
const file='050_general_banks.sql',key='migrate:'+file;
const lock='contabilidad:'+createHash('sha256').update(config.database.database).digest('hex').slice(0,40);
let db,locked=false;
try{
 db=await mysql.createConnection(config.database);
 const [[got]]=await db.execute('SELECT GET_LOCK(?,10) AS acquired',[lock]);if(got.acquired!==1)throw Error('DATABASE_LOCK_UNAVAILABLE');locked=true;
 const [applied]=await db.execute('SELECT name FROM schema_migrations WHERE name=?',[key]);
 if(!applied.length){
  const sql=await readFile(new URL('../database/migrations/'+file,import.meta.url),'utf8');
  for(const statement of sql.split(/^-- statement\s*$/m).map(s=>s.trim()).filter(Boolean))await db.query(statement);
  await db.execute('INSERT INTO schema_migrations (name) VALUES (?)',[key]);
 }
 const [[row]]=await db.execute('SELECT COUNT(*) AS banks FROM general_banks');
 console.log(JSON.stringify({migration:file,applied:!applied.length,banks:row.banks,scope:'central',presenter_id_stored:false}));
}catch(error){console.error(error.code||error.message);process.exitCode=1;}
finally{if(db){if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);await db.end();}}
