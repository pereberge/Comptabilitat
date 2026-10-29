import { decimal } from './money.js';

export const vatCategories = {
 output: { label: 'Ventas interiores sujetas', direction: 'issued' },
 output_adjustment: { label: 'Modificación de bases y cuotas', direction: 'issued', boxes: ['14','15'] },
 intra_sales: { label: 'Entregas intracomunitarias', direction: 'issued', boxes: ['59'] },
 exports: { label: 'Exportaciones y operaciones asimiladas', direction: 'issued', boxes: ['60'] },
 reverse_sales: { label: 'Ventas con inversión del sujeto pasivo', direction: 'issued', boxes: ['122'] },
 outside: { label: 'No sujetas por localización', direction: 'issued', boxes: ['120'] },
 exempt: { label: 'Ventas interiores exentas', direction: 'issued', boxes: [] },
 domestic: { label: 'Compras interiores corrientes', direction: 'received', boxes: ['28','29'] },
 investment: { label: 'Compras interiores · bienes de inversión', direction: 'received', boxes: ['30','31'] },
 imports: { label: 'Importaciones corrientes · DUA', direction: 'received', boxes: ['32','33'] },
 import_investment: { label: 'Importaciones · bienes de inversión · DUA', direction: 'received', boxes: ['34','35'] },
 intra: { label: 'Adquisiciones intracomunitarias corrientes', direction: 'received', boxes: ['36','37'], output: ['10','11'] },
 intra_investment: { label: 'Adquisiciones intracomunitarias · inversión', direction: 'received', boxes: ['38','39'], output: ['10','11'] },
 reverse: { label: 'Inversión del sujeto pasivo · compras corrientes', direction: 'received', boxes: ['28','29'], output: ['12','13'] },
 reverse_investment: { label: 'Inversión del sujeto pasivo · inversión', direction: 'received', boxes: ['30','31'], output: ['12','13'] },
 input_adjustment: { label: 'Rectificación de deducciones', direction: 'received', boxes: ['40','41'] },
 agriculture: { label: 'Compensaciones régimen agrícola, ganadero y pesca', direction: 'received', boxes: ['42'] },
 non_deductible: { label: 'IVA no deducible / compra sin cuota', direction: 'received', boxes: [] },
 pending: { label: 'Pendiente de clasificación fiscal' },
};
export const outputRates = [
 { rate: '0.00', base: '150', type: '151', tax: '152' },
 { rate: '4.00', base: '01', type: '02', tax: '03' },
 { rate: '10.00', base: '04', type: '05', tax: '06' },
 { rate: '21.00', base: '07', type: '08', tax: '09' },
];
export const vatModelRows = [
 ...outputRates.map(row=>({...row,section:'output',label:'Régimen general · '+row.rate.replace('.00','')+' %'})),
 {section:'output',label:'Adquisiciones intracomunitarias',base:'10',tax:'11'},
 {section:'output',label:'Otras operaciones con inversión del sujeto pasivo',base:'12',tax:'13'},
 {section:'output',label:'Modificación de bases y cuotas',base:'14',tax:'15'},
 {section:'deductible',label:'Operaciones interiores corrientes',base:'28',tax:'29'},
 {section:'deductible',label:'Operaciones interiores · bienes de inversión',base:'30',tax:'31'},
 {section:'deductible',label:'Importaciones corrientes',base:'32',tax:'33'},
 {section:'deductible',label:'Importaciones · bienes de inversión',base:'34',tax:'35'},
 {section:'deductible',label:'Adquisiciones intracomunitarias corrientes',base:'36',tax:'37'},
 {section:'deductible',label:'Adquisiciones intracomunitarias · inversión',base:'38',tax:'39'},
 {section:'deductible',label:'Rectificación de deducciones',base:'40',tax:'41'},
 {section:'deductible',label:'Compensaciones régimen agrícola, ganadero y pesca',tax:'42'},
 ...[['59','Entregas intracomunitarias'],['60','Exportaciones y operaciones asimiladas'],['120','No sujetas por localización'],['122','Ventas con inversión del sujeto pasivo']].map(([base,label])=>({section:'information',base,label})),
];
export function vatError(code='INVALID_VAT_INPUT') { const error=new Error(code); error.code=code; throw error; }
export function vatAmount(value,{signed=true}={}) {
 if(typeof value!=='string'||!(signed?/^-?\d{1,13}([.,]\d{1,2})?$/:/^\d{1,13}([.,]\d{1,2})?$/).test(value))vatError();
 const [whole,fraction='']=value.replace(',','.').replace(/^-/,'').split('.');
 const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return value.startsWith('-')?-result:result;
}
export function vatPercent(value) { const amount=vatAmount(value,{signed:false}); if(amount>10000n)vatError();return amount; }
export function roundedRatio(value,multiplier,divisor=10000n) { const sign=value<0n?-1n:1n; return sign*((value*sign*multiplier+divisor/2n)/divisor); }
export function vatPeriod(query={}) {
 const year=String(query.year??''),frequency=query.frequency,period=String(query.period??'');
 if(!/^20\d{2}$/.test(year)||!['quarterly','monthly'].includes(frequency)||!/^([1-9]|1[0-2])$/.test(period))vatError('INVALID_VAT_PERIOD');
 const number=Number(period);if(frequency==='quarterly'&&number>4)vatError('INVALID_VAT_PERIOD');
 const month=frequency==='quarterly'?(number-1)*3+1:number,last=frequency==='quarterly'?month+2:month;
 return {year:Number(year),frequency,period:number,code:frequency==='quarterly'?number+'T':period.padStart(2,'0'),from:year+'-'+String(month).padStart(2,'0')+'-01',to:new Date(Date.UTC(Number(year),last,0)).toISOString().slice(0,10)};
}
export function normalizeVatInput(input={}) {
 if(!input||typeof input!=='object'||Array.isArray(input))vatError();
 const compensation=decimal(vatAmount(input.compensation_pending??'0.00',{signed:false}));
 if(input.confirmed_general!==undefined&&typeof input.confirmed_general!=='boolean')vatError();
 if(input.apply_compensation!==undefined&&typeof input.apply_compensation!=='boolean')vatError();
 const overrides=input.overrides??[];if(!Array.isArray(overrides)||overrides.length>10000)vatError();
 const keys=new Set();
 return {confirmed_general:input.confirmed_general===true,apply_compensation:input.apply_compensation===true,compensation_pending:compensation,overrides:overrides.map(row=>{
  if(!row||typeof row!=='object'||typeof row.key!=='string'||row.key.length>140||keys.has(row.key)||!Object.hasOwn(vatCategories,row.category)||typeof row.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(row.fingerprint))vatError();
  keys.add(row.key);
  return {key:row.key,fingerprint:row.fingerprint,category:row.category,base:decimal(vatAmount(row.base)),rate:decimal(vatPercent(row.rate)),deductible_percent:decimal(vatPercent(row.deductible_percent??'100.00'))};
 })};
}
export function calculateVatModel(sources,input={},period={year:2026},{strict=false}={}) {
 const normalized=normalizeVatInput(input),overrides=new Map(normalized.overrides.map(row=>[row.key,row]));
 const boxes={},contributions={},stale=[];
 const add=(box,value,key)=>{boxes[box]=(boxes[box]||0n)+value;(contributions[box]??=[]).push({key,amount:decimal(value)});};
 const records=sources.map(source=>{
  let override=overrides.get(source.key);
  if(override&&override.fingerprint!==source.fingerprint){stale.push(source.key);if(strict)vatError('VAT_SOURCE_CHANGED');override=null;}
  overrides.delete(source.key);
  const row={...source,category:override?.category??source.category,base:override?.base??source.base,rate:override?.rate??source.rate,deductible_percent:override?.deductible_percent??'100.00',reviewed:!!override||!source.review_required};
  const category=vatCategories[row.category];
  if(!category||category.direction&&category.direction!==row.direction)vatError();
  const base=vatAmount(row.base),tax=vatAmount(row.tax_amount),rate=vatPercent(row.rate),deduction=roundedRatio(tax,vatPercent(row.deductible_percent));
  const rateRow=outputRates.find(item=>item.rate===row.rate);
  if(row.category!=='pending'){
   const zeroOnly=['intra_sales','exports','outside','reverse_sales','exempt'];
   if(zeroOnly.includes(row.category)&&tax!==0n)vatError();
   if(row.category==='output'&&(!rateRow||tax<0n||base<0n||abs(roundedRatio(base,rate)-tax)>1n))vatError();
   if(row.paired_output&&!category.output)vatError();
   if(category.output&&(tax<0n||base<0n||abs(roundedRatio(base,rate)-tax)>1n))vatError();
   if(['domestic','investment','imports','import_investment'].includes(row.category)&&(tax<0n||base<0n||tax>0n&&base===0n))vatError();
  }
  row.deductible_tax=row.direction==='received'&&!['non_deductible','pending'].includes(row.category)?decimal(deduction):'0.00';row.contributions={};
  const assign=(box,value)=>{add(box,value,row.key);row.contributions[box]=decimal(value);};
  if(row.category==='pending')return row;
  if(row.category==='output'){assign(rateRow.base,base);assign(rateRow.tax,tax);}
  else if(category.boxes?.length===2){
   // Acquisitions at zero rate / exempt do not belong in deductible bases.
   if(row.direction==='issued'||tax!==0n){assign(category.boxes[0],base);assign(category.boxes[1],row.direction==='received'?deduction:tax);}
  }else if(category.boxes?.length===1)assign(category.boxes[0],row.category==='agriculture'?deduction:base);
  if(category.output){assign(category.output[0],base);assign(category.output[1],tax);}
  return row;
 });
 for(const key of overrides.keys()){stale.push(key);if(strict)vatError('VAT_SOURCE_CHANGED');}
 const total=(box,parts)=>{boxes[box]=parts.reduce((sum,[part,sign])=>sum+(boxes[part]||0n)*sign,0n);const amounts=new Map();for(const [part,sign]of parts)for(const row of contributions[part]||[])amounts.set(row.key,(amounts.get(row.key)||0n)+vatAmount(row.amount)*sign);contributions[box]=[...amounts].map(([key,amount])=>({key,amount:decimal(amount)}));};
 total('27',['152','03','06','09','11','13','15'].map(key=>[key,1n]));
 total('45',['29','31','33','35','37','39','41','42'].map(key=>[key,1n]));
 total('46',[['27',1n],['45',-1n]]);total('64',[['46',1n]]);total('66',[['64',1n]]);
 boxes['65']=10000n;boxes['110']=vatAmount(normalized.compensation_pending);
 const positive=boxes['66']>0n?boxes['66']:0n;
 boxes['78']=normalized.apply_compensation?(boxes['110']<positive?boxes['110']:positive):0n;
 boxes['87']=boxes['110']-boxes['78'];total('69',[['66',1n]]);if(boxes['78']>0n)add('69',-boxes['78'],'manual:compensation');total('71',[['69',1n]]);
 const pending=records.filter(row=>row.category==='pending'),unreviewed=records.filter(row=>row.category!=='pending'&&!row.reviewed);
 const supported=period.year===2025||period.year===2026;
 return {input:normalized,records,boxes:Object.fromEntries(Object.entries(boxes).map(([key,value])=>[key,decimal(value)])),contributions,pending_count:pending.length,unreviewed_count:unreviewed.length,stale_keys:stale,layout_supported:supported,provisional:!normalized.confirmed_general||!!pending.length||!!unreviewed.length||!!stale.length||!supported,result_kind:boxes['71']>0n?'pay':boxes['71']<0n?'credit':'zero',total_output:decimal(boxes['27']),total_deductible:decimal(boxes['45']),result:decimal(boxes['71'])};
}
const abs=value=>value<0n?-value:value;
