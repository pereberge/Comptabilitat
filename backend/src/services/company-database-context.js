import {createContextService} from './context.js';
import {createCompanyService} from './companies.js';

// Central companies reserve IDs and support the user/company foreign keys.
export function createCompanyDatabaseContext(central,registry,{provision}={}){
 const catalog=createCompanyService(central);
 const context=async companyId=>createContextService(await registry.forCompany(companyId),Number(companyId));
 return {
  async listCompanies(allowed=null){
   const rows=(await catalog.listCompanies()).filter(row=>allowed===null||allowed.includes(row.id)),result=[];
   for(const row of rows)result.push(await (await context(row.id)).getCompany(row.id));
   return result.sort((a,b)=>a.name.localeCompare(b.name)||a.id-b.id);
  },
  async getCompany(companyId){return (await context(companyId)).getCompany(companyId);},
  async getCompanyLogo(companyId){return (await context(companyId)).getCompanyLogo(companyId);},
  async getContext(companyId){return (await context(companyId)).getContext(companyId);},
  async updateCompany(companyId,body){
   const result=await (await context(companyId)).updateCompany(companyId,body);
   await central.execute('UPDATE companies SET name=?,business_format=?,subaccount_length=? WHERE id=?',[result.name,result.business_format,result.subaccount_length,result.id]);
   return result;
  },
  async createCompany(body){
   if(!provision)throw new Error('COMPANY_DATABASE_PROVISIONING_UNAVAILABLE');
   const company=await catalog.createCompany(body);
   await provision(company.id);
   return this.getCompany(company.id);
  },
  async health(){await central.execute('SELECT 1');for(const row of await registry.list())await (await registry.forCompany(row.company_id)).execute('SELECT 1');return {status:'ok',database:'connected'};},
 };
}
