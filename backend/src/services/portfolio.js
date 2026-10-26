import { cents,decimal } from '../../../shared/money.js';
import { withTransaction } from '../db/transaction.js';
import { HttpError } from '../middleware/errors.js';
import { lockCompany } from './subaccounts.js';
import { date,fail,id } from './validation.js';
import { hash,method,positiveAmount,requestId,text } from './invoice-validation.js';
import { receiptDetail,receiptRows,today } from './portfolio-data.js';
import { requireAccount,reverseJournal } from './trade-posting.js';
import { postJournalEntry } from './accounting.js';
export function createPortfolioService(pool,companyId){
 return {
  async list(query={}){
   const rows=await receiptRows(pool,companyId,query),totals={receivable:0n,payable:0n,overdue_receivable:0n,overdue_payable:0n};
   for(const row of rows){if(row.status==='void')continue;const key=row.direction==='issued'?'receivable':'payable',remaining=cents(row.remaining_amount);totals[key]+=remaining;if(row.overdue)totals['overdue_'+key]+=remaining;}
   return {as_of:query.as_of||today(),rows,totals:Object.fromEntries(Object.entries(totals).map(([key,value])=>[key,decimal(value)]))};
  },
  get:receiptId=>withTransaction(pool,async db=>{
   const receipt=await receiptDetail(db,companyId,receiptId);
   const [[invoice]]=await db.execute('SELECT issuer_snapshot FROM trade_invoices WHERE company_id=? AND id=?',[companyId,receipt.invoice_id]);
   return {...receipt,issuer_snapshot:typeof invoice.issuer_snapshot==='string'?JSON.parse(invoice.issuer_snapshot):invoice.issuer_snapshot};
  }),
  async update(receiptId,body){
   const target=id(receiptId),due=date(body?.due_date),paymentMethod=method(body?.payment_method),notes=text(body?.notes,500);
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);const receipt=await receiptDetail(db,companyId,target);
    if(['void','settled'].includes(receipt.status))throw new HttpError(409,'RECEIPT_NOT_PENDING');if(due<receipt.invoice_date)fail('INVALID_DUE_DATE');
    await db.execute('UPDATE portfolio_receipts SET due_date=?,payment_method=?,notes=? WHERE company_id=? AND id=?',[due,paymentMethod,notes,companyId,target]);
    return receiptDetail(db,companyId,target);
   });
  },
  async settle(receiptId,body){
   const target=id(receiptId),data={request_id:requestId(body?.request_id),exercise_id:id(body?.exercise_id),payment_date:date(body?.payment_date),amount:positiveAmount(body?.amount),bank_account_id:id(body?.bank_account_id),payment_method:method(body?.payment_method),reference:text(body?.reference,100),notes:text(body?.notes,500)},digest=hash({receipt_id:target,...data});
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    const [[existing]]=await db.execute('SELECT id,request_hash FROM portfolio_settlements WHERE company_id=? AND request_id=?',[companyId,data.request_id]);
    if(existing){if(existing.request_hash!==digest)fail('REQUEST_CONFLICT');return {...await receiptDetail(db,companyId,target),settlement_id:existing.id,replayed:true};}
    const [[locked]]=await db.execute('SELECT id FROM portfolio_receipts WHERE company_id=? AND id=? FOR UPDATE',[companyId,target]);if(!locked)throw new HttpError(404,'RECEIPT_NOT_FOUND');
    const receipt=await receiptDetail(db,companyId,target);
    if(receipt.status==='void')throw new HttpError(409,'INVOICE_VOIDED');if(cents(data.amount)>cents(receipt.remaining_amount))throw new HttpError(409,'SETTLEMENT_EXCEEDS_REMAINING');
    if(data.payment_date<receipt.invoice_date)fail('INVALID_PAYMENT_DATE');
    const bank=await requireAccount(db,companyId,data.bank_account_id,['57'],'INVALID_BANK_ACCOUNT'),issued=receipt.direction==='issued';
    const concept=((issued?'Cobro ':'Pago ')+'recibo '+receipt.id+' · '+receipt.reference+' · '+receipt.party_name).slice(0,200);
    const entry=await postJournalEntry(db,companyId,{exercise_id:data.exercise_id,entry_date:data.payment_date,description:concept,request_id:data.request_id,lines:[
     {account_id:bank.id,description:concept,debit:issued?data.amount:'0.00',credit:issued?'0.00':data.amount},
     {account_id:receipt.party_account_id,description:concept,debit:issued?'0.00':data.amount,credit:issued?data.amount:'0.00'},
    ]});
    const [settlement]=await db.execute('INSERT INTO portfolio_settlements(company_id,receipt_id,exercise_id,payment_date,amount,bank_account_id,payment_method,reference,notes,entry_id,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[companyId,target,data.exercise_id,data.payment_date,data.amount,bank.id,data.payment_method,data.reference,data.notes,entry.id,data.request_id,digest]);
    return {...await receiptDetail(db,companyId,target),settlement_id:settlement.insertId,replayed:false};
   });
  },
  async reverse(settlementId,body){
   const target=id(settlementId),data={request_id:requestId(body?.request_id),exercise_id:id(body?.exercise_id),date:date(body?.date),reason:text(body?.reason,200,true)},digest=hash(data);
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    const [[settlement]]=await db.execute('SELECT * FROM portfolio_settlements WHERE company_id=? AND id=? FOR UPDATE',[companyId,target]);if(!settlement)throw new HttpError(404,'SETTLEMENT_NOT_FOUND');
    if(settlement.reversal_entry_id){if(settlement.reversal_request_id===data.request_id&&settlement.reversal_request_hash===digest)return {...await receiptDetail(db,companyId,settlement.receipt_id),replayed:true};throw new HttpError(409,'SETTLEMENT_REVERSED');}
    if(data.date<settlement.payment_date)fail('INVALID_PAYMENT_DATE');
    const reversal=await reverseJournal(db,companyId,settlement.entry_id,data.exercise_id,data.date,'Anulación movimiento de cartera '+target+' · '+data.reason);
    await db.execute('UPDATE portfolio_settlements SET reversal_entry_id=?,reversal_request_id=?,reversal_request_hash=?,reversal_date=?,reversal_reason=? WHERE company_id=? AND id=?',[reversal.id,data.request_id,digest,data.date,data.reason,companyId,target]);
    return {...await receiptDetail(db,companyId,settlement.receipt_id),replayed:false};
   });
  },
 };
}
