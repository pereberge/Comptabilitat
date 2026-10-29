import { amount } from './report-amount.js';
import { decimal } from '../../../shared/money.js';
import { normalizeBankText } from './bank-statement.js';
import { BANK_BALANCE_MAX_DAYS,BANK_BALANCE_TOLERANCE_CENTS,bankDayNumber,addBankDays,bankLedgerReadThrough } from '../../../shared/bank-reconciliation.js';
import {matchPendingInvoices} from './bank-invoice-matches.js';
import {findReconciliationRule,reconciliationProposal} from '../../../shared/reconciliation-proposals.js';
import {bankHistorySuggestions} from './bank-history-suggestions.js';

const sum = rows => rows.reduce((total,row)=>total+amount(row.debit)-amount(row.credit),0n);
const net = row => amount(row.debit)-amount(row.credit);
const key = row => row.entry_id+':'+row.position;
function tokens(value) {
  return new Set(String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().split(/[^A-Z0-9]+/)
    .filter(word=>word.length>=4&&!['TRANSFERENCIA','TRANSFER','INMEDIATA','IMMEDIATA','RECIBIDA','RECIBO','REBUT','PAGO','PAGAMENT','FAVOR','SEPA','TRSF','TRANSF'].includes(word)));
}
function similarity(a,b) {const x=tokens(a),y=tokens(b);return x.size&&y.size?[...x].filter(word=>y.has(word)).length/Math.max(x.size,y.size):0;}

function balanceAnchor(rows,lines) {
  // Use the final balance of each day; never cut in the middle of a day's movements.
  const days=new Map();let running=0n;
  for(const line of [...lines].sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.number-b.number||a.position-b.position)){
    running+=net(line);days.set(line.entry_date,{date:line.entry_date,balance:running,entry:line,day:bankDayNumber(line.entry_date)});
  }
  const checkpoints=[...days.values()],byBalance=new Map();
  for(const checkpoint of checkpoints){const value=checkpoint.balance.toString();if(!byBalance.has(value))byBalance.set(value,[]);byBalance.get(value).push(checkpoint);}
  const bankDays=new Map();for(const row of rows)bankDays.set(row.date,row);
  let anchor=null,index=0,current=0n,lastEntry=null;
  for(const row of bankDays.values()){
    while(index<checkpoints.length&&checkpoints[index].date<=row.date){current=checkpoints[index].balance;lastEntry=checkpoints[index].entry;index++;}
    const bankBalance=amount(row.balance);
    if(current===bankBalance){anchor={...row,book_date:row.date,book_balance:current,entry:lastEntry};continue;}
    const bankDay=bankDayNumber(row.date);
    const nearby=[];
    for(let offset=-BANK_BALANCE_TOLERANCE_CENTS;offset<=BANK_BALANCE_TOLERANCE_CENTS;offset++)for(const point of byBalance.get((bankBalance+offset).toString())||[])nearby.push({...point,difference:offset<0n?-offset:offset});
    const currentDifference=current-bankBalance,absolute=currentDifference<0n?-currentDifference:currentDifference;
    if(absolute<=BANK_BALANCE_TOLERANCE_CENTS)nearby.push({date:row.date,balance:current,entry:lastEntry,day:bankDay,difference:absolute});
    const ranked=nearby
      .filter(point=>Math.abs(point.day-bankDay)<=BANK_BALANCE_MAX_DAYS)
      .sort((a,b)=>Number(a.difference-b.difference)||Math.abs(a.day-bankDay)-Math.abs(b.day-bankDay)||b.day-a.day);
    if(ranked.length)anchor={...row,book_date:ranked[0].date,book_balance:ranked[0].balance,entry:ranked[0].entry};
  }
  return anchor;
}

export function buildBankAnalysis({company,exercise,account,statement,lines,history,accounts,sourceName,sourceHash,pendingInvoices=[],rules=[],manualProposals=[]}) {
  const rows=statement.rows.filter(row=>row.date>=exercise.start_date&&row.date<=exercise.end_date);
  if(!rows.length)throw Object.assign(new Error('Period'),{code:'BANK_STATEMENT_PERIOD_MISMATCH',status:409});
  const from=rows[0].date,through=rows.at(-1).date;
  const readThrough=bankLedgerReadThrough(through,exercise.end_date);
  const bankLines=lines.filter(row=>row.status==='posted'&&row.code===account.code&&row.entry_date>=exercise.start_date&&row.entry_date<=readThrough);
  const initial=amount(rows[0].balance)-amount(rows[0].amount);
  const bookInitial=sum(bankLines.filter(row=>row.entry_date<rows[0].date));
  const anchor=balanceAnchor(rows,bankLines);
  let bookThrough=anchor&&anchor.book_date>through?anchor.book_date:through;
  const after=rows.filter(row=>!anchor||row.date>anchor.date), used=new Set(), matched=[],pending=[];
  // The bank and ledger each resume after their own matching balance date.
  const start=anchor?addBankDays(anchor.date,1):from;
  const bookStart=anchor?addBankDays(anchor.book_date,1):from;
  const candidates=bankLines.filter(row=>row.entry_date>=bookStart&&row.entry_date<=readThrough&&!['opening','closing','regularization'].includes(row.entry_type));
  for(const row of after){
    const same=candidates.filter(line=>!used.has(key(line))&&Math.abs(bankDayNumber(line.entry_date)-bankDayNumber(row.date))<=BANK_BALANCE_MAX_DAYS&&net(line)===amount(row.amount));
    let found=same.length===1?same[0]:null;
    if(same.length>1){const ranked=same.map(line=>({line,distance:Math.abs(bankDayNumber(line.entry_date)-bankDayNumber(row.date)),score:similarity(row.concept,line.description)})).sort((a,b)=>a.distance-b.distance||b.score-a.score);if(ranked[0].distance<ranked[1].distance||ranked[0].score>=0.5&&ranked[0].score>ranked[1].score)found=ranked[0].line;}
    if(found){used.add(key(found));if(found.entry_date>bookThrough)bookThrough=found.entry_date;matched.push({...row,entry_id:found.entry_id,entry_number:found.number,book_date:found.entry_date,basis:'Importe exacto y fecha a '+Math.abs(bankDayNumber(found.entry_date)-bankDayNumber(row.date))+' días; revisar el justificante.'});}
    else pending.push(row);
  }
  const bookUnmatched=candidates.filter(row=>row.entry_date<=bookThrough&&!used.has(key(row))).map(row=>({...row,amount:decimal(net(row))}));
  const historySuggestion=bankHistorySuggestions(history,account,accounts);
  const invoiceMatches=matchPendingInvoices(after,pendingInvoices),invoiceMatchIds=new Set(invoiceMatches.map(row=>row.movement_id));
  const proposals=[],unresolved=[];
  for(const row of pending){
    const normalized=normalizeBankText(row.concept), value=amount(row.amount);
    const unresolvedRow=reason=>unresolved.push({movement_id:row.id,date:row.date,concept:row.concept,amount:row.amount,reason});
    const manual=manualProposals.find(item=>String(item.movement_id)===String(row.id));
    const selection=findReconciliationRule(rules,row.concept,row.amount),template=manual||selection.rule;
    if(template){
      const proposal=reconciliationProposal(row,manual||{...template,concept:row.concept},account,accounts);
      if(proposal){proposals.push({id:'P'+(proposals.length+1),...proposal,source:manual?'manual':'saved_rule',rule_concept:manual?manual.rule_concept||null:selection.rule.concept,basis:manual?'Propuesta introducida manualmente para este movimiento.':'Criterio guardado para «'+selection.rule.concept+'» en este banco y sentido.'+(selection.rule.counter_lines.length>1?' Reparto proporcional al ejemplo guardado; revisar los importes.':''),confidence:manual?'Manual · pendiente de validar':'Criterio guardado · pendiente de validar'});continue;}
      unresolvedRow('La propuesta manual o el criterio guardado necesita revisar sus cuentas e importes.');continue;
    }
    if(selection.ambiguous){unresolvedRow('Hay varios criterios guardados igualmente específicos. Indica la contrapartida manualmente.');continue;}
    if(invoiceMatchIds.has(row.id)){unresolvedRow('Posible factura pendiente en Documentación: revisar la coincidencia y pasarla a Facturas antes de preparar el pago o cobro.');continue;}
    if(/PRES\d|PRESTAM|PRESTEC|HIPOTEC/.test(normalized)){
      unresolvedRow('Cuota de préstamo: hace falta el recibo con el desglose de capital, intereses y comisiones, y la cuenta del préstamo. No se supone que toda la cuota sea gasto.');continue;
    }
    const idea=historySuggestion(row);
    if(idea){proposals.push({id:'P'+(proposals.length+1),...idea});continue;}
    let counterpart=null,basis='',confidence='Pendiente de validar';
    if(/MANTENIMENT|MANTENIMIENTO|COMISION/.test(normalized)){
      const eligible=accounts.filter(candidate=>candidate.code.startsWith('626')&&candidate.kind==='subaccount');
      if(eligible.length===1){counterpart=eligible[0];basis='Propuesta de clasificación: servicio bancario (grupo 626 del PGC). Un abono de mantenimiento se trata como devolución del mismo gasto. Validar el justificante.';}
      else{unresolvedRow('Servicio bancario o devolución: revisar el justificante y seleccionar una subcuenta 626. No se crea una contrapartida automáticamente.');continue;}
    }
    if(!counterpart){
      unresolvedRow(/TRANSFER|TRANSF|TRSF/.test(normalized)?'Transferencia: identificar factura, financiación o relación entre empresas. No se clasifica automáticamente como ingreso.':'No hay un precedente suficiente en tus datos. Hace falta el justificante para determinar la contrapartida.');continue;
    }
    const absolute=decimal(value<0n?-value:value);
    const line=(a,debit,credit)=>({account_id:a.id,code:a.code,name:a.description,debit,credit});
    proposals.push({id:'P'+(proposals.length+1),movement_id:row.id,date:row.date,concept:row.concept,basis,confidence,bank_effect:row.amount,
      lines:value>0n?[line(account,absolute,'0.00'),line(counterpart,'0.00',absolute)]:[line(counterpart,absolute,'0.00'),line(account,'0.00',absolute)]});
  }
  const book=sum(bankLines.filter(row=>row.entry_date<=bookThrough)), final=amount(rows.at(-1).balance), proposed=proposals.reduce((total,row)=>total+amount(row.bank_effect),0n);
  const anchorEntry=anchor?.entry;
  const openingGap=anchor?amount(anchor.balance)-anchor.book_balance:initial-bookInitial;
  return {analysis_version:2,company:{id:company.id,name:company.name},exercise:{id:exercise.id,name:exercise.name},
    account:{code:account.code,name_by_user:statement.bank.name,stored_name:account.description,iban_masked:statement.bank.iban_masked},
    source:{name:sourceName,sha256:sourceHash,mime:statement.mime,pages:statement.pages,rows:statement.rows.length,selected_rows:rows.length,
      from:rows[0].date,to:through,full_from:statement.from,full_to:statement.to,initial_balance_inferred:statement.initial_balance},
    scope:{last_matching_date:anchor?.date??null,last_matching_book_date:anchor?.book_date??null,last_matching_balance:anchor?.balance??null,last_book_entry:anchorEntry?.number??null,
      last_book_entry_date:anchorEntry?.entry_date??null,balance_match_max_days:BANK_BALANCE_MAX_DAYS,book_analysis_start_date:bookStart,book_balance_date:bookThrough,ledger_read_through:readThrough,
      last_matching_book_balance:anchor?decimal(anchor.book_balance):null,balance_match_difference:anchor?decimal(anchor.book_balance-amount(anchor.balance)):null,balance_match_tolerance:decimal(BANK_BALANCE_TOLERANCE_CENTS),
      initial_balance_matches:initial===bookInitial,analysis_start_date:start,bank_pending:pending,matched_movements:matched,
      period_opening_balance:decimal(initial),book_opening_balance:decimal(bookInitial),opening_difference_bank_minus_book:decimal(openingGap)},
    bank_rows:rows,manual_proposals:manualProposals,pending_invoice_matches:invoiceMatches,book_unmatched:bookUnmatched,current_book_balance:decimal(book),bank_balance:decimal(final),difference_book_minus_bank:decimal(book-final),
    projected_balance:decimal(book+proposed),unresolved_difference_book_minus_bank:decimal(book+proposed-final),proposals,unresolved,
    reconciliation_status:unresolved.length||bookUnmatched.length||(book+proposed-final> BANK_BALANCE_TOLERANCE_CENTS||book+proposed-final< -BANK_BALANCE_TOLERANCE_CENTS)?'needs_review':proposals.length?'proposals_ready':book===final?'matched':'matched_with_tolerance',
    posted:false,review_notes:[
      ...(!anchor&&openingGap!==0n?[{title:'Saldo anterior pendiente',detail:'El saldo bancario anterior al primer movimiento del tramo no coincide con el mayor. Hace falta el saldo de apertura o el extracto anterior; no se crea un asiento de ajuste para forzar la coincidencia.'}]:[]),
      {title:'Alcance',detail:'Solo se revisan movimientos dentro de las fechas del extracto. Se admite una diferencia de hasta 0,03 € en el saldo diario del mayor y hasta 10 días naturales antes o después, incluidos ambos límites. Se toma la última fecha del extracto con coincidencia, priorizando el importe exacto, después la diferencia menor y la fecha más cercana; en empate, la fecha contable más reciente. Cada listado continúa después de su propia fecha de saldo coincidente. Los apuntes anteriores solo se utilizan para calcular saldos y consultar precedentes. Después del punto de partida se buscan importes exactos hasta 10 días antes o después y, si hay varias opciones, se revisa el concepto. Los movimientos pendientes requieren validar sus justificantes. Guardar el informe no contabiliza asientos ni modifica cobros o pagos.'},
      {title:'Otros ejercicios',detail:statement.rows.length!==rows.length?'El documento abarca varios ejercicios. Este informe utiliza únicamente las fechas del ejercicio seleccionado; conserva el documento completo.':'Se han validado los saldos de todos los movimientos del documento.'},
    ]};
}
