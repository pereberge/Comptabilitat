import { decimal } from '../../../shared/money.js';
import { amount } from './report-amount.js';
import { HttpError } from '../middleware/errors.js';
const reject=code=>{throw new HttpError(409,code);};
const limit=999999999999999n;
export function accountBalances(rows){
 const result=new Map();
 for(const row of rows){const key=row.account_id;let account=result.get(key);if(!account){account={id:key,code:row.code,description:row.account_name,balance:0n};result.set(key,account);}account.balance+=amount(row.debit)-amount(row.credit);}
 return [...result.values()].filter(row=>row.balance!==0n).sort((a,b)=>a.code.localeCompare(b.code));
}
export function balanceLines(accounts,reverse=false){
 return accounts.filter(row=>row.balance!==0n).map(row=>{
  const value=reverse?-row.balance:row.balance;
  if(value>limit||value< -limit)reject('ANNUAL_ACCOUNT_BALANCE_TOO_LARGE');
  return {account_id:row.id,code:row.code,account_name:row.description,debit:decimal(value>0n?value:0n),credit:decimal(value<0n?-value:0n)};
 });
}
export function lineTotals(lines){
 const debit=lines.reduce((sum,row)=>sum+amount(row.debit),0n),credit=lines.reduce((sum,row)=>sum+amount(row.credit),0n);
 if(debit!==credit)reject('ANNUAL_UNBALANCED_JOURNAL');
 if(lines.length>10000)reject('ANNUAL_TOO_MANY_LINES');
 return {debit:decimal(debit),credit:decimal(credit),lines:lines.length};
}
export function calculateClosing(rows,resultAccount){
 const balances=accountBalances(rows);
 if(balances.reduce((sum,row)=>sum+row.balance,0n)!==0n)reject('ANNUAL_UNBALANCED_JOURNAL');
 if(balances.some(row=>/^[89]/.test(row.code)))reject('ANNUAL_EQUITY_ALLOCATION_REQUIRED');
 const income=balances.filter(row=>/^[67]/.test(row.code)),patrimonial=balances.filter(row=>/^[1-5]/.test(row.code));
 const residual=income.reduce((sum,row)=>sum+row.balance,0n),regularization=balanceLines(income,true);
 if(income.length&&!resultAccount)reject('ANNUAL_RESULT_ACCOUNT_REQUIRED');
 if(residual!==0n)regularization.push(...balanceLines([{...resultAccount,description:resultAccount.description,balance:residual}]));
 if(income.length){
  const existing=patrimonial.find(row=>row.id===resultAccount.id&&row.code===resultAccount.code);
  if(existing)existing.balance+=residual;
  else if(residual!==0n)patrimonial.push({...resultAccount,balance:residual});
 }
 const closing=balanceLines(patrimonial,true),carry=balanceLines(patrimonial);
 return {regularization,closing,carry,result_transfer:decimal(-residual),regularization_totals:lineTotals(regularization),closing_totals:lineTotals(closing)};
}
export function calculateCarry(rows,entries,end){
 const closings=entries.filter(row=>row.status==='posted'&&row.entry_type==='closing');
 if(closings.length!==1||closings[0].entry_date!==end)reject('ANNUAL_SOURCE_CLOSING_INVALID');
 const all=accountBalances(rows);
 if(all.length)reject('ANNUAL_SOURCE_CLOSING_INVALID');
 const before=accountBalances(rows.filter(row=>row.entry_id!==closings[0].id));
 if(before.some(row=>!/^[1-5]/.test(row.code)))reject('ANNUAL_SOURCE_CLOSING_INVALID');
 const lines=balanceLines(before),totals=lineTotals(lines);
 if(!lines.length)reject('ANNUAL_NO_OPENING_BALANCES');
 return {lines,totals,closing_entry:{id:closings[0].id,number:closings[0].number}};
}
