import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { id } from './validation.js';
import { amount } from './report-amount.js';
import { decimal } from '../../../shared/money.js';
import { reconciliationLedgerHash } from './bank-reconciliations.js';
import { bankReconciliationDates } from '../../../shared/bank-reconciliation.js';
import { today } from './portfolio-data.js';

const pgc='https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884';
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const net=row=>amount(row.debit)-amount(row.credit);
const total=rows=>rows.reduce((sum,row)=>sum+net(row),0n);
const parsed=value=>typeof value==='string'?JSON.parse(value):value;

export function buildAccountingReview({company,exercise,accounts,entries,lines,previous=null,previousBalances=[],banks=[],connections=[],invoices=[],receipts=[],asOf=today()}) {
 const findings=[],byAccount=new Map(accounts.map(row=>[row.id,row])),byEntry=new Map(),usage=new Map();
 const posted=entries.filter(entry=>entry.status==='posted'),active=new Set(posted.map(entry=>entry.id));
 const activeLines=lines.filter(row=>active.has(row.entry_id));
 for(const row of activeLines){if(!byEntry.has(row.entry_id))byEntry.set(row.entry_id,[]);byEntry.get(row.entry_id).push(row);usage.set(row.account_id,(usage.get(row.account_id)||0)+1);}
 const prefix=row=>byAccount.get(row.account_id)?.parent_code||'';
 const refs=items=>items.slice(0,12).map(row=>({id:row.id,number:row.number,date:row.entry_date}));
 const accountRefs=items=>[...new Map(items.map(row=>[row.id,row])).values()].slice(0,12).map(row=>({id:row.id,code:row.code,description:row.description}));
 function add(code,severity,category,title,detail,suggestion,extra={}){
  findings.push({id:code+':'+(extra.key??findings.length),code,severity,category,title,detail,suggestion,accounts:[],entries:[],...extra});
 }
 let debit=0n,credit=0n;
 const duplicates=new Map();
 for(const entry of posted){
  const rows=byEntry.get(entry.id)||[],d=rows.reduce((sum,row)=>sum+amount(row.debit),0n),c=rows.reduce((sum,row)=>sum+amount(row.credit),0n);
  debit+=d;credit+=c;
  if(rows.length<2)add('ENTRY_INCOMPLETE','error','journal','Asiento incompleto','El asiento '+entry.number+' tiene menos de dos líneas.','Revisar el documento y completar la partida doble.',{key:entry.id,entries:refs([entry])});
  if(d!==c)add('ENTRY_UNBALANCED','error','journal','Asiento descuadrado','El asiento '+entry.number+' tiene importes distintos en Debe y Haber.','Revisar sus líneas antes de añadir ajustes.',{key:entry.id,entries:refs([entry]),amount:decimal(d-c)});
  if(entry.entry_date<exercise.start_date||entry.entry_date>exercise.end_date)add('ENTRY_OUTSIDE_PERIOD','error','journal','Fecha fuera del ejercicio','La fecha del asiento '+entry.number+' no pertenece al ejercicio seleccionado.','Comprobar la fecha y el ejercicio que corresponden al documento.',{key:entry.id,entries:refs([entry])});
  if(!entry.description?.trim())add('ENTRY_DESCRIPTION','review','journal','Asiento sin concepto','El asiento '+entry.number+' no tiene concepto.','Añadir una descripción que permita identificar el justificante.',{key:entry.id,entries:refs([entry])});
  const invalid=rows.filter(row=>!byAccount.has(row.account_id)||byAccount.get(row.account_id).kind!=='subaccount'||amount(row.debit)!==0n&&amount(row.credit)!==0n||(!entry.import_id&&(amount(row.debit)<0n||amount(row.credit)<0n||amount(row.debit)===0n&&amount(row.credit)===0n)));
  if(invalid.length)add('ENTRY_INVALID_LINES','error','journal','Líneas de asiento no válidas','El asiento '+entry.number+' contiene líneas sin subcuenta válida o con importes incompatibles. Los importes con signo del diario importado se admiten.','Contrastar las líneas señaladas con el documento original.',{key:entry.id,entries:refs([entry]),accounts:accountRefs(invalid.map(row=>byAccount.get(row.account_id)).filter(Boolean))});
  if(entry.entry_type==='normal'&&rows.length&&rows.some(row=>net(row)!==0n)){
   const hash=createHash('sha256').update(JSON.stringify([entry.entry_date,normalized(entry.description),rows.map(row=>[row.account_id,row.debit,row.credit]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))])).digest('hex');
   if(!duplicates.has(hash))duplicates.set(hash,[]);duplicates.get(hash).push(entry);
  }
 }
 for(const [hash,group]of duplicates)if(group.length>1)add('POSSIBLE_DUPLICATE','review','journal','Posible asiento duplicado',group.length+' asientos tienen la misma fecha, concepto, cuentas e importes. Puede haber operaciones legítimas iguales.','Comparar referencias y justificantes antes de anular cualquier asiento.',{key:hash,entries:refs(group),count:group.length});
 if(debit!==credit)add('JOURNAL_UNBALANCED','error','journal','El diario no cuadra','El total del Debe y del Haber del ejercicio es distinto.','Resolver primero los asientos descuadrados identificados.',{amount:decimal(debit-credit)});

 const names=new Map();
 for(const account of accounts){
  const parent=byAccount.get(account.parent_id);
  const validParent=account.parent_id?parent?.kind==='account'&&account.code.startsWith(parent.code)&&parent.code.length<account.code.length:account.kind==='account'&&account.code.length===1;
  if(!validParent||account.kind==='subaccount'&&account.code.length!==company.subaccount_length||!account.description?.trim())add('ACCOUNT_STRUCTURE','error','accounts','Estructura de cuenta incoherente','La cuenta '+account.code+' tiene un padre, una longitud o una descripción no válidos.','Revisar su estructura en Mantenimiento de subcuentas antes de utilizarla.',{key:account.id,accounts:accountRefs([account])});
  if(account.kind!=='subaccount')continue;
  if(usage.has(account.id)){
   const nameKey=account.parent_code+':'+normalized(account.description);
   if(!names.has(nameKey))names.set(nameKey,[]);names.get(nameKey).push(account);
   if(/^(?:CUENTA|SUBCUENTA)?\d+$/.test(normalized(account.description))||['BANCO','CLIENTE','PROVEEDOR','VARIOS'].includes(normalized(account.description)))add('GENERIC_ACCOUNT_NAME','improvement','accounts','Nombre de subcuenta poco descriptivo','La subcuenta '+account.code+' se utiliza en el ejercicio y tiene un nombre genérico.','Identificar banco, tercero o finalidad para facilitar la revisión de los apuntes.',{key:account.id,accounts:accountRefs([account])});
  }
  if(account.parent_code?.startsWith('4752')&&/\bIVA\b/i.test(account.description))add('VAT_ACCOUNT_NAME','improvement','accounts','Revisar una cuenta nombrada como IVA','El nombre de '+account.code+' indica IVA y su grupo contable es 4752.','Contrastar su uso: el PGC distingue IVA (4750) e Impuesto sobre Sociedades (4752). Revisar nombre y movimientos antes de reclasificar.',{key:account.id,accounts:accountRefs([account]),reference:pgc});
  if(account.parent_code?.startsWith('473')&&/M202|MODELO202|MODEL202/.test(normalized(account.description))){
   const examples=posted.filter(entry=>{const rows=byEntry.get(entry.id)||[];return rows.some(row=>row.account_id===account.id)&&rows.some(row=>prefix(row).startsWith('76'));});
   if(examples.length)add('WITHHOLDING_ACCOUNT_NAME','improvement','accounts','Distinguir retenciones financieras y pagos fraccionados','La cuenta '+account.code+' se nombra como modelo 202 y también se utiliza con ingresos financieros.','Valorar una denominación más amplia o subcuentas separadas dentro de 473, conservando el historial.',{key:account.id,accounts:accountRefs([account]),entries:refs(examples),reference:pgc});
  }
 }
 for(const [key,group]of names)if(group.length>1)add('DUPLICATE_ACCOUNT_NAMES','improvement','accounts','Subcuentas con el mismo nombre',group.length+' subcuentas activas del mismo grupo comparten nombre. Pueden corresponder a terceros u operaciones distintos.','Precisar los nombres para distinguirlas; no fusionar saldos sin revisar sus movimientos.',{key,accounts:accountRefs(group),count:group.length});
 const namedBanks=new Set();
 for(const connection of connections){
  const connectionKey=connection.account_id+':'+normalized(connection.bank_name);
  if(namedBanks.has(connectionKey))continue;namedBanks.add(connectionKey);
  const account=byAccount.get(connection.account_id);
  if(account&&!normalized(account.description).includes(normalized(connection.bank_name)))add('BANK_ACCOUNT_NAME','improvement','accounts','Nombre del banco distinto al de la subcuenta','El IBAN vinculado a '+account.code+' corresponde a '+connection.bank_name+'; la subcuenta se llama «'+account.description+'».','Revisar la denominación de esta subcuenta para identificar el banco correctamente.',{key:connectionKey,accounts:accountRefs([account])});
 }

 const beforeClosing=activeLines.filter(row=>row.entry_type!=='closing');
 const balances=new Map();for(const row of beforeClosing)balances.set(row.account_id,(balances.get(row.account_id)||0n)+net(row));
 for(const [accountId,value]of balances){
  const account=byAccount.get(accountId);if(!account||value===0n)continue;
  const p=account.parent_code||'';
  const unusual=value<0n&&(/^(570|572|430)/.test(p))||value>0n&&(/^(400|410|28)/.test(p));
  if(unusual)add('ACCOUNT_UNUSUAL_BALANCE','review','accounts','Saldo a contrastar en '+account.code,'La subcuenta presenta un saldo '+(value<0n?'acreedor':'deudor')+' antes del cierre. En bancos, clientes o proveedores puede corresponder a descubiertos, anticipos o devoluciones.','Consultar el mayor y comprobar la naturaleza del saldo y su presentación.',{key:account.id,accounts:accountRefs([account]),amount:decimal(value),reference:pgc});
 }

 const openings=posted.filter(entry=>entry.entry_type==='opening'),closings=posted.filter(entry=>entry.entry_type==='closing');
 for(const [kind,group]of [['opening',openings],['closing',closings]]){
  if(group.length>1)add('MULTIPLE_ANNUAL_ENTRIES','review','annual','Varios asientos activos de '+(kind==='opening'?'apertura':'cierre'),'Hay '+group.length+' asientos de este tipo en el ejercicio.','Comprobar que no se haya generado la operación más de una vez.',{key:kind,entries:refs(group)});
  const expected=kind==='opening'?exercise.start_date:exercise.end_date,wrong=group.filter(entry=>entry.entry_date!==expected);
  if(wrong.length)add('ANNUAL_DATE','review','annual','Fecha de '+(kind==='opening'?'apertura':'cierre')+' a revisar','No coincide con el '+(kind==='opening'?'inicio':'final')+' del ejercicio.','Contrastar la fecha de la operación anual con el período configurado.',{key:kind,entries:refs(wrong)});
 }
 if(exercise.status==='closed'){
  const remaining=new Map();for(const row of activeLines)remaining.set(row.account_id,(remaining.get(row.account_id)||0n)+net(row));
  const nonzero=[...remaining].filter(([,value])=>value!==0n);
  if(!closings.length&&posted.length)add('CLOSING_MISSING','error','annual','Ejercicio cerrado sin asiento de cierre','El ejercicio está cerrado y tiene apuntes, pero no tiene cierre activo.','Revisar las operaciones anuales y su historial antes de regenerar el cierre.');
  if(nonzero.length)add('CLOSING_RESIDUAL','error','annual','Quedan saldos después del cierre',nonzero.length+' subcuentas conservan saldo en un ejercicio cerrado.','Comprobar regularización, cierre y posibles apuntes posteriores.',{accounts:accountRefs(nonzero.map(([accountId])=>byAccount.get(accountId)).filter(Boolean)),count:nonzero.length});
 }
 if(previous?.status==='closed'&&previousBalances.length&&posted.length){
  if(!openings.length&&!activeLines.some(row=>row.entry_date===exercise.start_date&&/^[1-5]/.test(prefix(row))))add('OPENING_MISSING','review','annual','Revisar el saldo de apertura','El ejercicio anterior está cerrado y tiene saldos para trasladar, pero no se identifica una apertura ni movimientos patrimoniales el primer día.','Consultar el ejercicio anterior y generar la apertura únicamente después de verificar los saldos.');
  if(openings.length===1){
   const actual=new Map();for(const row of byEntry.get(openings[0].id)||[])actual.set(row.account_id,(actual.get(row.account_id)||0n)+net(row));
   const expected=new Map(previousBalances.map(row=>[row.account_id,amount(row.balance)]));
   const different=[...new Set([...actual.keys(),...expected.keys()])].filter(accountId=>(actual.get(accountId)||0n)!==(expected.get(accountId)||0n));
   if(different.length)add('OPENING_DIFFERENCE','review','annual','La apertura difiere de los saldos anteriores',different.length+' subcuentas no coinciden con el saldo del ejercicio anterior antes del cierre. Puede haber reclasificaciones justificadas.','Revisar el asiento de apertura y los ajustes, sin sustituir automáticamente la apertura.',{accounts:accountRefs(different.map(accountId=>byAccount.get(accountId)).filter(Boolean)),entries:refs(openings),count:different.length});
  }
 }

 // Detect review points, not filing obligations: payment frequency and tax documents are not inferred.
 const fiscal=beforeClosing.filter(row=>row.entry_type!=='opening');
 const years=new Set(fiscal.map(row=>row.entry_date.slice(0,4)));
 for(const year of years)for(let quarter=1;quarter<=4;quarter++){
  const start=year+'-'+String(quarter*3-2).padStart(2,'0')+'-01';
  const end=year+'-'+String(quarter*3).padStart(2,'0')+'-'+(quarter===1||quarter===4?'31':'30');
  if(start<exercise.start_date||end>exercise.end_date||end>asOf)continue;
  const period=fiscal.filter(row=>row.entry_date>=start&&row.entry_date<=end),tax=period.filter(row=>/^(472|477)/.test(prefix(row)));
  if(!tax.length)continue;
  const settlement=posted.filter(entry=>entry.entry_date>=start&&entry.entry_date<=end&&(byEntry.get(entry.id)||[]).some(row=>prefix(row).startsWith('477')&&amount(row.debit)>0n)&&(byEntry.get(entry.id)||[]).some(row=>/^(475|4700)/.test(prefix(row))));
  const related=accounts.filter(account=>/^(472|477)/.test(account.parent_code||'')&&tax.some(row=>row.account_id===account.id));
  if(settlement.length){
   const output=total(beforeClosing.filter(row=>row.entry_date<=end&&prefix(row).startsWith('477')));
   if(output!==0n)add('VAT_RESIDUAL','review','taxes','IVA repercutido pendiente tras una liquidación · '+year+' T'+quarter,'Al terminar este trimestre queda saldo en 477 después de un asiento identificado como liquidación. Puede corresponder a diferencias o importes pendientes.','Comparar las facturas, la liquidación y el modelo presentado antes de ajustar.',{key:year+'-'+quarter,accounts:accountRefs(related.filter(account=>account.parent_code.startsWith('477'))),entries:refs(settlement),amount:decimal(-output),from:exercise.start_date,to:end,reference:pgc});
  }else{
   const output=-total(tax.filter(row=>prefix(row).startsWith('477'))),input=total(tax.filter(row=>prefix(row).startsWith('472')));
   if(output!==0n||input!==0n)add('VAT_SETTLEMENT_REVIEW','review','taxes','IVA registrado sin liquidación identificada · '+year+' T'+quarter,'En el trimestre hay IVA repercutido y/o soportado y no se identifica un asiento de liquidación. La periodicidad fiscal no se deduce de los apuntes.','Contrastar con los modelos presentados y su período. El importe mostrado es repercutido menos soportado del tramo, no una deuda fiscal confirmada.',{key:year+'-'+quarter,accounts:accountRefs(related),amount:decimal(output-input),from:start,to:end,reference:pgc});
  }
 }

 const seenBanks=new Set();
 for(const bank of [...banks].sort((a,b)=>b.id-a.id)){
  if(seenBanks.has(bank.account_id))continue;seenBanks.add(bank.account_id);
  const data=parsed(bank.snapshot),account=byAccount.get(bank.account_id);if(!account)continue;
  const dates=bankReconciliationDates(data);
  const current=total(activeLines.filter(row=>row.account_id===account.id&&row.entry_date<=dates.bookThrough));
  const difference=current-amount(data.bank_balance),stale=reconciliationLedgerHash(lines.filter(row=>row.entry_date<=dates.readThrough))!==bank.ledger_hash;
  if(difference!==0n)add('BANK_DIFFERENCE','review','banks',data.account.name_by_user+': diferencia con el extracto','El saldo contable a '+dates.bookThrough+' y el extracto guardado a '+data.source.to+' no coinciden. El informe contiene '+data.proposals.length+' propuestas pendientes de validar'+(data.unresolved?.length?' y '+data.unresolved.length+' movimientos sin contrapartida confirmada':'')+'.','Revisar el PDF/CSV y la conciliación. No crear un ajuste solo para igualar saldos.',{key:account.id,accounts:accountRefs([account]),amount:decimal(difference),bank_report_id:bank.id,from:exercise.start_date,to:dates.bookThrough});
  if(stale)add('BANK_ANALYSIS_STALE','review','banks','La contabilidad ha cambiado desde el análisis de '+data.account.name_by_user,'La huella del diario ya no coincide con la utilizada para preparar el informe guardado.','Revisar las propuestas frente al mayor actual, aunque la diferencia de saldo sea cero.',{key:account.id,accounts:accountRefs([account]),bank_report_id:bank.id});
 }

 for(const invoice of invoices){
  if(invoice.status!=='posted')continue;
  if(amount(invoice.receipt_total)!==amount(invoice.total_amount))add('INVOICE_RECEIPT_TOTAL','error','portfolio','Los recibos no suman el total de la factura '+invoice.reference,'El reparto de vencimientos difiere del total de la factura.','Revisar la factura y sus recibos.',{key:invoice.id,amount:decimal(amount(invoice.total_amount)-amount(invoice.receipt_total))});
  if(invoice.entry_status!=='posted')add('INVOICE_ENTRY_STATUS','error','portfolio','Factura activa con asiento no vigente','La factura '+invoice.reference+' no tiene un asiento contabilizado activo.','Revisar la factura, su asiento y el historial de anulaciones.',{key:invoice.id});
 }
 const overdue=[];
 for(const receipt of receipts){
  if(receipt.invoice_status!=='posted')continue;
  const remaining=amount(receipt.amount)-amount(receipt.paid_amount);
  if(remaining<0n)add('RECEIPT_OVERPAID','error','portfolio','Un recibo tiene pagos superiores al importe','El recibo '+receipt.position+' de '+receipt.reference+' acumula más liquidaciones activas que su importe.','Revisar las liquidaciones y las anulaciones de la cartera.',{key:receipt.id,amount:decimal(-remaining)});
  else if(remaining>0n&&receipt.due_date<asOf)overdue.push({...receipt,remaining});
 }
 if(overdue.length)add('OVERDUE_RECEIPTS','review','portfolio','Recibos vencidos pendientes',overdue.length+' recibos del ejercicio tienen saldo pendiente y una fecha anterior a la consulta.','Consultar Cartera para comprobar los cobros y pagos; el vencimiento por sí solo no implica un error contable.',{count:overdue.length,amount:decimal(overdue.reduce((sum,row)=>sum+row.remaining,0n))});
 if(posted.length||invoices.length){
  const missing=[!company.tax_id?.trim()?'CIF/NIF':'',!company.address?.trim()?'dirección fiscal':''].filter(Boolean);
  if(missing.length)add('COMPANY_BILLING_DATA','improvement','company','Completar datos de facturación','Faltan '+missing.join(' y ')+' en la ficha actual de la empresa.','Completar la ficha antes de emitir nuevas facturas. Los datos históricos de facturas ya emitidas conservan su propia copia.');
 }
 const order={error:0,review:1,improvement:2};findings.sort((a,b)=>order[a.severity]-order[b.severity]||a.category.localeCompare(b.category)||a.id.localeCompare(b.id));
 return {company:{id:company.id,name:company.name},exercise,as_of:asOf,generated_at:new Date().toISOString(),
  scope:{from:exercise.start_date,to:exercise.end_date,account_plan:'company',cancelled_excluded:true},
  summary:{errors:findings.filter(row=>row.severity==='error').length,review:findings.filter(row=>row.severity==='review').length,improvements:findings.filter(row=>row.severity==='improvement').length,posted_entries:posted.length,cancelled_entries:entries.length-posted.length,accounts:accounts.filter(row=>row.kind==='subaccount').length,active_accounts:usage.size,debit:decimal(debit),credit:decimal(credit),difference:decimal(debit-credit)},
  checks:['journal','accounts','annual','taxes','banks','portfolio','company'],findings,read_only:true};
}

export function createAccountingReviewService(pool,companyId){
 return {async review(query){
  const exerciseId=id(query.exercise_id),db=await pool.getConnection();
  try{
   await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
   const [[exercise]]=await db.execute('SELECT id,name,start_date,end_date,status FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,exerciseId]);
   if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
   const [[company]]=await db.execute('SELECT c.id,c.name,c.subaccount_length,d.tax_id,d.address FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);
   const [accounts]=await db.execute('SELECT a.id,a.code,a.description,a.kind,a.parent_id,p.code AS parent_code FROM accounts a LEFT JOIN accounts p ON p.company_id=a.company_id AND p.id=a.parent_id WHERE a.company_id=? ORDER BY a.code',[companyId]);
   const [entries]=await db.execute('SELECT id,number,entry_date,description,status,entry_type,import_id FROM journal_entries WHERE company_id=? AND exercise_id=? ORDER BY entry_date,number',[companyId,exerciseId]);
   const [lines]=await db.execute(`SELECT e.exercise_id,e.id AS entry_id,e.number,e.entry_date,e.status,e.entry_type,a.code,a.description AS account_name,l.account_id,l.position,l.description,l.debit,l.credit
    FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
    WHERE e.company_id=? AND e.exercise_id=? ORDER BY e.entry_date,e.number,l.position`,[companyId,exerciseId]);
   const [[previous]]=await db.execute('SELECT id,name,status FROM accounting_exercises WHERE company_id=? AND end_date=DATE_SUB(?,INTERVAL 1 DAY)',[companyId,exercise.start_date]);
   const [previousBalances]=previous?.status==='closed'?await db.execute(`SELECT l.account_id,SUM(l.debit-l.credit) AS balance FROM journal_entries e
    JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
    WHERE e.company_id=? AND e.exercise_id=? AND e.status='posted' AND e.entry_type<>'closing' AND LEFT(a.code,1) BETWEEN '1' AND '5'
    GROUP BY l.account_id HAVING SUM(l.debit-l.credit)<>0`,[companyId,previous.id]):[[]];
   const [banks]=await db.execute('SELECT id,account_id,snapshot,ledger_hash FROM bank_reconciliations WHERE company_id=? AND exercise_id=? ORDER BY id DESC',[companyId,exerciseId]);
   const [connections]=await db.execute('SELECT account_id,bank_name FROM bank_connections WHERE company_id=?',[companyId]);
   const [invoices]=await db.execute(`SELECT i.id,i.reference,i.status,i.total_amount,e.status AS entry_status,COALESCE(SUM(r.amount),0.00) AS receipt_total FROM trade_invoices i
    JOIN journal_entries e ON e.company_id=i.company_id AND e.id=i.entry_id LEFT JOIN portfolio_receipts r ON r.company_id=i.company_id AND r.invoice_id=i.id
    WHERE i.company_id=? AND i.exercise_id=? GROUP BY i.id,e.status`,[companyId,exerciseId]);
   const [receipts]=await db.execute(`SELECT r.id,r.position,r.due_date,r.amount,i.reference,i.status AS invoice_status,COALESCE(p.paid,0.00) AS paid_amount
    FROM portfolio_receipts r JOIN trade_invoices i ON i.company_id=r.company_id AND i.id=r.invoice_id
    LEFT JOIN (SELECT company_id,receipt_id,SUM(amount) AS paid FROM portfolio_settlements WHERE company_id=? AND reversal_entry_id IS NULL GROUP BY company_id,receipt_id) p ON p.company_id=r.company_id AND p.receipt_id=r.id
    WHERE i.company_id=? AND i.exercise_id=?`,[companyId,companyId,exerciseId]);
   const report=buildAccountingReview({company,exercise,accounts,entries,lines,previous,previousBalances,banks,connections,invoices,receipts});
   await db.commit();return report;
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 }};
}
