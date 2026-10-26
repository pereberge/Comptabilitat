import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createContextService } from '../src/services/context.js';
import { companyScope } from '../src/middleware/company-scope.js';

test('API company selection scopes concurrent requests, defaults and invalid IDs', async () => {
  const companies = [{id:1,name:'One'},{id:2,name:'Two'}];
  const db = {async execute(sql, params=[]) {
    if (sql.includes('FROM companies')) return [params.length ? companies.filter(c=>c.id===params[0]) : companies];
    if (sql.includes('FROM accounting_exercises')) return [[{id:params[0]*10,name:'2026',is_default:1}]];
    if (sql.includes('FROM accounts')) {
      await new Promise(resolve=>setTimeout(resolve, params[0]===1 ? 20 : 1));
      return [[{id:params[0]*100,company_id:params[0]}]];
    }
    throw new Error('Unexpected query');
  }};
  const app = createApp(createContextService(db,1), {}, companyScope(db,1));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api';
  const request=(path,id)=>fetch(base+path,{headers:id===undefined?{}:{'X-Company-Id':id}});
  try {
    assert.deepEqual(await (await request('/companies')).json(),companies.map(company=>({...company,business_format:'general',tax_id:'',city:'',logo_url:null})));
    for(const id of ['1','2']) {
      const context=await (await request('/context',id)).json();
      assert.equal(context.company.id,Number(id));
      assert.equal(context.exercises[0].id,Number(id)*10);
    }
    const responses=await Promise.all(['1','2','1','2'].map(async id=>({id,rows:await (await request('/accounts',id)).json()})));
    for(const {id,rows} of responses) assert.equal(rows[0].company_id,Number(id));
    assert.equal((await (await request('/accounts')).json())[0].company_id,1);
    for(const id of ['0','-1','abc','1 OR 1=1','9007199254740992']) assert.equal((await request('/accounts',id)).status,400);
    assert.equal((await request('/context','99')).status,404);
    assert.equal((await request('/accounts','99')).status,404);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
