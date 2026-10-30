import { randomUUID } from 'node:crypto';
import { ensureAccount } from './account-hierarchy.js';
import { nextSubaccountCode } from './subaccounts.js';
import { fail,id } from './validation.js';
import { HttpError } from '../middleware/errors.js';
import { postJournalEntry } from './accounting.js';
import { normalizePartyProfile } from '../../../shared/account-party.js';
import {findPartyAccount} from './party-identification.js';

export async function requireAccount(db,companyId,accountId,prefixes,error='INVALID_INVOICE_ACCOUNT'){
 const [[row]]=await db.execute('SELECT id,code,kind,party_profile,payment_profile FROM accounts WHERE company_id=? AND id=?',[companyId,id(accountId)]);
 if(!row)throw new HttpError(404,'ACCOUNT_NOT_FOUND');
 if(row.kind!=='subaccount'||!prefixes.some(prefix=>row.code.startsWith(prefix)))fail(error);
 return row;
}
export async function standardAccount(db,companyId,settings,parentCode){
 const code=parentCode.padEnd(settings.subaccount_length,'0');
 const [[existing]]=await db.execute('SELECT id,kind FROM accounts WHERE company_id=? AND code=?',[companyId,code]);
 if(existing){if(existing.kind!=='subaccount')fail('INVALID_INVOICE_ACCOUNT');return existing;}
 const parent=await ensureAccount(db,companyId,parentCode);
 const [row]=await db.execute("INSERT INTO accounts(company_id,code,description,kind,parent_id) VALUES (?,?,?,'subaccount',?)",[companyId,code,parent.description,parent.id]);return {id:row.insertId};
}
export async function partyAccount(db,companyId,settings,data){
 const prefixes=data.direction==='issued'?['430','440']:['400','410'];
 if(data.party_account_id)return requireAccount(db,companyId,data.party_account_id,prefixes,'INVALID_PARTY_ACCOUNT');
 if(data.party.tax_id||data.party.name){
  const known=await findPartyAccount(db,companyId,data.direction,data.party.tax_id,data.party.name);
  if(known.ambiguous)throw new HttpError(409,known.matchedBy==='name'?'PARTY_NAME_AMBIGUOUS':'PARTY_TAX_ID_AMBIGUOUS');
  if(known.accountId)return requireAccount(db,companyId,known.accountId,prefixes,'INVALID_PARTY_ACCOUNT');
 }
 const parent=await ensureAccount(db,companyId,data.party_parent),code=await nextSubaccountCode(db,companyId,parent,settings.subaccount_length);
 const profile=normalizePartyProfile(data.party);
 const [created]=await db.execute("INSERT INTO accounts(company_id,code,description,kind,parent_id,party_profile) VALUES (?,?,?,'subaccount',?,?)",[companyId,code,data.party.name,parent.id,JSON.stringify(profile)]);return {id:created.insertId,party_profile:profile};
}
export async function reverseJournal(db,companyId,entryId,exerciseId,day,concept){
 const [lines]=await db.execute('SELECT account_id,description,debit,credit FROM journal_lines WHERE company_id=? AND entry_id=? ORDER BY position',[companyId,entryId]);
 if(!lines.length)fail('ENTRY_NOT_FOUND');
 return postJournalEntry(db,companyId,{exercise_id:exerciseId,entry_date:day,description:concept.slice(0,200),request_id:randomUUID(),lines:lines.map(line=>({...line,debit:line.credit,credit:line.debit}))});
}
