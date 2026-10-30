import {config} from '../src/config.js';
import {pool} from '../src/db/pool.js';
import {createIntegrationReceptionService} from '../src/integrations/received-invoices.js';
try{
 const values=process.argv.slice(2),args={};for(let i=0;i<values.length;i+=2){if(!['--client','--source','--external','--company','--enabled'].includes(values[i])||values[i+1]===undefined)throw new Error('INTEGRATION_ARGUMENTS_INVALID');args[values[i].slice(2)]=values[i+1];}
 if(!config.integrations.clients.some(client=>client.clientId===args.client&&client.sourceSystem===args.source))throw new Error('INTEGRATION_CLIENT_NOT_CONFIGURED');
 if(args.enabled!==undefined&&!['true','false'].includes(args.enabled))throw new Error('INTEGRATION_ARGUMENTS_INVALID');
 const result=await createIntegrationReceptionService(pool).linkCompany({clientId:args.client,sourceSystem:args.source,externalCompanyId:args.external,companyId:Number(args.company),enabled:args.enabled!=='false'});
 console.log('Integration company configured:',result.companyId,'enabled:',result.enabled);
}catch(error){console.error('Integration configuration failed:',error.code||error.message);process.exitCode=1;}finally{await pool.end();}
