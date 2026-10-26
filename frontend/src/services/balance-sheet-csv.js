import { b } from '../locales/balance-sheet.js';
import { reportDate } from './report-format.js';
import { balanceDetailSections } from './balance-detail.js';
export function balanceSheetCsv(data, {digits=0}={}) {
 if(data.comparison?.available)return comparisonCsv(data,digits);
 const sections=balanceDetailSections(data.sections,digits);
 const numeric=amount=>({amount});
 const rows=[[b.title],['Empresa',data.company.name],['Ejercicio',data.exercise.name],[b.date,reportDate(data.date)],[b.model,b[data.model]],['Moneda','EUR'],['Nivel','Partida / cuenta',b.contribution,b.signed]];
 rows.splice(6,0,['Criterio de saldos',b.scope]);
 if(digits)rows.splice(rows.length-1,0,[b.detail,String(digits)]);
 if(data.compare_previous)rows.splice(7,0,[b.comparison,data.comparison.reason==='PREVIOUS_EXERCISE_NOT_FOUND'?b.missingPrevious+' '+reportDate(data.comparison.expected_end):b.missingPeriod]);
 function visit(node,depth){
  rows.push([depth,'  '.repeat(depth)+node.label,numeric(node.amount)]);
  node.children.forEach(child=>visit(child,depth+1));
  for(const account of node.accounts){
   rows.push([depth+1,'  '.repeat(depth+1)+account.code+(account.description?' · '+account.description:''),numeric(account.amount),...(account.detail_is_subaccount?[numeric(account.signed_balance)]:[])]);
   if(!digits)for(const sub of account.subaccounts)rows.push([depth+2,'  '.repeat(depth+2)+sub.code+' · '+sub.description,numeric(sub.amount),numeric(sub.signed_balance)]);
  }
 }
 for(const side of ['asset','equity_liabilities']){
  sections.filter(node=>node.side===side).forEach(node=>visit(node,0));
  rows.push([side==='asset'?b.totalAsset:b.totalEquity,numeric(data.totals[side==='asset'?'assets':'equity_liabilities'])]);
 }
 rows.push([b.difference,numeric(data.totals.difference)]);
 if(data.generated_result!==undefined)rows.push([b.balanceResult,numeric(data.result.total)],[b.generatedResult,numeric(data.generated_result)]);
 rows.push([b.booked,numeric(data.result.booked_129)],[b.residual,numeric(data.result.residual_6_7)],
 [b.diagnostic],['Clasificación completa',String(data.checks.complete)],['Conciliación con Sumas y Saldos',String(data.checks.reconciles_trial_balance)]);
 for(const row of data.diagnostic.unclassified)rows.push([row.code,row.description,numeric(row.signed_balance),b.reason[row.reason]]);
 for(const warning of data.diagnostic.warnings)rows.push([warning.account?.code||'',b.reason[warning.code],...(warning.amount?[numeric(warning.amount)]:[])]);
 return rows;
}

function comparisonCsv(data,digits) {
 const previous=data.comparison.previous,numeric=amount=>({amount});
 const rows=[[b.title+' · '+b.comparison],['Empresa',data.company.name],['Ejercicio actual',data.exercise.name],[b.date,reportDate(data.date)],
  ['Ejercicio anterior',previous.exercise.name],['Fecha anterior',reportDate(previous.date)],[b.model,b[data.model]],['Moneda','EUR'],['Criterio de saldos',b.scope],
  ['Criterio de variación',b.changeHelp],['Movimientos en el ejercicio anterior',String(data.comparison.has_activity)],
  ['Nivel',b.caption,data.exercise.name+' · '+reportDate(data.date),previous.exercise.name+' · '+reportDate(previous.date),b.change]];
 if(digits)rows.splice(rows.length-1,0,[b.detail,String(digits)]);
 function line(depth,label,row){rows.push([depth,label,numeric(row.amount),numeric(row.previous_amount),numeric(row.difference)]);}
 function visit(node,depth){
  line(depth,node.label,node);node.children.forEach(child=>visit(child,depth+1));
  for(const account of node.accounts){line(depth+1,account.code+(account.description?' · '+account.description:''),account);if(!digits)for(const sub of account.subaccounts)line(depth+2,sub.code+' · '+sub.description,sub);}
 }
 const sections=balanceDetailSections(data.comparison.sections,digits);
 for(const side of ['asset','equity_liabilities']){
  sections.filter(node=>node.side===side).forEach(node=>visit(node,0));
  const key=side==='asset'?'assets':'equity_liabilities';
  line('',side==='asset'?b.totalAsset:b.totalEquity,data.comparison.totals[key]);
 }
 line('',b.difference,data.comparison.totals.difference);
 for(const [key,label] of [['booked_129',b.booked],['residual_6_7',b.residual],['total',data.comparison.generated_result?b.balanceResult:b.result]])line('',label,data.comparison.result[key]);
 if(data.comparison.generated_result)line('',b.generatedResult,data.comparison.generated_result);
 for(const sheet of [data,previous]){
  rows.push([b.diagnostic,sheet.exercise.name],['Balance cuadrado',String(sheet.checks.balanced)],['Clasificación completa',String(sheet.checks.complete)],['Conciliación con Sumas y Saldos',String(sheet.checks.reconciles_trial_balance)]);
  for(const row of sheet.diagnostic.unclassified)rows.push([row.code,row.description,numeric(row.signed_balance),b.reason[row.reason]]);
  for(const warning of sheet.diagnostic.warnings)rows.push([warning.account?.code || '',b.reason[warning.code],...(warning.account?[numeric(warning.account.amount)]:warning.amount?[numeric(warning.amount)]:[])]);
 }
 return rows;
}
