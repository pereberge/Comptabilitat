import {decimal} from './money.js';
import {reconciliationSignedAmount} from './reconciliation-proposals.js';

export function reconciliationPostingState(records,entries,movementAmount){
 const ids=new Set(records.map(row=>row.entry_id)),active=entries.filter(row=>ids.has(row.id)&&row.status==='posted');
 const total=active.reduce((sum,row)=>sum+reconciliationSignedAmount(row.bank_amount),0n);
 const done=ids.size>0&&active.length===ids.size&&total===reconciliationSignedAmount(movementAmount);
 return {entries:active,done,modified:active.length>0&&!done,amount:decimal(total)};
}
