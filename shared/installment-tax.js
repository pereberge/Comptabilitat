import {decimal} from './money.js';
import {corporateAmount,corporateRound,corporatePeriod,corporateTaxRules,normalizeCorporateTaxInput,calculateCorporateTax} from './corporate-tax.js';
export const installmentPeriods=[{id:'1',label:'1/P · Abril',month:'04',cutoff:'03-31'},{id:'2',label:'2/P · Octubre',month:'10',cutoff:'09-30'},{id:'3',label:'3/P · Diciembre',month:'12',cutoff:'11-30'}];
const fail=(code='INVALID_INSTALLMENT_TAX_INPUT')=>{throw Object.assign(new Error(code),{code});};
const max=(a,b)=>a>b?a:b,min=(a,b)=>a<b?a:b;
export function installmentPeriod(exercise,value){
 const annual=corporatePeriod(exercise),year=String(value?.year),number=String(value?.period),definition=installmentPeriods.find(row=>row.id===number);
 if(!/^20\d{2}$/.test(year)||!definition)fail('INVALID_INSTALLMENT_TAX_PERIOD');
 const to=year+'-'+definition.cutoff;if(to<annual.from||to>annual.to)fail('INVALID_INSTALLMENT_TAX_PERIOD');
 return {year:Number(year),period:Number(number),code:number+'P',label:definition.label,from:annual.from,to,filing_from:year+'-'+definition.month+'-01',annual};
}
export function emptyInstallmentTaxInput(){return {method:'40.2',previous_turnover:null,reference_base:'0.00',reference_note:'',reference_confirmed:false,option_confirmed:false,regime:'general',erd_extension:false,new_entity_eligible:false,new_loss_exception:false,consolidated:false,special_scope:false,confirmed:false,reviewed_source_hash:'',adjustments:[],capitalization:'0.00',losses_available:'0.00',losses_mode:'none',losses_requested:'0.00',leveling_increase:'0.00',leveling_decrease:'0.00',bonuses:'0.00',withholdings:'0.00',previous_payments:'0.00',notes:''};}
const fiscalKeys=['regime','previous_turnover','erd_extension','new_entity_eligible','new_loss_exception','consolidated','adjustments','capitalization','losses_available','losses_mode','losses_requested','leveling_increase','leveling_decrease'];
export function normalizeInstallmentTaxInput(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const defaults=emptyInstallmentTaxInput();if(Object.keys(value).some(key=>!Object.hasOwn(defaults,key)))fail();const input={...defaults,...value};
 if(!['40.2','40.3'].includes(input.method))fail();
 for(const key of ['reference_confirmed','option_confirmed','special_scope','confirmed'])if(typeof input[key]!=='boolean')fail();
 try{
  const fiscal=normalizeCorporateTaxInput({...Object.fromEntries(fiscalKeys.map(key=>[key,input[key]])),confirmed_general:input.confirmed,reviewed_source_hash:input.reviewed_source_hash,notes:input.notes});
  for(const key of fiscalKeys)input[key]=fiscal[key];input.notes=fiscal.notes;
  input.reference_base=decimal(corporateAmount(input.reference_base));
  for(const key of ['bonuses','withholdings','previous_payments'])input[key]=decimal(corporateAmount(input[key],{signed:false}));
 }catch(error){if(error.code==='INVALID_CORPORATE_TAX_INPUT')fail();throw error;}
 if(typeof input.reference_note!=='string'||input.reference_note.length>500||/[\u0000-\u001f]/.test(input.reference_note))fail();
 return input;
}
export function calculateInstallmentTax(source,value,period,{strict=false}={}){
 const input=normalizeInstallmentTaxInput(value),issues=[],issue=code=>{if(!issues.includes(code))issues.push(code);},million=100000000n,turnover=input.previous_turnover===null?null:corporateAmount(input.previous_turnover),large=turnover!==null&&turnover>=10n*million;
 const requiredMethod=turnover!==null&&turnover>6n*million?'40.3':null;
 if(turnover===null)issue('CORPORATE_TAX_TURNOVER_REQUIRED');
 if(!corporateTaxRules[period.annual.year])issue('CORPORATE_TAX_YEAR_UNVERIFIED');
 if(requiredMethod&&input.method!==requiredMethod)issue('INSTALLMENT_TAX_METHOD_REQUIRED');
 if(input.consolidated||input.special_scope)issue('INSTALLMENT_TAX_SPECIAL_SCOPE');
 if(!input.confirmed)issue('CORPORATE_TAX_REVIEW_REQUIRED');
 if(input.confirmed&&input.reviewed_source_hash!==source.source_hash){if(strict)fail('CORPORATE_TAX_SOURCE_CHANGED');issue('CORPORATE_TAX_SOURCE_CHANGED');}
 if(source.today&&period.to>source.today)issue('INSTALLMENT_TAX_PERIOD_IN_PROGRESS');
 let result=0n,boxes={},brackets=[],annualModel=null,gross=0n,ordinary=0n,minimum=0n;
 if(input.method==='40.2'){
  if(!input.reference_confirmed)issue('INSTALLMENT_TAX_REFERENCE_REQUIRED');
  const base=corporateAmount(input.reference_base);result=max(0n,corporateRound(base*1800n));gross=result;ordinary=result;boxes={'01':base,'03':result};
 }else{
  if(!requiredMethod&&!input.option_confirmed)issue('INSTALLMENT_TAX_OPTION_REQUIRED');
  const fiscal={...Object.fromEntries(fiscalKeys.map(key=>[key,input[key]])),confirmed_general:input.confirmed,reviewed_source_hash:input.reviewed_source_hash,credits_mode:'manual'};
  // Limits and the 50,000-euro band refer to the full tax period, not the elapsed 3/9/11 months.
  annualModel=calculateCorporateTax({...source,today:null,credits_473:'0.00'},fiscal,period.annual,{strict});
  for(const code of annualModel.issues)if(code!=='CORPORATE_TAX_SPECIAL_SCOPE')issue(code);
  const taxable=max(0n,corporateAmount(annualModel.summary.tax_base)),rates=corporateTaxRules[period.annual.year]?.[input.regime]??2500;
  const installmentRate=rate=>large?((BigInt(rate)*19n+1999n)/2000n)*100n:(BigInt(rate)*5n/700n)*100n;
  if(Array.isArray(rates)){
   const denominator=period.annual.short?365n:1n,threshold=5000000n*(period.annual.short?BigInt(period.annual.days):1n),first=min(taxable*denominator,threshold),remaining=taxable*denominator-first;
   const rate1=installmentRate(rates[0]),rate2=installmentRate(rates[1]);
   if(rate1===rate2){gross=corporateRound(taxable*rate1);brackets=[{base:decimal(taxable),tax_rate:rates.map(rate=>decimal(BigInt(rate))).join(' / '),rate:decimal(rate1),quota:decimal(gross)}];}
   else{const quota1=corporateRound(first*rate1,denominator*10000n),quota2=corporateRound(remaining*rate2,denominator*10000n);gross=quota1+quota2;brackets=[{base:decimal(corporateRound(first,denominator)),tax_rate:decimal(BigInt(rates[0])),rate:decimal(rate1),quota:decimal(quota1)},{base:decimal(corporateRound(remaining,denominator)),tax_rate:decimal(BigInt(rates[1])),rate:decimal(rate2),quota:decimal(quota2)}];}
  }else{const rate=installmentRate(rates);gross=corporateRound(taxable*rate);brackets=[{base:decimal(taxable),tax_rate:decimal(BigInt(rates)),rate:decimal(rate),quota:decimal(gross)}];}
  const bonuses=corporateAmount(input.bonuses),withholdings=corporateAmount(input.withholdings),paid=corporateAmount(input.previous_payments);
  ordinary=gross-bonuses-withholdings-paid;
  minimum=large?max(0n,corporateRound(max(0n,corporateAmount(source.net_result))*2300n)-paid):0n;
  result=max(0n,max(ordinary,minimum));
  boxes={'04':corporateAmount(source.net_result),'05':max(0n,corporateAmount(source.income_tax_expense)),'06':max(0n,-corporateAmount(source.income_tax_expense)),'07':corporateAmount(annualModel.summary.increases),'08':corporateAmount(annualModel.summary.decreases),'13':corporateAmount(annualModel.summary.adjusted_base),'44':corporateAmount(annualModel.summary.capitalization),'14':corporateAmount(annualModel.losses.applied),'45':corporateAmount(input.leveling_increase),'46':corporateAmount(input.leveling_decrease),'16':taxable,'18':gross,'27':bonuses,'28':withholdings,'30':paid,'32':ordinary,'33':minimum,'34':result};
  if(annualModel.provisional)boxes['46']=corporateAmount(annualModel.boxes['01034']);
  if(brackets.length>1){delete boxes['16'];delete boxes['18'];boxes['19']=taxable;boxes['26']=gross;boxes['20']=corporateAmount(brackets[0].base);boxes['23']=corporateAmount(brackets[1].base);boxes['22']=corporateAmount(brackets[0].quota);boxes['25']=corporateAmount(brackets[1].quota);}
 }
 const mandatory=turnover===null?null:turnover>6n*million||result>0n;
 return {input,period,annual_model:annualModel,brackets,issues,provisional:issues.length>0,required_method:requiredMethod,mandatory,result:decimal(result),boxes:Object.fromEntries(Object.entries(boxes).map(([key,amount])=>[key,decimal(amount)])),summary:{gross:decimal(gross),ordinary:decimal(ordinary),minimum:decimal(minimum),result:decimal(result)}};
}
