// Creates a fresh local MySQL instance. Never connects to an existing instance.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer,createConnection as connectSocket} from 'node:net';
import mysql from 'mysql2/promise';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mysqld=process.env.TEST_MYSQLD_PATH||'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysqld.exe';
const runDirectory=resolve(root,'.local-backups','purchase-mysql-'+Date.now()+'-'+randomBytes(4).toString('hex'));
const dataDirectory=resolve(runDirectory,'data');
const scope=relative(resolve(root,'.local-backups'),dataDirectory);
assert.ok(scope&&!scope.startsWith('..')&&!isAbsolute(scope),'Unsafe isolated data directory');
const database='purchase_validation',password=randomBytes(32).toString('hex');
let daemon,admin,port,childEnv;
const report={synthetic_only:true,production_access:false,data_directory:dataDirectory,tests_passed:false,stopped:false};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const daemonStopped=()=>!daemon||daemon.exitCode!==null||daemon.signalCode!==null;
function portListening(value){return new Promise(resolvePort=>{const socket=connectSocket({host:'127.0.0.1',port:value});let done=false;const finish=result=>{if(done)return;done=true;socket.destroy();resolvePort(result);};socket.setTimeout(1000,()=>finish(true));socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));});}
function run(binary,args,{env=process.env,log}={}){
 return new Promise((resolveRun,reject)=>{
  const output=log?createWriteStream(resolve(runDirectory,log)):null;
  const child=spawn(binary,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  for(const source of [child.stdout,child.stderr])source.on('data',data=>{output?.write(data);if(binary===process.execPath)process.stdout.write(data);});
  child.once('error',error=>{output?.end();reject(error);});
  child.once('close',code=>{output?.end();code===0?resolveRun():reject(new Error('ISOLATED_STEP_FAILED: '+(log||args[0])+' (exit '+code+')'));});
 });
}
async function availablePort(){const server=createServer();await new Promise((resolvePort,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolvePort);});const chosen=server.address().port;await new Promise(resolveClose=>server.close(resolveClose));return chosen;}
try{
 await mkdir(runDirectory,{recursive:true});await mkdir(dataDirectory);
 console.log('Creating fresh synthetic MySQL data directory: '+dataDirectory);
 await run(mysqld,['--no-defaults','--initialize-insecure','--basedir='+resolve(dirname(mysqld),'..'),'--datadir='+dataDirectory,'--console'],{log:'initialize.log'});
 port=await availablePort();report.port=port;
 daemon=spawn(mysqld,['--no-defaults','--basedir='+resolve(dirname(mysqld),'..'),'--datadir='+dataDirectory,'--port='+port,'--bind-address=127.0.0.1','--mysqlx=0','--skip-log-bin','--max-allowed-packet=64M','--log-error='+resolve(runDirectory,'mysql.log')],{cwd:root,windowsHide:true,stdio:'ignore'});
 report.server_pid=daemon.pid;
 let daemonError;daemon.once('error',error=>{daemonError=error;});
 for(let attempt=0;attempt<120;attempt++){
  if(daemonError)throw daemonError;if(daemon.exitCode!==null)throw new Error('ISOLATED_MYSQL_START_FAILED');
  try{admin=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password:'',connectTimeout:1000});break;}catch{}
  await pause(500);
 }
 if(!admin)throw new Error('ISOLATED_MYSQL_START_TIMEOUT');
 const [[identity]]=await admin.query('SELECT @@port AS port,@@datadir AS data_directory,VERSION() AS version');
 const normalized=value=>resolve(value).replace(/[\\/]+$/,'').toLowerCase();
 assert.equal(identity.port,port);assert.equal(normalized(identity.data_directory),normalized(dataDirectory));report.mysql_version=identity.version;
 try{await admin.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?",[password]);}catch(error){throw new Error('ISOLATED_ROOT_SETUP_FAILED: '+error.code);}
 await admin.query('CREATE DATABASE purchase_validation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');await admin.end();admin=null;
 childEnv={...process.env,DB_HOST:'127.0.0.1',DB_PORT:String(port),DB_NAME:database,DB_USER:'root',DB_PASSWORD:password,TEST_MYSQL:'1',NODE_ENV:'test',COMPANY_ID:'1',COMPANY_DATABASES_ENABLED:'false',DATABASE_ROLE:'central',CENTRAL_DB_NAME:database,INTEGRATION_CLIENTS_JSON:'[]',BACKUP_DIRECTORY:resolve(runDirectory,'backups')};
 // Config may load backend/.env, so verify effective overrides before any child
 // migration/test can open a database connection. Do not print credentials.
 await run(process.execPath,['--input-type=module','-e',`import {config} from './backend/src/config.js';if(config.database.host!=='127.0.0.1'||config.database.port!==${port}||config.database.database!=='purchase_validation'||config.database.user!=='root'||config.database.password!==process.env.DB_PASSWORD||config.separateCompanyDatabases)throw Error('ISOLATION_CONFIG_MISMATCH');console.log('Effective test configuration verified: isolated local MySQL only');`],{env:childEnv,log:'config.log'});
 console.log('Migrating isolated MySQL on port '+port);
 await run(process.execPath,['backend/scripts/database.js','migrate'],{env:childEnv,log:'migrations.log'});
 admin=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password,database});
 const [migrations]=await admin.query('SELECT name FROM schema_migrations ORDER BY name');report.migrations=migrations.map(row=>row.name);await admin.end();admin=null;
 console.log('Running purchase/OCR integration tests with synthetic companies');
 await run(process.execPath,['--test','--test-concurrency=1','backend/test/purchases-db.test.js','backend/test/purchase-ocr-db.test.js'],{env:childEnv,log:'tests.log'});
 report.tests_passed=true;
}catch(error){report.error=error.code||error.message;console.error(report.error);process.exitCode=1;}
finally{
 await admin?.end().catch(()=>{});
 if(daemon&&!daemonStopped()){
  try{const shutdown=await mysql.createConnection({host:'127.0.0.1',port,user:'root',password,connectTimeout:2000});await shutdown.query('SHUTDOWN').catch(()=>{});await shutdown.end().catch(()=>{});}catch{}
  for(let attempt=0;attempt<120&&!daemonStopped();attempt++)await pause(500);
  if(!daemonStopped()){daemon.kill();report.forced_stop=true;for(let attempt=0;attempt<20&&!daemonStopped();attempt++)await pause(250);}
 }
 if(daemon){report.port_closed=!(await portListening(port));report.stopped=daemonStopped()&&report.port_closed;if(!report.stopped)process.exitCode=1;}
 try{await writeFile(resolve(runDirectory,'report.json'),JSON.stringify(report,null,2));}catch{}
 console.log('Isolated validation report: '+resolve(runDirectory,'report.json'));
 if(report.tests_passed)console.log('PASS: purchase/OCR integration tests. No existing MySQL instance or real company data accessed.');
}
