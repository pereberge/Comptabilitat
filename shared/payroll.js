import {cents,decimal} from './money.js';
import {isValidIban} from './company-profile.js';
import {payrollAgreement,payrollAgreementFor} from './payroll-agreements.js';
export {payrollAgreement,payrollReferences} from './payroll-agreements.js';
const fail=(code='INVALID_PAYROLL_INPUT')=>{throw Object.assign(new Error(code),{code});};
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const payrollCanonical=value=>JSON.stringify((function sort(item){return Array.isArray(item)?item.map(sort):plain(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,sort(item[key])])):item;})(value));
const max=(a,b)=>a>b?a:b,min=(a,b)=>a<b?a:b;
export const payrollRound=(value,divisor=10000n)=>(value+divisor/2n)/divisor;
function amount(value){try{return cents(value);}catch{fail();}}
function signedAmount(value){return typeof value==='string'&&value.startsWith('-')?-amount(value.slice(1)):amount(value);}
function rate(value){if(typeof value!=='string'||!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(value))fail();const n=amount(value);if(n>10000n)fail();return n;}
function text(value,length=200,required=false){if(typeof value!=='string'||value.length>length||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)||required&&!value.trim())fail();return value.trim();}
export function payrollDate(value){if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)fail();return value;}
export function payrollMonth(year,month){const y=Number(year),m=Number(month);if(!Number.isInteger(y)||y<2000||y>2099||!Number.isInteger(m)||m<1||m>12)fail();const from=y+'-'+String(m).padStart(2,'0')+'-01',to=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);return {from,to,days:Number(to.slice(8))};}
export function emptyPayrollEmployee(agreement=payrollAgreement){return {code:'',name:'',tax_id:'',ss_number:'',address:'',iban:'',job_title:'',contract_code:'',notes:'',agreement:agreement.name,agreement_code:agreement.code,employment_start:'',employment_end:'',salary_unit:'daily',contribution_group:'10',work_percent:'100.00',unemployment:'ordinary',base_salary:'0.00',seniority:'0.00',attendance_rate:agreement.attendance,extra_annual:'0.00',prorated:false,irpf_rate:null,accident_rate:null,agreement_reviewed:false,active:true,batch_excluded:false,monthly_template:null};}
export function normalizePayrollEmployee(value){
 if(!plain(value))fail();const defaults=emptyPayrollEmployee(payrollAgreementFor(value.agreement_code)||payrollAgreement);if(Object.keys(value).some(key=>!Object.hasOwn(defaults,key)))fail();const p={...defaults,...value};if(!payrollAgreementFor(p.agreement_code))fail();
 for(const [key,length,required]of [['code',24,true],['name',160,true],['tax_id',32],['ss_number',20],['address',250],['iban',34],['job_title',160],['agreement',200]])p[key]=text(p[key],length,required);
 p.contract_code=text(p.contract_code,3);if(p.contract_code&&!/^\d{3}$/.test(p.contract_code))fail();p.notes=text(p.notes,2000);
 p.code=p.code.toUpperCase();if(!/^[A-Z0-9._-]{1,24}$/.test(p.code))fail();p.tax_id=p.tax_id.replace(/[\s.-]/g,'').toUpperCase();p.ss_number=p.ss_number.replace(/[\s/-]/g,'');if(p.ss_number&&!/^\d{11,12}$/.test(p.ss_number))fail();p.iban=p.iban.replace(/\s/g,'').toUpperCase();if(p.iban&&!isValidIban(p.iban))fail();
 payrollDate(p.employment_start);if(p.employment_end){payrollDate(p.employment_end);if(p.employment_end<p.employment_start)fail();}
 if(!['daily','monthly'].includes(p.salary_unit)||! /^(?:[1-9]|10|11)$/.test(p.contribution_group)||!['ordinary','temporary','excluded'].includes(p.unemployment))fail();
 for(const key of ['prorated','agreement_reviewed','active','batch_excluded'])if(typeof p[key]!=='boolean')fail();
 for(const key of ['base_salary','seniority','attendance_rate'])p[key]=decimal(amount(p[key]));if(p.extra_annual!==null)p.extra_annual=decimal(amount(p.extra_annual));
 for(const key of ['work_percent','irpf_rate','accident_rate'])if(p[key]!==null)p[key]=decimal(rate(p[key]));
 if(p.work_percent!==null&&rate(p.work_percent)===0n)fail();p.monthly_template=normalizePayrollTemplate(p.monthly_template);return p;
}
export function normalizePayrollTemplate(value){
 if(value===null)return null;if(!plain(value)||Object.keys(value).some(key=>!['source_period','input'].includes(key))||typeof value.source_period!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value.source_period))fail();
 const input=normalizePayrollInput(value.input);if(input.kind!=='monthly')fail();return {source_period:value.source_period,input:{...input,confirmed:false}};
}
export function normalizePayrollSettings(value={}){if(!plain(value)||Object.keys(value).some(key=>!['contribution_account','notes'].includes(key)))fail();const p={contribution_account:'',notes:'',...value};p.contribution_account=text(p.contribution_account,20).replace(/[\s/-]/g,'');if(p.contribution_account&&!/^\d{11}$/.test(p.contribution_account))fail();p.notes=text(p.notes,1000);return p;}
export const payrollManualKeys=['base_cc','base_at','base_irpf','employee_cc','employee_unemployment','employee_training','employee_mei','employee_solidarity','employee_other','employer_cc','employer_unemployment','employer_training','employer_fogasa','employer_mei','employer_accidents','employer_solidarity','employer_other'];
export function emptyPayrollInput(employee,year,month,kind='monthly'){
 const period=payrollMonth(year,month),agreement=payrollAgreementFor(employee.agreement_code)||payrollAgreement,annual=employee.extra_annual??'0.00',base={period_from:period.from,period_to:period.to,kind,mode:'general_2026',units:employee.salary_unit==='monthly'?30:period.days,attendance_days:null,base_salary:employee.base_salary,seniority:employee.seniority,attendance_rate:employee.attendance_rate,attendance_override:null,extra_annual:annual,prorated:employee.prorated,extra_amount:decimal(payrollRound(amount(annual),BigInt(agreement.extra_count))),irpf_rate:employee.irpf_rate,accident_rate:employee.accident_rate,earnings:[],advance:'0.00',other_deductions:'0.00',special_case:false,extra_cotized:false,confirmed:false,notes:'',manual:Object.fromEntries(payrollManualKeys.map(key=>[key,'0.00']))};
 if(kind!=='monthly'||!employee.monthly_template)return base;const template=normalizePayrollTemplate(employee.monthly_template);
 return {...base,...template.input,period_from:period.from,period_to:period.to,units:base.units,base_salary:employee.base_salary,seniority:employee.seniority,irpf_rate:employee.irpf_rate,accident_rate:employee.accident_rate,confirmed:false,notes:('Referencia económica: '+template.source_period+'. Revisar conceptos, incidencias, bases, cuotas e IRPF para este período.\n'+template.input.notes).slice(0,2000)};
}
export function normalizePayrollInput(value){
 if(!plain(value))fail();const defaults=emptyPayrollInput(emptyPayrollEmployee(),2026,1);if(Object.keys(value).some(key=>!Object.hasOwn(defaults,key)&&!['reviewed_extra_proration','employer_rounding'].includes(key)))fail();const p={...defaults,...value};
 payrollDate(p.period_from);payrollDate(p.period_to);if(p.period_from.slice(0,7)!==p.period_to.slice(0,7)||p.period_from>p.period_to||!['monthly','extra'].includes(p.kind)||!['general_2026','reviewed'].includes(p.mode))fail();
 if(!Number.isInteger(p.units)||p.units<1||p.units>31||p.attendance_days!==null&&(!Number.isInteger(p.attendance_days)||p.attendance_days<0||p.attendance_days>31))fail();
 for(const key of ['prorated','special_case','extra_cotized','confirmed'])if(typeof p[key]!=='boolean')fail();
 for(const key of ['base_salary','seniority','attendance_rate','extra_annual','extra_amount','advance','other_deductions'])p[key]=decimal(amount(p[key]));
 if(p.attendance_override!==null)p.attendance_override=decimal(amount(p.attendance_override));for(const key of ['irpf_rate','accident_rate'])if(p[key]!==null)p[key]=decimal(rate(p[key]));
 if(!Array.isArray(p.earnings)||p.earnings.length>50)fail();const keys=new Set();p.earnings=p.earnings.map(row=>{if(!plain(row)||typeof row.id!=='string'||! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.id)||keys.has(row.id))fail();keys.add(row.id);return {id:row.id,description:text(row.description,160,true),amount:decimal(amount(row.amount))};});
 if(!plain(p.manual)||Object.keys(p.manual).some(key=>!payrollManualKeys.includes(key)))fail();p.manual=Object.fromEntries(payrollManualKeys.map(key=>[key,decimal(amount(p.manual[key]??'0.00'))]));p.notes=text(p.notes,2000);
 if(Object.hasOwn(p,'reviewed_extra_proration'))p.reviewed_extra_proration=decimal(amount(p.reviewed_extra_proration));if(Object.hasOwn(p,'employer_rounding')){const adjustment=signedAmount(p.employer_rounding);if(adjustment>100n||adjustment< -100n)fail();p.employer_rounding=decimal(adjustment);}return p;
}
export function calculatePayroll(employee,value,employer={}){
 const input=normalizePayrollInput(value),issues=[],issue=code=>{if(!issues.includes(code))issues.push(code);},month=payrollMonth(input.period_from.slice(0,4),input.period_from.slice(5,7)),year=Number(input.period_from.slice(0,4)),periodDays=Math.round((Date.parse(input.period_to)-Date.parse(input.period_from))/86400000)+1,group=Number(employee.contribution_group),daily=employee.salary_unit==='daily';
 if(!employee.tax_id||!employee.ss_number||!employee.job_title)issue('PAYROLL_EMPLOYEE_INCOMPLETE');
 if(!employer.tax_id||!employer.name||!employer.contribution_account)issue('PAYROLL_EMPLOYER_INCOMPLETE');
 if(!employee.agreement_reviewed)issue('PAYROLL_AGREEMENT_REVIEW');if(!input.confirmed)issue('PAYROLL_REVIEW_REQUIRED');if(input.irpf_rate===null)issue('PAYROLL_IRPF_REQUIRED');
 if(input.period_from<employee.employment_start||employee.employment_end&&input.period_to>employee.employment_end)issue('PAYROLL_EMPLOYMENT_DATES');
 const agreement=payrollAgreementFor(employee.agreement_code)||payrollAgreement;
 if(employer.payroll_agreement!==undefined&&employer.payroll_agreement!==agreement.code)issue('PAYROLL_AGREEMENT_CHANGED');
 const fullMonth=input.period_from===month.from&&input.period_to===month.to;
 if(input.mode==='general_2026'&&(year!==2026||!fullMonth||employee.work_percent!=='100.00'||employee.unemployment==='excluded'||input.special_case||daily&&group<8||!daily&&group>7||input.units!==(daily?month.days:30)))issue('PAYROLL_AUTOMATIC_SCOPE');
 if(input.mode==='general_2026'&&employee.extra_annual===null)issue('PAYROLL_EXTRA_ANNUAL_UNKNOWN');
 if(input.kind==='extra'&&input.prorated&&(agreement.prorated_count===agreement.extra_count||Number(month.from.slice(5,7))===3))issue('PAYROLL_EXTRA_PRORATED');if(input.kind==='extra'&&input.mode==='general_2026'&&!input.extra_cotized)issue('PAYROLL_EXTRA_COTIZED_REVIEW');
 if(input.kind==='monthly'&&input.mode==='general_2026'&&amount(input.extra_annual)<(amount(input.base_salary)+amount(input.seniority))*BigInt((daily?30:1)*agreement.extra_count))issue('PAYROLL_EXTRA_ANNUAL_REVIEW');
 const earnings=[];const earn=(description,value)=>{if(value>0n)earnings.push({description,amount:decimal(value)});};
 const multiplier=BigInt(input.units),base=daily?amount(input.base_salary)*multiplier:payrollRound(amount(input.base_salary)*multiplier,30n),seniority=daily?amount(input.seniority)*multiplier:payrollRound(amount(input.seniority)*multiplier,30n);
 const yearDays=(Number(month.from.slice(0,4))%4===0?366n:365n),denominator=daily?yearDays:360n,extraProration=payrollRound(amount(input.extra_annual)*multiplier,denominator),paidExtraProration=input.prorated?payrollRound(amount(input.extra_annual)*multiplier*BigInt(agreement.prorated_count),denominator*BigInt(agreement.extra_count)):0n;
 if(input.kind==='monthly'){
  earn('Salario base',base);earn(agreement.seniority_label,seniority);
  if(input.attendance_days===null&&input.attendance_override===null&&amount(input.attendance_rate)>0n)issue('PAYROLL_ATTENDANCE_REQUIRED');
  earn('Prima de asistencia',input.attendance_override!==null?amount(input.attendance_override):amount(input.attendance_rate)*BigInt(input.attendance_days||0));
  if(input.prorated)earn(agreement.extra_count===agreement.prorated_count?'Prorrata de pagas extraordinarias':'Prorrata paga de marzo',paidExtraProration);
 }else earn('Paga extraordinaria',amount(input.extra_amount));
 for(const row of input.earnings)earn(row.description,amount(row.amount));const gross=earnings.reduce((sum,row)=>sum+amount(row.amount),0n);
 let baseCc=0n,baseAt=0n,baseIrpf=gross,contributions=[];
 const contribution=(code,label,base,workerRate,companyRate)=>{const worker=payrollRound(base*workerRate),company=payrollRound(base*companyRate);contributions.push({code,label,base:decimal(base),employee_rate:decimal(workerRate),employer_rate:decimal(companyRate),employee:decimal(worker),employer:decimal(company)});};
 if(input.mode==='reviewed'){
  baseCc=amount(input.manual.base_cc);baseAt=amount(input.manual.base_at);baseIrpf=amount(input.manual.base_irpf);
  for(const [code,label,base,key]of [['cc','Contingencias comunes',baseCc,'cc'],['unemployment','Desempleo',baseAt,'unemployment'],['training','Formación profesional',baseAt,'training'],['mei','Mecanismo de equidad intergeneracional',baseCc,'mei'],['solidarity','Cotización adicional de solidaridad',0n,'solidarity'],['other','Otras cotizaciones revisadas',0n,'other'],['accidents','Accidentes de trabajo y enfermedades profesionales',baseAt,'accidents'],['fogasa','FOGASA',baseAt,'fogasa']])contributions.push({code,label,base:decimal(base),employee_rate:null,employer_rate:null,employee:input.manual['employee_'+key]||'0.00',employer:input.manual['employer_'+key]||'0.00'});
 }else if(input.kind==='monthly'){
  if(input.accident_rate===null)issue('PAYROLL_ACCIDENT_RATE_REQUIRED');
  const raw=gross+extraProration-paidExtraProration,maximum=daily?17004n*multiplier:510120n,minimum=daily?4748n*multiplier:({1:198930n,2:164970n,3:143520n}[group]||142440n);
  baseCc=min(maximum,max(minimum,raw));baseAt=min(maximum,max(daily?4748n*multiplier:142440n,raw));
  contribution('cc','Contingencias comunes',baseCc,470n,2360n);contribution('unemployment','Desempleo',baseAt,employee.unemployment==='excluded'?0n:employee.unemployment==='temporary'?160n:155n,employee.unemployment==='excluded'?0n:employee.unemployment==='temporary'?670n:550n);contribution('training','Formación profesional',baseAt,10n,60n);contribution('mei','Mecanismo de equidad intergeneracional',baseCc,15n,75n);contribution('fogasa','FOGASA',baseAt,0n,employee.unemployment==='excluded'?0n:20n);contribution('accidents','Accidentes de trabajo y enfermedades profesionales',baseAt,0n,input.accident_rate===null?0n:rate(input.accident_rate));
  const excess=max(0n,raw-maximum)*10n,first=min(excess,maximum),second=min(max(0n,excess-first),maximum*4n),third=max(0n,excess-first-second);
  for(const [index,numerator,workerRate,companyRate]of [[1,first,19n,96n],[2,second,21n,104n],[3,third,24n,122n]])if(numerator>0n)contributions.push({code:'solidarity_'+index,label:'Solidaridad · Tramo '+index,base:decimal(payrollRound(numerator,10n)),employee_rate:decimal(workerRate),employer_rate:decimal(companyRate),employee:decimal(payrollRound(numerator*workerRate,100000n)),employer:decimal(payrollRound(numerator*companyRate,100000n))});
 }
 if(input.mode==='reviewed'&&input.employer_rounding&&input.employer_rounding!=='0.00')contributions.push({code:'rounding',label:'Diferencia de redondeo del resumen',base:'0.00',employee_rate:null,employer_rate:null,employee:'0.00',employer:input.employer_rounding});
 const employeeSs=contributions.reduce((sum,row)=>sum+amount(row.employee),0n),employerSs=contributions.reduce((sum,row)=>sum+signedAmount(row.employer),0n),irpf=payrollRound(baseIrpf*(input.irpf_rate===null?0n:rate(input.irpf_rate))),advance=amount(input.advance),other=amount(input.other_deductions),deductions=employeeSs+irpf+advance+other,net=gross-deductions;
 if(employerSs<0n)fail();
 if(net<0n)issue('PAYROLL_NEGATIVE_NET');if(gross===0n)issue('PAYROLL_EMPTY');if(gross>999999999999999n||employerSs>999999999999999n||gross+employerSs>999999999999999n)fail('PAYROLL_AMOUNT_TOO_LARGE');
 return {input,rules:input.mode==='general_2026'?'RG-2026-PJC297':'IMPORTES-REVISADOS',earnings,contributions,bases:{cc:decimal(baseCc),at:decimal(baseAt),irpf:decimal(baseIrpf),extra_proration:input.kind==='monthly'?(input.mode==='reviewed'&&input.reviewed_extra_proration!==undefined?input.reviewed_extra_proration:decimal(extraProration)):'0.00'},totals:{gross:decimal(gross),employee_ss:decimal(employeeSs),employer_ss:decimal(employerSs),irpf:decimal(irpf),advance:input.advance,other_deductions:input.other_deductions,deductions:decimal(deductions),net:decimal(net),company_cost:decimal(gross+employerSs)},issues,ready:issues.length===0,period_days:periodDays};
}
