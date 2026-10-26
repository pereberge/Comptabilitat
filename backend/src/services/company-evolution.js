import {buildBalanceSheet} from './balance-sheet.js';
import {amount} from './report-amount.js';
import {decimal} from '../../../shared/money.js';
import {date} from './validation.js';

// These are the three companies included in the master's portfolio.
export const evolutionCompanyIds=Object.freeze([85,224,225]);
function madridToday(){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=type=>parts.find(part=>part.type===type).value;
 return value('year')+'-'+value('month')+'-'+value('day');
}

export function buildCompanyEvolution(companies,exercises,balances,asOf){
 const byExercise=new Map();
 for(const row of balances){
  const key=row.company_id+':'+row.exercise_id;
  if(!byExercise.has(key))byExercise.set(key,[]);
  byExercise.get(key).push(row);
 }
 return {as_of:asOf,companies:companies.map(company=>({id:company.id,name:company.name,years:exercises
  .filter(exercise=>exercise.company_id===company.id&&exercise.start_date<=asOf)
  .sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.id-b.id)
  .map(exercise=>{
   const rows=byExercise.get(company.id+':'+exercise.id)||[],cutoff=exercise.end_date<asOf?exercise.end_date:asOf;
   const meta={exercise_id:exercise.id,name:exercise.name,start_date:exercise.start_date,end_date:exercise.end_date,cutoff,status:exercise.status,partial:cutoff<exercise.end_date,has_activity:rows.length>0};
   if(!rows.length)return {...meta,net_equity:null,profit:null,needs_review:false};
   const difference=decimal(rows.reduce((sum,row)=>sum+amount(row.closing),0n));
   const sheet=buildBalanceSheet({company,exercise,from:exercise.start_date,to:cutoff,rows,checks:{differences:{closing:difference}}},'abbreviated');
   // Root A of the abbreviated PGC balance is net equity; roots B and C are liabilities.
   const equity=sheet.sections.find(node=>node.id==='equity_liabilities-19');
   if(!equity)throw new Error('NET_EQUITY_HEADING_NOT_FOUND');
   return {...meta,net_equity:equity.amount,profit:decimal(rows.reduce((sum,row)=>sum+amount(row.generated_result),0n)),needs_review:!sheet.checks.valid};
  })}))};
}

export function createCompanyEvolutionService(pool,{companyIds=evolutionCompanyIds,today=madridToday}={}){
 return {async get(query={}){
  const asOf=date(query.as_of===undefined?today():query.as_of),db=await pool.getConnection();
  const placeholders=companyIds.map(()=>'?').join(',');
  try{
   await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
   const [companies]=await db.execute('SELECT id,name FROM companies WHERE id IN ('+placeholders+') ORDER BY name',companyIds);
   const [exercises]=await db.execute('SELECT id,company_id,name,start_date,end_date,status FROM accounting_exercises WHERE company_id IN ('+placeholders+') AND start_date<=? ORDER BY start_date,id',[...companyIds,asOf]);
   const [balances]=await db.execute(`SELECT e.company_id,e.exercise_id,a.id,a.code,a.description,p.code AS parent_code,p.description AS parent_description,
    SUM(l.debit) AS debit,SUM(l.credit) AS credit,SUM(l.debit-l.credit) AS closing,
    SUM(CASE WHEN e.entry_type NOT IN ('opening','regularization','closing') AND LEFT(p.code,1) IN ('6','7') THEN l.credit-l.debit ELSE 0.00 END) AS generated_result
    FROM journal_entries e JOIN accounting_exercises x ON x.id=e.exercise_id AND x.company_id=e.company_id
    JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id
    JOIN accounts a ON a.id=l.account_id AND a.company_id=e.company_id
    JOIN accounts p ON p.id=a.parent_id AND p.company_id=e.company_id
    WHERE e.company_id IN (${placeholders}) AND e.status='posted' AND e.entry_type<>'closing'
     AND e.entry_date BETWEEN x.start_date AND LEAST(x.end_date,?)
    GROUP BY e.company_id,e.exercise_id,a.id,a.code,a.description,p.code,p.description`,[...companyIds,asOf]);
   const report=buildCompanyEvolution(companies,exercises,balances,asOf);
   await db.commit();return report;
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 }};
}
