import { cents } from '../../../shared/money.js';
import { date,fail,id } from './validation.js';
import { HttpError } from '../middleware/errors.js';
import {createHash} from 'node:crypto';
export function receiptRevision(row){return createHash('sha256').update(JSON.stringify([row.id,row.invoice_id,row.amount,row.due_date,row.payment_method,row.notes,row.paid_amount,row.invoice_status])).digest('hex');}
export const activePayments=`SELECT company_id,receipt_id,SUM(amount) AS paid_amount,MAX(payment_date) AS last_payment_date FROM portfolio_settlements WHERE reversal_entry_id IS NULL GROUP BY company_id,receipt_id`;
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
export async function receiptRows(db,companyId,query={}){
 const asOf=date(query.as_of || today()),params=[companyId];let where='r.company_id=?';
 if(query.exercise_id){where+=' AND i.exercise_id=?';params.push(id(query.exercise_id));}
 if(query.invoice_id){where+=' AND i.id=?';params.push(id(query.invoice_id));}
 if(query.receipt_id){where+=' AND r.id=?';params.push(id(query.receipt_id));}
 if(query.direction&&query.direction!=='all'){if(!['issued','received'].includes(query.direction))fail('INVALID_PORTFOLIO_FILTER');where+=' AND i.direction=?';params.push(query.direction);}
 if(query.from){where+=' AND r.due_date>=?';params.push(date(query.from));}
 if(query.to){where+=' AND r.due_date<=?';params.push(date(query.to));}
 if(query.from&&query.to&&query.from>query.to)fail('INVALID_DATE');
 const search=typeof query.search==='string'?query.search.trim():'';if(search.length>200)fail('INVALID_PORTFOLIO_FILTER');
 if(search){where+=' AND (LOCATE(?,i.reference)>0 OR LOCATE(?,i.party_name)>0 OR LOCATE(?,i.party_tax_id)>0)';params.push(search,search,search);}
 if(query.status&&!['all','open','pending','partial','settled','overdue','void'].includes(query.status))fail('INVALID_PORTFOLIO_FILTER');
 const [rows]=await db.execute(`SELECT r.*,i.exercise_id,i.direction,i.reference,i.invoice_date,i.posting_date,i.party_name,i.party_tax_id,i.party_address,i.party_account_id,i.status AS invoice_status,i.entry_id AS invoice_entry_id,e.name AS exercise_name,
   (SELECT m.id FROM bank_remittances m WHERE m.company_id=r.company_id AND m.status='prepared' AND JSON_CONTAINS(m.receipt_ids,CAST(r.id AS JSON)) LIMIT 1) AS remittance_id,
   COALESCE(p.paid_amount,0.00) AS paid_amount,r.amount-COALESCE(p.paid_amount,0.00) AS remaining_amount,p.last_payment_date
   FROM portfolio_receipts r JOIN trade_invoices i ON i.id=r.invoice_id AND i.company_id=r.company_id
   JOIN accounting_exercises e ON e.company_id=i.company_id AND e.id=i.exercise_id
   LEFT JOIN (${activePayments}) p ON p.receipt_id=r.id AND p.company_id=r.company_id WHERE ${where} ORDER BY r.due_date,r.id`,params);
 return rows.map(row=>({...row,revision:receiptRevision(row),remaining_amount:row.invoice_status==='void'?'0.00':row.remaining_amount,status:row.invoice_status==='void'?'void':cents(row.remaining_amount)===0n?'settled':cents(row.paid_amount)>0n?'partial':'pending',overdue:row.invoice_status!=='void'&&cents(row.remaining_amount)>0n&&row.due_date<asOf,as_of:asOf}))
  .filter(row=>!query.status||query.status==='all'||(query.status==='open'?['pending','partial'].includes(row.status):query.status==='overdue'?row.overdue:row.status===query.status));
}
export async function receiptDetail(db,companyId,receiptId){
 const [row]=await receiptRows(db,companyId,{receipt_id:receiptId});if(!row)throw new HttpError(404,'RECEIPT_NOT_FOUND');
 const [settlements]=await db.execute(`SELECT s.*,a.code AS bank_code,a.description AS bank_name,e.name AS exercise_name FROM portfolio_settlements s JOIN accounts a ON a.company_id=s.company_id AND a.id=s.bank_account_id JOIN accounting_exercises e ON e.company_id=s.company_id AND e.id=s.exercise_id WHERE s.company_id=? AND s.receipt_id=? ORDER BY s.payment_date,s.id`,[companyId,row.id]);
 return {...row,settlements};
}
