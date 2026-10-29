import {decimal} from './money.js';
import {vatCategories} from './vat-model.js';

export function vatDetailCents(value){
 if(typeof value!=='string'||! /^-?\d{1,22}\.\d{2}$/.test(value))throw Object.assign(new Error('INVALID_VAT_DETAIL_AMOUNT'),{code:'INVALID_VAT_DETAIL_AMOUNT'});
 return BigInt(value.replace('.',''));
}
const outputQuotas=['152','03','06','09','11','13','15'];
const inputQuotas=['29','31','33','35','37','39','41','42'];
const outputBoxes=new Set(['150','01','04','07','10','12','14',...outputQuotas,'27']);
const inputBoxes=new Set(['28','30','32','34','36','38','40',...inputQuotas,'45']);
const resultBoxes=new Set(['46','64','66','69','71']);
const sumBoxes=(record,boxes)=>boxes.reduce((sum,box)=>sum+vatDetailCents(record.contributions?.[box]||'0.00'),0n);
const emptyTotals=()=>({base:0n,tax:0n,included:0n,contribution:0n});
const serialize=totals=>Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,decimal(value)]));

export function groupVatDetails(records,{box='all',contributions=[]}={}){
 const values=new Map(contributions.map(row=>[row.key,row.amount]));
 const groups=new Map(['477','472','other'].map(code=>[code,{code,label:code==='477'?'477 · IVA repercutido':code==='472'?'472 · IVA soportado':'Operaciones sin cuota de IVA',accounts:new Map(),totals:emptyTotals(),sourceKeys:new Set()}]));
 for(const source of records){
  let accounts=(source.vat_accounts||[]).map(account=>({...account}));
  if(!accounts.length&&vatDetailCents(source.tax_amount)!==0n)accounts.push({id:null,code:source.direction==='issued'?'477':'472',description:'Subcuenta pendiente de identificar',tax_amount:source.tax_amount});
  if((source.paired_output||vatCategories[source.category]?.output)&&!accounts.some(account=>account.code.startsWith('477'))&&vatDetailCents(source.tax_amount)!==0n)accounts.push({id:null,code:'477',description:'Cuota devengada · subcuenta pendiente',tax_amount:source.tax_amount});
  if(!accounts.length)accounts=[{id:null,code:'',description:'Sin cuenta de IVA',tax_amount:'0.00'}];
  for(const account of accounts){
   const family=/^47[27]/.test(account.code)?account.code.slice(0,3):'other';
   if(outputBoxes.has(box)&&family==='472'||inputBoxes.has(box)&&family==='477')continue;
   const included=family==='477'?sumBoxes(source,outputQuotas):family==='472'?sumBoxes(source,inputQuotas):0n;
   let contribution=vatDetailCents(values.get(source.key)||'0.00');
   // A self-assessed operation contributes once to each side of the result.
   if(resultBoxes.has(box))contribution=family==='472'?-included:included;
   else if(box==='27'||box==='45')contribution=included;
   const row={...source,vat_account_id:account.id,vat_account_code:account.code,vat_account_description:account.description,detail_key:source.key+':'+family+':'+account.code,tax_amount:account.tax_amount,included_tax:decimal(included),contribution:decimal(contribution)};
   const group=groups.get(family),key=account.code||'other';
   if(!group.accounts.has(key))group.accounts.set(key,{code:account.code,description:account.description,rows:[],totals:emptyTotals()});
   const section=group.accounts.get(key);section.rows.push(row);group.sourceKeys.add(source.key);
   const amounts={base:vatDetailCents(row.base),tax:vatDetailCents(row.tax_amount),included,contribution};
   for(const key of Object.keys(amounts)){section.totals[key]+=amounts[key];group.totals[key]+=amounts[key];}
  }
 }
 return [...groups.values()].filter(group=>group.accounts.size||['all','review'].includes(box)&&group.code!=='other').map(group=>({...group,count:group.sourceKeys.size,totals:serialize(group.totals),sourceKeys:undefined,accounts:[...group.accounts.values()].sort((a,b)=>a.code.localeCompare(b.code,'es')).map(account=>({...account,totals:serialize(account.totals)}))}));
}
