import {config} from '../src/config.js';
import {pool} from '../src/db/pool.js';
import {provisionCompanyDatabase,companyDatabaseName} from '../src/services/company-database-provision.js';

try{
 const args=process.argv.slice(2),apply=args.includes('--apply'),stopped=args.includes('--writes-stopped');
 if(args.some(arg=>!['--apply','--writes-stopped'].includes(arg)))throw new Error('Usage: company-databases.js [--apply --writes-stopped]');
 if(apply&&!stopped)throw new Error('STOP_APPLICATION_WRITES_FIRST: pass --writes-stopped');
 const [rows]=await pool.execute('SELECT c.id,c.name,d.database_name FROM companies c LEFT JOIN company_databases d ON d.company_id=c.id ORDER BY c.id');
 for(const row of rows){
  if(row.database_name){console.log('Already registered:',row.id,row.database_name);continue;}
  const target=companyDatabaseName(config.database.database,row.id);
  if(!apply){console.log('Plan:',row.id,row.name,'->',target);continue;}
  const result=await provisionCompanyDatabase(pool,config.database.database,row.id);
  console.log(JSON.stringify(result));
 }
}catch(error){console.error('Company database split failed:',error.code||error.message);process.exitCode=1;}finally{await pool.end();}
