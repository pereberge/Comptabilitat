import {createHash} from 'node:crypto';
import {databaseName,quoteDatabase} from '../db/company-databases.js';
import {id} from './validation.js';

export const centralTables=new Set(['app_users','app_sessions','app_user_companies','company_databases','integration_company_links']);
const quote=value=>'`'+String(value).replace(/`/g,'``')+'`';
export const companyDatabaseName=(source,companyId)=>databaseName(source+'_company_'+id(companyId));
export function companyCopyFilter(table,columns,companyId){
 if(table==='schema_migrations')return {sql:'',params:[]};
 if(table==='companies')return {sql:' WHERE id=?',params:[id(companyId)]};
 if(columns.some(column=>column.Field==='company_id'))return {sql:' WHERE company_id=?',params:[id(companyId)]};
 throw new Error('UNCLASSIFIED_COMPANY_TABLE: '+table);
}

// The source remains untouched. Use only while application writes are stopped,
// or for a newly reserved company which has no registered route yet.
export async function provisionCompanyDatabase(pool,source,companyId){
 companyId=id(companyId);const target=companyDatabaseName(source,companyId),db=await pool.getConnection();
 const src=quoteDatabase(source),dst=quoteDatabase(target),lock='company-split:'+source+':'+companyId;
 let locked=false,transaction=false;
 try{
  const [[got]]=await db.execute('SELECT GET_LOCK(?,10) AS acquired',[lock]);
  if(Number(got.acquired)!==1)throw new Error('COMPANY_DATABASE_BUSY');locked=true;
  const [[company]]=await db.execute('SELECT id FROM '+src+'.companies WHERE id=?',[companyId]);
  if(!company)throw new Error('COMPANY_NOT_FOUND');
  const [registered]=await db.execute('SELECT company_id FROM '+src+'.company_databases WHERE company_id=?',[companyId]);
  if(registered.length)throw new Error('COMPANY_DATABASE_ALREADY_REGISTERED');
  const [exists]=await db.execute('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[target]);
  if(exists.length)throw new Error('TARGET_DATABASE_ALREADY_EXISTS');
  const [tables]=await db.execute('SELECT TABLE_NAME,ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE=\'BASE TABLE\' ORDER BY TABLE_NAME',[source]);
  const plan=[];
  for(const row of tables){
   if(centralTables.has(row.TABLE_NAME))continue;
   if(row.ENGINE!=='InnoDB')throw new Error('NON_TRANSACTIONAL_TABLE: '+row.TABLE_NAME);
   const [columns]=await db.query('SHOW FULL COLUMNS FROM '+src+'.'+quote(row.TABLE_NAME));
   const filter=companyCopyFilter(row.TABLE_NAME,columns,companyId);
   const writable=columns.filter(column=>!/(?:VIRTUAL|STORED) GENERATED/.test(column.Extra)).map(column=>column.Field);
   const [keys]=await db.query('SHOW INDEX FROM '+src+'.'+quote(row.TABLE_NAME)+" WHERE Key_name='PRIMARY'");
   if(!keys.length)throw new Error('TABLE_WITHOUT_PRIMARY_KEY: '+row.TABLE_NAME);
   plan.push({name:row.TABLE_NAME,columns:writable,filter,order:keys.sort((a,b)=>a.Seq_in_index-b.Seq_in_index).map(key=>quote(key.Column_name)).join(',')});
  }
  const [[collation]]=await db.execute('SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?',[source]);
  if(! /^utf8mb4_[a-z0-9_]+$/.test(collation.DEFAULT_COLLATION_NAME))throw new Error('UNSUPPORTED_SOURCE_CHARSET');
  await db.query('CREATE DATABASE '+dst+' CHARACTER SET utf8mb4 COLLATE '+collation.DEFAULT_COLLATION_NAME);
  await db.query('SET FOREIGN_KEY_CHECKS=0');
  for(const table of plan){
   const [[definition]]=await db.query('SHOW CREATE TABLE '+src+'.'+quote(table.name));
   let ddl=definition['Create Table'].replace(/^CREATE TABLE `[^`]+`/,'CREATE TABLE '+dst+'.'+quote(table.name));
   // Document permissions reference the central identity, not a copied password.
   for(const name of centralTables)ddl=ddl.replaceAll('REFERENCES '+quote(name)+' (','REFERENCES '+src+'.'+quote(name)+' (');
   await db.query(ddl);
  }
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');transaction=true;
  const manifest=[];
  for(const table of plan){
   const columns=table.columns.map(quote).join(','),from=src+'.'+quote(table.name),to=dst+'.'+quote(table.name);
   await db.execute('INSERT INTO '+to+' ('+columns+') SELECT '+columns+' FROM '+from+table.filter.sql,table.filter.params);
   const [[count]]=await db.execute('SELECT COUNT(*) AS n FROM '+from+table.filter.sql,table.filter.params);
   const [[copied]]=await db.query('SELECT COUNT(*) AS n FROM '+to);
   if(String(count.n)!==String(copied.n))throw new Error('COMPANY_COPY_COUNT_MISMATCH: '+table.name);
   const hashes=[createHash('sha256'),createHash('sha256')];
   const hashRow=(hash,row)=>{for(const column of table.columns){const value=row[column];hash.update(column+'\0');if(Buffer.isBuffer(value))hash.update('buffer:'+value.length+':').update(value);else hash.update(JSON.stringify(value));hash.update('\0');}};
   for(let offset=0;offset<Number(count.n);offset++){
    const [original]=await db.execute('SELECT '+columns+' FROM '+from+table.filter.sql+' ORDER BY '+table.order+' LIMIT 1 OFFSET '+offset,table.filter.params);
    const [copy]=await db.query('SELECT '+columns+' FROM '+to+' ORDER BY '+table.order+' LIMIT 1 OFFSET '+offset);
    for(const [index,rows]of [original,copy].entries())for(const row of rows)hashRow(hashes[index],row);
   }
   const [before,after]=hashes.map(hash=>hash.digest('hex'));
   if(before!==after)throw new Error('COMPANY_COPY_HASH_MISMATCH: '+table.name);
   manifest.push({table:table.name,rows:Number(count.n),sha256:after});
  }
  // Re-enabling FOREIGN_KEY_CHECKS does not validate pre-existing rows: check all
  // references explicitly before committing and exposing a route.
  const [foreignKeys]=await db.execute('SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_SCHEMA,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME,ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION',[target]);
  const groups=new Map();for(const key of foreignKeys){const group=key.TABLE_NAME+':'+key.CONSTRAINT_NAME;if(!groups.has(group))groups.set(group,[]);groups.get(group).push(key);}
  for(const keys of groups.values()){
   const key=keys[0],parent=quote(key.REFERENCED_TABLE_SCHEMA)+'.'+quote(key.REFERENCED_TABLE_NAME);
   const join=keys.map(item=>'c.'+quote(item.COLUMN_NAME)+'=p.'+quote(item.REFERENCED_COLUMN_NAME)).join(' AND ');
   const present=keys.map(item=>'c.'+quote(item.COLUMN_NAME)+' IS NOT NULL').join(' AND ');
   const [orphans]=await db.query('SELECT 1 FROM '+dst+'.'+quote(key.TABLE_NAME)+' c LEFT JOIN '+parent+' p ON '+join+' WHERE '+present+' AND p.'+quote(key.REFERENCED_COLUMN_NAME)+' IS NULL LIMIT 1');
   if(orphans.length)throw new Error('COMPANY_COPY_ORPHAN: '+key.TABLE_NAME+'.'+key.CONSTRAINT_NAME);
  }
  await db.commit();transaction=false;await db.query('SET FOREIGN_KEY_CHECKS=1');
  const [triggers]=await db.execute('SELECT TRIGGER_NAME,ACTION_TIMING,EVENT_MANIPULATION,EVENT_OBJECT_TABLE,ACTION_STATEMENT,SQL_MODE FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=?',[source]);
  const [[mode]]=await db.query('SELECT @@SESSION.sql_mode AS value');
  try{for(const trigger of triggers){if(!plan.some(table=>table.name===trigger.EVENT_OBJECT_TABLE))continue;await db.query('SET SESSION sql_mode=?',[trigger.SQL_MODE]);await db.query('CREATE TRIGGER '+dst+'.'+quote(trigger.TRIGGER_NAME)+' '+trigger.ACTION_TIMING+' '+trigger.EVENT_MANIPULATION+' ON '+dst+'.'+quote(trigger.EVENT_OBJECT_TABLE)+' FOR EACH ROW '+trigger.ACTION_STATEMENT);}}finally{await db.query('SET SESSION sql_mode=?',[mode.value]);}
  await db.execute('INSERT INTO '+src+'.company_databases(company_id,database_name,verified_at) VALUES (?,?,UTC_TIMESTAMP())',[companyId,target]);
  return {companyId,database:target,tables:manifest};
 }catch(error){if(transaction)await db.rollback();throw error;}
 finally{try{await db.query('SET FOREIGN_KEY_CHECKS=1');if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{db.release();}}
}
