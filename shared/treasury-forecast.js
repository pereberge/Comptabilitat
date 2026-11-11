import {cents,decimal,signedCents} from './money.js';
export function treasuryDate(asOf,days){const date=new Date(asOf+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);const value=date.toISOString().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('TREASURY_INVALID_DATE');return value;}
export function buildTreasuryForecast({asOf,accounts,receipts,bankMovements,plans=[]}){
 const opening=accounts.reduce((sum,row)=>sum+signedCents(row.balance),0n),events=[],seen=new Set();
 for(const receipt of receipts){
  const key='receipt:'+receipt.id;if(seen.has(key))continue;seen.add(key);
  if(!['pending','partial'].includes(receipt.status)||cents(receipt.remaining_amount)===0n)continue;
  const payment=cents(receipt.remaining_amount),day=receipt.due_date<=asOf?treasuryDate(asOf,1):receipt.due_date;
  if(day>treasuryDate(asOf,90))continue;
  events.push({key,source:'receipt',date:day,original_date:receipt.due_date,overdue:receipt.due_date<asOf,reference:receipt.reference,description:receipt.party_name,account_id:receipt.forecast_account_id??null,amount:decimal(receipt.direction==='issued'?payment:-payment)});
 }
 for(const plan of plans){
  const key='plan:'+plan.id;if(seen.has(key)||plan.status!=='pending')continue;seen.add(key);
  const day=plan.expected_date<=asOf?treasuryDate(asOf,1):plan.expected_date;if(day>treasuryDate(asOf,90))continue;
  const value=cents(plan.amount);events.push({key,source:'plan',date:day,original_date:plan.expected_date,description:plan.description,account_id:plan.bank_account_id??null,amount:decimal(plan.direction==='issued'?value:-value)});
 }
 for(const row of bankMovements){
  const key='journal:'+row.entry_id+':'+row.position;if(seen.has(key))continue;seen.add(key);
  if(row.date<=asOf||row.date>treasuryDate(asOf,90))continue;
  events.push({key,source:'journal',date:row.date,description:row.description,account_id:row.account_id,linked_receipt:!!row.linked_receipt,amount:decimal(signedCents(row.debit)-signedCents(row.credit))});
 }
 events.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
 function project(start,rows,days){
  const end=treasuryDate(asOf,days),daily=new Map();let collections=0n,payments=0n,known=0n,balance=start,minimum=start,firstNegative=start<0n?asOf:null;
  for(const row of rows.filter(row=>row.date<=end)){
   const value=signedCents(row.amount);daily.set(row.date,(daily.get(row.date)||0n)+value);
   if(row.source==='journal')known+=value;else if(value>0n)collections+=value;else payments-=value;
  }
  for(const [day,value] of daily){balance+=value;if(balance<minimum)minimum=balance;if(balance<0n&&!firstNegative)firstNegative=day;}
  return {days,date:end,collections:decimal(collections),payments:decimal(payments),known_bank_net:decimal(known),projected_balance:decimal(balance),minimum_balance:decimal(minimum),liquidity_need:decimal(minimum<0n?-minimum:0n),first_negative_date:firstNegative};
 }
 return {as_of:asOf,opening_balance:decimal(opening),horizons:[30,60,90].map(days=>project(opening,events,days)),
  accounts:accounts.map(row=>({...row,horizons:[30,60,90].map(days=>project(signedCents(row.balance),events.filter(event=>event.account_id===row.account_id),days))})),
  unassigned_receipts:events.filter(row=>row.source==='receipt'&&row.account_id===null).length,unassigned_plans:events.filter(row=>row.source==='plan'&&row.account_id===null).length,unlinked_future_movements:events.filter(row=>row.source==='journal'&&!row.linked_receipt).length,events};
}
