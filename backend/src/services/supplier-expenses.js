import {partyTaxId} from '../../../shared/party-identity.js';
import {requireAccount} from './trade-posting.js';
export async function supplierExpensePreference(db,companyId,taxId){
 const [[row]]=await db.execute("SELECT a.id AS account_id,a.code,a.description FROM supplier_expense_preferences p JOIN accounts a ON a.company_id=p.company_id AND a.id=p.expense_account_id WHERE p.company_id=? AND p.supplier_tax_id=? AND a.kind='subaccount' AND (a.code LIKE '6%' OR a.code LIKE '2%')",[companyId,partyTaxId(taxId)]);return row||null;
}
export async function rememberSupplierExpense(db,companyId,{taxId,name,accountId},actor){
 await requireAccount(db,companyId,accountId,['6','2']);
 await db.execute('INSERT INTO supplier_expense_preferences(company_id,supplier_tax_id,supplier_name,expense_account_id,updated_by) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE supplier_name=VALUES(supplier_name),expense_account_id=VALUES(expense_account_id),updated_by=VALUES(updated_by)',[companyId,partyTaxId(taxId),name,accountId,actor]);
}
