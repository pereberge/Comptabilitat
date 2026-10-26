import { decimal } from '../../../shared/money.js';

// Presentation groups stay within their PGC heading; the report's totals are unchanged.
export function balanceDetailSections(sections, digits = 0) {
 if (!Number.isInteger(digits) || digits < 3) return sections;
 const sum = (rows, key) => decimal(rows.reduce((total, row) => {
  const value = row[key] ?? '0.00';
  if (!/^-?\d+\.\d{2}$/.test(value)) throw new Error('INVALID_REPORT_AMOUNT');
  return total + BigInt(value.replace('.', ''));
 }, 0n));
 function visit(node) {
  const groups = new Map();
  for (const account of node.accounts) for (const sub of account.subaccounts) {
   const code = sub.code.slice(0, digits);
   if (!groups.has(code)) groups.set(code, []);
   groups.get(code).push({account, sub});
  }
  const accounts = [...groups].map(([code, members]) => {
   if (members.length === 1 && members[0].sub.code === code) {
    return {...members[0].sub, detail_is_subaccount: true, subaccounts: []};
   }
   const subs = members.map(member => member.sub).sort((a, b) => a.code.localeCompare(b.code));
   const exact = members.find(member => member.account.code === code)?.account;
   const descriptions = new Set(members.map(member => member.account.description));
   const result = {code, description: exact?.description || (descriptions.size === 1 ? [...descriptions][0] : ''), amount: sum(subs, 'amount'), subaccounts: subs};
   if (subs.some(sub => Object.hasOwn(sub, 'previous_amount'))) {
    result.previous_amount = sum(subs, 'previous_amount');
    result.difference = sum(subs, 'difference');
   }
   return result;
  }).sort((a, b) => a.code.localeCompare(b.code));
  return {...node, children: node.children.map(visit), accounts};
 }
 return sections.map(visit);
}
