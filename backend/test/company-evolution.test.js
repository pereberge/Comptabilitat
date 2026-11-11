import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCompanyEvolution,createCompanyEvolutionService,isAnnualProfitTransferDescription} from '../src/services/company-evolution.js';
import {companyScope} from '../src/middleware/company-scope.js';
const company={id:1,name:'Evolution'};
const exercise=(id,year)=>({id,company_id:1,name:String(year),start_date:year+'-01-01',end_date:year+'-12-31',status:'closed'});
const row=(id,parent,closing,generated='0.00',exerciseId=1)=>({id,company_id:1,exercise_id:exerciseId,code:parent.padEnd(8,'0'),parent_code:parent,parent_description:parent,description:parent,closing,debit:'0.00',credit:'0.00',generated_result:generated});

function reportPool(companies,transfers=[]){
 const calls=[];
 const db={async query(sql){calls.push({sql});},async execute(sql,params){calls.push({sql,params});return [sql.startsWith('SELECT id,name FROM companies')?companies:sql.startsWith('SELECT e.id,e.description')?transfers:[]];},async commit(){},async rollback(){},release(){}};
 return {calls,async getConnection(){return db;}};
}

test('master evolution discovers all companies and scopes balances to their actual IDs',async()=>{
 const companies=[{id:85,name:'Nou Fons'},{id:583,name:'Piensos ARB'},{id:823,name:'Reciclajes'},{id:999,name:'Future company'}],pool=reportPool(companies);
 const report=await createCompanyEvolutionService(pool).get({as_of:'2026-11-10',companyIds:[85]});
 assert.deepEqual(report.companies.map(c=>c.id),[85,583,823,999]);
 const queries=pool.calls.filter(c=>c.params);assert.equal(queries[0].sql,'SELECT id,name FROM companies ORDER BY name');
 assert.deepEqual(queries[1].params,[85,583,823,999,'2026-11-10']);assert.deepEqual(queries[2].params,queries[1].params);
 assert.ok(report.companies.every(c=>c.years.length===0));
});

test('master evolution supports an empty catalog and explicit per-database scope',async()=>{
 const empty=reportPool([]);assert.deepEqual((await createCompanyEvolutionService(empty).get()).companies,[]);assert.equal(empty.calls.filter(c=>c.params).length,1);
 const scoped=reportPool([{id:583,name:'ARB'}]);await createCompanyEvolutionService(scoped,{companyIds:[583]}).get({as_of:'2026-11-10'});
 assert.deepEqual(scoped.calls.find(c=>c.params).params,[583]);
});

test('annual profit transfers use explicit concepts and never confuse stock, VAT or ordinary adjustments',()=>{
 for(const text of ['Regularización del ejercicio','REGULARIZACION DEL EJERCICIO.','Liquidar pèrdues i guanys.'])assert.equal(isAnnualProfitTransferDescription(text),true);
 for(const text of ['Regularizacion de existencias','TANCAMENT IVA','REPARTIMENT IS','REGULARIZACION','Liquidar pèrdues i guanys parcial'])assert.equal(isAnnualProfitTransferDescription(text),false);
});

test('profit query excludes only validated annual transfers while preserving equity balances',async()=>{
 const pool=reportPool([{id:583,name:'ARB'}],[{id:42,description:'Regularización del ejercicio'},{id:43,description:'Liquidar pèrdues i guanys.'},{id:44,description:'Regularizacion de existencias'}]);
 await createCompanyEvolutionService(pool).get({as_of:'2026-11-10'});
 const candidates=pool.calls.find(c=>c.sql.startsWith('SELECT e.id,e.description'));
 assert.match(candidates.sql,/e.entry_date=x.end_date/);assert.match(candidates.sql,/SUM\(l.debit-l.credit\)=0/);assert.match(candidates.sql,/LEFT\(a.code,3\)<>'129'/);
 const balances=pool.calls.find(c=>c.sql.includes('AS generated_result'));
 assert.deepEqual(balances.params,[42,43,583,'2026-11-10']);assert.match(balances.sql,/SUM\(l.debit-l.credit\) AS closing/);assert.match(balances.sql,/e.id NOT IN \(\?,\?\)/);
});

test('separate-database master evolution includes every registered company with isolated reads',async()=>{
 const accessed=[],ids=[85,583,823,999],registry={async list(){return ids.map(company_id=>({company_id}));},async forCompany(id){accessed.push(id);return reportPool([{id,name:'Company '+id}]);}};
 const middleware=companyScope({},85,{automaticBackups:{},companyDatabases:registry}),req={path:'/master/company-evolution'};
 let next=false;await middleware(req,{},()=>{next=true;});assert.equal(next,true);
 const report=await req.companyEvolution.get({as_of:'2026-11-10'});assert.deepEqual(accessed,ids);assert.deepEqual(report.companies.map(c=>c.id).sort((a,b)=>a-b),ids);
});
test('evolution reports net equity rather than assets or liabilities and retains an allocated profit',()=>{
 const years=[exercise(2,2026),exercise(1,2025),exercise(3,2027)];
 const balances=[row(1,'5720','1650.00'),row(2,'1000','-1000.00'),row(3,'1700','-500.00'),row(4,'1200','-150.00'),row(5,'7000','0.00','200.00'),row(6,'6220','0.00','-50.00')];
 const report=buildCompanyEvolution([company],years,balances,'2026-10-24');
 assert.deepEqual(report.companies[0].years.map(year=>year.name),['2025','2026']);
 const [old,current]=report.companies[0].years;
 assert.equal(old.net_equity,'1150.00');assert.equal(old.profit,'150.00');assert.equal(old.needs_review,false);
 assert.equal(current.net_equity,null);assert.equal(current.profit,null);assert.equal(current.has_activity,false);assert.equal(current.partial,true);assert.equal(current.cutoff,'2026-10-24');
});
test('evolution preserves negative equity, losses and cents beyond floating point precision',()=>{
 const rows=[row(1,'5720','999999999999999.99'),row(2,'5721','0.02'),row(3,'1000','-1000000000000000.01')];
 assert.equal(buildCompanyEvolution([company],[exercise(1,2025)],rows,'2026-10-24').companies[0].years[0].net_equity,'1000000000000000.01');
 const loss=[row(1,'5720','-25.01'),row(2,'6220','25.01','-25.01')];
 const year=buildCompanyEvolution([company],[exercise(1,2025)],loss,'2026-10-24').companies[0].years[0];
 assert.equal(year.net_equity,'-25.01');assert.equal(year.profit,'-25.01');assert.equal(year.needs_review,true);
});
