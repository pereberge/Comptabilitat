import { calculateInvoice } from '../../../shared/invoice-money.js';
import { amount } from './report-amount.js';
import { validateInvoice } from './invoice-validation.js';
import { invoiceIdentity } from './invoice-pdf.js';
import {completeFiscalProfile} from '../../../shared/account-party.js';
import {partyPaymentReceipts,normalizePartyPaymentProfile} from '../../../shared/party-payments.js';
import {partyTaxId,partyAccountsByTaxId,partyAccountsByName} from '../../../shared/party-identity.js';

export function buildInvoiceProposal({form:input,extraction,accounts,journal,invoices=[],knownParties=[],exercise}){
 const form=structuredClone(input),received=form.direction==='received',warnings=[...extraction.warnings],byId=new Map(accounts.map(account=>[account.id,account]));
 const parties=accounts.filter(account=>account.kind==='subaccount'&&(received?/^(400|410)/:/^(430|440)/).test(account.code));
 const identities=[...parties.filter(row=>row.party_profile?.tax_id).map(row=>({account_id:row.id,direction:form.direction,tax_id:row.party_profile.tax_id})),...knownParties,...invoices.map(row=>({account_id:row.party_account_id,direction:row.direction,tax_id:row.party_tax_id})),...parties.filter(row=>row.tax_id).map(row=>({account_id:row.id,direction:form.direction,tax_id:row.tax_id}))];
 const taxId=partyTaxId(form.party?.tax_id),matched=partyAccountsByTaxId(identities,form.direction,taxId).filter(accountId=>parties.some(account=>account.id===accountId));
 if(!form.party_account_id){
  if(matched.length===1)form.party_account_id=matched[0];
  else if(matched.length>1)warnings.push('Hay varias subcuentas con el mismo CIF / NIF. Selecciona la correcta antes de contabilizar.');
  else{const named=partyAccountsByName(parties,identities,form.direction,form.party?.name,taxId);if(named.length===1)form.party_account_id=named[0].id;else if(named.length>1)warnings.push('Hay varios proveedores o clientes con nombres similares. Selecciona la subcuenta correcta.');}
 }
 const selectedIdentities=identities.filter(row=>Number(row.account_id)===Number(form.party_account_id)&&row.direction===form.direction&&partyTaxId(row.tax_id));
 const taxConflict=!!(taxId&&selectedIdentities.length&&!selectedIdentities.some(row=>partyTaxId(row.tax_id)===taxId));
 if(taxConflict)warnings.push('El CIF / NIF no coincide con el de la subcuenta seleccionada. Revisa el proveedor o cliente.');
 const party=parties.find(account=>account.id===Number(form.party_account_id));
 if(party?.party_profile)form.party=completeFiscalProfile(form.party,party.party_profile);
 const grouped=new Map();for(const row of journal){if(!grouped.has(row.entry_id))grouped.set(row.entry_id,[]);grouped.get(row.entry_id).push(row);}
 let totals=null;try{totals=calculateInvoice(form.lines,form.withholding_rate||'0');}catch{}
 let paymentError=false;
 if(totals&&form.automatic_receipts)try{const profile=normalizePartyPaymentProfile(party?.payment_profile||{});if(form.payment_profile&&JSON.stringify(normalizePartyPaymentProfile(form.payment_profile))!==JSON.stringify(profile))throw new Error();form.payment_profile=profile;form.receipts=partyPaymentReceipts(totals.total_amount,form.invoice_date,profile);}catch{paymentError=true;warnings.push('Revisa las condiciones de cobro o pago del tercero.');}
 const candidates=[];
 if(totals&&form.party_account_id){
  for(const rows of grouped.values()){
   const header=rows[0];if(header.status!=='posted'||header.entry_type!=='normal'||!form.invoice_date||Math.abs(new Date(header.entry_date)-new Date(form.invoice_date))>45*86400000)continue;
   const party=rows.filter(row=>row.account_id===Number(form.party_account_id)).reduce((sum,row)=>sum+amount(row.debit)-amount(row.credit),0n);
   if(party!==(received?-1n:1n)*amount(totals.total_amount))continue;
   const offset=rows.filter(row=>(received?/^[62]/:/^7/).test(row.code)),vat=rows.filter(row=>(received?/^472/:/^477/).test(row.code));
   if(offset.reduce((sum,row)=>sum+amount(row.debit)-amount(row.credit),0n)!==(received?1n:-1n)*amount(totals.base_total)||vat.reduce((sum,row)=>sum+amount(row.debit)-amount(row.credit),0n)!==(received?1n:-1n)*amount(totals.tax_total))continue;
   const description=invoiceIdentity(header.entry_description),reference=invoiceIdentity(form.reference),suffix=form.reference?.match(/(\d{6})$/)?.[1];
   candidates.push({entry_id:header.entry_id,number:header.number,entry_date:header.entry_date,description:header.entry_description,
    reference_matches:!!(reference&&description.includes(reference)||suffix&&description.includes(suffix)),
    offset_account_id:offset.length===1?offset[0].account_id:null,vat_account_id:vat.length===1?vat[0].account_id:null});
  }
 }
 const strong=candidates.filter(candidate=>candidate.reference_matches),matches=strong.length?strong:candidates;
 if(matches.length===1){
  const match=matches[0];
  if(!form.offset_account_id)form.offset_account_id=match.offset_account_id;
  if(!form.vat_account_id)form.vat_account_id=match.vat_account_id;
  if(!form.posting_date||form.posting_date===form.invoice_date)form.posting_date=match.entry_date;
 }
 let basis='Contrapartidas pendientes de revisar.';
 if(!form.offset_account_id&&form.party_account_id){
  const history=[...grouped.values()].filter(rows=>rows[0].status==='posted'&&rows[0].entry_type==='normal'&&rows.some(row=>row.account_id===Number(form.party_account_id)))
    .sort((a,b)=>b[0].entry_date.localeCompare(a[0].entry_date)||b[0].number-a[0].number);
  for(const rows of history){const offsets=rows.filter(row=>(received?/^[62]/:/^7/).test(row.code));if(offsets.length===1){form.offset_account_id=offsets[0].account_id;basis='Según tus datos: misma contrapartida que el asiento '+rows[0].number+' de este proveedor o cliente.';break;}}
 }
 if(matches.length)basis='Según tus datos: hay '+matches.length+' asiento(s) que coinciden en tercero, base, IVA e importe'+(strong.length?' y referencia de factura.':'. Revisar la referencia para confirmar la coincidencia.');
 if(totals&&amount(totals.tax_total)>0n&&!form.vat_account_id){
  const rate=form.lines.length===1?String(form.lines[0].tax_rate).split('.')[0]:'';
  const eligible=accounts.filter(account=>account.kind==='subaccount'&&(received?/^472/:/^477/).test(account.code)&&(!rate||account.code.endsWith(rate.padStart(2,'0'))||account.description.includes(rate+'%')));
  if(eligible.length===1)form.vat_account_id=eligible[0].id;
 }
 const existing=invoices.find(invoice=>invoice.direction===form.direction&&invoice.reference===form.reference&&invoice.status==='posted'&&
  (form.party_account_id&&invoice.party_account_id===Number(form.party_account_id)||form.party?.tax_id&&invoiceIdentity(invoice.party_tax_id)===invoiceIdentity(form.party.tax_id)));
 const lines=[];
 if(totals){
  const line=(accountId,fallback,debit,credit)=>{if(amount(debit)===0n&&amount(credit)===0n)return;const account=byId.get(Number(accountId));lines.push({account_id:account?.id??null,code:account?.code||fallback,description:account?.description||'Pendiente de asignar',debit,credit});};
  line(form.offset_account_id,received?'Cuenta de gasto':'Cuenta de ingreso',received?totals.base_total:'0.00',received?'0.00':totals.base_total);
  line(form.vat_account_id,received?'472':'477',received?totals.tax_total:'0.00',received?'0.00':totals.tax_total);
  line(form.party_account_id,form.party_parent|| (received?'4100':'4300'),received?'0.00':totals.total_amount,received?totals.total_amount:'0.00');
  line(form.withholding_account_id,received?'4751':'473',received?'0.00':totals.withholding_total,received?totals.withholding_total:'0.00');
 }
 const printedDifference=!!(totals&&['base_total','tax_total','total_amount'].some(field=>extraction[field]&&extraction[field]!==totals[field]));
 if(printedDifference)warnings.push('La propuesta editada difiere de los importes leídos en el PDF. Comprueba y justifica la corrección antes de confirmar.');
 const alternatives=[];
 if(extraction.parser==='energia-xxi')alternatives.push({detail:'Para electricidad, valorar una subcuenta específica del grupo 628 (Suministros). Se conserva como propuesta principal la clasificación de tus apuntes anteriores. No se cambia el asiento existente.',reference:'https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884'});
 if(matches.length)warnings.push('Posible factura ya contabilizada. Revisa el asiento antes de vincularla; no se permite crear otro asiento mientras exista esta coincidencia.');
 if(!form.offset_account_id)warnings.push('Selecciona la cuenta de gasto o ingreso antes de contabilizar.');
 let valid=false;try{validateInvoice(form);valid=true;}catch{}
 const accountValid=(field,pattern,required=false)=>!form[field]?!required:byId.get(Number(form[field]))?.kind==='subaccount'&&pattern.test(byId.get(Number(form[field]))?.code||'');
 const accountsValid=accountValid('party_account_id',received?/^(400|410)/:/^(430|440)/)&&accountValid('offset_account_id',received?/^[62]/:/^7/,true)&&accountValid('vat_account_id',received?/^472/:/^477/)&&accountValid('withholding_account_id',received?/^4751/:/^473/);
 const complete=!!(totals&&form.reference?.trim()&&form.party?.name?.trim()&&form.invoice_date&&form.posting_date&&form.offset_account_id&&
  (amount(totals.tax_total)===0n||form.vat_account_id)&&(amount(totals.withholding_total)===0n||form.withholding_account_id)&&
  form.posting_date>=exercise.start_date&&form.posting_date<=exercise.end_date&&form.posting_date>=form.invoice_date);
 return {form,totals,journal:lines,candidates:matches.slice(0,12),existing_invoice:existing?{id:existing.id,entry_id:existing.entry_id,reference:existing.reference,total_amount:existing.total_amount}:null,
  basis,alternatives,warnings:[...new Set(warnings)],ready:complete&&valid&&accountsValid&&!paymentError&&!taxConflict&&!(matched.length>1&&!form.party_account_id)&&extraction.currency==='EUR'&&!extraction.multiple_invoices,needs_amount_review:!extraction.totals_verified||!!extraction.withholding_review||printedDifference};
}
