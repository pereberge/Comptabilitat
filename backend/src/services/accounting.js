import { parseAccountCode } from '../../../shared/account-codes.js';
import { accountPartyType,normalizePartyProfile } from '../../../shared/account-party.js';
import {normalizePartyPaymentProfile} from '../../../shared/party-payments.js';
import {normalizeSepaMandate} from '../../../shared/sepa.js';
import { ensureAccount } from './account-hierarchy.js';
import { lockCompany, nextSubaccountCode } from './subaccounts.js';
import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { cents, decimal } from '../../../shared/money.js';
import { id, description, date, fail, validateEntry } from './validation.js';
// The caller owns the transaction; invoices and receipts commit with their journal.
export async function postJournalEntry(db,companyId,body) {
 const data=validateEntry(body),hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 const [[period]]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,data.exerciseId]);
 if(!period)throw new HttpError(404,'EXERCISE_NOT_FOUND');
 const [[existing]]=await db.execute('SELECT id,request_hash FROM journal_entries WHERE company_id=? AND request_id=?',[companyId,data.requestId]);
 if(existing){if(existing.request_hash!==hash)fail('REQUEST_CONFLICT');return {id:existing.id,replayed:true};}
 if(period.status!=='open')fail('EXERCISE_CLOSED');
 if(data.entryDate<period.start_date||data.entryDate>period.end_date)fail('DATE_OUTSIDE_EXERCISE');
 for(const accountId of [...new Set(data.lines.map(line=>line.account_id))].sort((a,b)=>a-b)){
  const [[row]]=await db.execute('SELECT kind FROM accounts WHERE company_id=? AND id=?',[companyId,accountId]);
  if(!row)throw new HttpError(404,'ACCOUNT_NOT_FOUND');if(row.kind!=='subaccount')fail('SUBACCOUNT_REQUIRED');
 }
 const [[last]]=await db.execute('SELECT COALESCE(MAX(number),0) AS number FROM journal_entries WHERE company_id=? AND exercise_id=?',[companyId,period.id]);
 if(last.number>=4294967295)fail('INVALID_ID');
 const number=last.number+1;
 const [entry]=await db.execute('INSERT INTO journal_entries(company_id,exercise_id,number,entry_date,description,request_id,request_hash) VALUES (?,?,?,?,?,?,?)',[companyId,period.id,number,data.entryDate,data.concept,data.requestId,hash]);
 for(const [index,line]of data.lines.entries())await db.execute('INSERT INTO journal_lines(company_id,entry_id,account_id,position,description,debit,credit) VALUES (?,?,?,?,?,?,?)',[companyId,entry.insertId,line.account_id,index+1,line.description,line.debit,line.credit]);
 return {id:entry.insertId,number};
}
export function createAccountingService(pool, companyId) {
 function mandate(value,row){if(accountPartyType(row)!=='customer')fail('INVALID_PARTY_ACCOUNT');if(value===null)return null;try{return normalizeSepaMandate(value);}catch(error){fail(error.message);}}
 function paymentProfile(value,row){
  if(!accountPartyType(row))fail('INVALID_PARTY_ACCOUNT');
  if(value===null)return null;
  try{return normalizePartyPaymentProfile(value);}catch(error){fail(error.message);}
 }
 function profile(value,row){
  if(!accountPartyType(row))fail('INVALID_PARTY_ACCOUNT');
  if(value===null)return null;
  try{return normalizePartyProfile(value);}catch(error){fail(error.message);}
 }
 async function transaction(action,readOnly=false) {
  const db=await pool.getConnection();
  try{if(readOnly){await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');}else await db.beginTransaction();const value=await action(db);await db.commit();return value;}
  catch(error){await db.rollback();throw error;}finally{db.release();}
 }
 async function account(db,accountId) {
  const [[row]]=await db.execute('SELECT a.*,p.code AS parent_code FROM accounts a LEFT JOIN accounts p ON p.id=a.parent_id WHERE a.company_id=? AND a.id=?',[companyId,id(accountId)]);
  if(!row) throw new HttpError(404,'ACCOUNT_NOT_FOUND');
  return row;
 }
 async function exercise(db,exerciseId,lock=false) {
  const [[row]]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?'+(lock?' FOR UPDATE':''),[companyId,id(exerciseId)]);
  if(!row) throw new HttpError(404,'EXERCISE_NOT_FOUND');
  return row;
 }
 async function entry(db,entryId) {
  const [[row]]=await db.execute(`SELECT e.*,x.name AS exercise_name,x.start_date AS exercise_start,x.end_date AS exercise_end,x.status AS exercise_status,
    (EXISTS(SELECT 1 FROM trade_invoices i WHERE i.company_id=e.company_id AND (i.entry_id=e.id OR i.void_entry_id=e.id))
     OR EXISTS(SELECT 1 FROM portfolio_settlements s WHERE s.company_id=e.company_id AND (s.entry_id=e.id OR s.reversal_entry_id=e.id))
     OR EXISTS(SELECT 1 FROM invoice_documents d WHERE d.company_id=e.company_id AND d.entry_id=e.id)) AS linked_document
    FROM journal_entries e JOIN accounting_exercises x ON x.company_id=e.company_id AND x.id=e.exercise_id WHERE e.company_id=? AND e.id=?`,[companyId,id(entryId)]);
  if(!row)throw new HttpError(404,'ENTRY_NOT_FOUND');
  const [lines]=await db.execute('SELECT l.*,a.code,COALESCE(l.source_account_name,a.description) AS account_description FROM journal_lines l JOIN accounts a ON a.id=l.account_id AND a.company_id=l.company_id WHERE l.company_id=? AND l.entry_id=? ORDER BY l.position,l.id',[companyId,row.id]);
  const blocked=row.exercise_status!=='open'?'EXERCISE_CLOSED':row.status!=='posted'||row.entry_type!=='normal'||row.exercise_operation_id||row.cancelled_by_operation_id?'ENTRY_NOT_EDITABLE':Number(row.linked_document)?'ENTRY_LINKED_DOCUMENT':null;
  const revision=createHash('sha256').update(JSON.stringify({id:row.id,exercise_id:row.exercise_id,number:row.number,date:row.entry_date,description:row.description,status:row.status,type:row.entry_type,operation:row.exercise_operation_id,cancelled:row.cancelled_by_operation_id,lines:lines.map(line=>[line.id,line.account_id,line.position,line.description,line.debit,line.credit,line.source_page,line.source_account_name,line.source_line_number])})).digest('hex');
  return {...row,lines,revision,editable:!blocked,edit_blocked_reason:blocked,exercise:{id:row.exercise_id,name:row.exercise_name,start_date:row.exercise_start,end_date:row.exercise_end,status:row.exercise_status}};
 }
 return {
  async listAccounts(query={}) {
   const search=typeof query.search==='string'?query.search.trim():'';
   if(search.length>200) fail('INVALID_SEARCH');
   if(query.kind && !['account','subaccount'].includes(query.kind)) fail('INVALID_KIND');
   const params=[companyId]; let where='a.company_id=?';
   if(search){where+=" AND (LOCATE(?,CONVERT(a.code USING utf8mb4))>0 OR LOCATE(?,a.description)>0 OR LOCATE(?,a.party_profile->>'$.name')>0 OR LOCATE(?,a.party_profile->>'$.tax_id')>0)";params.push(search,search,search,search);}
   if(query.kind){where+=' AND a.kind=?';params.push(query.kind);}
   const [rows]=await pool.execute('SELECT a.*,p.code AS parent_code FROM accounts a LEFT JOIN accounts p ON p.id=a.parent_id WHERE '+where+' ORDER BY a.code',params);
   return rows;
  },
  getAccount: accountId=>account(pool,accountId),
  async createAccount(body) {
   if(!body || typeof body!=='object') fail('INVALID_ACCOUNT');
   const text=description(body.description);
   return transaction(async db=>{
    const settings=await lockCompany(db, companyId);
    let parsed;
    try { parsed=parseAccountCode(body.code,settings.subaccount_length); } catch(error) { fail(error.message); }
    const {code,kind}=parsed;
    if(body.kind!==undefined && body.kind!==kind) fail('INVALID_KIND');
    let parentCode=parsed.parentCode;
    if(kind==='account') parentCode=code.slice(0,-1);
    else if(!parentCode){
      if(body.parent_id){parentCode=(await account(db,body.parent_id)).code;}
      else {
        const [[nearest]]=await db.execute("SELECT code FROM accounts WHERE company_id=? AND kind='account' AND LENGTH(code)>=3 AND LENGTH(code)<? AND LEFT(?,LENGTH(code))=code ORDER BY LENGTH(code) DESC LIMIT 1",[companyId,code.length,code]);
        if(!nearest) fail('SUBACCOUNT_SEPARATOR_REQUIRED');
        parentCode=nearest.code;
      }
    }
    if(kind==='subaccount' && (!parentCode || parentCode.length<3 || parentCode.length>=code.length || !code.startsWith(parentCode))) fail('INVALID_PARENT');
    const parent=await ensureAccount(db,companyId,parentCode);
    if(body.parent_id && (!parent || Number(body.parent_id)!==parent.id)) fail('INVALID_PARENT');
    const party=body.party_profile===undefined?null:profile(body.party_profile,{code,kind});
    const payment=body.payment_profile===undefined?null:paymentProfile(body.payment_profile,{code,kind});
    const sepa=body.sepa_mandate===undefined?null:mandate(body.sepa_mandate,{code,kind});
    const [result]=await db.execute('INSERT INTO accounts(company_id,code,description,kind,parent_id,party_profile,payment_profile,sepa_mandate) VALUES (?,?,?,?,?,?,?,?)',[companyId,code,text,kind,parent?.id??null,party===null?null:JSON.stringify(party),payment===null?null:JSON.stringify(payment),sepa===null?null:JSON.stringify(sepa)]);
    return account(db,result.insertId);
   });
  },
  async updateAccount(accountId,body) {
   if(!body || typeof body!=='object'||Array.isArray(body)||!Object.keys(body).length||Object.keys(body).some(key=>!['description','party_profile','payment_profile','sepa_mandate'].includes(key))) fail('IMMUTABLE_ACCOUNT');
   return transaction(async db=>{
    await lockCompany(db,companyId);
    const row=await account(db,accountId),text=body.description===undefined?row.description:description(body.description);
    if(body.party_profile!==undefined){
     const party=profile(body.party_profile,row);
     await db.execute('UPDATE accounts SET description=?,party_profile=? WHERE company_id=? AND id=?',[text,party===null?null:JSON.stringify(party),companyId,row.id]);
    }else await db.execute('UPDATE accounts SET description=? WHERE company_id=? AND id=?',[text,companyId,row.id]);
    if(body.payment_profile!==undefined){const payment=paymentProfile(body.payment_profile,row);await db.execute('UPDATE accounts SET payment_profile=? WHERE company_id=? AND id=?',[payment===null?null:JSON.stringify(payment),companyId,row.id]);}
    if(body.sepa_mandate!==undefined){const sepa=mandate(body.sepa_mandate,row);await db.execute('UPDATE accounts SET sepa_mandate=? WHERE company_id=? AND id=?',[sepa===null?null:JSON.stringify(sepa),companyId,row.id]);}
    return account(db,row.id);
   });
  },
  async nextCode(parentId) {
   const parent=await account(pool,parentId);
   const [[settings]]=await pool.execute('SELECT subaccount_length FROM companies WHERE id=?',[companyId]);
   const next = await nextSubaccountCode(pool, companyId, parent, settings.subaccount_length);
   return {code:next};
  },
  async listEntries(query) {
   await exercise(pool,query.exercise_id);
   let where='e.company_id=? AND e.exercise_id=?';const params=[companyId,id(query.exercise_id)];
   if(query.from){where+=' AND e.entry_date>=?';params.push(date(query.from));}
   if(query.to){where+=' AND e.entry_date<=?';params.push(date(query.to));}
   if(query.from&&query.to&&query.from>query.to) fail('INVALID_DATE');
   if(query.number!==undefined&&query.number!==''){
    if(!/^(0|[1-9]\d*)$/.test(String(query.number))||!Number.isSafeInteger(Number(query.number))||Number(query.number)>4294967295) fail('INVALID_ID');
    where+=' AND e.number=?';params.push(Number(query.number));
   }
   if(query.amount!==undefined&&query.amount!==''){
    let target;try{if(typeof query.amount!=='string')fail('INVALID_AMOUNT');target=cents(query.amount.trim());}catch{fail('INVALID_AMOUNT');}
    const value=decimal(target);
    where+=' AND EXISTS (SELECT 1 FROM journal_lines matched WHERE matched.company_id=e.company_id AND matched.entry_id=e.id AND (matched.debit=? '+(target===0n?'AND':'OR')+' matched.credit=?))';
    params.push(value,value);
   }
   if(query.view==='lines') {
    const [rows]=await pool.execute('SELECT l.id,e.id AS entry_id,e.number,e.entry_date,e.status,p.code AS account_code,SUBSTRING(a.code,CHAR_LENGTH(p.code)+1) AS subaccount_code,COALESCE(l.source_account_name,a.description) AS account_name,l.description,l.debit,l.credit,l.source_page,l.source_line_number,e.entry_type,e.source_journal_code,e.source_entry_reference FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id JOIN accounts a ON a.id=l.account_id AND a.company_id=e.company_id JOIN accounts p ON p.id=a.parent_id AND p.company_id=e.company_id WHERE '+where+' ORDER BY e.entry_date DESC,e.number DESC,l.position',params);
    return rows;
   }
   const [rows]=await pool.execute('SELECT e.*,SUM(l.debit) AS debit,SUM(l.credit) AS credit FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id WHERE '+where+' GROUP BY e.id ORDER BY e.number DESC',params);
   return rows;
  },
  getEntry:entryId=>transaction(db=>entry(db,entryId),true),
  async updateEntry(entryId,body,{canRemoveLines=true}={}) {
   const target=id(entryId);
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['exercise_id','entry_date','description','lines','revision'].includes(key)))fail('IMMUTABLE_ENTRY');
   if(typeof body.revision!=='string'||!/^[a-f0-9]{64}$/.test(body.revision))fail('INVALID_ENTRY_REVISION');
   // Validate the accounting content; the original creation request is kept unchanged.
   const data=validateEntry({...body,request_id:'00000000-0000-4000-8000-000000000000'});
   // Resolve outside the transaction so the consistent read starts after the exercise lock.
   const [[targetEntry]]=await pool.execute('SELECT exercise_id FROM journal_entries WHERE company_id=? AND id=?',[companyId,target]);
   if(!targetEntry)throw new HttpError(404,'ENTRY_NOT_FOUND');
   if(data.exerciseId!==targetEntry.exercise_id)fail('IMMUTABLE_ENTRY');
   return transaction(async db=>{
    const period=await exercise(db,targetEntry.exercise_id,true);
    const [[locked]]=await db.execute('SELECT id FROM journal_entries WHERE company_id=? AND id=? FOR UPDATE',[companyId,target]);
    if(!locked)throw new HttpError(404,'ENTRY_NOT_FOUND');
    const before=await entry(db,target);
    if(!before.editable)throw new HttpError(409,before.edit_blocked_reason);
    if(data.entryDate<period.start_date||data.entryDate>period.end_date)fail('DATE_OUTSIDE_EXERCISE');
    const oldData={exerciseId:before.exercise_id,entryDate:before.entry_date,concept:before.description,lines:before.lines.map(line=>({account_id:line.account_id,description:line.description,debit:line.debit,credit:line.credit}))};
    const nextData={exerciseId:data.exerciseId,entryDate:data.entryDate,concept:data.concept,lines:data.lines};
    const unchanged=JSON.stringify(oldData)===JSON.stringify(nextData);
    if(body.revision!==before.revision&&!unchanged)throw new HttpError(409,'ENTRY_CHANGED');
    const lineIds=body.lines.map(line=>line.id===undefined?null:id(line.id));
    if(new Set(lineIds.filter(Boolean)).size!==lineIds.filter(Boolean).length||lineIds.some(value=>value&&!before.lines.some(line=>line.id===value)))fail('INVALID_LINES');
    if(!canRemoveLines&&!unchanged&&before.lines.some(line=>!lineIds.includes(line.id)))throw new HttpError(403,'PERMISSION_DENIED');
    for(const accountId of [...new Set(data.lines.map(line=>line.account_id))].sort((a,b)=>a-b)){
     const selected=await account(db,accountId);if(selected.kind!=='subaccount')fail('SUBACCOUNT_REQUIRED');
    }
    if(unchanged)return {...before,replayed:true};
    await db.execute('UPDATE journal_entries SET entry_date=?,description=? WHERE company_id=? AND id=?',[data.entryDate,data.concept,companyId,target]);
    await db.execute('DELETE FROM journal_lines WHERE company_id=? AND entry_id=?',[companyId,target]);
    for(const [index,line] of data.lines.entries()){
     const original=before.lines.find(row=>row.id===lineIds[index]);
     await db.execute('INSERT INTO journal_lines(id,company_id,entry_id,account_id,position,description,debit,credit,source_page,source_account_name,source_line_number) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[lineIds[index],companyId,target,line.account_id,index+1,line.description,line.debit,line.credit,original?.source_page??null,original?.account_id===line.account_id?original.source_account_name??null:null,original?.source_line_number??null]);
    }
    return entry(db,target);
   });
  },
  async createEntry(body) {
   validateEntry(body);
   return transaction(db=>postJournalEntry(db,companyId,body));
  },
 };
}
