import {createHash} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {purchaseDocumentMime} from './purchase-document-reader.js';

function identifier(value,max){
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new HttpError(400,'PURCHASE_MAIL_METADATA_INVALID');
 return value.trim();
}
// A future mailbox connector supplies decoded attachments; this service neither
// connects to mail servers nor confirms invoices. Company scope comes from auth.
export function createPurchaseMailIntake(companyId,ocr){
 companyId=id(companyId);
 return {async receive({mailbox,messageId,attachmentId,filename,content}){
  mailbox=identifier(mailbox,200);messageId=identifier(messageId,1000);attachmentId=identifier(attachmentId,200);
  filename=identifier(filename,200);
  if(/[\\/:]/.test(filename))throw new HttpError(400,'PURCHASE_INVALID_FILE');
  const mime=purchaseDocumentMime(content),extension=/\.([^.]+)$/.exec(filename)?.[1].toLowerCase();
  if(!({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'})[extension]||({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'})[extension]!==mime)throw new HttpError(400,'PURCHASE_INVALID_FILE');
  const digest=createHash('sha256').update(JSON.stringify(['purchase-mail-v1',companyId,mailbox,messageId,attachmentId])).digest('hex');
  const key=[digest.slice(0,8),digest.slice(8,12),'5'+digest.slice(13,16),'8'+digest.slice(17,20),digest.slice(20,32)].join('-');
  const job=await ocr.start(content,filename,key);
  return {...job,intake_channel:'email'};
 }};
}
