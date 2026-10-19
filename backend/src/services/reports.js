import { id, date, fail } from './validation.js';
import { HttpError } from '../middleware/errors.js';
import { decimal } from '../../../shared/money.js';
import { buildBalanceSheet } from './balance-sheet.js';
import { amount } from './report-amount.js';
export { amount } from './report-amount.js';

const fields = ['opening', 'debit', 'credit', 'closing', 'debtor', 'creditor'];
function balances(opening, debit, credit) {
  const closing = opening + debit - credit;
  return { opening, debit, credit, closing, debtor: closing > 0n ? closing : 0n, creditor: closing < 0n ? -closing : 0n };
}
function serialize(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' ? decimal(value) : value]));
}

export function createReportService(pool, companyId) {
  async function snapshot(action) {
    const db = await pool.getConnection();
    try {
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const result = await action(db);
      await db.commit();
      return result;
    } catch (error) { await db.rollback(); throw error; }
    finally { db.release(); }
  }
  async function context(db, query) {
    const [[exercise]] = await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?', [companyId, id(query.exercise_id)]);
    if (!exercise) throw new HttpError(404, 'EXERCISE_NOT_FOUND');
    const [[company]] = await db.execute('SELECT id,name,subaccount_length FROM companies WHERE id=?', [companyId]);
    const from = date(query.from || exercise.start_date), to = date(query.to || exercise.end_date);
    if (from > to || from < exercise.start_date || to > exercise.end_date) fail('DATE_OUTSIDE_EXERCISE');
    return { company, exercise, from, to, currency: 'EUR' };
  }
  return {
    ledger(query) { return snapshot(async db => {
      const meta = await context(db, query);
      const [[account]] = await db.execute('SELECT a.*,p.code AS parent_code FROM accounts a LEFT JOIN accounts p ON p.id=a.parent_id AND p.company_id=a.company_id WHERE a.company_id=? AND a.id=? AND a.kind=\'subaccount\'', [companyId, id(query.account_id)]);
      if (!account) throw new HttpError(404, 'ACCOUNT_NOT_FOUND');
      const [[initial]] = await db.execute(`SELECT COALESCE(SUM(l.debit-l.credit),0.00) AS opening
        FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id AND e.company_id=l.company_id
        WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND l.account_id=? AND e.entry_date>=? AND e.entry_date<?`,
      [companyId, meta.exercise.id, account.id, meta.exercise.start_date, meta.from]);
      const [lines] = await db.execute(`SELECT l.id,l.position,l.description,l.debit,l.credit,e.id AS entry_id,e.number,e.entry_date
        FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id AND e.company_id=l.company_id
        WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND l.account_id=? AND e.entry_date BETWEEN ? AND ?
        ORDER BY e.entry_date,e.number,l.position,l.id`, [companyId, meta.exercise.id, account.id, meta.from, meta.to]);
      const opening = amount(initial.opening);
      let running = opening, debit = 0n, credit = 0n;
      const rows = lines.map(line => {
        const d = amount(line.debit), c = amount(line.credit);
        debit += d; credit += c; running += d - c;
        return { ...line, balance: decimal(running) };
      });
      return { ...meta, account, rows, totals: serialize(balances(opening, debit, credit)) };
    }); },
    trialBalance(query) { return snapshot(db => trialBalance(db, query)); },
    balanceSheet(query) { return snapshot(async db => {
      const exerciseId = query.exercise_id ?? query.exerciseId;
      if (query.companyId !== undefined && id(query.companyId) !== companyId) fail('INVALID_COMPANY');
      if (query.company_id !== undefined && id(query.company_id) !== companyId) fail('INVALID_COMPANY');
      if (!['normal','abbreviated'].includes(query.model || 'abbreviated')) fail('INVALID_REPORT_FILTER');
      const trial = await trialBalance(db, {exercise_id:exerciseId,to:query.date,mode:'accumulated',level:'subaccount'});
      const [[evidence]] = await db.execute(`SELECT
        EXISTS(SELECT 1 FROM journal_entries e JOIN accounting_exercises x ON x.id=e.exercise_id AND x.company_id=e.company_id
          WHERE e.company_id=? AND e.status='posted' AND x.end_date<?) AS previous_activity,
        EXISTS(SELECT 1 FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id
          JOIN accounts a ON a.id=l.account_id AND a.company_id=l.company_id
          WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_date=? AND LEFT(a.code,1) BETWEEN '1' AND '5') AS first_day_patrimonial`,
      [companyId,trial.exercise.start_date,companyId,trial.exercise.id,trial.exercise.start_date]);
      return buildBalanceSheet(trial,query.model || 'abbreviated',{previous_activity:!!evidence.previous_activity,first_day_patrimonial:!!evidence.first_day_patrimonial});
    }); },
  };
  async function trialBalance(db, query) {
      const meta = await context(db, query);
      const mode = query.mode || 'accumulated', level = query.level || 'subaccount';
      if (!['accumulated', 'period'].includes(mode) || !['subaccount', '3', '2', '1'].includes(level)) fail('INVALID_REPORT_FILTER');
      if (query.show_empty !== undefined && !['true', 'false'].includes(query.show_empty)) fail('INVALID_REPORT_FILTER');
      const from = mode === 'accumulated' ? meta.exercise.start_date : meta.from;
      const [accounts] = await db.execute('SELECT id,code,description,kind,parent_id FROM accounts WHERE company_id=? ORDER BY code', [companyId]);
      const [sums] = await db.execute(`SELECT l.account_id,
        SUM(CASE WHEN e.entry_date<? THEN l.debit-l.credit ELSE 0 END) AS opening,
        SUM(CASE WHEN e.entry_date>=? THEN l.debit ELSE 0 END) AS debit,
        SUM(CASE WHEN e.entry_date>=? THEN l.credit ELSE 0 END) AS credit
        FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id
        WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_date BETWEEN ? AND ? GROUP BY l.account_id`,
      [from, from, from, companyId, meta.exercise.id, meta.exercise.start_date, meta.to]);
      const byId = new Map(accounts.map(a => [a.id, a])), bySum = new Map(sums.map(s => [s.account_id, s]));
      const groups = new Map();
      for (const account of accounts.filter(a => a.kind === 'subaccount')) {
        const sum = bySum.get(account.id);
        const values = balances(sum ? amount(sum.opening) : 0n, sum ? amount(sum.debit) : 0n, sum ? amount(sum.credit) : 0n);
        if (query.show_empty !== 'true' && values.opening === 0n && values.debit === 0n && values.credit === 0n) continue;
        let target = account;
        if (level !== 'subaccount') {
          let parent = byId.get(account.parent_id);
          const visited = new Set([account.id]);
          // Walk actual parents, not a presumed fixed-length prefix.
          while (parent) {
            if (visited.has(parent.id)) fail('INVALID_ACCOUNT_HIERARCHY');
            visited.add(parent.id);
            if (parent.code.length <= Number(level)) { target = parent; break; }
            parent = byId.get(parent.parent_id);
          }
        }
        if (!groups.has(target.id)) groups.set(target.id, { ...target, ...balances(0n, 0n, 0n), children: [] });
        const group = groups.get(target.id);
        group.opening += values.opening; group.debit += values.debit; group.credit += values.credit;
        group.children.push(serialize({ ...account, parent_code:byId.get(account.parent_id)?.code, parent_description:byId.get(account.parent_id)?.description, ...values }));
        if (level === 'subaccount') Object.assign(group, {parent_code:byId.get(account.parent_id)?.code,parent_description:byId.get(account.parent_id)?.description});
      }
      const totals = Object.fromEntries(fields.map(key => [key, 0n]));
      const rows = [...groups.values()].sort((a,b) => a.code.localeCompare(b.code)).map(group => {
        Object.assign(group, balances(group.opening, group.debit, group.credit));
        for (const key of fields) totals[key] += group[key];
        return serialize(group);
      });
      const differences = { opening: totals.opening, movements: totals.debit - totals.credit, closing: totals.debtor - totals.creditor };
      return { ...meta, from, mode, level, show_empty: query.show_empty === 'true', rows, totals: serialize(totals),
        checks: { balanced: Object.values(differences).every(v => v === 0n), differences: serialize(differences) } };
  }
}
