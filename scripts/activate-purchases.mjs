// Applies only the six reviewed purchase migrations to the configured database.
import mysql from 'mysql2/promise';
import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {config} from '../backend/src/config.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const approved=['043_management_audit.sql','044_items_units.sql','045_purchase_orders.sql','046_goods_receipts.sql','047_purchase_invoice_links.sql','048_document_extraction_jobs.sql'];
const tables=['management_audit_events','management_requests','purchase_units','purchase_items','purchase_supplier_items','purchase_orders','purchase_order_lines','purchase_receipts','purchase_receipt_lines','purchase_order_receipts','purchase_invoices','purchase_invoice_lines','purchase_invoice_links','document_extraction_jobs'];
function run(binary,args,env){return new Promise((resolveRun,reject)=>{const child=spawn(binary,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>process.stdout.write(data));child.stderr.on('data',data=>process.stderr.write(data));child.once('error',reject);child.once('close',code=>code===0?resolveRun():reject(new Error('PURCHASE_ACTIVATION_STEP_FAILED: '+code)));});}
let connection;
try{
 if(config.separateCompanyDatabases)throw Error('COMPANY_DATABASE_SCOPE_REQUIRES_REVIEW');
 connection=await mysql.createConnection(config.database);
 const [registered]=await connection.query('SELECT name FROM schema_migrations ORDER BY name');const applied=new Set(registered.map(row=>row.name));
 const files=(await readdir(resolve(root,'database/migrations'))).filter(file=>file.endsWith('.sql')).sort();
 const pending=files.filter(file=>!applied.has('migrate:'+file));
 if(pending.some(file=>!approved.includes(file)))throw Error('UNAPPROVED_PENDING_MIGRATIONS');
 for(const file of pending){const sql=await readFile(resolve(root,'database/migrations',file),'utf8');for(const statement of sql.split(/^-- statement\s*$/m).map(value=>value.trim()).filter(Boolean))if(!/^CREATE TABLE\s/i.test(statement)&&!/^ALTER TABLE company_documents ADD UNIQUE KEY uq_company_document_scope\(company_id,id\)$/i.test(statement))throw Error('UNREVIEWED_PURCHASE_MIGRATION_STATEMENT');}
 console.log(JSON.stringify({database:config.database.database,pending}));
 if(!process.argv.includes('--apply')){console.log('Read-only check. Use --apply after explicit authorization.');}
 else if(pending.length){
  const [existing]=await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('+tables.map(()=>'?').join(',')+')',[config.database.database,...tables]);
  if(existing.length&&pending.length===approved.length)throw Error('PARTIAL_PURCHASE_SCHEMA_REQUIRES_REVIEW');
  const directory=resolve(root,'.local-backups','purchase-activation-'+Date.now());await mkdir(directory,{recursive:true});
  const schema=resolve(directory,'schema-before.sql');
  await run(process.env.MYSQLDUMP_PATH||'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqldump.exe',['--no-defaults','--host='+config.database.host,'--port='+config.database.port,'--user='+config.database.user,'--no-data','--skip-lock-tables','--no-tablespaces','--set-gtid-purged=OFF','--column-statistics=0','--result-file='+schema,config.database.database],{...process.env,MYSQL_PWD:config.database.password});
  console.log('Structure backup saved: '+schema);
  await run(process.execPath,['backend/scripts/database.js','migrate'],{...process.env,DB_HOST:config.database.host,DB_PORT:String(config.database.port),DB_NAME:config.database.database,DB_USER:config.database.user,DB_PASSWORD:config.database.password,COMPANY_DATABASES_ENABLED:'false',DATABASE_ROLE:'central'});
  const [after]=await connection.query('SELECT name FROM schema_migrations ORDER BY name');const names=new Set(after.map(row=>row.name));if(approved.some(file=>!names.has('migrate:'+file)))throw Error('PURCHASE_MIGRATION_VERIFICATION_FAILED');
  const [created]=await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME IN ('+tables.map(()=>'?').join(',')+')',[config.database.database,...tables]);if(created.length!==tables.length)throw Error('PURCHASE_TABLE_VERIFICATION_FAILED');
  const report={database:config.database.database,applied:pending,tables_verified:created.length,schema_backup_sha256:createHash('sha256').update(await readFile(schema)).digest('hex'),business_documents_written:false};await writeFile(resolve(directory,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({activated:true,tables_verified:created.length,report:resolve(directory,'report.json')}));
 }else console.log('Purchase migrations are already applied.');
}catch(error){console.error(error.code||error.message);process.exitCode=1;}
finally{await connection?.end();}
