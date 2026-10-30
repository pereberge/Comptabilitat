import {spawnSync} from 'node:child_process';
import {config} from '../src/config.js';
import {pool} from '../src/db/pool.js';
import {databaseName} from '../src/db/company-databases.js';
import {fileURLToPath} from 'node:url';
const script=new URL('./database.js',import.meta.url);
try{
 const run=env=>{const result=spawnSync(process.execPath,[fileURLToPath(script),'migrate'],{stdio:'inherit',env:{...process.env,...env}});if(result.error)throw result.error;if(result.status!==0)throw new Error('MIGRATION_FAILED');};
 run({DB_NAME:config.database.database,DATABASE_ROLE:'central'});
 const [rows]=await pool.execute('SELECT company_id,database_name FROM company_databases ORDER BY company_id');
 for(const row of rows){console.log('Company:',row.company_id);run({DB_NAME:databaseName(row.database_name),CENTRAL_DB_NAME:config.database.database,DATABASE_ROLE:'company'});}
}catch(error){console.error(error.code||error.message);process.exitCode=1;}finally{await pool.end();}
