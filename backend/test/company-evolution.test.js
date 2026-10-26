import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCompanyEvolution} from '../src/services/company-evolution.js';
const company={id:1,name:'Evolution'};
const exercise=(id,year)=>({id,company_id:1,name:String(year),start_date:year+'-01-01',end_date:year+'-12-31',status:'closed'});
const row=(id,parent,closing,generated='0.00',exerciseId=1)=>({id,company_id:1,exercise_id:exerciseId,code:parent.padEnd(8,'0'),parent_code:parent,parent_description:parent,description:parent,closing,debit:'0.00',credit:'0.00',generated_result:generated});
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
