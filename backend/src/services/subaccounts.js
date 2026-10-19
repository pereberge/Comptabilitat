import { HttpError } from '../middleware/errors.js';
import { fail } from './validation.js';

// Shared lock with manual account creation: all code allocation uses this row.
export async function lockCompany(db, companyId) {
  const [[company]] = await db.execute('SELECT id, subaccount_length FROM companies WHERE id=? FOR UPDATE', [companyId]);
  if (!company) throw new HttpError(404, 'COMPANY_NOT_FOUND');
  return company;
}

export async function nextSubaccountCode(db, companyId, parent, length) {
  if (parent.kind !== 'account' || parent.code.length < 3 || parent.code.length >= length) fail('INVALID_PARENT');
  const [[last]] = await db.execute("SELECT MAX(code) AS code FROM accounts WHERE company_id=? AND code LIKE ? AND LENGTH(code)=? AND kind='subaccount'", [companyId, parent.code + '%', length]);
  const code = last.code ? String(BigInt(last.code) + 1n) : parent.code.padEnd(length - 1, '0') + '1';
  if (code.length !== length || !code.startsWith(parent.code)) fail('CODE_EXHAUSTED');
  return code;
}
