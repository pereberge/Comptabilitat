import {HttpError} from '../middleware/errors.js';
import {id,description,date,fail} from './validation.js';
import {cents,decimal} from '../../../shared/money.js';
import {reconciliationConcept,reconciliationSignedAmount} from '../../../shared/reconciliation-proposals.js';
export async function readReconciliationRules(db,companyId,bankAccountId){
 if(!bankAccountId)return [];
 const [rows]=await db.execute('SELECT * FROM bank_reconciliation_rules WHERE company_id=? AND bank_account_id=? ORDER BY CHAR_LENGTH(concept_key) DESC,id',[companyId,bankAccountId]);
 if(!rows.length)return [];
 const [accounts]=await db.execute('SELECT id,code,description FROM accounts WHERE company_id=?',[companyId]);
 return rows.map(row=>({...row,counter_lines:(typeof row.counter_lines==='string'?JSON.parse(row.counter_lines):row.counter_lines).map(line=>({...line,code:accounts.find(account=>account.id===line.account_id)?.code||'',name:accounts.find(account=>account.id===line.account_id)?.description||'Cuenta no disponible'}))}));
}
export function validateManualReconciliation(body,movement,bank,accounts,period){
 if(!body||!Array.isArray(body.counter_lines)||!body.counter_lines.length||body.counter_lines.length>20)fail('RECONCILIATION_INVALID_PROPOSAL');
 const used=new Set(),counter_lines=body.counter_lines.map(line=>{
  const accountId=id(line?.account_id),account=accounts.find(item=>item.id===accountId&&item.kind==='subaccount');
  if(!account||account.id===bank.id||used.has(accountId))fail('RECONCILIATION_INVALID_ACCOUNT');used.add(accountId);
  let debit,credit;try{debit=cents(line.debit);credit=cents(line.credit);}catch{fail('INVALID_AMOUNT');}
  if(!((debit>0n&&credit===0n)||(credit>0n&&debit===0n)))fail('INVALID_LINE_AMOUNTS');
  return {account_id:accountId,debit:decimal(debit),credit:decimal(credit)};
 });
 const net=counter_lines.reduce((sum,line)=>sum+cents(line.debit)-cents(line.credit),0n);
 if(net!==-reconciliationSignedAmount(movement.amount))fail('RECONCILIATION_UNBALANCED_PROPOSAL');
 const absolute=reconciliationSignedAmount(movement.amount),debit=counter_lines.reduce((sum,line)=>sum+cents(line.debit),absolute>0n?absolute:0n),credit=counter_lines.reduce((sum,line)=>sum+cents(line.credit),absolute<0n?-absolute:0n);
 if(debit>999999999999999n||credit>999999999999999n)fail('TOTAL_TOO_LARGE');
 const entryDate=date(body.date||movement.date);if(entryDate<period.start_date||entryDate>period.end_date)fail('DATE_OUTSIDE_EXERCISE');
 if(typeof body.remember!=='boolean')fail('RECONCILIATION_INVALID_PROPOSAL');
 const pattern=body.remember?description(body.rule_concept):null,conceptKey=pattern?reconciliationConcept(pattern):null;
 if(body.remember&&(!conceptKey||conceptKey.length<3||conceptKey.length>200))fail('RECONCILIATION_INVALID_RULE');
 return {manual:{movement_id:movement.id,date:entryDate,concept:description(body.concept||movement.concept.slice(0,200)),bank_amount:movement.amount,counter_lines,rule_concept:pattern},pattern,conceptKey};
}
export async function saveReconciliationRule(db,companyId,bankAccountId,manual,concept,conceptKey){
 const direction=reconciliationSignedAmount(manual.bank_amount)<0n?'out':'in';
 const [[existing]]=await db.execute('SELECT id FROM bank_reconciliation_rules WHERE company_id=? AND bank_account_id=? AND concept_key=? AND direction=?',[companyId,bankAccountId,conceptKey,direction]);
 if(existing){await db.execute('UPDATE bank_reconciliation_rules SET concept=?,bank_amount=?,counter_lines=?,version=version+1 WHERE company_id=? AND id=?',[concept,manual.bank_amount,JSON.stringify(manual.counter_lines),companyId,existing.id]);return existing.id;}
 const [saved]=await db.execute('INSERT INTO bank_reconciliation_rules(company_id,bank_account_id,concept,concept_key,direction,bank_amount,counter_lines) VALUES (?,?,?,?,?,?,?)',[companyId,bankAccountId,concept,conceptKey,direction,manual.bank_amount,JSON.stringify(manual.counter_lines)]);return saved.insertId;
}
export async function removeReconciliationRule(db,companyId,bankAccountId,ruleId,version){
 const [[row]]=await db.execute('SELECT id,version FROM bank_reconciliation_rules WHERE company_id=? AND bank_account_id=? AND id=?',[companyId,bankAccountId,id(ruleId)]);
 if(!row)throw new HttpError(404,'RECONCILIATION_RULE_NOT_FOUND');
 if(row.version!==version)throw new HttpError(409,'RECONCILIATION_CHANGED');
 await db.execute('DELETE FROM bank_reconciliation_rules WHERE company_id=? AND id=?',[companyId,row.id]);
}
