import {decimal} from '../../../shared/money.js';

export const reportAmountDetailKey=Symbol('reportAmountDetail');
const cents=value=>{if(!/^-?\d+\.\d{2}$/.test(value))throw Error('INVALID_REPORT_AMOUNT');return BigInt(value.replace('.',''));};
const sum=rows=>decimal(rows.reduce((total,row)=>total+cents(row.amount),0n));
function find(nodes,id){for(const node of nodes){if(node.id===id)return node;const found=find(node.children||[],id);if(found)return found;}return null;}
function collect(nodes,factor=1n){
 const result=[];
 for(const node of nodes){
  for(const account of node.accounts||[]){
   const subs=account.detail_is_subaccount?[account]:account.subaccounts||[];
   for(const sub of subs)result.push({...sub,amount:decimal(cents(sub.amount)*factor),coefficient:(cents(sub.amount)===cents(sub.signed_balance||'0.00')?1n:-1n)*factor});
  }
  result.push(...collect(node.children||[],factor));
 }
 return result;
}
export function reportAmountRows(sheet,selection){
 const sections=sheet.sections||[];
 if(['node','account','subaccount'].includes(selection.kind)){
  const selected=find(sections,selection.node_id||selection.id);
  let rows=collect(selected?[selected]:selection.node_id||selection.kind==='node'?[]:sections);
  if(selection.kind==='account')rows=rows.filter(row=>row.code.startsWith(selection.code));
  if(selection.kind==='subaccount')rows=rows.filter(row=>row.code===selection.code);
  return rows.sort((a,b)=>a.code.localeCompare(b.code));
 }
 if(selection.kind==='generated_result')return collect(sections);
 if(selection.kind==='result')return collect(sections).filter(row=>selection.key==='booked_129'?(row.parent_code||'').startsWith('129'):selection.key==='residual_6_7'?/^[67]/.test(row.parent_code||''):(row.parent_code||'').startsWith('129')||/^[67]/.test(row.parent_code||''));
 if(selection.kind==='unclassified')return (sheet.diagnostic?.unclassified||[]).filter(row=>!selection.code||row.code===selection.code).map(row=>({...row,amount:row.amount||row.signed_balance,coefficient:row.amount&&cents(row.amount)!==cents(row.signed_balance)?-1n:1n}));
 if(selection.kind!=='total')return [];
 if(sheet.report==='profit_loss'){
  const sides={operating:['operating'],financial:['financial'],before_tax:['operating','financial'],net:['operating','financial','tax']}[selection.key]||[];
  return collect(sections.filter(node=>sides.includes(node.side)));
 }
 if(selection.key==='assets')return collect(sections.filter(node=>node.side==='asset'));
 if(selection.key==='equity_liabilities')return collect(sections.filter(node=>node.side==='equity_liabilities'));
 if(selection.key==='difference')return [...collect(sections.filter(node=>node.side==='asset')),...collect(sections.filter(node=>node.side==='equity_liabilities'),-1n)];
 return [];
}
export function buildReportAmountDetail(sheets,selection){
 const grouped=new Map(),periods=sheets.map(sheet=>({sheet,rows:reportAmountRows(sheet,selection)}));
 periods.forEach(({sheet,rows},index)=>{for(const account of rows){if(!grouped.has(account.code))grouped.set(account.code,{code:account.code,description:account.description,values:Array(sheets.length).fill(null)});grouped.get(account.code).values[index]={account,sheet,amount:account.amount};}});
 const totals=periods.map(period=>sum(period.rows));
 const rows=[...grouped.values()].sort((a,b)=>a.code.localeCompare(b.code)).map(row=>({...row,...(sheets.length===2?{difference:decimal(cents(row.values[0]?.amount||'0.00')-cents(row.values[1]?.amount||'0.00'))}:{})}));
 return {periods,rows,totals,total:sheets.length===2?decimal(cents(totals[0])-cents(totals[1])):totals[0]||'0.00'};
}
export function reportDetailLedgerQuery(sheet,account,selection){
 return {company_id:String(sheet.company.id),exercise_id:String(sheet.exercise.id),account_id:String(account.id),from:sheet.from,to:sheet.to||sheet.date,...(sheet.report==='profit_loss'||selection.kind==='generated_result'?{exclude_annual:'true'}:{exclude_closing:'true'})};
}
