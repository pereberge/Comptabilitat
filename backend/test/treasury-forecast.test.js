import test from 'node:test';import assert from 'node:assert/strict';
import {buildTreasuryForecast,treasuryDate} from '../../shared/treasury-forecast.js';
import {readTreasuryForecast} from '../src/services/treasury-forecast.js';
import {createApp} from '../src/app.js';
import {companyScope} from '../src/middleware/company-scope.js';
import {accessControl} from '../src/middleware/access.js';
import {today} from '../src/services/portfolio-data.js';
const asOf='2026-01-01',account={account_id:1,code:'57200001',description:'Bank',balance:'100.00'};
const receipt=(id,amount,date='2026-01-15',direction='received')=>({id,remaining_amount:amount,due_date:date,direction,status:'pending',reference:'INV-'+id,party_name:'Supplier'});
const build=(values={})=>buildTreasuryForecast({asOf,accounts:[account],receipts:[],bankMovements:[],...values});
test('assigned receipts and manual plans affect the selected bank, while linked and cancelled plans do not repeat receipts',()=>{
 const accounts=[account,{...account,account_id:2,balance:'0.00'}],pending={...receipt(1,'60.00'),forecast_account_id:2};
 const plan={id:1,status:'pending',amount:'100.00',direction:'received',description:'Expected invoice',expected_date:'2026-01-20',bank_account_id:1};
 const before=build({accounts,receipts:[pending],plans:[plan]});assert.equal(before.horizons[0].projected_balance,'-60.00');assert.equal(before.unassigned_receipts,0);assert.equal(before.accounts[1].horizons[0].projected_balance,'-60.00');
 for(const status of ['linked','cancelled']){const after=build({accounts,receipts:[pending],plans:[{...plan,status}]});assert.equal(after.horizons[0].projected_balance,'40.00');assert.equal(after.events.filter(row=>row.source==='plan').length,0);}
 const collection=build({plans:[{...plan,direction:'issued',bank_account_id:null}]});assert.equal(collection.horizons[0].collections,'100.00');assert.equal(collection.unassigned_plans,1);assert.equal(collection.accounts[0].horizons[0].projected_balance,'100.00');
});
test('treasury uses only the remaining receipt amount and does not count a future posted payment twice',()=>{
 const r=receipt(1,'60.00'),j={entry_id:2,position:1,account_id:1,date:'2026-01-10',description:'Payment',debit:'0.00',credit:'40.00',linked_receipt:1};
 const data=build({receipts:[r,r,{...receipt(2,'0.00'),status:'settled'}],bankMovements:[j,j]});
 assert.equal(data.horizons[0].projected_balance,'0.00');assert.equal(data.horizons[0].payments,'60.00');assert.equal(data.horizons[0].known_bank_net,'-40.00');assert.equal(data.events.length,2);
 assert.equal(data.accounts[0].horizons[0].projected_balance,'60.00');assert.equal(data.unassigned_receipts,1);
 assert.equal(data.unlinked_future_movements,0);
});
test('forecast API requires a session, company membership and an exercise of that company',async()=>{
 let user={role:'user',company_ids:[85],permissions:{}};const year=today().slice(0,4);
 const db={async query(){},async execute(sql,args){
  if(sql==='SELECT id FROM companies WHERE id=?')return [[{id:args[0]}]];
  assert.equal(args[0],85);
  if(sql.includes('FROM accounting_exercises'))return [args[1]===7?[{id:7,start_date:year+'-01-01',end_date:year+'-12-31'}]:[]];
  if(sql.includes('COALESCE(b.balance'))return [[account]];
  return [[]];
 },async commit(){},async rollback(){},release(){}};
 const pool={execute:db.execute,getConnection:async()=>db},access=accessControl({current:async()=>user});
 const server=createApp({},null,companyScope(pool,85,{automaticBackups:{forCompany:()=>({})}}),access).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const get=(company,exercise=7)=>fetch('http://127.0.0.1:'+server.address().port+'/api/portfolio/forecast?exercise_id='+exercise,{headers:{'X-Company-Id':String(company)}});
  const response=await get(85);assert.equal(response.status,200);assert.equal((await response.json()).opening_balance,'100.00');assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await get(86)).status,403);assert.equal((await get(85,99)).status,404);user=null;assert.equal((await get(85)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('liquidity detects an intermediate deficit even when the final balance is positive',()=>{
 const data=build({receipts:[receipt(1,'200.00','2026-01-05'),receipt(2,'300.00','2026-01-20','issued')]});
 assert.equal(data.horizons[0].projected_balance,'200.00');assert.equal(data.horizons[0].minimum_balance,'-100.00');assert.equal(data.horizons[0].liquidity_need,'100.00');assert.equal(data.horizons[0].first_negative_date,'2026-01-05');
 const sameDay=build({receipts:[receipt(1,'200.00','2026-01-05'),receipt(2,'300.00','2026-01-05','issued')]});assert.equal(sameDay.horizons[0].liquidity_need,'0.00');
});
test('30, 60 and 90 day boundaries, overdue receipts and year crossings are explicit',()=>{
 const data=build({receipts:[receipt(1,'1.00',treasuryDate(asOf,30)),receipt(2,'2.00',treasuryDate(asOf,60)),receipt(3,'3.00',treasuryDate(asOf,90)),receipt(4,'100.00',treasuryDate(asOf,91)),receipt(5,'0.01','2025-12-01')]});
 assert.deepEqual(data.horizons.map(row=>row.payments),['1.01','3.01','6.01']);assert.equal(data.events[0].date,'2026-01-02');assert.equal(data.events[0].original_date,'2025-12-01');assert.equal(data.events[0].overdue,true);
 assert.equal(treasuryDate('2026-12-20',30),'2027-01-19');assert.equal(treasuryDate('2028-02-28',1),'2028-02-29');
});
test('internal bank transfers change account balances but not company cash and support negative journal amounts',()=>{
 const data=build({accounts:[account,{...account,account_id:2,code:'57200002',balance:'50.00'}],bankMovements:[{entry_id:1,position:1,account_id:1,date:'2026-01-05',debit:'-10.00',credit:'0.00'},{entry_id:1,position:2,account_id:2,date:'2026-01-05',debit:'10.00',credit:'0.00'}]});
 assert.equal(data.horizons[0].projected_balance,'150.00');assert.deepEqual(data.accounts.map(row=>row.horizons[0].projected_balance),['90.00','60.00']);
 assert.equal(build({accounts:[{...account,balance:'-0.01'}]}).horizons[0].liquidity_need,'0.01');
});
test('forecast reads a company-scoped consistent snapshot and rejects another company exercise',async()=>{
 const calls=[];let committed=false,released=false,rolledBack=false;
 const db={async query(sql){calls.push(sql);},async execute(sql,args){calls.push(sql);assert.equal(args[0],85);
  if(sql.includes('FROM accounting_exercises'))return [[{id:7,start_date:'2026-01-01',end_date:'2026-12-31'}]];
  if(sql.includes('COALESCE(b.balance')){assert.equal(args[3],85);assert.match(sql,/e.exercise_id=\?/);assert.match(sql,/entry_type<>'closing'/);return [[account]];}
  if(sql.includes('FROM journal_entries')){assert.match(sql,/NOT IN \('opening','closing'\)/);return [[]];}
  if(sql.includes('treasury_receipt_accounts'))throw Object.assign(Error('not migrated'),{code:'ER_NO_SUCH_TABLE'});
  assert.match(sql,/r.company_id=\?/);return [[]];
 },async commit(){committed=true;},async rollback(){rolledBack=true;},release(){released=true;}};
 const pool={getConnection:async()=>db};assert.equal((await readTreasuryForecast(pool,85,7,{asOf})).opening_balance,'100.00');assert.ok(calls.some(sql=>sql.includes('CONSISTENT SNAPSHOT, READ ONLY')));assert.equal(committed,true);assert.equal(released,true);assert.equal(rolledBack,false);
 db.execute=async()=>[[]];await assert.rejects(readTreasuryForecast(pool,85,99,{asOf}),error=>error.code==='EXERCISE_NOT_FOUND');assert.equal(rolledBack,true);
});
