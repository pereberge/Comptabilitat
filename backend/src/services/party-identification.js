import {partyTaxId,partyAccountsByName} from '../../../shared/party-identity.js';
export const partyTaxSql=column=>"REGEXP_REPLACE(UPPER("+column+"),'[^A-Z0-9]','')";
export async function findPartyAccountByTaxId(db,companyId,direction,taxId){
 const normalized=partyTaxId(taxId);if(!normalized)return {accountId:null,ambiguous:false};
 const supplier=direction==='received'?` UNION SELECT account_id FROM suppliers WHERE company_id=? AND ${partyTaxSql('tax_id')}=? AND status='active'`:'';
 const prefixes=direction==='received'?['400','410']:['430','440'];
 const [rows]=await db.execute(`SELECT DISTINCT party_account_id AS account_id FROM trade_invoices WHERE company_id=? AND direction=? AND ${partyTaxSql('party_tax_id')}=?`+supplier+` UNION SELECT id AS account_id FROM accounts WHERE company_id=? AND kind='subaccount' AND LEFT(code,3) IN (?,?) AND ${partyTaxSql("JSON_UNQUOTE(JSON_EXTRACT(party_profile,'$.tax_id'))")}=?`,[companyId,direction,normalized,...(supplier?[companyId,normalized]:[]),companyId,...prefixes,normalized]);
 return {accountId:rows.length===1?rows[0].account_id:null,ambiguous:rows.length>1};
}
export async function knownPartyTaxIds(db,companyId){
 const [rows]=await db.execute("SELECT DISTINCT party_account_id AS account_id,direction,party_tax_id AS tax_id FROM trade_invoices WHERE company_id=? AND party_tax_id<>'' UNION SELECT account_id,'received' AS direction,tax_id FROM suppliers WHERE company_id=? AND status='active' AND tax_id<>''",[companyId,companyId]);return rows;
}
export async function findPartyAccount(db,companyId,direction,taxId,name){
 const fiscal=await findPartyAccountByTaxId(db,companyId,direction,taxId);if(fiscal.accountId||fiscal.ambiguous)return {...fiscal,matchedBy:'tax_id'};
 const [accounts]=await db.execute("SELECT id,code,description,kind FROM accounts WHERE company_id=? AND kind='subaccount'",[companyId]);
 const identities=await knownPartyTaxIds(db,companyId);
 const [profiles]=await db.execute("SELECT id AS account_id,IF(LEFT(code,3) IN ('430','440'),'issued','received') AS direction,JSON_UNQUOTE(JSON_EXTRACT(party_profile,'$.tax_id')) AS tax_id,JSON_UNQUOTE(JSON_EXTRACT(party_profile,'$.name')) AS name FROM accounts WHERE company_id=? AND kind='subaccount' AND party_profile IS NOT NULL",[companyId]);
 const matches=partyAccountsByName(accounts,[...profiles,...identities],direction,name,taxId);
 return {accountId:matches.length===1?matches[0].id:null,ambiguous:matches.length>1,matchedBy:matches.length?'name':null};
}
