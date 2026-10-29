import {decimal} from '../../../shared/money.js';
import {vatDetailCents as amount} from '../../../shared/vat-details.js';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';

const retentionAccount=account=>/RETEN|RETEC|\bRET\b|IRPF|MODELO?\s*111\b/.test(account.description.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase());
export function calculateVatSettlement(model,{vatAccounts=[],treasuryAccounts=[],exercise=null},{payable_account_id,receivable_account_id}={}){
 const issues=[],lines=[],selected={},candidates={},required=[];
 const issue=(code,message)=>{if(!issues.some(row=>row.code===code))issues.push({code,message});};
 const totals={output:0n,input:0n};
 for(const account of vatAccounts){const value=amount(account.debit)-amount(account.credit);totals[account.code.startsWith('477')?'output':'input']+=account.code.startsWith('477')?-value:value;}
 const differences={output:totals.output-amount(model.total_output),input:totals.input-amount(model.total_deductible)};
 const matched=differences.output===0n&&differences.input===0n;
 if(!matched)issue('VAT_SETTLEMENT_DIFFERENCE','Las cuotas contabilizadas en el período no coinciden con el modelo. Revisa las fechas de registro, las operaciones pendientes y el IVA no deducible antes de preparar el asiento.');
 if(model.provisional)issue('VAT_SETTLEMENT_REVIEW','Confirma los criterios y revisa las operaciones del modelo antes de contabilizar la propuesta.');
 if(model.settlements?.length)issue('VAT_SETTLEMENT_EXISTS','Ya hay asientos de liquidación de IVA en este período. Consulta los existentes para evitar una segunda liquidación.');
 if(!exercise)issue('VAT_SETTLEMENT_EXERCISE','No hay un ejercicio contable que incluya la fecha de liquidación.');
 else if(exercise.status!=='open')issue('VAT_SETTLEMENT_CLOSED','El ejercicio de la fecha de liquidación está cerrado. La propuesta se muestra para consulta.');
 const choose=(family,requested)=>{
  const list=treasuryAccounts.filter(account=>account.code.startsWith(family)).map(account=>({...account,eligible:!retentionAccount(account)}));candidates[family]=list;
  let chosen;
  if(requested!==undefined&&requested!==null&&requested!==''){
   chosen=list.find(account=>account.id===id(requested));
   if(!chosen||!chosen.eligible)throw new HttpError(400,'INVALID_VAT_SETTLEMENT_ACCOUNT');
  }else{
   const eligible=list.filter(account=>account.eligible),explicit=eligible.filter(account=>/\bIVA\b/i.test(account.description));
   chosen=explicit.length===1?explicit[0]:eligible.length===1?eligible[0]:null;
  }
  selected[family]=chosen?.id||null;required.push(family);
  if(!chosen)issue('VAT_SETTLEMENT_ACCOUNT_'+family,list.some(account=>account.eligible)?'Selecciona la subcuenta '+family+' de IVA que debe utilizarse.':'Falta una subcuenta '+family+' de IVA adecuada. Créala o revisa su descripción en el plan de cuentas.');
  return chosen||{id:null,code:family,description:family==='4750'?'Hacienda Pública, acreedora por IVA':'Hacienda Pública, deudora por IVA',balance:'0.00'};
 };
 const add=(account,value,description)=>{if(value===0n)return;lines.push({account_id:account.id,code:account.code,account_name:account.description,description,debit:decimal(value>0n?value:0n),credit:decimal(value<0n?-value:0n),account_missing:!account.id});};
 if(matched){
  for(const account of vatAccounts)add(account,amount(account.credit)-amount(account.debit),'Liquidación IVA '+model.period.code+' · '+model.period.year);
  const net=totals.output-totals.input,compensation=amount(model.boxes['78']||'0.00');
  let receivable;
  if(compensation>0n||net<0n){receivable=choose('4700',receivable_account_id);if(compensation>0n&&amount(receivable.balance)<compensation)issue('VAT_SETTLEMENT_COMPENSATION_BALANCE','El saldo deudor disponible en la subcuenta 4700 no cubre la compensación aplicada. Revisa la apertura y los saldos anteriores.');}
  if(compensation>0n)add(receivable,-compensation,'Compensación de IVA de períodos anteriores');
  const result=net-compensation;
  if(result>0n)add(choose('4750',payable_account_id),-result,'IVA del período a ingresar');
  else if(result<0n)add(receivable,-result,'IVA del período a compensar o devolver');
 }
 const debit=lines.reduce((sum,line)=>sum+amount(line.debit),0n),credit=lines.reduce((sum,line)=>sum+amount(line.credit),0n),balanced=debit===credit;
 if(lines.length&&!balanced)issue('VAT_SETTLEMENT_UNBALANCED','La propuesta no cuadra. Revisa las cuotas y las compensaciones.');
 return {date:model.period.to,description:'Liquidación IVA · Modelo 303 · '+model.period.year+' · '+model.period.code,exercise,lines,totals:{debit:decimal(debit),credit:decimal(credit),difference:decimal(debit-credit)},comparison:{book_output:decimal(totals.output),model_output:model.total_output,output_difference:decimal(differences.output),book_input:decimal(totals.input),model_input:model.total_deductible,input_difference:decimal(differences.input),matched},compensation:model.boxes['78']||'0.00',result:model.result,issues,ready:!issues.length&&lines.length>=2&&balanced,empty:matched&&!lines.length,selected_accounts:selected,required_accounts:required,account_candidates:candidates,existing_settlements:model.settlements||[]};
}

export async function readVatSettlement(db,companyId,model,selection={}){
 const [[exercise]]=await db.execute('SELECT id,name,status,start_date,end_date FROM accounting_exercises WHERE company_id=? AND start_date<=? AND end_date>=?',[companyId,model.period.to,model.period.to]);
 const excluded=(model.settlements||[]).map(row=>row.entry_id),notSettled=excluded.length?' AND e.id NOT IN ('+excluded.map(()=>'?').join(',')+')':'';
 const [vatAccounts]=await db.execute(`SELECT a.id,a.code,a.description,SUM(l.debit) AS debit,SUM(l.credit) AS credit
  FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
  WHERE e.company_id=? AND e.entry_date BETWEEN ? AND ? AND e.status='posted' AND e.entry_type='normal' AND (a.code LIKE '477%' OR a.code LIKE '472%')${notSettled}
  GROUP BY a.id,a.code,a.description ORDER BY a.code`,[companyId,model.period.from,model.period.to,...excluded]);
 const [treasuryAccounts]=await db.execute(`SELECT a.id,a.code,a.description,COALESCE((SELECT SUM(l.debit-l.credit) FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id WHERE l.company_id=a.company_id AND l.account_id=a.id AND e.exercise_id=? AND e.entry_date<=? AND e.status='posted' AND e.entry_type<>'closing'),0.00) AS balance
  FROM accounts a WHERE a.company_id=? AND a.kind='subaccount' AND (a.code LIKE '4700%' OR a.code LIKE '4750%') ORDER BY a.code`,[exercise?.id??null,model.period.to,companyId]);
 return calculateVatSettlement(model,{vatAccounts,treasuryAccounts,exercise},selection);
}
