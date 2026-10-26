import {p,profitLossTotalLabels} from '../locales/profit-loss.js';
import {b} from '../locales/balance-sheet.js';
import {reportDate as date} from './report-format.js';
export function profitLossCsv(data){
 if(data.comparison?.multiple)return multipleCsv(data);
 const compare=data.comparison?.available,previous=data.comparison?.previous,numeric=amount=>({amount});
 const rows=[[p.title],['Empresa',data.company.name],['Ejercicio',data.exercise.name],['Desde',date(data.from)],['Hasta',date(data.to)],['Modelo',p.model],['Moneda','EUR'],['Criterio',p.scope]];
 if(compare)rows.push(['Ejercicio comparado',previous.exercise.name],['Desde comparado',date(previous.from)],['Hasta comparado',date(previous.to)],['Variación',b.changeHelp]);
 else if(data.compare_previous)rows.push([b.comparison,data.comparison.reason==='PREVIOUS_EXERCISE_NOT_FOUND'?b.missingPrevious+' '+date(data.comparison.expected_end):b.missingPeriod]);
 rows.push(['Nivel',b.caption,data.exercise.name+' · '+date(data.from)+' — '+date(data.to),...(compare?[previous.exercise.name+' · '+date(previous.from)+' — '+date(previous.to),b.change]:[])]);
 function line(depth,label,row){rows.push([depth,label,numeric(row.amount),...(compare?[numeric(row.previous_amount),numeric(row.difference)]:[])]);}
 function visit(node,depth){line(depth,node.label,node);for(const child of node.children)visit(child,depth+1);for(const account of node.accounts){line(depth+1,account.code+' · '+account.description,account);for(const sub of account.subaccounts)line(depth+2,sub.code+' · '+sub.description,sub);}}
 (compare?data.comparison.sections:data.sections).forEach(node=>visit(node,0));
 for(const [key,label] of profitLossTotalLabels)line('',label,compare?data.comparison.totals[key]:{amount:data.totals[key]});
 for(const sheet of compare?[data,previous]:[data])for(const row of sheet.diagnostic.unclassified)rows.push([p.unclassified,sheet.exercise.name,row.code,row.description,numeric(row.amount)]);
 return rows;
}

function multipleCsv(data){
 const comparison=data.comparison.multiple,numeric=amount=>amount===null?p.unavailable:{amount};
 const label=period=>period.sheet?.exercise.name||period.exercise?.name||period.expected_end.slice(0,4);
 const rows=[[p.title],['Empresa',data.company.name],['Modelo',p.model],['Moneda','EUR'],['Criterio',p.scope],[p.threeExercises,...comparison.periods.map(label)]];
 for(const period of comparison.periods)rows.push(period.available?['Período',label(period),date(period.sheet.from),date(period.sheet.to)]:['Período',label(period),p.unavailable,period.reason]);
 rows.push(['Nivel',b.caption,...comparison.periods.map(period=>label(period)+(period.available?' · '+date(period.sheet.from)+' — '+date(period.sheet.to):' · '+p.unavailable))]);
 function line(depth,label,row){rows.push([depth,label,...row.amounts.map(numeric)]);}
 function visit(node,depth){line(depth,node.label,node);for(const child of node.children)visit(child,depth+1);for(const account of node.accounts){line(depth+1,account.code+' · '+account.description,account);for(const sub of account.subaccounts)line(depth+2,sub.code+' · '+sub.description,sub);}}
 comparison.sections.forEach(node=>visit(node,0));
 for(const [key,label] of profitLossTotalLabels)line('',label,{amounts:comparison.totals[key]});
 for(const period of comparison.periods.filter(period=>period.available))for(const row of period.sheet.diagnostic.unclassified)rows.push([p.unclassified,period.sheet.exercise.name,row.code,row.description,numeric(row.amount)]);
 return rows;
}
