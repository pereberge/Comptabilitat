import {createHash} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {buildProfitLoss} from './profit-loss.js';
import {amount} from './report-amount.js';
import {decimal} from '../../../shared/money.js';
export const corporateHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const taxAccount=code=>/^(630|633|638)/.test(code||'');
export async function readCorporateTaxSources(db,company,exercise,period){
 const [rows]=await db.execute(`SELECT e.id AS entry_id,e.request_id AS entry_request_id,e.number,e.entry_date,e.description AS entry_description,e.import_id,
  l.id AS line_id,l.position,l.description,l.debit,l.credit,l.source_page,
  a.id AS account_id,a.code,a.description AS account_description,p.code AS parent_code,p.description AS parent_description
  FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id
  JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id LEFT JOIN accounts p ON p.company_id=a.company_id AND p.id=a.parent_id
  WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_type NOT IN ('opening','regularization','closing') AND e.entry_date BETWEEN ? AND ?
  AND (LEFT(COALESCE(p.code,a.code),1) IN ('6','7') OR a.code LIKE '473%' OR a.code LIKE '4752%' OR a.code LIKE '4709%') ORDER BY e.entry_date,e.number,l.position LIMIT 50001`,[company.id,exercise.id,period.from,period.to]);
 if(rows.length>50000)throw new HttpError(400,'CORPORATE_TAX_TOO_MANY_ROWS');
 const [unbalanced]=await db.execute(`SELECT e.id AS entry_id,e.request_id,e.number,SUM(l.debit-l.credit) AS difference FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id
  WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_type NOT IN ('opening','regularization','closing') AND e.entry_date BETWEEN ? AND ? GROUP BY e.id,e.request_id,e.number HAVING SUM(l.debit-l.credit)<>0 LIMIT 100`,[company.id,exercise.id,period.from,period.to]);
 const grouped=new Map(),accounts=new Map();
 for(const row of rows){if(!grouped.has(row.entry_id))grouped.set(row.entry_id,[]);grouped.get(row.entry_id).push(row);
  if(!/^[67]/.test(row.parent_code||row.code))continue;
  if(!accounts.has(row.account_id))accounts.set(row.account_id,{id:row.account_id,code:row.code,description:row.account_description,parent_code:row.parent_code,parent_description:row.parent_description,debit:0n,credit:0n});const account=accounts.get(row.account_id);account.debit+=amount(row.debit);account.credit+=amount(row.credit);
 }
 const settlements=[...grouped.values()].filter(lines=>lines.some(row=>(row.parent_code||'').startsWith('6300'))&&lines.some(row=>/^(473|4752|4709)/.test(row.code))).map(lines=>({entry_id:lines[0].entry_id,number:lines[0].number,date:lines[0].entry_date}));
 const settled=new Set(settlements.map(row=>row.entry_id));
 const profitLoss=buildProfitLoss({company,exercise,from:period.from,to:period.to,currency:'EUR',rows:[...accounts.values()].map(row=>({...row,debit:decimal(row.debit),credit:decimal(row.credit)}))});
 const records=rows.map(row=>({key:'journal:'+row.entry_request_id+':'+row.position,fingerprint:corporateHash([row.entry_request_id,row.position,row.entry_date,row.entry_description,row.code,row.parent_code,row.description,row.debit,row.credit]),entry_id:row.entry_id,line_id:row.line_id,number:row.number,date:row.entry_date,reference:'Asiento '+row.number,description:row.description,entry_description:row.entry_description,account_id:row.account_id,code:row.code,parent_code:row.parent_code,account_description:row.account_description,debit:row.debit,credit:row.credit,amount:decimal(amount(row.credit)-amount(row.debit)),is_income_tax:taxAccount(row.parent_code),is_current_tax:(row.parent_code||'').startsWith('6300'),is_credit:row.code.startsWith('473'),is_settlement:settled.has(row.entry_id),source_available:!!row.import_id,source_page:row.source_page||1}));
 const credits=records.filter(row=>row.is_credit&&!row.is_settlement).reduce((sum,row)=>sum+amount(row.debit)-amount(row.credit),0n);
 const [[previous]]=await db.execute('SELECT id,name,start_date,end_date FROM accounting_exercises WHERE company_id=? AND end_date<? ORDER BY end_date DESC,id DESC LIMIT 1',[company.id,period.from]);
 let previousTurnover=null;
 if(previous){
  const [[sales]]=await db.execute(`SELECT COALESCE(SUM(l.credit-l.debit),0.00) AS total FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id JOIN accounts p ON p.company_id=a.company_id AND p.id=a.parent_id WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_type NOT IN ('opening','regularization','closing') AND e.entry_date BETWEEN ? AND ? AND p.code LIKE '70%'`,[company.id,previous.id,previous.start_date,previous.end_date]);
  const days=Math.round((Date.parse(previous.end_date)-Date.parse(previous.start_date))/86400000)+1,contiguous=new Date(Date.parse(previous.end_date)+86400000).toISOString().slice(0,10)===period.from;
  previousTurnover={...previous,amount:sales.total,annualized:decimal(days<365?amount(sales.total)*365n/BigInt(days):amount(sales.total)),contiguous};
 }
 const missingParents=records.filter(row=>/^[67]/.test(row.code)&&!row.parent_code),complete=profitLoss.checks.complete&&profitLoss.checks.reconciles&&!unbalanced.length&&!missingParents.length;
 const incomeTax=-(profitLoss.sections.find(row=>row.id==='tax')?amount(profitLoss.sections.find(row=>row.id==='tax').amount):0n);
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
 const source_hash=corporateHash({tax_id:company.tax_id,from:period.from,to:period.to,records:records.map(row=>[row.key,row.fingerprint]),unbalanced:unbalanced.map(row=>[row.request_id,row.difference]),previous:previousTurnover?{from:previousTurnover.start_date,to:previousTurnover.end_date,amount:previousTurnover.amount}:null});
 return {source_hash,complete,today,net_result:profitLoss.totals.net,income_tax_expense:decimal(incomeTax),credits_473:decimal(credits),records,profit_loss:profitLoss,previous_turnover:previousTurnover,settlements,diagnostic:{unbalanced,unclassified:profitLoss.diagnostic.unclassified,missing_parents:missingParents.map(row=>row.key)}};
}
