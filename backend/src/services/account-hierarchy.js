import { readFileSync } from 'node:fs';
import { fail } from './validation.js';

const reference = JSON.parse(readFileSync(new URL('../../../database/reference/pgc.json', import.meta.url), 'utf8'));
const standardNames = new Map(reference.accounts.map(row => [row.code, row.description]));

// Caller must hold the company row lock and a transaction.
export async function ensureAccount(db, companyId, code) {
  if (!code) return null;
  const [[existing]] = await db.execute('SELECT * FROM accounts WHERE company_id=? AND code=?', [companyId, code]);
  if (existing) {
    if (existing.kind !== 'account') fail('INVALID_PARENT');
    return existing;
  }
  const parent = await ensureAccount(db, companyId, code.slice(0, -1));
  const description = standardNames.get(code) || 'Cuenta ' + code;
  const [result] = await db.execute("INSERT INTO accounts(company_id,code,description,kind,parent_id) VALUES (?,?,?,'account',?)", [companyId,code,description,parent?.id ?? null]);
  return { id:result.insertId, code, description, kind:'account', parent_id:parent?.id ?? null };
}
