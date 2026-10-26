import { id, date, fail } from './validation.js';
import { HttpError } from '../middleware/errors.js';
import { decimal } from '../../../shared/money.js';
import { buildBalanceSheet } from './balance-sheet.js';
import { buildProfitLoss } from './profit-loss.js';
import { compareBalanceSheets, compareReportPeriods, previousExerciseEnd, previousYearDate, previousYearCutoff } from './balance-comparison.js';
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
    if (query.company_id !== undefined && id(query.company_id) !== companyId) fail('INVALID_COMPANY');
    const [[exercise]] = await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?', [companyId, id(query.exercise_id)]);
    if (!exercise) throw new HttpError(404, 'EXERCISE_NOT_FOUND');
    const [[company]] = await db.execute('SELECT id,name,subaccount_length FROM companies WHERE id=?', [companyId]);
    const from = date(query.from || exercise.start_date), to = date(query.to || exercise.end_date);
    if (from > to || from < exercise.start_date || to > exercise.end_date) fail('DATE_OUTSIDE_EXERCISE');
    if (query.exclude_closing !== undefined && ![true,false,'true','false'].includes(query.exclude_closing)) fail('INVALID_REPORT_FILTER');
    if(query.exclude_annual !== undefined && ![true,false,'true','false'].includes(query.exclude_annual)) fail('INVALID_REPORT_FILTER');
    return { company, exercise, from, to, currency: 'EUR', exclude_closing: query.exclude_closing === true || query.exclude_closing === 'true',exclude_annual:query.exclude_annual===true||query.exclude_annual==='true' };
  }
  async function ledgerContext(db, query) {
    if (query.multi_exercise !== undefined && ![true,false,'true','false'].includes(query.multi_exercise)) fail('INVALID_REPORT_FILTER');
    if (query.multi_exercise !== true && query.multi_exercise !== 'true') return context(db, query);
    const meta = await context(db, {...query,from:undefined,to:undefined});
    const [all] = await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? ORDER BY start_date,id', [companyId]);
    const firstId = id(query.exercise_from_id), lastId = id(query.exercise_to_id);
    const firstIndex = all.findIndex(row => row.id === firstId), lastIndex = all.findIndex(row => row.id === lastId);
    if (firstIndex < 0 || lastIndex < 0) throw new HttpError(404, 'EXERCISE_NOT_FOUND');
    if (firstIndex > lastIndex) fail('INVALID_REPORT_FILTER');
    const from = date(query.from || all[firstIndex].start_date), to = date(query.to || all[lastIndex].end_date);
    if (from > to || from < all[firstIndex].start_date || to > all[lastIndex].end_date) fail('DATE_OUTSIDE_EXERCISE');
    const exercises = all.slice(firstIndex,lastIndex+1).filter(row => row.start_date <= to && row.end_date >= from);
    if (!exercises.length) fail('DATE_OUTSIDE_EXERCISE');
    return {...meta,from,to,multi_exercise:true,exercise_from_id:firstId,exercise_to_id:lastId,exercises};
  }
  async function ledgerPeriod(db, meta, account) {
      const [[initial]] = await db.execute(`SELECT COALESCE(SUM(l.debit-l.credit),0.00) AS opening
        FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id AND e.company_id=l.company_id
        WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND l.account_id=? AND e.entry_date>=? AND e.entry_date<? AND (?=0 OR e.entry_type<>'closing') AND (?=0 OR e.entry_type NOT IN ('opening','regularization','closing'))`,
      [companyId, meta.exercise.id, account.id, meta.exercise.start_date, meta.from,meta.exclude_closing,meta.exclude_annual]);
      const [lines] = await db.execute(`SELECT l.id,l.position,l.description,l.debit,l.credit,e.id AS entry_id,e.number,e.entry_date,e.entry_type
        FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id AND e.company_id=l.company_id
        WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND l.account_id=? AND e.entry_date BETWEEN ? AND ? AND (?=0 OR e.entry_type<>'closing') AND (?=0 OR e.entry_type NOT IN ('opening','regularization','closing'))
        ORDER BY e.entry_date,e.number,l.position,l.id`, [companyId, meta.exercise.id, account.id, meta.from, meta.to,meta.exclude_closing,meta.exclude_annual]);
      const opening = amount(initial.opening);
      let running = opening, debit = 0n, credit = 0n;
      const rows = lines.map(line => {
        const d = amount(line.debit), c = amount(line.credit);
        debit += d; credit += c; running += d - c;
        return { ...line, balance: decimal(running) };
      });
      return { rows, totals: serialize(balances(opening, debit, credit)) };
  }
  return {
    ledger(query) { return snapshot(async db => {
      const meta = await ledgerContext(db, query);
      if(query.latest!==undefined&&![true,false,'true','false'].includes(query.latest))fail('INVALID_REPORT_FILTER');
      let accountId=query.account_id;
      if(!accountId&&(query.latest===true||query.latest==='true')){
        if(meta.multi_exercise)fail('INVALID_REPORT_FILTER');
        const [[last]]=await db.execute(`SELECT l.account_id FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id
          WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_date BETWEEN ? AND ?
          AND (?=0 OR e.entry_type<>'closing') AND (?=0 OR e.entry_type NOT IN ('opening','regularization','closing'))
          ORDER BY e.entry_date DESC,e.number DESC,l.position DESC,l.id DESC LIMIT 1`,[companyId,meta.exercise.id,meta.from,meta.to,meta.exclude_closing,meta.exclude_annual]);
        if(!last)return {...meta,account:null,rows:[],totals:serialize(balances(0n,0n,0n))};
        accountId=last.account_id;
      }
      const [[account]] = await db.execute("SELECT a.*,p.code AS parent_code FROM accounts a LEFT JOIN accounts p ON p.id=a.parent_id AND p.company_id=a.company_id WHERE a.company_id=? AND a.id=? AND a.kind='subaccount'", [companyId, id(accountId)]);
      if (!account) throw new HttpError(404, 'ACCOUNT_NOT_FOUND');
      if (!meta.multi_exercise) return {...meta,account,...await ledgerPeriod(db,meta,account)};
      const sections = [];
      for (const exercise of meta.exercises) {
        const period = {...meta,exercise,from:exercise.start_date > meta.from ? exercise.start_date : meta.from,to:exercise.end_date < meta.to ? exercise.end_date : meta.to};
        sections.push({exercise,from:period.from,to:period.to,...await ledgerPeriod(db,period,account)});
      }
      // Annual openings and closings belong to their own exercise. Never sum balances across years.
      return {...meta,account,sections};
    }); },
    trialBalance(query) { return snapshot(db => trialBalance(db, query)); },
    profitLoss(query) { return snapshot(async db => {
      if(query.compare_previous!==undefined&&![true,false,'true','false'].includes(query.compare_previous))fail('INVALID_REPORT_FILTER');
      if(query.comparison_count!==undefined&&![2,3,'2','3'].includes(query.comparison_count))fail('INVALID_REPORT_FILTER');
      const compare=query.compare_previous===true||query.compare_previous==='true',count=Number(query.comparison_count||2);
      const sheet=await profitLoss(db,query);sheet.compare_previous=compare;sheet.comparison_count=count;
      if(!compare)return sheet;
      const periods=[{available:true,sheet}];let expectedEnd=previousExerciseEnd(sheet.exercise.start_date);
      for(let offset=1;offset<count;offset++){
        const [[exercise]]=await db.execute('SELECT id,name,start_date,end_date FROM accounting_exercises WHERE company_id=? AND end_date=?',[companyId,expectedEnd]);
        const fromKey=offset===1?'previous_from':'older_from',toKey=offset===1?'previous_to':'older_to';
        if(!exercise){
          periods.push({available:false,reason:'PREVIOUS_EXERCISE_NOT_FOUND',expected_end:expectedEnd});
          expectedEnd=previousYearCutoff(expectedEnd);continue;
        }
        let shiftedFrom=sheet.from,shiftedTo=sheet.to;
        for(let year=0;year<offset;year++){shiftedFrom=previousYearDate(shiftedFrom);shiftedTo=previousYearCutoff(shiftedTo);}
        const from=query[fromKey]!==undefined?date(query[fromKey]):sheet.from===sheet.exercise.start_date?exercise.start_date:shiftedFrom;
        const to=query[toKey]!==undefined?date(query[toKey]):sheet.to===sheet.exercise.end_date?exercise.end_date:shiftedTo;
        if(from>to||from<exercise.start_date||to>exercise.end_date){
          if(query[fromKey]!==undefined||query[toKey]!==undefined)fail('DATE_OUTSIDE_EXERCISE');
          periods.push({available:false,reason:'PREVIOUS_PERIOD_UNAVAILABLE',expected_end:expectedEnd,exercise});
        }else periods.push({available:true,sheet:await profitLoss(db,{exercise_id:exercise.id,from,to})});
        expectedEnd=previousExerciseEnd(exercise.start_date);
      }
      const prior=periods[1];
      const comparison=prior.available?{available:true,has_activity:prior.sheet.has_activity,previous:prior.sheet,...compareBalanceSheets(sheet,prior.sheet)}:{...prior};
      if(count===3)comparison.multiple={periods,...compareReportPeriods(periods.map(period=>period.available?period.sheet:null))};
      return {...sheet,comparison};
    }); },
    balanceSheet(query) { return snapshot(async db => {
      const exerciseId = query.exercise_id ?? query.exerciseId;
      if (query.companyId !== undefined && id(query.companyId) !== companyId) fail('INVALID_COMPANY');
      if (query.company_id !== undefined && id(query.company_id) !== companyId) fail('INVALID_COMPANY');
      if (!['normal','abbreviated'].includes(query.model || 'abbreviated')) fail('INVALID_REPORT_FILTER');
      if (query.compare_previous !== undefined && ![true,false,'true','false'].includes(query.compare_previous)) fail('INVALID_REPORT_FILTER');
      const compare=query.compare_previous===true || query.compare_previous==='true';
      const sheet=await balanceSheet(db,exerciseId,query.date,query.model || 'abbreviated');
      sheet.compare_previous=compare;
      if(!compare)return sheet;
      const expectedEnd=previousExerciseEnd(sheet.exercise.start_date);
      const [[previous]]=await db.execute('SELECT id,start_date,end_date FROM accounting_exercises WHERE company_id=? AND end_date=?',[companyId,expectedEnd]);
      if(!previous)return {...sheet,comparison:{available:false,reason:'PREVIOUS_EXERCISE_NOT_FOUND',expected_end:expectedEnd}};
      const cutoff=query.previous_date!==undefined?date(query.previous_date):sheet.date===sheet.exercise.end_date ? previous.end_date : previousYearCutoff(sheet.date);
      if(query.previous_date!==undefined&&(cutoff<previous.start_date||cutoff>previous.end_date))fail('DATE_OUTSIDE_EXERCISE');
      if(cutoff<previous.start_date || cutoff>previous.end_date)return {...sheet,comparison:{available:false,reason:'PREVIOUS_PERIOD_UNAVAILABLE',expected_end:expectedEnd}};
      const previousSheet=await balanceSheet(db,previous.id,cutoff,sheet.model);
      const [[activity]]=await db.execute("SELECT EXISTS(SELECT 1 FROM journal_entries WHERE company_id=? AND exercise_id=? AND status='posted' AND entry_type<>'closing' AND entry_date BETWEEN ? AND ?) AS present",[companyId,previous.id,previous.start_date,cutoff]);
      return {...sheet,comparison:{available:true,has_activity:!!activity.present,previous:previousSheet,...compareBalanceSheets(sheet,previousSheet)}};
    }); },
  };
  async function profitLoss(db,query) {
    const meta=await context(db,query);
    const [rows]=await db.execute(`SELECT a.id,a.code,a.description,p.code AS parent_code,p.description AS parent_description,SUM(l.debit) AS debit,SUM(l.credit) AS credit
      FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id
      JOIN accounts a ON a.id=l.account_id AND a.company_id=e.company_id
      JOIN accounts p ON p.id=a.parent_id AND p.company_id=a.company_id
      WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_date BETWEEN ? AND ?
        AND e.entry_type NOT IN ('opening','regularization','closing') AND LEFT(p.code,1) IN ('6','7')
      GROUP BY a.id,a.code,a.description,p.code,p.description ORDER BY a.code`,[companyId,meta.exercise.id,meta.from,meta.to]);
    return buildProfitLoss({...meta,rows});
  }
  async function balanceSheet(db,exerciseId,cutoff,model) {
      const trial = await trialBalance(db, {exercise_id:exerciseId,to:cutoff,mode:'accumulated',level:'subaccount',exclude_closing:true});
      const [[evidence]] = await db.execute(`SELECT
        EXISTS(SELECT 1 FROM journal_entries e JOIN accounting_exercises x ON x.id=e.exercise_id AND x.company_id=e.company_id
          WHERE e.company_id=? AND e.status='posted' AND x.end_date<?) AS previous_activity,
        EXISTS(SELECT 1 FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id
          JOIN accounts a ON a.id=l.account_id AND a.company_id=l.company_id
          WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_date=? AND LEFT(a.code,1) BETWEEN '1' AND '5') AS first_day_patrimonial`,
      [companyId,trial.exercise.start_date,companyId,trial.exercise.id,trial.exercise.start_date]);
      const [[activity]] = await db.execute(`SELECT COALESCE(SUM(l.credit-l.debit),0.00) AS generated_result
        FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id
        JOIN accounts a ON a.id=l.account_id AND a.company_id=e.company_id
        JOIN accounts p ON p.id=a.parent_id AND p.company_id=e.company_id
        WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_date BETWEEN ? AND ?
          AND e.entry_type NOT IN ('opening','regularization','closing') AND LEFT(p.code,1) IN ('6','7')`,
      [companyId,trial.exercise.id,trial.from,trial.to]);
      const sheet=buildBalanceSheet(trial,model,{previous_activity:!!evidence.previous_activity,first_day_patrimonial:!!evidence.first_day_patrimonial});
      return {...sheet,generated_result:decimal(amount(activity.generated_result))};
  }
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
        WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_date BETWEEN ? AND ? AND (?=0 OR e.entry_type<>'closing') AND (?=0 OR e.entry_type NOT IN ('opening','regularization','closing')) GROUP BY l.account_id`,
      [from, from, from, companyId, meta.exercise.id, meta.exercise.start_date, meta.to,meta.exclude_closing,meta.exclude_annual]);
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
