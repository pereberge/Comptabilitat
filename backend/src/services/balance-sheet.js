import mapping from './pgc-balance-map.json' with { type: 'json' };
import { amount } from './report-amount.js';
import { decimal } from '../../../shared/money.js';
import { fail } from './validation.js';

export function buildBalanceSheet(trial, model = 'abbreviated', opening = {}) {
  if (!Object.hasOwn(mapping.models, model)) fail('INVALID_REPORT_FILTER');
  const nodes = mapping.models[model].map(n => ({ ...n, children: [], accounts: [], value: 0n }));
  const byId = new Map(nodes.map(n => [n.id,n]));
  const resultNode = nodes.find(n => n.rules.some(r => r.prefix === '129'));
  const diagnostics = [], unclassified = [], assigned = new Set();
  let residual = 0n, booked = 0n, unclassifiedBalance = 0n;
  for (const row of trial.rows) {
    const signed = amount(row.closing);
    if (!signed) continue;
    // Use the real accounting parent, never interpret a subaccount suffix as a PGC account.
    const code = row.parent_code || '';
    const base = { id:row.id, code:row.code, description:row.description, parent_code:code,
      signed_balance:row.closing, debit:row.debit, credit:row.credit };
    let candidates = nodes.flatMap(node => node.rules.filter(rule => code.startsWith(rule.prefix)).map(rule => ({node,rule})));
    const longest = Math.max(0,...candidates.map(c => c.rule.prefix.length));
    candidates = candidates.filter(c => c.rule.prefix.length === longest);
    // These accounts appear on both sides in the official model; classify each subaccount by its balance.
    if (['551','5523','5524','5525'].some(p => code.startsWith(p))) {
      candidates = candidates.filter(c => c.node.side === (signed > 0n ? 'asset' : 'equity_liabilities'));
    }
    const incomeExpense = /^[67]/.test(code);
    if (incomeExpense) candidates = [{node:resultNode,rule:{prefix:code.slice(0,1),corrector:false}}];
    if (candidates.length !== 1 || assigned.has(row.id)) {
      const reason = /^[89]/.test(code) ? 'DIRECT_EQUITY_REQUIRES_ALLOCATION' : assigned.has(row.id) ? 'DUPLICATE_ACCOUNT' : 'UNCLASSIFIED_ACCOUNT';
      unclassified.push({...base,reason}); unclassifiedBalance += signed;
      continue;
    }
    assigned.add(row.id);
    if (incomeExpense) residual -= signed;
    if (code.startsWith('129')) booked -= signed;
    const {node,rule} = candidates[0];
    const value = node.side === 'asset' ? signed : -signed;
    const contribution = {...base,amount:decimal(value),pgc_prefix:rule.prefix,corrector:rule.corrector,role:incomeExpense?'residual_result':'balance'};
    node.value += value;
    let group = node.accounts.find(a => a.code === code);
    if (!group) { group={code,description:row.parent_description || code,value:0n,subaccounts:[]};node.accounts.push(group); }
    group.value += value; group.subaccounts.push(contribution);
    if (rule.review) diagnostics.push({code:'PGC_DETAIL_REQUIRED',account:contribution});
    if (!incomeExpense && (rule.corrector ? value > 0n : value < 0n)) diagnostics.push({code:'UNUSUAL_SIGN',account:contribution});
  }
  for (const node of [...nodes].sort((a,b)=>b.depth-a.depth)) {
    if (node.parent_id) { const parent=byId.get(node.parent_id); parent.value+=node.value; }
  }
  for (const node of nodes) if (node.parent_id) byId.get(node.parent_id).children.push(node);
  const roots=nodes.filter(n=>!n.parent_id);
  const total = side => roots.filter(n=>n.side===side).reduce((sum,n)=>sum+n.value,0n);
  const assets=total('asset'), equityLiabilities=total('equity_liabilities'), difference=assets-equityLiabilities;
  const noDoubleCount=new Set(trial.rows.map(r=>r.id)).size===trial.rows.length;
  const resultReconciled=resultNode.value===booked+residual;
  const trialDifference=amount(trial.checks.differences.closing);
  if (trialDifference) diagnostics.push({code:'UNBALANCED_JOURNAL',amount:decimal(trialDifference)});
  if (opening.previous_activity) diagnostics.push({code:opening.first_day_patrimonial?'OPENING_NOT_VERIFIABLE':'OPENING_MAY_BE_MISSING'});
  function serialize(node) {
    const {value,rules,...rest}=node;
    return {...rest,amount:decimal(value),children:node.children.map(serialize),accounts:node.accounts.map(({value,...a})=>({...a,amount:decimal(value)}))};
  }
  return {company:trial.company,exercise:trial.exercise,from:trial.from,to:trial.to,date:trial.to,currency:'EUR',model,
    exclude_closing:!!trial.exclude_closing,mapping_version:mapping.version,source:mapping.source,sections:roots.map(serialize),
    totals:{assets:decimal(assets),equity_liabilities:decimal(equityLiabilities),difference:decimal(difference)},
    result:{booked_129:decimal(booked),residual_6_7:decimal(residual),total:decimal(booked+residual)},
    checks:{balanced:difference===0n,complete:unclassified.length===0,valid:difference===0n&&!unclassified.length&&!diagnostics.length&&noDoubleCount&&resultReconciled,
      no_double_count:noDoubleCount,result_reconciled:resultReconciled,
      reconciles_trial_balance:difference+unclassifiedBalance===trialDifference,trial_balance_difference:decimal(trialDifference)},
    diagnostic:{unclassified,unclassified_signed_balance:decimal(unclassifiedBalance),warnings:diagnostics},opening};
}
