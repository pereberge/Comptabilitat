// Only the reviewed additive table is applied, never unrelated pending migrations.
import mysql from 'mysql2/promise';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {config} from '../backend/src/config.js';
import {databaseName} from '../backend/src/db/company-databases.js';
const file='051_company_banks.sql',key='migrate:'+file;
const sql=await readFile(new URL('../database/migrations/'+file,import.meta.url),'utf8');
let central;
try{
 central=await mysql.createConnection(config.database);
 const databases=[config.database.database];
 if(config.separateCompanyDatabases){const [rows]=await central.execute('SELECT database_name FROM company_databases ORDER BY company_id');databases.push(...rows.map(row=>databaseName(row.database_name)));}
 for(const database of [...new Set(databases)]){
  const db=await mysql.createConnection({...config.database,database});let locked=false;
  const lock='contabilidad:'+createHash('sha256').update(database).digest('hex').slice(0,40);
  try{
   const [[got]]=await db.execute('SELECT GET_LOCK(?,10) AS acquired',[lock]);if(got.acquired!==1)throw Error('DATABASE_LOCK_UNAVAILABLE');locked=true;
   const [applied]=await db.execute('SELECT name FROM schema_migrations WHERE name=?',[key]);
   if(!applied.length){await db.query(sql);await db.execute('INSERT INTO schema_migrations (name) VALUES (?)',[key]);}
   console.log(JSON.stringify({database,migration:file,applied:!applied.length,settings_created:0}));
  }finally{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);await db.end();}
 }
}catch(error){console.error(error.code||error.message);process.exitCode=1;}finally{await central?.end();}
