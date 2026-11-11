import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {receiptRows,today} from './portfolio-data.js';
import {buildTreasuryForecast,treasuryDate} from '../../../shared/treasury-forecast.js';
import {readTreasuryPlanning} from './treasury-planning.js';
export async function readTreasuryForecast(pool,companyId,exerciseId,{asOf=today()}={}){
 const target=id(exerciseId),db=await pool.getConnection();
 try{
  await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
  const [[exercise]]=await db.execute('SELECT id,start_date,end_date FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,target]);
  if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
  if(asOf<exercise.start_date||asOf>exercise.end_date)throw new HttpError(400,'TREASURY_EXERCISE_DATE');
  const [accounts]=await db.execute(`SELECT a.id AS account_id,a.code,a.description,COALESCE(b.balance,0.00) AS balance FROM accounts a
   LEFT JOIN (SELECT l.account_id,SUM(l.debit-l.credit) AS balance FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id
    WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_type<>'closing' AND e.entry_date<=? GROUP BY l.account_id) b ON b.account_id=a.id
   WHERE a.company_id=? AND a.kind='subaccount' AND a.code LIKE '572%' ORDER BY a.code`,[companyId,target,asOf,companyId]);
  const [bankMovements]=await db.execute(`SELECT e.id AS entry_id,l.position,l.account_id,e.entry_date AS date,l.description,l.debit,l.credit,
   EXISTS(SELECT 1 FROM portfolio_settlements s WHERE s.company_id=e.company_id AND (s.entry_id=e.id OR s.reversal_entry_id=e.id)) AS linked_receipt FROM journal_entries e
   JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
   WHERE e.company_id=? AND e.status='posted' AND e.entry_type NOT IN ('opening','closing') AND a.code LIKE '572%' AND e.entry_date>? AND e.entry_date<=? ORDER BY e.entry_date,e.id,l.position`,[companyId,asOf,treasuryDate(asOf,90)]);
  // Remaining amounts already subtract settlements, including future postings.
  // Those future bank journals appear above, once, rather than as receipts too.
  const pending=await receiptRows(db,companyId,{status:'open',as_of:asOf}),planning=await readTreasuryPlanning(db,companyId),assigned=new Map(planning.assignments.map(row=>[row.receipt_id,row]));
  const receipts=pending.map(row=>({...row,forecast_account_id:row.remittance_id?null:assigned.get(row.id)?.bank_account_id??null,assignment_version:assigned.get(row.id)?.version||0}));
  const result=buildTreasuryForecast({asOf,accounts,receipts,bankMovements,plans:planning.plans});await db.commit();return {...result,exercise_id:target,planning_available:planning.planning_available,plans:planning.plans,
   receipts:receipts.map(row=>({id:row.id,reference:row.reference,party_name:row.party_name,due_date:row.due_date,amount:row.amount,remaining_amount:row.remaining_amount,direction:row.direction,forecast_account_id:row.forecast_account_id,assignment_version:row.assignment_version,remittance_id:row.remittance_id}))};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
