import {createAutomaticBackupManager} from './automatic-backups.js';

export function createCompanyDatabaseBackups(registry,options={}){
 const managers=new Map();let timer,inFlight;
 async function manager(companyId){
  const db=await registry.forCompany(companyId);
  if(!managers.has(db))managers.set(db,createAutomaticBackupManager(db,options));
  return managers.get(db);
 }
 async function tick(){
  if(inFlight)return inFlight;
  inFlight=(async()=>{for(const row of await registry.list())try{await (await manager(row.company_id)).tick();}catch(error){console.error('Company backup failed:',row.company_id,error.code||error.message);}})();
  try{await inFlight;}finally{inFlight=null;}
 }
 return {
  tick,
  async forCompany(companyId){return (await manager(companyId)).forCompany(companyId);},
  start(){if(timer)return;const run=()=>tick().catch(error=>console.error('Company backups:',error.code||error.message));timer=setInterval(run,60000);timer.unref();run();},
  async stop(){clearInterval(timer);timer=null;await inFlight;await Promise.all([...managers.values()].map(item=>item.stop()));},
 };
}
