import {createHash,randomUUID} from 'node:crypto';
import {withTransaction} from '../db/transaction.js';
import {HttpError} from '../middleware/errors.js';
import {date,fail,id} from './validation.js';
import {hash,requestId} from './invoice-validation.js';
import {lockCompany} from './subaccounts.js';
import {receiptRows,today} from './portfolio-data.js';
import {cents,decimal} from '../../../shared/money.js';
import {isValidCreditorId,normalizedIban,sepaIdentifier,sepaText,validSepaIban} from '../../../shared/sepa.js';
import {buildSepaXml} from './sepa-xml.js';
const json=value=>typeof value==='string'?JSON.parse(value):value;
const conflict=code=>{throw new HttpError(409,code);};
const eea=new Set('AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES'.split(' '));
const countries={ESPANA:'ES',SPAIN:'ES',FRANCIA:'FR',FRANCE:'FR',PORTUGAL:'PT',ANDORRA:'AD',ALEMANIA:'DE',GERMANY:'DE',ITALIA:'IT',ITALY:'IT'};
const country=value=>{const key=sepaText(value).toUpperCase();return /^[A-Z]{2}$/.test(key)?key:countries[key]||'';};
function input(body){
 if(!body||!['issued','received'].includes(body.direction))fail('INVALID_REMITTANCE');
 if(!Array.isArray(body.receipt_ids)||!body.receipt_ids.length||body.receipt_ids.length>1000)fail('INVALID_REMITTANCE_RECEIPTS');
 const receipt_ids=body.receipt_ids.map(id).sort((a,b)=>a-b);if(new Set(receipt_ids).size!==receipt_ids.length)fail('INVALID_REMITTANCE_RECEIPTS');
 const requested_date=date(body.requested_date);
 const bank={iban:normalizedIban(body.iban),bic:String(body.bic||'').replace(/\s/g,'').toUpperCase(),creditor_id:String(body.creditor_id||'').replace(/\s/g,'').toUpperCase(),initiator_id:String(body.initiator_id||'').trim()};
 return {direction:body.direction,receipt_ids,requested_date,bank};
}
function summary(row){const snapshot=json(row.snapshot);return {id:row.id,direction:row.direction,message_id:row.message_id,requested_date:row.requested_date,status:row.status,filename:row.filename,created_at:row.created_at,cancelled_at:row.cancelled_at,total:snapshot.total,count:snapshot.items.length,iban:snapshot.bank.iban};}
export function createBankRemittanceService(pool,companyId){
 async function company(db){const [[row]]=await db.execute('SELECT c.id,c.name,d.account_holder,d.iban,d.bic,d.sepa_creditor_id,d.bank_initiator_id,d.address,d.city,d.country FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);return row;}
 async function rows(db,direction){
  const receipts=await receiptRows(db,companyId,{direction,status:'open'});if(!receipts.length)return [];
  const [sources]=await db.execute(`SELECT i.id,i.payment_snapshot,a.payment_profile,a.party_profile,a.sepa_mandate,a.description FROM trade_invoices i JOIN accounts a ON a.id=i.party_account_id AND a.company_id=i.company_id WHERE i.company_id=? AND i.direction=?`,[companyId,direction]),byInvoice=new Map(sources.map(row=>[row.id,row]));
  return receipts.filter(row=>row.payment_method===(direction==='issued'?'direct_debit':'transfer')).map(receipt=>{
   const source=byInvoice.get(receipt.invoice_id),payment=json(source?.payment_profile),saved=json(source?.payment_snapshot),party=json(source?.party_profile),mandate=json(source?.sepa_mandate),issues=[];
   const iban=normalizedIban(payment?payment.iban:saved?.iban),name=party?.name||receipt.party_name||source?.description||'',taxId=String(party?.tax_id||'').replace(/[\s.\/-]/g,'').toUpperCase(),invoiceTax=String(receipt.party_tax_id||'').replace(/[\s.\/-]/g,'').toUpperCase();
   if(!validSepaIban(iban))issues.push('REMITTANCE_PARTY_IBAN');
   if(cents(receipt.remaining_amount)>99999999999n)issues.push('REMITTANCE_AMOUNT_LIMIT');
   if(!sepaText(name))issues.push('REMITTANCE_PARTY_NAME');
   if(taxId&&invoiceTax&&taxId!==invoiceTax)issues.push('REMITTANCE_PARTY_CHANGED');
   if(receipt.remittance_id)issues.push('RECEIPT_IN_REMITTANCE');
   if(direction==='issued'&&(!mandate?.reference||!sepaIdentifier(mandate.reference)||!mandate.signed_on||mandate.signed_on>today()||!['RCUR','OOFF','FRST','FNAL'].includes(mandate.sequence)))issues.push('REMITTANCE_MANDATE');
   const address=party?.address||receipt.party_address||'',residence=country(party?.country);
   if(direction==='issued'&&!eea.has(iban.slice(0,2))&&(!address||!residence))issues.push('REMITTANCE_PARTY_ADDRESS');
   return {receipt_id:receipt.id,invoice_id:receipt.invoice_id,account_id:receipt.party_account_id,name,reference:receipt.reference,invoice_date:receipt.invoice_date,due_date:receipt.due_date,amount:receipt.remaining_amount,iban,mandate:direction==='issued'?mandate:null,address,city:party?.city||'',country:residence,revision:receipt.revision,issues,remittance_id:receipt.remittance_id};
  });
 }
 async function preview(db,data){
  if(data.requested_date<today())fail('REMITTANCE_DATE_PAST');
  const own=await company(db),available=await rows(db,data.direction),byId=new Map(available.map(row=>[row.receipt_id,row]));
  const items=data.receipt_ids.map(receiptId=>{const row=byId.get(receiptId);if(!row)conflict('REMITTANCE_RECEIPT_UNAVAILABLE');return {...row,execution_date:row.due_date<data.requested_date?data.requested_date:row.due_date};});
  const issues=[];
  if(!validSepaIban(data.bank.iban))issues.push('REMITTANCE_COMPANY_IBAN');
  if(data.bank.bic&&!/^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(data.bank.bic))issues.push('INVALID_BIC');
  if(data.bank.initiator_id&&!sepaIdentifier(data.bank.initiator_id))issues.push('INVALID_INITIATOR_ID');
  if(data.direction==='issued'&&!isValidCreditorId(data.bank.creditor_id))issues.push('INVALID_CREDITOR_ID');
  const owner={name:own.account_holder||own.name,address:own.address||'',city:own.city||'',country:country(own.country)};
  if(!sepaText(owner.name))issues.push('REMITTANCE_COMPANY_NAME');
  if(data.direction==='received'&&items.some(row=>!eea.has(row.iban.slice(0,2)))&&(!owner.address||!owner.country))issues.push('REMITTANCE_COMPANY_ADDRESS');
  // A one-off/final mandate must never be reused in another active file or twice in this file.
  if(data.direction==='issued'){
   const [used]=await db.execute("SELECT snapshot FROM bank_remittances WHERE company_id=? AND direction='issued' AND status='prepared'",[companyId]);
   const creditorKey=value=>value.slice(0,4)+value.slice(7),prior=used.flatMap(row=>{const previous=json(row.snapshot);return creditorKey(previous.bank.creditor_id)===creditorKey(data.bank.creditor_id)?previous.items:[];}),seen=new Map();
   for(const item of items){
    const key=item.mandate?.reference;
    const related=[...prior,...(seen.get(key)||[])].filter(row=>row.mandate?.reference===item.mandate?.reference);
    if(related.some(row=>['OOFF','FNAL'].includes(row.mandate?.sequence))||(related.length&&['OOFF','FNAL'].includes(item.mandate?.sequence)))item.issues.push('REMITTANCE_MANDATE_REUSED');
    seen.set(key,[...(seen.get(key)||[]),item]);
   }
  }
  const total=decimal(items.reduce((sum,row)=>sum+cents(row.amount),0n)),snapshot={direction:data.direction,requested_date:data.requested_date,bank:data.bank,company:owner,items,total};
  return {...snapshot,issues,ready:!issues.length&&items.every(row=>!row.issues.length),preview_hash:hash({snapshot,company_defaults:own})};
 }
 return {
  async list(query={}){
   if(query.direction!==undefined&&!['issued','received'].includes(query.direction))fail('INVALID_REMITTANCE');
   const params=[companyId];if(query.direction)params.push(query.direction);
   const [history]=await pool.execute('SELECT id,direction,message_id,requested_date,status,snapshot,filename,created_at,cancelled_at FROM bank_remittances WHERE company_id=?'+(query.direction?' AND direction=?':'')+' ORDER BY id DESC LIMIT 200',params);return history.map(summary);
  },
  options(query={}){if(!['issued','received'].includes(query.direction))fail('INVALID_REMITTANCE');return withTransaction(pool,async db=>({company:await company(db),rows:await rows(db,query.direction)}));},
  preview:body=>{const data=input(body);return withTransaction(pool,db=>preview(db,data));},
  async create(body){
   const data=input(body),request=requestId(body.request_id),digest=hash({...data,preview_hash:body.preview_hash});
   if(typeof body.preview_hash!=='string'||! /^[a-f0-9]{64}$/.test(body.preview_hash))fail('REMITTANCE_PREVIEW_REQUIRED');
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    const [[existing]]=await db.execute('SELECT * FROM bank_remittances WHERE company_id=? AND request_id=?',[companyId,request]);
    if(existing){if(existing.request_hash!==digest)conflict('REQUEST_CONFLICT');return {...summary(existing),replayed:true};}
    const snapshot=await preview(db,data);if(snapshot.preview_hash!==body.preview_hash)conflict('REMITTANCE_CHANGED');if(!snapshot.ready)fail('REMITTANCE_INCOMPLETE');
    const messageId='M'+randomUUID().replaceAll('-',''),xml=Buffer.from(buildSepaXml(snapshot,messageId)),filename=(data.direction==='issued'?'cobros-19-':'pagos-34-')+data.requested_date+'-'+messageId+'.xml';
    const [created]=await db.execute('INSERT INTO bank_remittances(company_id,direction,message_id,requested_date,receipt_ids,snapshot,filename,xml_content,xml_sha256,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[companyId,data.direction,messageId,data.requested_date,JSON.stringify(data.receipt_ids),JSON.stringify(snapshot),filename,xml,createHash('sha256').update(xml).digest('hex'),request,digest]);
    return {id:created.insertId,direction:data.direction,message_id:messageId,requested_date:data.requested_date,status:'prepared',filename,total:snapshot.total,count:snapshot.items.length,iban:data.bank.iban,replayed:false};
   });
  },
  async file(remittanceId){const [[row]]=await pool.execute('SELECT filename,xml_content FROM bank_remittances WHERE company_id=? AND id=?',[companyId,id(remittanceId)]);if(!row)throw new HttpError(404,'REMITTANCE_NOT_FOUND');return {filename:row.filename,file:row.xml_content};},
  async cancel(remittanceId){return withTransaction(pool,async db=>{await lockCompany(db,companyId);const target=id(remittanceId),[[row]]=await db.execute('SELECT * FROM bank_remittances WHERE company_id=? AND id=? FOR UPDATE',[companyId,target]);if(!row)throw new HttpError(404,'REMITTANCE_NOT_FOUND');if(row.status==='prepared')await db.execute("UPDATE bank_remittances SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP WHERE company_id=? AND id=?",[companyId,target]);return {id:target,status:row.status==='archived'?'archived':'cancelled'};});},
 };
}
