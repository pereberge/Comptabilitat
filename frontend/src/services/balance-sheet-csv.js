import { b } from '../locales/balance-sheet.js';
import { reportDate } from './report-format.js';
export function balanceSheetCsv(data) {
 const numeric=amount=>({amount});
 const rows=[[b.title],['Empresa',data.company.name],['Ejercicio',data.exercise.name],[b.date,reportDate(data.date)],[b.model,b[data.model]],['Moneda','EUR'],['Nivel','Partida / cuenta',b.contribution,b.signed]];
 function visit(node,depth){
  rows.push([depth,'  '.repeat(depth)+node.label,numeric(node.amount)]);
  node.children.forEach(child=>visit(child,depth+1));
  for(const account of node.accounts){
   rows.push([depth+1,'  '.repeat(depth+1)+account.code+' · '+account.description,numeric(account.amount)]);
   for(const sub of account.subaccounts)rows.push([depth+2,'  '.repeat(depth+2)+sub.code+' · '+sub.description,numeric(sub.amount),numeric(sub.signed_balance)]);
  }
 }
 data.sections.forEach(node=>visit(node,0));
 rows.push([b.totalAsset,numeric(data.totals.assets)],[b.totalEquity,numeric(data.totals.equity_liabilities)],[b.difference,numeric(data.totals.difference)],
 [b.booked,numeric(data.result.booked_129)],[b.residual,numeric(data.result.residual_6_7)],
 [b.diagnostic],['Clasificación completa',String(data.checks.complete)],['Conciliación con Sumas y Saldos',String(data.checks.reconciles_trial_balance)]);
 for(const row of data.diagnostic.unclassified)rows.push([row.code,row.description,numeric(row.signed_balance),b.reason[row.reason]]);
 for(const warning of data.diagnostic.warnings)rows.push([warning.account?.code||'',b.reason[warning.code],...(warning.amount?[numeric(warning.amount)]:[])]);
 return rows;
}
