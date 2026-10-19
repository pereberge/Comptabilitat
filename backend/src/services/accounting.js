import { parseAccountCode } from '../../../shared/account-codes.js';
import { ensureAccount } from './account-hierarchy.js';
import { lockCompany, nextSubaccountCode } from './subaccounts.js';
import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { id, description, date, fail, validateEntry } from './validation.js';
export function createAccountingService(pool, companyId) {
 async function transaction(action) {
  const db=await pool.getConnection();
  try{await db.beginTransaction();const value=await action(db);await db.commit();return value;}
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
 return {
  async listAccounts(query={}) {
   const search=typeof query.search==='string'?query.search.trim():'';
   if(search.length>200) fail('INVALID_SEARCH');
   if(query.kind && !['account','subaccount'].includes(query.kind)) fail('INVALID_KIND');
   const params=[companyId]; let where='a.company_id=?';
   if(search){where+=' AND (LOCATE(?,a.code)>0 OR LOCATE(?,a.description)>0)';params.push(search,search);}
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
    const [result]=await db.execute('INSERT INTO accounts(company_id,code,description,kind,parent_id) VALUES (?,?,?,?,?)',[companyId,code,text,kind,parent?.id??null]);
    return account(db,result.insertId);
   });
  },
  async updateAccount(accountId,body) {
   if(!body || Object.keys(body).some(key=>key!=='description')) fail('IMMUTABLE_ACCOUNT');
   const text=description(body.description);
   await account(pool,accountId);
   await pool.execute('UPDATE accounts SET description=? WHERE company_id=? AND id=?',[text,companyId,id(accountId)]);
   return account(pool,accountId);
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
   if(query.number){where+=' AND e.number=?';params.push(id(query.number));}
   if(query.view==='lines') {
    const [rows]=await pool.execute('SELECT l.id,e.id AS entry_id,e.number,e.entry_date,p.code AS account_code,SUBSTRING(a.code,CHAR_LENGTH(p.code)+1) AS subaccount_code,a.description AS account_name,l.description,l.debit,l.credit FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id JOIN accounts a ON a.id=l.account_id AND a.company_id=e.company_id JOIN accounts p ON p.id=a.parent_id AND p.company_id=e.company_id WHERE '+where+' ORDER BY e.entry_date DESC,e.number DESC,l.position',params);
    return rows;
   }
   const [rows]=await pool.execute('SELECT e.*,SUM(l.debit) AS debit,SUM(l.credit) AS credit FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id WHERE '+where+' GROUP BY e.id ORDER BY e.number DESC',params);
   return rows;
  },
  async getEntry(entryId) {
   const [[entry]]=await pool.execute('SELECT * FROM journal_entries WHERE company_id=? AND id=?',[companyId,id(entryId)]);
   if(!entry) throw new HttpError(404,'ENTRY_NOT_FOUND');
   const [lines]=await pool.execute('SELECT l.*,a.code,a.description AS account_description FROM journal_lines l JOIN accounts a ON a.id=l.account_id WHERE l.company_id=? AND l.entry_id=? ORDER BY l.position',[companyId,entry.id]);
   return {...entry,lines};
  },
  async createEntry(body) {
   const data=validateEntry(body);
   const hash=createHash('sha256').update(JSON.stringify(data)).digest('hex');
   return transaction(async db=>{
    const period=await exercise(db,data.exerciseId,true);
    const [[existing]]=await db.execute('SELECT id,request_hash FROM journal_entries WHERE company_id=? AND request_id=?',[companyId,data.requestId]);
    if(existing){if(existing.request_hash!==hash)fail('REQUEST_CONFLICT');return {id:existing.id,replayed:true};}
    if(period.status!=='open') fail('EXERCISE_CLOSED');
    if(data.entryDate<period.start_date||data.entryDate>period.end_date) fail('DATE_OUTSIDE_EXERCISE');
    const unique=[...new Set(data.lines.map(line=>line.account_id))].sort((a,b)=>a-b);
    for(const accountId of unique){
     const row=await account(db,accountId);
     if(row.kind!=='subaccount') fail('SUBACCOUNT_REQUIRED');
    }
    const [[last]]=await db.execute('SELECT COALESCE(MAX(number),0) AS number FROM journal_entries WHERE company_id=? AND exercise_id=?',[companyId,period.id]);
    const number=last.number+1;
    const [entry]=await db.execute('INSERT INTO journal_entries(company_id,exercise_id,number,entry_date,description,request_id,request_hash) VALUES (?,?,?,?,?,?,?)',[companyId,period.id,number,data.entryDate,data.concept,data.requestId,hash]);
    for(const [index,line]of data.lines.entries())await db.execute('INSERT INTO journal_lines(company_id,entry_id,account_id,position,description,debit,credit) VALUES (?,?,?,?,?,?,?)',[companyId,entry.insertId,line.account_id,index+1,line.description,line.debit,line.credit]);
    return {id:entry.insertId,number};
   });
  },
 };
}
