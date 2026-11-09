import {withTransaction} from '../db/transaction.js';
import {HttpError} from '../middleware/errors.js';
import {lockCompany} from './subaccounts.js';
import {date,id,fail} from './validation.js';
import {hash} from './invoice-validation.js';
import {receiptRows} from './portfolio-data.js';

async function state(db,companyId,invoiceId,lock=false){
 const [[row]]=await db.execute(`SELECT i.id,i.reference,i.direction,i.status,i.exercise_id,i.invoice_date,i.posting_date,i.entry_id,
  j.entry_date,j.status AS entry_status,j.entry_type,e.name AS exercise_name,e.status AS exercise_status,e.start_date,e.end_date,
  EXISTS(SELECT 1 FROM verifactu_records v WHERE v.company_id=i.company_id AND v.invoice_id=i.id) AS fiscal_registered
  FROM trade_invoices i JOIN journal_entries j ON j.company_id=i.company_id AND j.id=i.entry_id AND j.exercise_id=i.exercise_id
  JOIN accounting_exercises e ON e.company_id=i.company_id AND e.id=i.exercise_id
  WHERE i.company_id=? AND i.id=?${lock?' FOR UPDATE':''}`,[companyId,invoiceId]);
 if(!row)throw new HttpError(404,'INVOICE_NOT_FOUND');
 const receipts=await receiptRows(db,companyId,{invoice_id:invoiceId});
 const [[payments]]=await db.execute(`SELECT MIN(s.payment_date) AS first_payment_date FROM portfolio_settlements s
  JOIN portfolio_receipts r ON r.company_id=s.company_id AND r.id=s.receipt_id
  WHERE r.company_id=? AND r.invoice_id=? AND s.reversal_entry_id IS NULL`,[companyId,invoiceId]);
 const editable=row.direction==='received'&&row.status==='posted'&&row.entry_status==='posted'&&row.entry_type==='normal'&&row.exercise_status==='open'&&!row.fiscal_registered&&!receipts.some(receipt=>receipt.remittance_id);
 return {...row,editable,first_payment_date:payments.first_payment_date,
  earliest_due_date:receipts.map(receipt=>receipt.due_date).sort()[0]||null,
  revision:hash([row,payments.first_payment_date,receipts.map(receipt=>[receipt.id,receipt.revision,receipt.remittance_id])])};
}

export function createInvoiceDatesService(pool,companyId){
 return {
  get:invoiceId=>withTransaction(pool,db=>state(db,companyId,id(invoiceId))),
  async update(invoiceId,body){
   const target=id(invoiceId),invoiceDate=date(body?.invoice_date),postingDate=date(body?.posting_date);
   if(typeof body?.revision!=='string'||!/^[a-f0-9]{64}$/.test(body.revision))fail('INVOICE_DATES_CHANGED');
   if(invoiceDate>postingDate)fail('INVALID_INVOICE_DATE');
   const [[source]]=await pool.execute('SELECT exercise_id FROM trade_invoices WHERE company_id=? AND id=?',[companyId,target]);
   if(!source)throw new HttpError(404,'INVOICE_NOT_FOUND');
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,source.exercise_id]);
    const before=await state(db,companyId,target,true);
    if(before.exercise_status!=='open')throw new HttpError(409,'EXERCISE_CLOSED');
    if(!before.editable)throw new HttpError(409,'INVOICE_DATES_NOT_EDITABLE');
    if(before.revision!==body.revision)throw new HttpError(409,'INVOICE_DATES_CHANGED');
    if(postingDate<before.start_date||postingDate>before.end_date)fail('DATE_OUTSIDE_EXERCISE');
    if(before.earliest_due_date&&invoiceDate>before.earliest_due_date||before.first_payment_date&&invoiceDate>before.first_payment_date)fail('INVOICE_DATES_RECEIPT_CONFLICT');
    await db.execute('UPDATE trade_invoices SET invoice_date=?,posting_date=? WHERE company_id=? AND id=?',[invoiceDate,postingDate,companyId,target]);
    await db.execute('UPDATE journal_entries SET entry_date=? WHERE company_id=? AND id=?',[postingDate,companyId,before.entry_id]);
    return state(db,companyId,target);
   });
  },
 };
}
