import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {emptyPayrollEmployee,normalizePayrollEmployee,emptyPayrollInput,calculatePayroll,normalizePayrollInput,payrollCanonical} from '../../shared/payroll.js';
import {payrollHtml} from '../src/services/payroll-document.js';
import {poultryAgreement,payrollAgreement,companyHasPayroll,payrollReferencesFor} from '../../shared/payroll-agreements.js';
const employer={name:'Test factory',tax_id:'B12345674',contribution_account:'28123456789'};
const employee=(extra={})=>normalizePayrollEmployee({...emptyPayrollEmployee(),code:'T1',name:'Test worker',tax_id:'12345678Z',ss_number:'281234567890',job_title:'Administración',employment_start:'2020-01-01',salary_unit:'monthly',contribution_group:'7',base_salary:'1800.00',extra_annual:'7200.00',attendance_rate:'0.00',irpf_rate:'12.00',accident_rate:'1.50',agreement_reviewed:true,...extra});
function calculate(profile=employee(),extra={},month=1){return calculatePayroll(profile,{...emptyPayrollInput(profile,2026,month),confirmed:true,...extra},employer);}
test('payroll: monthly salary includes four extras in the contribution base without paying them twice',()=>{
 const value=calculate();assert.equal(value.ready,true);assert.equal(value.totals.gross,'1800.00');assert.equal(value.bases.extra_proration,'600.00');assert.equal(value.bases.cc,'2400.00');assert.equal(value.totals.employee_ss,'156.00');assert.equal(value.totals.irpf,'216.00');assert.equal(value.totals.net,'1428.00');assert.equal(value.totals.employer_ss,'771.60');assert.equal(value.totals.company_cost,'2571.60');
 const prorated=calculate(employee({prorated:true}));assert.equal(prorated.totals.gross,'2400.00');assert.equal(prorated.bases.cc,'2400.00');assert.equal(prorated.totals.employee_ss,'156.00');assert.equal(prorated.totals.net,'1956.00');
});
test('payroll: daily industrial wages use calendar days, attendance and daily limits',()=>{
 const p=employee({salary_unit:'daily',contribution_group:'10',base_salary:'43.03',extra_annual:'5163.60',attendance_rate:'9.50',irpf_rate:'10.00'});
 const january=calculate(p,{attendance_days:22});assert.equal(january.totals.gross,'1542.93');assert.equal(january.bases.extra_proration,'438.55');assert.equal(january.bases.cc,'1981.48');assert.equal(january.totals.employee_ss,'128.79');assert.equal(january.totals.irpf,'154.29');assert.equal(january.totals.net,'1259.85');
 const february=calculate(p,{attendance_days:20},2);assert.equal(february.totals.gross,'1394.84');assert.equal(february.period_days,28);assert.equal(february.input.units,28);
 assert.ok(calculate(p).issues.includes('PAYROLL_ATTENDANCE_REQUIRED'));
});

test('payroll: poultry and livestock use three extras and only the March pay can be prorated',()=>{
 const p=employee({...emptyPayrollEmployee(poultryAgreement),code:'A1',name:'Farm worker',employment_start:'2020-01-01',tax_id:'12345678Z',ss_number:'281234567890',job_title:'Administración',salary_unit:'monthly',contribution_group:'7',base_salary:'1800.00',extra_annual:'5400.00',irpf_rate:'12.00',accident_rate:'1.50',agreement_reviewed:true});
 const input={...emptyPayrollInput(p,2026,1),confirmed:true},company={...employer,payroll_agreement:poultryAgreement.code},value=calculatePayroll(p,input,company);
 assert.equal(value.ready,true);assert.equal(input.extra_amount,'1800.00');assert.equal(value.bases.extra_proration,'450.00');assert.equal(value.bases.cc,'2250.00');assert.equal(value.totals.net,'1437.74');
 const prorated=calculatePayroll(p,{...input,prorated:true},company);assert.equal(prorated.totals.gross,'1950.00');assert.equal(prorated.bases.cc,'2250.00');assert.equal(prorated.totals.net,'1569.74');
 const june=calculatePayroll(p,{...emptyPayrollInput(p,2026,6,'extra'),confirmed:true,prorated:true,extra_cotized:true},company);assert.equal(june.ready,true);assert.equal(june.totals.gross,'1800.00');
 const march=calculatePayroll(p,{...emptyPayrollInput(p,2026,3,'extra'),confirmed:true,prorated:true,extra_cotized:true},company);assert.ok(march.issues.includes('PAYROLL_EXTRA_PRORATED'));
 assert.ok(calculatePayroll(p,input,{...employer,payroll_agreement:payrollAgreement.code}).issues.includes('PAYROLL_AGREEMENT_CHANGED'));
 assert.equal(companyHasPayroll({payroll_agreement:''}),false);assert.equal(companyHasPayroll({payroll_agreement:poultryAgreement.code}),true);
 const reference=payrollReferencesFor(poultryAgreement.code).find(row=>row.id==='official');assert.equal(reference.base,'45.15');assert.equal(reference.attendance,'0.00');
});
test('payroll: extra pay with social contributions already accrued only withholds IRPF',()=>{
 const extra=calculate(employee(),{kind:'extra',extra_amount:'1800.00',extra_cotized:true});assert.equal(extra.ready,true);assert.equal(extra.totals.gross,'1800.00');assert.equal(extra.totals.employee_ss,'0.00');assert.equal(extra.totals.employer_ss,'0.00');assert.equal(extra.totals.net,'1584.00');
 assert.ok(calculate(employee(),{kind:'extra'}).issues.includes('PAYROLL_EXTRA_COTIZED_REVIEW'));
 assert.ok(calculate(employee({prorated:true}),{kind:'extra',extra_cotized:true}).issues.includes('PAYROLL_EXTRA_PRORATED'));
});
test('payroll: minimum contribution bases, maximum bases and solidarity are independent of cash',()=>{
 const low=calculate(employee({contribution_group:'1',base_salary:'1000.00',extra_annual:'0.00'}));assert.equal(low.bases.cc,'1989.30');assert.equal(low.bases.at,'1424.40');
 const high=calculate(employee({base_salary:'8000.00',extra_annual:'0.00'}));assert.equal(high.bases.cc,'5101.20');assert.equal(high.bases.at,'5101.20');const solidarity=high.contributions.filter(row=>row.code.startsWith('solidarity_'));assert.equal(solidarity.length,3);assert.equal(solidarity[0].base,'510.12');assert.equal(solidarity[0].employee,'0.97');assert.equal(solidarity[0].employer,'4.90');assert.equal(solidarity[1].base,'2040.48');assert.equal(solidarity[2].base,'348.20');
 const fixed=calculate(employee({unemployment:'temporary'}));assert.equal(fixed.contributions.find(row=>row.code==='unemployment').employee,'38.40');assert.equal(fixed.contributions.find(row=>row.code==='unemployment').employer,'160.80');
});
test('payroll: reviewed bases and quotas support special cases without invented social rates',()=>{
 const p=employee({work_percent:'50.00'}),input=emptyPayrollInput(p,2025,1),value=calculatePayroll(p,{...input,mode:'reviewed',confirmed:true,manual:{...input.manual,base_cc:'1500.00',base_at:'1500.00',base_irpf:'1800.00',employee_cc:'70.50',employee_unemployment:'23.25',employee_training:'1.50',employee_mei:'1.95',employer_cc:'354.00'},advance:'50.00',other_deductions:'10.00'},employer);
 assert.equal(value.ready,true);assert.equal(value.totals.employee_ss,'97.20');assert.equal(value.totals.net,'1426.80');assert.equal(value.totals.employer_ss,'354.00');
 assert.ok(calculate(p).issues.includes('PAYROLL_AUTOMATIC_SCOPE'));assert.ok(calculate(employee(),{special_case:true}).issues.includes('PAYROLL_AUTOMATIC_SCOPE'));
});
test('payroll: exact complementary cents and explicit review prevent malformed or negative payrolls',()=>{
 const value=calculate(employee(),{earnings:[{id:randomUUID(),description:'Turno',amount:'0.01'}],advance:'0.01'});assert.equal(value.totals.gross,'1800.01');assert.equal(value.totals.net,'1428.00');
 assert.ok(calculate(employee(),{advance:'2000.00'}).issues.includes('PAYROLL_NEGATIVE_NET'));
 assert.ok(calculate(employee(),{extra_annual:'0.00'}).issues.includes('PAYROLL_EXTRA_ANNUAL_REVIEW'));
 for(const changes of [{base_salary:'1.001'},{units:0},{irpf_rate:'101.00'},{period_to:'2026-02-31'},{earnings:[{id:randomUUID(),description:'',amount:'1'}]},{confirmed:1}])assert.throws(()=>normalizePayrollInput({...emptyPayrollInput(employee(),2026,1),...changes}),{code:'INVALID_PAYROLL_INPUT'});
 assert.equal(payrollCanonical({b:2,a:1}),payrollCanonical({a:1,b:2}));
});
test('payroll: document escapes worker data and exposes employer contribution and immutable void status',()=>{
 const person=employee({name:'<script>alert(1)</script>'}),calculation=calculate(person),html=payrollHtml({employee_snapshot:{profile:person},employer_snapshot:employer,period_from:'2026-01-01',period_to:'2026-01-31',kind:'monthly',status:'voided',void_reason:'<test>',calculation});assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('NÓMINA ANULADA'));assert.ok(html.includes('Seguridad Social a cargo de la empresa'));assert.ok(html.includes('1.428,00'));
});

test('payroll: imported profiles preserve unknown conditions and contract evidence without enabling automatic wages',()=>{
 const profile=employee({work_percent:null,extra_annual:null,contract_code:'200',notes:'Source receipt: monthly pay. Contracted percentage and annual extras pending.',unemployment:'excluded'});
 assert.equal(profile.work_percent,null);assert.equal(profile.extra_annual,null);assert.equal(profile.contract_code,'200');
 const input=emptyPayrollInput(profile,2026,10),result=calculatePayroll(profile,{...input,confirmed:true},employer);
 assert.equal(result.ready,false);assert.ok(result.issues.includes('PAYROLL_AUTOMATIC_SCOPE'));assert.ok(result.issues.includes('PAYROLL_EXTRA_ANNUAL_UNKNOWN'));
 assert.equal(result.contributions.find(row=>row.code==='unemployment').employee,'0.00');assert.equal(result.contributions.find(row=>row.code==='fogasa').employer,'0.00');
 for(const changes of [{contract_code:'20X'},{contract_code:'2000'},{notes:'x'.repeat(2001)},{work_percent:'0.00'},{extra_annual:'-1.00'}])assert.throws(()=>normalizePayrollEmployee({...profile,...changes}),{code:'INVALID_PAYROLL_INPUT'});
 const old=employee();delete old.contract_code;delete old.notes;assert.deepEqual(calculatePayroll(normalizePayrollEmployee(old),{...emptyPayrollInput(old,2026,1),confirmed:true},employer),calculate(old));
});

test('payroll: monthly economic templates copy complements and documented bases without duplicating benefits',()=>{
 const original=employee({work_percent:null,extra_annual:null}),reference={...emptyPayrollInput(original,2026,9),mode:'reviewed',prorated:false,earnings:[{id:randomUUID(),description:'Voluntary supplement',amount:'250.00'},{id:randomUUID(),description:'Benefits pay',amount:'100.00'}],reviewed_extra_proration:'300.00',manual:{base_cc:'2450.00',base_at:'2450.00',base_irpf:'2150.00',employee_cc:'115.15',employer_cc:'578.20'},notes:'Reference document; review variable concepts.'};
 const person=normalizePayrollEmployee({...original,monthly_template:{source_period:'2026-09',input:reference}}),input=emptyPayrollInput(person,2026,10),calculation=calculatePayroll(person,input,employer);
 assert.equal(input.period_to,'2026-10-31');assert.equal(input.units,30);assert.equal(input.confirmed,false);assert.equal(input.mode,'reviewed');assert.match(input.notes,/2026-09/);assert.equal(calculation.totals.gross,'2150.00');assert.equal(calculation.totals.irpf,'258.00');assert.equal(calculation.totals.net,'1776.85');assert.equal(calculation.bases.cc,'2450.00');assert.equal(calculation.bases.extra_proration,'300.00');assert.ok(calculation.issues.includes('PAYROLL_REVIEW_REQUIRED'));
 input.earnings[0].amount='999.00';input.manual.base_cc='1.00';assert.equal(person.monthly_template.input.earnings[0].amount,'250.00');assert.equal(person.monthly_template.input.manual.base_cc,'2450.00');
 const changed=emptyPayrollInput({...person,base_salary:'1900.00',irpf_rate:'15.00'},2026,11);assert.equal(changed.base_salary,'1900.00');assert.equal(changed.irpf_rate,'15.00');assert.equal(changed.period_to,'2026-11-30');assert.equal(emptyPayrollInput(person,2026,12,'extra').earnings.length,0);
 const legacy=emptyPayrollInput(original,2026,10);assert.equal(Object.hasOwn(legacy,'reviewed_extra_proration'),false);assert.equal(Object.hasOwn(legacy,'employer_rounding'),false);assert.deepEqual(calculatePayroll({...original,monthly_template:null},legacy,employer),calculatePayroll(original,legacy,employer));
 assert.throws(()=>normalizePayrollEmployee({...original,monthly_template:{source_period:'bad',input:reference}}),{code:'INVALID_PAYROLL_INPUT'});
});

test('payroll: documented rounding differences preserve component quotas and the summary total',()=>{
 const person=employee(),base={...emptyPayrollInput(person,2026,10),mode:'reviewed',confirmed:true,manual:{base_irpf:'1800.00',employer_cc:'100.00'}};
 for(const [rounding,total]of [['0.01','100.01'],['-0.01','99.99']]){const result=calculatePayroll(person,{...base,employer_rounding:rounding},employer);assert.equal(result.totals.employer_ss,total);assert.equal(result.contributions.find(row=>row.code==='cc').employer,'100.00');assert.equal(result.contributions.find(row=>row.code==='rounding').employer,rounding);}
 for(const employer_rounding of ['-1.01','1.01','bad'])assert.throws(()=>normalizePayrollInput({...base,employer_rounding}),{code:'INVALID_PAYROLL_INPUT'});
 assert.throws(()=>calculatePayroll(person,{...base,manual:{base_irpf:'1800.00'},employer_rounding:'-0.01'},employer),{code:'INVALID_PAYROLL_INPUT'});
});
