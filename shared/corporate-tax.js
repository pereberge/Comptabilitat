import {decimal} from './money.js';
export const corporateTaxRegimes={general:'Tipo general',micro:'Microempresa · INCN inferior a 1 millón',small:'Entidad de reducida dimensión',new:'Nueva creación · tipo reducido',patrimonial:'Entidad patrimonial'};
export const corporateTaxRules={2024:{general:2500,micro:2300,small:2500,new:1500,patrimonial:2500},2025:{general:2500,micro:[2100,2200],small:2400,new:1500,patrimonial:2500},2026:{general:2500,micro:[1900,2100],small:2300,new:1500,patrimonial:2500}};
const fail=(code='INVALID_CORPORATE_TAX_INPUT')=>{throw Object.assign(new Error(code),{code});};
export function corporateAmount(value,{signed=true}={}){if(typeof value!=='string'||!(signed?/^-?\d{1,22}(?:[.,]\d{1,2})?$/:/^\d{1,22}(?:[.,]\d{1,2})?$/).test(value))fail();const negative=value.startsWith('-'),[whole,fraction='']=value.replace('-','').replace(',','.').split('.');return (BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))*(negative?-1n:1n);}
export function corporateRound(numerator,denominator=10000n){const negative=numerator<0n,value=negative?-numerator:numerator;return ((value+denominator/2n)/denominator)*(negative?-1n:1n);}
const min=(...values)=>values.reduce((a,b)=>a<b?a:b),max=(...values)=>values.reduce((a,b)=>a>b?a:b);
export function corporatePeriod(exercise){
 const from=exercise?.start_date,to=exercise?.end_date;
 for(const date of [from,to])if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail('INVALID_CORPORATE_TAX_PERIOD');
 const year=Number(from.slice(0,4)),days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;
 const anniversary=new Date(from+'T00:00:00Z');anniversary.setUTCFullYear(anniversary.getUTCFullYear()+1);anniversary.setUTCDate(anniversary.getUTCDate()-1);
 if(year<2000||year>2099||days<1||to>anniversary.toISOString().slice(0,10))fail('INVALID_CORPORATE_TAX_PERIOD');
 return {year,from,to,days,short:to<anniversary.toISOString().slice(0,10),exercise_id:exercise.id};
}
export function emptyCorporateTaxInput(){return {regime:'general',previous_turnover:null,erd_extension:false,new_entity_eligible:false,new_loss_exception:false,consolidated:false,confirmed_general:false,reviewed_source_hash:'',adjustments:[],capitalization:'0.00',losses_available:'0.00',losses_mode:'none',losses_requested:'0.00',leveling_increase:'0.00',leveling_decrease:'0.00',bonuses:'0.00',double_tax_relief:'0.00',deductions:'0.00',deduction_limit:'25',enhanced_deduction_eligible:false,credits_mode:'ledger',withholdings:'0.00',payment_1:'0.00',payment_2:'0.00',payment_3:'0.00',notes:''};}
export function normalizeCorporateTaxInput(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))fail();
 const defaults=emptyCorporateTaxInput();if(Object.keys(value).some(key=>!Object.hasOwn(defaults,key)))fail();const input={...defaults,...value};
 if(!Object.hasOwn(corporateTaxRegimes,input.regime)||!['none','maximum','manual'].includes(input.losses_mode)||!['ledger','manual'].includes(input.credits_mode)||!['25','50'].includes(input.deduction_limit))fail();
 for(const key of ['erd_extension','new_entity_eligible','new_loss_exception','consolidated','confirmed_general','enhanced_deduction_eligible'])if(typeof input[key]!=='boolean')fail();
 for(const key of ['capitalization','losses_available','losses_requested','leveling_increase','leveling_decrease','bonuses','double_tax_relief','deductions','withholdings','payment_1','payment_2','payment_3'])input[key]=decimal(corporateAmount(input[key],{signed:false}));
 if(input.previous_turnover!==null)input.previous_turnover=decimal(corporateAmount(input.previous_turnover,{signed:false}));
 if(typeof input.reviewed_source_hash!=='string'||input.reviewed_source_hash&&!/^[a-f0-9]{64}$/.test(input.reviewed_source_hash)||typeof input.notes!=='string'||input.notes.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.notes))fail();
 if(!Array.isArray(input.adjustments)||input.adjustments.length>1000)fail();const ids=new Set();
 input.adjustments=input.adjustments.map(row=>{
  if(!row||typeof row!=='object'||typeof row.id!=='string'||! /^[a-f0-9-]{36}$/i.test(row.id)||ids.has(row.id)||typeof row.description!=='string'||!row.description.trim()||row.description.length>200||!['increase','decrease'].includes(row.direction)||!['permanent','temporary'].includes(row.kind))fail();ids.add(row.id);
  const amount=corporateAmount(row.amount,{signed:false});if(amount<=0n)fail();
  const source_key=row.source_key||'',fingerprint=row.fingerprint||'';if(typeof source_key!=='string'||source_key.length>160||typeof fingerprint!=='string'||(source_key&&!/^[a-f0-9]{64}$/.test(fingerprint))||(!source_key&&fingerprint))fail();
  return {id:row.id,description:row.description.trim(),direction:row.direction,kind:row.kind,amount:decimal(amount),source_key,fingerprint};
 });return input;
}
export function calculateCorporateTax(source,value={},period,{strict=false}={}){
 const input=normalizeCorporateTaxInput(value),issues=[],stale=[],rows=source.records||[],byKey=new Map(rows.map(row=>[row.key,row]));
 const issue=code=>{if(!issues.includes(code))issues.push(code);};
 const bound=(amount,limit,code)=>{if(amount>limit){if(strict)fail(code);issue(code);}return min(amount,limit);};
 const rules=corporateTaxRules[period.year];if(!rules)issue('CORPORATE_TAX_YEAR_UNVERIFIED');
 const turnover=input.previous_turnover===null?null:corporateAmount(input.previous_turnover),million=100000000n;
 if(turnover===null)issue('CORPORATE_TAX_TURNOVER_REQUIRED');
 if(input.consolidated||turnover!==null&&turnover>=20n*million)issue('CORPORATE_TAX_SPECIAL_SCOPE');
 if(input.regime==='micro'&&turnover!==null&&turnover>=million)issue('CORPORATE_TAX_REGIME_TURNOVER');
 if(turnover!==null&&input.regime==='general'&&(turnover<million||period.year>=2025&&turnover<10n*million))issue('CORPORATE_TAX_REGIME_TURNOVER');
 if(turnover!==null&&input.regime==='small'&&turnover<million)issue('CORPORATE_TAX_REGIME_TURNOVER');
 if(input.regime==='small'&&turnover!==null&&turnover>=10n*million&&!input.erd_extension)issue('CORPORATE_TAX_REGIME_TURNOVER');
 if(input.regime==='new'&&!input.new_entity_eligible)issue('CORPORATE_TAX_NEW_ENTITY_REVIEW');
 if(input.new_loss_exception&&input.regime==='patrimonial')issue('CORPORATE_TAX_NEW_LOSS_REVIEW');
 if(input.deduction_limit==='50'&&!input.enhanced_deduction_eligible)issue('CORPORATE_TAX_DEDUCTION_REVIEW');
 if(!source.complete)issue('CORPORATE_TAX_ACCOUNTING_REVIEW');
 if(source.today&&period.to>source.today)issue('CORPORATE_TAX_PERIOD_IN_PROGRESS');
 if(!input.confirmed_general)issue('CORPORATE_TAX_REVIEW_REQUIRED');
 const reviewed=input.reviewed_source_hash===source.source_hash;
 if(input.confirmed_general&&!reviewed){if(strict)fail('CORPORATE_TAX_SOURCE_CHANGED');issue('CORPORATE_TAX_SOURCE_CHANGED');}
 let increases=0n,decreases=0n;
 const adjustments=input.adjustments.map(row=>{
  const evidence=row.source_key?byKey.get(row.source_key):null,changed=!!row.source_key&&(!evidence||evidence.fingerprint!==row.fingerprint);
  if(evidence?.is_income_tax)fail('CORPORATE_TAX_DUPLICATE_TAX_ADJUSTMENT');
  if(changed){stale.push(row.id);if(strict)fail('CORPORATE_TAX_SOURCE_CHANGED');issue('CORPORATE_TAX_SOURCE_CHANGED');}
  const amount=corporateAmount(row.amount);if(!changed){if(row.direction==='increase')increases+=amount;else decreases+=amount;}
  return {...row,stale:changed,entry_id:evidence?.entry_id||null};
 });
 const net=corporateAmount(source.net_result),incomeTax=corporateAmount(source.income_tax_expense),beforeTax=net+incomeTax,adjusted=beforeTax+increases-decreases;
 const positive=max(0n,adjusted),capPercent=period.year>=2025?(turnover!==null&&turnover<million?25n:20n):10n;
 const capitalizationLimit=positive*capPercent/100n,capitalization=bound(corporateAmount(input.capitalization),capitalizationLimit,'CORPORATE_TAX_CAPITALIZATION_LIMIT');
 const beforeLosses=adjusted-capitalization,lossPercent=turnover!==null&&turnover>=60n*million?25n:turnover!==null&&turnover>=20n*million?50n:70n;
 const annualFloor=period.short?million*BigInt(period.days)/365n:million;
 const lossesAvailable=corporateAmount(input.losses_available),basePositive=max(0n,beforeLosses),unlimited=input.regime!=='patrimonial'&&input.new_loss_exception;
 const lossLimit=min(basePositive,lossesAvailable,unlimited?basePositive:max(annualFloor,positive*lossPercent/100n));
 let losses=input.losses_mode==='maximum'?lossLimit:input.losses_mode==='manual'?bound(corporateAmount(input.losses_requested),lossLimit,'CORPORATE_TAX_LOSSES_LIMIT'):0n;
 const base=beforeLosses-losses,levelingEligible=['micro','small'].includes(input.regime),levelingLimit=levelingEligible?min(max(0n,base)/10n,annualFloor):0n;
 if(corporateAmount(input.leveling_decrease)>0n&&!levelingEligible)issue('CORPORATE_TAX_LEVELING_REGIME');
 const leveling=bound(corporateAmount(input.leveling_decrease),levelingLimit,'CORPORATE_TAX_LEVELING_LIMIT'),levelingIncrease=corporateAmount(input.leveling_increase),taxBase=base+levelingIncrease-leveling;
 const taxable=max(0n,taxBase),rates=rules?.[input.regime]??2500;
 let gross=0n,brackets=[];
 if(Array.isArray(rates)){
  const denominator=period.short?365n:1n,threshold=5000000n*(period.short?BigInt(period.days):1n),firstNumerator=min(taxable*denominator,threshold),restNumerator=taxable*denominator-firstNumerator;
  gross=corporateRound(firstNumerator*BigInt(rates[0])+restNumerator*BigInt(rates[1]),denominator*10000n);
  brackets=[{base:decimal(corporateRound(firstNumerator,denominator)),rate:decimal(BigInt(rates[0]))},{base:decimal(corporateRound(restNumerator,denominator)),rate:decimal(BigInt(rates[1]))}];
 }else{gross=corporateRound(taxable*BigInt(rates));brackets=[{base:decimal(taxable),rate:decimal(BigInt(rates))}];}
 const reliefLimit=turnover!==null&&turnover>=20n*million?gross/2n:gross;
 const relief=bound(corporateAmount(input.double_tax_relief),reliefLimit,'CORPORATE_TAX_RELIEF_LIMIT'),bonuses=bound(corporateAmount(input.bonuses),gross-relief,'CORPORATE_TAX_BONUS_LIMIT'),adjustedQuota=gross-relief-bonuses;
 const deductionLimit=adjustedQuota*BigInt(input.deduction_limit)/100n,deductions=bound(corporateAmount(input.deductions),deductionLimit,'CORPORATE_TAX_DEDUCTIONS_LIMIT'),liquid=adjustedQuota-deductions;
 const ledgerCredits=corporateAmount(source.credits_473||'0.00');if(input.credits_mode==='ledger'&&ledgerCredits<0n)issue('CORPORATE_TAX_NEGATIVE_CREDITS');
 const manualCredits=['withholdings','payment_1','payment_2','payment_3'].reduce((sum,key)=>sum+corporateAmount(input[key]),0n),credits=input.credits_mode==='ledger'?max(0n,ledgerCredits):manualCredits,result=liquid-credits;
 const boxes={'00500':net,'00301':max(0n,incomeTax),'00302':max(0n,-incomeTax),'00501':beforeTax,'00417':increases,'00418':decreases,'00550':adjusted,'01032':capitalization,'00547':losses,'00552':base,'01033':levelingIncrease,'01034':leveling,'01330':taxBase,'00562':gross,'00582':adjustedQuota,'00592':liquid,'00611':result,'00621':result};
 return {input,period,adjustments,stale_adjustments:stale,issues,provisional:issues.length>0,result:decimal(result),result_kind:result>0n?'pay':result<0n?'refund':'zero',boxes:Object.fromEntries(Object.entries(boxes).map(([key,amount])=>[key,decimal(amount)])),summary:{net_result:decimal(net),income_tax_expense:decimal(incomeTax),before_tax:decimal(beforeTax),increases:decimal(increases),decreases:decimal(decreases),adjusted_base:decimal(adjusted),capitalization:decimal(capitalization),tax_base:decimal(taxBase),gross_quota:decimal(gross),double_tax_relief:decimal(relief),bonuses:decimal(bonuses),deductions:decimal(deductions),liquid_quota:decimal(liquid),credits:decimal(credits)},limits:{capitalization:decimal(capitalizationLimit),losses:decimal(lossLimit),loss_percent:String(lossPercent),leveling:decimal(levelingLimit),deductions:decimal(deductionLimit)},losses:{available:input.losses_available,applied:decimal(losses),remaining:decimal(lossesAvailable-losses),generated:decimal(max(0n,-taxBase))},brackets};
}
