import { appendFiscalRecord,invoiceFiscalInfo } from './verifactu.js';
import { cents } from '../../../shared/money.js';
import { withTransaction } from '../db/transaction.js';
import { HttpError } from '../middleware/errors.js';
import { lockCompany } from './subaccounts.js';
import { createCompanyService } from './companies.js';
import { date,fail,id } from './validation.js';
import { hash,requestId,text,validateInvoice } from './invoice-validation.js';
import { partyAccount,requireAccount,reverseJournal,standardAccount } from './trade-posting.js';
import { postJournalEntry } from './accounting.js';
import { activePayments,receiptRows } from './portfolio-data.js';
import { nextIssuedReference } from './invoice-numbering.js';
import { emptyPartyProfile,completeFiscalProfile,invoicePartyProfile } from '../../../shared/account-party.js';
import {normalizePartyPaymentProfile,partyPaymentReceipts} from '../../../shared/party-payments.js';

export function createInvoiceService(pool,companyId){
 async function detail(db,invoiceId){
  const [[invoice]]=await db.execute(`SELECT i.*,a.code AS party_code,a.party_profile AS account_party_profile,o.code AS offset_code,e.name AS exercise_name FROM trade_invoices i JOIN accounts a ON a.company_id=i.company_id AND a.id=i.party_account_id JOIN accounts o ON o.company_id=i.company_id AND o.id=i.offset_account_id JOIN accounting_exercises e ON e.company_id=i.company_id AND e.id=i.exercise_id WHERE i.company_id=? AND i.id=?`,[companyId,id(invoiceId)]);
  if(!invoice)throw new HttpError(404,'INVOICE_NOT_FOUND');
  const [lines]=await db.execute('SELECT * FROM trade_invoice_lines WHERE company_id=? AND invoice_id=? ORDER BY position',[companyId,invoice.id]);
  const receipts=await receiptRows(db,companyId,{invoice_id:invoice.id});
  const [documents]=await db.execute('SELECT id,source_name FROM invoice_documents WHERE company_id=? AND invoice_id=? ORDER BY id',[companyId,invoice.id]);
  const {account_party_profile:accountProfile,...record}=invoice;
  const issuer=typeof invoice.issuer_snapshot==='string'?JSON.parse(invoice.issuer_snapshot):invoice.issuer_snapshot;
  const currentCompany=await createCompanyService(db).getCompany(companyId);
  return {...record,documents,verifactu:await invoiceFiscalInfo(db,companyId,invoice.id),issuer_snapshot:issuer,issuer_fiscal:completeFiscalProfile(issuer,currentCompany),party_fiscal:completeFiscalProfile(invoicePartyProfile(record),accountProfile),lines,receipts};
 }
 return {
  get:invoiceId=>withTransaction(pool,db=>detail(db,invoiceId)),
  nextReference:exerciseId=>withTransaction(pool,db=>nextIssuedReference(db,companyId,exerciseId)),
  async list(query={}){
   const params=[companyId];let where='i.company_id=?';
   if(query.exercise_id){where+=' AND i.exercise_id=?';params.push(id(query.exercise_id));}
   if(query.direction&&query.direction!=='all'){if(!['issued','received'].includes(query.direction))fail('INVALID_INVOICE');where+=' AND i.direction=?';params.push(query.direction);}
   if(query.search){const search=text(query.search,200);where+=' AND (LOCATE(?,i.reference)>0 OR LOCATE(?,i.party_name)>0)';params.push(search,search);}
   const [rows]=await pool.execute(`SELECT EXISTS(SELECT 1 FROM verifactu_records v WHERE v.company_id=i.company_id AND v.invoice_id=i.id) AS fiscal_registered,i.id,i.exercise_id,i.direction,i.reference,i.invoice_date,i.posting_date,i.party_name,i.party_tax_id,i.total_amount,i.status,i.entry_id,e.name AS exercise_name,COUNT(r.id) AS receipt_count,COALESCE(SUM(p.paid_amount),0.00) AS paid_amount,i.total_amount-COALESCE(SUM(p.paid_amount),0.00) AS remaining_amount
    FROM trade_invoices i JOIN accounting_exercises e ON e.company_id=i.company_id AND e.id=i.exercise_id
    JOIN portfolio_receipts r ON r.company_id=i.company_id AND r.invoice_id=i.id LEFT JOIN (${activePayments}) p ON p.company_id=r.company_id AND p.receipt_id=r.id
    WHERE ${where} GROUP BY i.id,e.name ORDER BY i.invoice_date DESC,i.id DESC`,params);
   return rows.map(row=>({...row,remaining_amount:row.status==='void'?'0.00':row.remaining_amount,payment_status:row.status==='void'?'void':cents(row.remaining_amount)===0n?'settled':cents(row.paid_amount)>0n?'partial':'pending'}));
  },
  async parties(){
   const [rows]=await pool.execute(`SELECT a.id AS account_id,IF(LEFT(a.code,3) IN ('430','440'),'issued','received') AS direction,a.description,a.party_profile,a.payment_profile,i.party_name,i.party_tax_id,i.party_address,i.party_email FROM accounts a LEFT JOIN trade_invoices i ON i.company_id=a.company_id AND i.party_account_id=a.id AND i.id=(SELECT MAX(x.id) FROM trade_invoices x WHERE x.company_id=a.company_id AND x.party_account_id=a.id) WHERE a.company_id=? AND a.kind='subaccount' AND LEFT(a.code,3) IN ('430','440','400','410') ORDER BY a.description`,[companyId]);
   return rows.map(row=>({account_id:row.account_id,direction:row.direction,payment_profile:row.payment_profile,...emptyPartyProfile(),...(row.party_profile||{name:row.party_name||row.description,tax_id:row.party_tax_id||'',address:row.party_address||'',email:row.party_email||''})}));
  },
  async create(body,options={}){
   if(body?.auto_reference!==undefined&&typeof body.auto_reference!=='boolean')fail('INVALID_INVOICE_NUMBERING');
   const automatic=body?.auto_reference===true;if(automatic&&(body.direction!=='issued'||options.existing_entry_id))fail('INVALID_INVOICE_NUMBERING');
   const data=validateInvoice(automatic?{...body,reference:'__AUTO__'}:body),digest=hash(automatic?{...data,reference:'',auto_reference:true}:options.existing_entry_id?{...data,existing_entry_id:id(options.existing_entry_id)}:data);
   const create=async db=>{
    const settings=await lockCompany(db,companyId);
    const [[existing]]=await db.execute('SELECT id,request_hash FROM trade_invoices WHERE company_id=? AND request_id=?',[companyId,data.request_id]);
    if(existing){if(existing.request_hash!==digest)fail('REQUEST_CONFLICT');return {...await detail(db,existing.id),replayed:true};}
    const [[exercise]]=await db.execute('SELECT status,start_date,end_date FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,data.exercise_id]);
    if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');if(exercise.status!=='open')fail('EXERCISE_CLOSED');if(data.posting_date<exercise.start_date||data.posting_date>exercise.end_date)fail('DATE_OUTSIDE_EXERCISE');
    if(automatic){const next=await nextIssuedReference(db,companyId,data.exercise_id);if(!next.automatic_available)fail('INVOICE_NUMBER_UNAVAILABLE');data.reference=next.reference;}
    const issued=data.direction==='issued',party=await partyAccount(db,companyId,settings,data);
    const issuer=await createCompanyService(db).getCompany(companyId);
    let paymentSnapshot=null;
    if(data.automatic_receipts){
     try{
      const profile=normalizePartyPaymentProfile(party.payment_profile||{}),receipts=partyPaymentReceipts(data.total_amount,data.invoice_date,profile);
      if(data.payment_profile&&JSON.stringify(data.payment_profile)!==JSON.stringify(profile))fail('PARTY_PAYMENT_CHANGED');
      if(data.receipts.length&&JSON.stringify(data.receipts)!==JSON.stringify(receipts))fail('PARTY_PAYMENT_CHANGED');
      data.receipts=receipts;
      if(!body.payment_method)data.payment_method=profile.payment_method||issuer.payment_method||'transfer';
      paymentSnapshot={...profile,payment_method:data.payment_method};
     }catch(error){if(error instanceof HttpError)throw error;fail(error.message);}
    }
    // Keep the request hash independent of later changes to the account's profile.
    const snapshot=completeFiscalProfile(data.party,party.party_profile);
    data.party=snapshot;
    const [[duplicate]]=await db.execute('SELECT id FROM trade_invoices WHERE company_id=? AND direction=? AND reference=? AND reference_party_id=?',[companyId,data.direction,data.reference,issued?0:party.id]);
    if(duplicate)throw new HttpError(409,'INVOICE_REFERENCE_EXISTS');
    const offset=data.offset_account_id?await requireAccount(db,companyId,data.offset_account_id,issued?['7']:['6','2']):await standardAccount(db,companyId,settings,issued?'7000':'6000');
    const vat=cents(data.tax_total)>0n?(data.vat_account_id?await requireAccount(db,companyId,data.vat_account_id,issued?['477']:['472']):await standardAccount(db,companyId,settings,issued?'4770':'4720')):null;
    const retained=cents(data.withholding_total)>0n?(data.withholding_account_id?await requireAccount(db,companyId,data.withholding_account_id,issued?['473']:['4751']):await standardAccount(db,companyId,settings,issued?'4730':'4751')):null;
    const concept=((issued?'Factura emitida ':'Factura recibida ')+data.reference+' · '+data.party.name).slice(0,200),lines=[];
    const line=(account,value,debit)=>{if(cents(value)>0n)lines.push({account_id:account.id,description:concept,debit:debit?value:'0.00',credit:debit?'0.00':value});};
    line(party,data.total_amount,issued);line(offset,data.base_total,!issued);if(vat)line(vat,data.tax_total,!issued);if(retained)line(retained,data.withholding_total,issued);
    let entry;
    if(options.existing_entry_id){
     const [[existingEntry]]=await db.execute('SELECT id,exercise_id,entry_date,status,entry_type FROM journal_entries WHERE company_id=? AND id=? FOR UPDATE',[companyId,id(options.existing_entry_id)]);
     if(!existingEntry||existingEntry.exercise_id!==data.exercise_id||existingEntry.status!=='posted'||existingEntry.entry_type!=='normal'||existingEntry.entry_date!==data.posting_date)throw new HttpError(409,'INVOICE_EXISTING_ENTRY_MISMATCH');
     const [[linked]]=await db.execute('SELECT id FROM trade_invoices WHERE company_id=? AND entry_id=?',[companyId,existingEntry.id]);if(linked)throw new HttpError(409,'INVOICE_EXISTING_ENTRY_LINKED');
     const [actual]=await db.execute('SELECT account_id,debit,credit FROM journal_lines WHERE company_id=? AND entry_id=?',[companyId,existingEntry.id]);
     const canonical=rows=>JSON.stringify(rows.map(row=>[row.account_id,row.debit,row.credit]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
     if(canonical(actual)!==canonical(lines))throw new HttpError(409,'INVOICE_EXISTING_ENTRY_MISMATCH');
     entry={id:existingEntry.id};
    }else entry=await postJournalEntry(db,companyId,{exercise_id:data.exercise_id,entry_date:data.posting_date,description:concept,request_id:data.request_id,lines});
    const [created]=await db.execute(`INSERT INTO trade_invoices(company_id,exercise_id,direction,reference,invoice_date,posting_date,party_name,party_tax_id,party_address,party_email,party_account_id,offset_account_id,vat_account_id,withholding_account_id,issuer_snapshot,base_total,tax_total,withholding_rate,withholding_total,total_amount,payment_method,notes,entry_id,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
     [companyId,data.exercise_id,data.direction,data.reference,data.invoice_date,data.posting_date,data.party.name,data.party.tax_id,data.party.address,data.party.email,party.id,offset.id,vat?.id??null,retained?.id??null,JSON.stringify(issuer),data.base_total,data.tax_total,data.withholding_rate,data.withholding_total,data.total_amount,data.payment_method,data.notes,entry.id,data.request_id,digest]);
    for(const [index,row]of data.lines.entries())await db.execute('INSERT INTO trade_invoice_lines(company_id,invoice_id,position,description,base,tax_rate,tax_amount) VALUES (?,?,?,?,?,?,?)',[companyId,created.insertId,index+1,row.description,row.base,row.tax_rate,row.tax_amount]);
    await db.execute('UPDATE trade_invoices SET party_snapshot=? WHERE company_id=? AND id=?',[JSON.stringify(snapshot),companyId,created.insertId]);
    if(paymentSnapshot)await db.execute('UPDATE trade_invoices SET payment_snapshot=? WHERE company_id=? AND id=?',[JSON.stringify(paymentSnapshot),companyId,created.insertId]);
    for(const [index,row]of data.receipts.entries())await db.execute('INSERT INTO portfolio_receipts(company_id,invoice_id,position,original_due_date,due_date,amount,payment_method) VALUES (?,?,?,?,?,?,?)',[companyId,created.insertId,index+1,row.due_date,row.due_date,row.amount,data.payment_method]);
    const invoice=await detail(db,created.insertId);
    if(!options.accounting_only&&await appendFiscalRecord(db,companyId,invoice))return {...await detail(db,created.insertId),replayed:false};
    return {...invoice,replayed:false};
   };
   return options.db?create(options.db):withTransaction(pool,create);
  },
  async void(invoiceId,body){
   const target=id(invoiceId),data={request_id:requestId(body?.request_id),exercise_id:id(body?.exercise_id),date:date(body?.date),reason:text(body?.reason,200,true)},digest=hash(data);
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    const invoice=await detail(db,target);
    if(invoice.status==='void'){if(invoice.void_request_id===data.request_id&&invoice.void_request_hash===digest)return {...invoice,replayed:true};throw new HttpError(409,'INVOICE_VOIDED');}
    if(data.date<invoice.posting_date)fail('INVALID_INVOICE_DATE');
    if(invoice.receipts.some(row=>row.remittance_id))throw new HttpError(409,'RECEIPT_IN_REMITTANCE');
    if(invoice.receipts.some(row=>cents(row.paid_amount)>0n))throw new HttpError(409,'INVOICE_HAS_SETTLEMENTS');
    const [[latest]]=await db.execute('SELECT MAX(s.reversal_date) AS date FROM portfolio_settlements s JOIN portfolio_receipts r ON r.company_id=s.company_id AND r.id=s.receipt_id WHERE r.company_id=? AND r.invoice_id=?',[companyId,target]);
    if(latest.date&&data.date<latest.date)fail('INVALID_PAYMENT_DATE');
    const reversal=await reverseJournal(db,companyId,invoice.entry_id,data.exercise_id,data.date,'Anulación factura '+invoice.reference+' · '+data.reason);
    await db.execute("UPDATE trade_invoices SET status='void',void_entry_id=?,void_request_id=?,void_request_hash=?,void_date=?,void_reason=? WHERE company_id=? AND id=?",[reversal.id,data.request_id,digest,data.date,data.reason,companyId,target]);
    await appendFiscalRecord(db,companyId,invoice,'anulacion');
    return {...await detail(db,target),replayed:false};
   });
  },
 };
}
