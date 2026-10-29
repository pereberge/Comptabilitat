import {HttpError} from '../middleware/errors.js';
export async function activeReceiptRemittance(db,companyId,receiptId){
 const [[row]]=await db.execute("SELECT id FROM bank_remittances WHERE company_id=? AND status='prepared' AND JSON_CONTAINS(receipt_ids,CAST(? AS JSON)) LIMIT 1",[companyId,String(receiptId)]);
 return row||null;
}
export async function requireUnremittedReceipt(db,companyId,receiptId){if(await activeReceiptRemittance(db,companyId,receiptId))throw new HttpError(409,'RECEIPT_IN_REMITTANCE');}
