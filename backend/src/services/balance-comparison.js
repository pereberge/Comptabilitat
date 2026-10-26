import { decimal } from '../../../shared/money.js';
import { amount } from './report-amount.js';

export {previousYearDate,previousYearCutoff,previousExerciseEnd} from '../../../shared/report-periods.js';
function values(current='0.00',previous='0.00') {
  return {amount:current,previous_amount:previous,difference:decimal(amount(current)-amount(previous))};
}
function union(current,previous,key) {
  const rows=new Map(current.map(row=>[row[key],[row,undefined]]));
  for(const row of previous) {const pair=rows.get(row[key]) || [undefined,undefined];pair[1]=row;rows.set(row[key],pair);}
  return [...rows.values()];
}
export function compareBalanceSheets(current,previous) {
  function merge(a,b) {
    const meta=a || b;
    return {...meta,...values(a?.amount,b?.amount),
      children:union(a?.children || [],b?.children || [],'id').map(([x,y])=>merge(x,y)),
      accounts:union(a?.accounts || [],b?.accounts || [],'code').map(([x,y])=>({
        ...(x || y),...values(x?.amount,y?.amount),
        subaccounts:union(x?.subaccounts || [],y?.subaccounts || [],'id').map(([s,t])=>({
          ...(s || t),...values(s?.amount,t?.amount),current_id:s?.id ?? null,previous_id:t?.id ?? null,
          current_signed_balance:s?.signed_balance ?? '0.00',previous_signed_balance:t?.signed_balance ?? '0.00',
        })),
      })).sort((x,y)=>x.code.localeCompare(y.code)),
    };
  }
  return {
    sections:union(current.sections,previous.sections,'id').map(([a,b])=>merge(a,b)),
    totals:Object.fromEntries(Object.keys(current.totals).map(key=>[key,values(current.totals[key],previous.totals[key])])),
    result:Object.fromEntries(Object.keys(current.result).map(key=>[key,values(current.result[key],previous.result[key])])),
    ...(current.generated_result!==undefined&&previous.generated_result!==undefined?{generated_result:values(current.generated_result,previous.generated_result)}:{}),
  };
}

// Keep every annual column independent; null denotes an unavailable exercise, never a zero balance.
export function compareReportPeriods(sheets) {
  function unionRows(collections,key) {
    const grouped=new Map();
    collections.forEach((rows,index)=>{for(const row of rows){if(!grouped.has(row[key]))grouped.set(row[key],Array(sheets.length).fill(null));grouped.get(row[key])[index]=row;}});
    return [...grouped.values()];
  }
  const amounts=rows=>rows.map((row,index)=>sheets[index]?row?.amount??'0.00':null);
  function merge(rows) {
    return {...rows.find(Boolean),amounts:amounts(rows),
      children:unionRows(rows.map(row=>row?.children||[]),'id').map(merge),
      accounts:unionRows(rows.map(row=>row?.accounts||[]),'code').map(accounts=>({
        ...accounts.find(Boolean),amounts:amounts(accounts),
        subaccounts:unionRows(accounts.map(account=>account?.subaccounts||[]),'id').map(subs=>({
          ...subs.find(Boolean),amounts:amounts(subs),ids:subs.map(sub=>sub?.id??null),signed_balances:subs.map(sub=>sub?.signed_balance??null),
        })),
      })).sort((a,b)=>a.code.localeCompare(b.code)),
    };
  }
  const first=sheets.find(Boolean);
  return {
    sections:unionRows(sheets.map(sheet=>sheet?.sections||[]),'id').map(merge),
    totals:Object.fromEntries(Object.keys(first.totals).map(key=>[key,sheets.map(sheet=>sheet?.totals[key]??null)])),
  };
}
