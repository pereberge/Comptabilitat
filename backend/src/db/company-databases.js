import mysql from 'mysql2/promise';
import {HttpError} from '../middleware/errors.js';
import {id} from '../services/validation.js';

export function databaseName(value){
 if(typeof value!=='string'||! /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(value))throw new Error('INVALID_DATABASE_NAME');
 return value;
}
export const quoteDatabase=value=>'`'+databaseName(value)+'`';

// Routes come only from the administrator-owned registry, never from HTTP input.
export function createCompanyDatabases(central,settings,{createPool=mysql.createPool}={}){
 const pools=new Map();
 async function schema(companyId){
  const [[row]]=await central.execute('SELECT database_name FROM company_databases WHERE company_id=?',[id(companyId)]);
  if(!row)throw new HttpError(503,'COMPANY_DATABASE_NOT_CONFIGURED');
  const name=databaseName(row.database_name);
  if(name===settings.database)throw new Error('COMPANY_DATABASE_IS_CENTRAL');
  return name;
 }
 return {
  central,schema,
  async list(){const [rows]=await central.execute('SELECT company_id,database_name FROM company_databases ORDER BY company_id');return rows;},
  async forCompany(companyId){
   const name=await schema(companyId);
   if(!pools.has(name))pools.set(name,createPool({...settings,database:name}));
   return pools.get(name);
  },
  async table(companyId,table){
   if(! /^[a-z_]+$/.test(table))throw new Error('INVALID_TABLE_NAME');
   return quoteDatabase(await schema(companyId))+'.`'+table+'`';
  },
  async end(){await Promise.all([...pools.values()].map(pool=>pool.end()));pools.clear();},
 };
}
