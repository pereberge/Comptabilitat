import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanyDatabases,databaseName} from '../src/db/company-databases.js';
import {companyCopyFilter} from '../src/services/company-database-provision.js';

test('database registry rejects missing/unsafe routes and never falls back to the central database',async()=>{
 let route;const central={async execute(){return [route?[{database_name:route}]:[]];}};
 const created=[],registry=createCompanyDatabases(central,{database:'central'},{createPool:options=>{created.push(options);return {end:async()=>{}};}});
 await assert.rejects(registry.forCompany(1),{code:'COMPANY_DATABASE_NOT_CONFIGURED'});
 for(const name of ['central','bad; DROP TABLE companies','../other']){route=name;await assert.rejects(registry.forCompany(1));}
 route='company_1';const first=await registry.forCompany(1);assert.equal(await registry.forCompany(1),first);assert.equal(created.length,1);assert.equal(created[0].database,'company_1');
 await registry.end();assert.throws(()=>databaseName('x`'));assert.throws(()=>databaseName('a'.repeat(65)));
});

test('company copying includes only the selected company and fails on unknown unscoped tables',()=>{
 assert.deepEqual(companyCopyFilter('companies',[],85),{sql:' WHERE id=?',params:[85]});
 assert.deepEqual(companyCopyFilter('accounts',[{Field:'company_id'}],85),{sql:' WHERE company_id=?',params:[85]});
 assert.deepEqual(companyCopyFilter('schema_migrations',[],85),{sql:'',params:[]});
 assert.throws(()=>companyCopyFilter('unexpected_global_data',[],85),/UNCLASSIFIED_COMPANY_TABLE/);
});
