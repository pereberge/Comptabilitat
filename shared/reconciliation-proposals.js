import {cents,decimal} from './money.js';
export const reconciliationConcept=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export const reconciliationSignedAmount=value=>String(value).startsWith('-')?-cents(String(value).slice(1)):cents(String(value));
export function findReconciliationRule(rules,concept,bankAmount){
 const text=' '+reconciliationConcept(concept)+' ',direction=reconciliationSignedAmount(bankAmount)<0n?'out':'in';
 const matches=rules.filter(rule=>rule.direction===direction&&text.includes(' '+rule.concept_key+' ')).sort((a,b)=>b.concept_key.length-a.concept_key.length);
 return {rule:matches.length&&!(matches.length>1&&matches[0].concept_key.length===matches[1].concept_key.length)?matches[0]:null,ambiguous:matches.length>1&&matches[0].concept_key.length===matches[1].concept_key.length};
}
// Scale a remembered split using integer cents; distribute only rounding cents.
export function scaleReconciliationCounterLines(lines,exampleAmount,bankAmount){
 const previous=reconciliationSignedAmount(exampleAmount),current=reconciliationSignedAmount(bankAmount);
 if(!previous||!current||(previous<0n)!==(current<0n)||!Array.isArray(lines)||!lines.length||lines.length>20)throw new Error('RECONCILIATION_INVALID_PROPOSAL');
 const denominator=previous<0n?-previous:previous,numerator=current<0n?-current:current;
 const values=lines.map(line=>{const debit=cents(line.debit),credit=cents(line.credit);if(!((debit>0n&&credit===0n)||(credit>0n&&debit===0n)))throw new Error('RECONCILIATION_INVALID_PROPOSAL');return {...line,net:debit-credit};});
 if(new Set(lines.map(line=>String(line.account_id))).size!==lines.length)throw new Error('RECONCILIATION_INVALID_PROPOSAL');
 if(values.reduce((sum,line)=>sum+line.net,0n)!==-previous||values.some(line=>!line.net))throw new Error('RECONCILIATION_UNBALANCED_PROPOSAL');
 const calculated=values.map((line,index)=>({account_id:line.account_id,index,net:line.net*numerator/denominator,remainder:line.net*numerator%denominator}));
 const difference=-current-calculated.reduce((sum,line)=>sum+line.net,0n),sign=difference<0n?-1n:1n;
 const order=[...calculated].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:Number((a.remainder>b.remainder?-1n:1n)*sign));
 if(difference>BigInt(lines.length)||difference< -BigInt(lines.length))throw new Error('RECONCILIATION_INVALID_PROPOSAL');
 for(let index=0;index<Number(difference<0n?-difference:difference);index++)order[index].net+=sign;
 const debit=calculated.reduce((sum,line)=>sum+(line.net>0n?line.net:0n),current>0n?current:0n),credit=calculated.reduce((sum,line)=>sum+(line.net<0n?-line.net:0n),current<0n?-current:0n);
 if(debit>999999999999999n||credit>999999999999999n)throw new Error('TOTAL_TOO_LARGE');
 return calculated.filter(line=>line.net!==0n).map(line=>({account_id:line.account_id,debit:decimal(line.net>0n?line.net:0n),credit:decimal(line.net<0n?-line.net:0n)}));
}
export function reconciliationProposal(row,template,bank,accounts){
 try{
  const counter=scaleReconciliationCounterLines(template.counter_lines,template.bank_amount,row.amount),byId=new Map(accounts.filter(account=>account.kind==='subaccount').map(account=>[account.id,account]));
  const lines=counter.map(line=>{const account=byId.get(Number(line.account_id));if(!account||account.id===bank.id||account.code===bank.code)throw new Error('ACCOUNT_NOT_FOUND');return {...line,account_id:account.id,code:account.code,name:account.description};});
  const amount=reconciliationSignedAmount(row.amount),absolute=decimal(amount<0n?-amount:amount),bankLine={account_id:bank.id,code:bank.code,name:bank.description,debit:amount>0n?absolute:'0.00',credit:amount<0n?absolute:'0.00'};
  return {movement_id:row.id,date:template.date||row.date,concept:template.concept||row.concept,bank_effect:row.amount,lines:amount>0n?[bankLine,...lines]:[...lines,bankLine]};
 }catch{return null;}
}
