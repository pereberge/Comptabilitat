import {amount} from './report-amount.js';
import {decimal} from '../../../shared/money.js';
import {reconciliationProposal} from '../../../shared/reconciliation-proposals.js';
const net=line=>amount(line.debit)-amount(line.credit),abs=value=>value<0n?-value:value;
const ignored=new Set('TRANSFERENCIA TRANSFER RECIBIDA RECIBIDO EMITIDA RECIBO REBUT PAGO PAGAMENT COBRO COBRAMENT CARGO CARREC ABONO ABONAMENT SEPA TRSF TRANSF INMEDIATA IMMEDIATA FACTURA FACT FAC REFERENCIA REF FAVOR DEL LOS LAS POR CON PARA UNA GASTOS DESPESES CUENTA COMPTE BANCO BANC BANK MOVIMIENTO MOVIMENT OPERACION OPERACIO APUNTE APUNT ENERO GENER FEBRERO FEBRER MARZO MARC ABRIL MAYO MAIG JUNIO JUNY JULIO JULIOL AGOSTO AGOST SEPTIEMBRE SETEMBRE SEPT OCTUBRE OCT NOVIEMBRE NOVEMBRE DICIEMBRE DESEMBRE'.split(' '));
const aliases={ALQUILER:'LLOGUER',ALQUILERS:'LLOGUER',LLOGUERS:'LLOGUER',ARRENDAMIENTO:'LLOGUER',ARRENDAMENT:'LLOGUER',BASURA:'RESIDUS',BASURAS:'RESIDUS',BASURES:'RESIDUS',ESCOMBRERIES:'RESIDUS',INTERESES:'INTERES',INTERESOS:'INTERES',INTERESSOS:'INTERES',INTRS:'INTERES',INT:'INTERES',RET:'RETENCIO',RETEN:'RETENCIO',RETENCION:'RETENCIO',RETENCIONES:'RETENCIO',RETENCIONS:'RETENCIO',IRPF:'RETENCIO',CONTRIBUCIO:'IBI',CONTRIBUCION:'IBI',CONTRIBUCIONS:'IBI',AGUA:'AIGUA',BARA:'BERA'};
function words(value){
 let text=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
 text=text.replace(/^I\s*\.\s*R\s*\.\s*C\b/,' RETENCIO ');
 return new Set(text.split(/[^A-Z0-9]+/).map(word=>aliases[word]||word).filter(word=>word.length>=3&&!/\d/.test(word)&&!ignored.has(word)));
}
function overlap(a,b){if(!a.size||!b.size)return 0;return [...a].filter(word=>b.has(word)).length/Math.min(a.size,b.size);}
function counters(bank,entry,account,byCode){
 const others=entry.filter(line=>line.code!==account.code&&byCode.has(line.code)&&net(line)!==0n),same=others.filter(line=>net(line)===-net(bank));
 let chosen=null;
 if(same.length&&new Set(same.map(line=>line.code)).size===1)chosen=[same[0]];
 else if(same.length>1){const exact=same.filter(line=>overlap(words(line.description),words(bank.description))>=0.99);if(exact.length&&new Set(exact.map(line=>line.code)).size===1)chosen=[exact[0]];}
 if(!chosen&&entry.filter(line=>line.code===account.code).length===1&&others.reduce((sum,line)=>sum+net(line),0n)===-net(bank))chosen=others;
 if(!chosen)return null;
 const sums=new Map();for(const line of chosen)sums.set(line.code,(sums.get(line.code)||0n)+net(line));
 const counter_lines=[...sums].filter(([,value])=>value!==0n).map(([code,value])=>({account_id:byCode.get(code).id,debit:decimal(value>0n?value:0n),credit:decimal(value<0n?-value:0n)}));
 return counter_lines.length&&counter_lines.length<=20?counter_lines:null;
}
export function bankHistorySuggestions(history,account,accounts){
 const byCode=new Map(accounts.filter(row=>row.kind==='subaccount').map(row=>[row.code,row])),entries=new Map();
 for(const line of history){if(line.status!=='posted'||line.entry_type!=='normal')continue;if(!entries.has(line.entry_id))entries.set(line.entry_id,[]);entries.get(line.entry_id).push(line);}
 const candidates=[];
 for(const entry of entries.values())for(const bank of entry.filter(line=>line.code===account.code&&net(line)!==0n)){
  const counter_lines=counters(bank,entry,account,byCode);if(!counter_lines)continue;
  const description=words(bank.description).size?bank.description:bank.entry_description||bank.description;
  candidates.push({bank,counter_lines,description,text:words(description),names:words(counter_lines.map(line=>accounts.find(row=>row.id===line.account_id)?.description||'').join(' ')),signature:counter_lines.map(line=>line.account_id).sort((a,b)=>a-b).join(',')});
 }
 return row=>{
  const value=amount(row.amount),text=words(row.concept),eligible=[];
  for(const candidate of candidates){
   if(candidate.bank.entry_date>=row.date||(net(candidate.bank)<0n)!==(value<0n))continue;
   const difference=abs(abs(net(candidate.bank))-abs(value)),primary=overlap(text,candidate.text),names=overlap(text,candidate.names),near=difference<=3n;
   if(!(primary>=0.65||near&&(primary>=0.4||names>=0.65)))continue;
   const tier=difference===0n?3:near?2:1;eligible.push({...candidate,tier,primary,names,difference});
  }
  if(!eligible.length)return null;
  eligible.sort((a,b)=>b.tier-a.tier||b.primary-a.primary||b.names-a.names||b.bank.entry_date.localeCompare(a.bank.entry_date)||b.bank.number-a.bank.number);
  const best=eligible[0],ties=eligible.filter(item=>item.tier===best.tier&&item.primary===best.primary&&item.names===best.names);
  if(new Set(ties.map(item=>item.signature)).size!==1)return null;
  const proposal=reconciliationProposal(row,{bank_amount:decimal(net(best.bank)),counter_lines:best.counter_lines},account,accounts);if(!proposal)return null;
  const codes=best.counter_lines.map(line=>accounts.find(item=>item.id===line.account_id)?.code).join(', '),evidence=best.difference===0n?'mateix import':best.difference<=3n?'import anterior '+decimal(abs(net(best.bank)))+' €':'concepte semblant i mateix sentit';
  return {...proposal,source:'history',history_number:best.bank.number,history_date:best.bank.entry_date,history_amount:decimal(net(best.bank)),basis:'Idea segons l’assentament '+best.bank.number+' del '+best.bank.entry_date+' («'+best.description+'»): '+evidence+', compte '+codes+'.'+(best.counter_lines.length>1?' Repartiment orientatiu segons el precedent; revisa les línies.':''),confidence:best.difference===0n?'Precedent del diari i mateix import':'Precedent del diari · revisar'};
 };
}
