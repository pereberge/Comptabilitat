import {amount} from './report-amount.js';
import {receiptRows} from './portfolio-data.js';
import {readPendingDocumentInvoices} from './document-invoice-data.js';
import {matchPendingInvoices} from './bank-invoice-matches.js';
import {bankDayNumber} from '../../../shared/bank-reconciliation.js';
import {decimal} from '../../../shared/money.js';

export async function readReconciliationMatches(db,companyId,movement){
 const value=amount(movement.amount),absolute=value<0n?-value:value;
 const pending=await receiptRows(db,companyId,{status:'open',direction:value<0n?'received':'issued'});
 const receipts=pending
  .filter(row=>amount(row.remaining_amount)===absolute)
  .map(row=>({id:row.id,invoice_id:row.invoice_id,exercise_id:row.exercise_id,exercise_name:row.exercise_name,direction:row.direction,reference:row.reference,party_name:row.party_name,invoice_date:row.invoice_date,posting_date:row.invoice_entry_date||row.posting_date,due_date:row.due_date,amount:row.amount,paid_amount:row.paid_amount,remaining_amount:row.remaining_amount,payment_method:row.payment_method,status:row.status,remittance_id:row.remittance_id}))
  .sort((a,b)=>Math.abs(bankDayNumber(a.due_date)-bankDayNumber(movement.date))-Math.abs(bankDayNumber(b.due_date)-bankDayNumber(movement.date))||a.id-b.id);
 const documents=await readPendingDocumentInvoices(db,companyId);
 const invoices=matchPendingInvoices([movement],documents,{amountOnly:true})[0]?.candidates||[];
 const [drafts]=await db.execute("SELECT id,version,exercise_id,source_name,reference,party_name,invoice_date,total_amount,extraction FROM invoice_documents WHERE company_id=? AND status='draft' AND direction=? AND total_amount=? ORDER BY invoice_date,id",[companyId,value<0n?'received':'issued',decimal(absolute)]);
 for(const draft of drafts){const extraction=typeof draft.extraction==='string'?JSON.parse(draft.extraction):draft.extraction;if(extraction?.multiple_invoices||extraction?.currency&&extraction.currency!=='EUR')continue;invoices.push({invoice_document_id:draft.id,version:draft.version,title:draft.reference||draft.source_name,reference:draft.reference,party:draft.party_name,source_name:draft.source_name,invoice_date:draft.invoice_date,total_amount:draft.total_amount,exercise_id:draft.exercise_id});}
 const groups=new Map();for(const receipt of pending){if(!groups.has(receipt.invoice_id))groups.set(receipt.invoice_id,[]);groups.get(receipt.invoice_id).push(receipt);}
 for(const [invoiceId,rows]of groups){if(rows.length<2||rows.reduce((sum,row)=>sum+amount(row.remaining_amount),0n)!==absolute)continue;const first=rows[0];invoices.push({invoice_id:invoiceId,title:first.reference,reference:first.reference,party:first.party_name,invoice_date:first.invoice_date,total_amount:decimal(absolute),exercise_id:first.exercise_id,receipt_count:rows.length});}
 return {receipts,invoices};
}
