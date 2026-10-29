import {groupVatDetails} from '../../../shared/vat-details.js';
import {vatCategories} from '../../../shared/vat-model.js';

export function appendVatDetailCsv(rows,records){
 const amount=value=>({amount:value});
 for(const group of groupVatDetails(records)){
  rows.push([],[group.label]);
  for(const account of group.accounts){
   rows.push([account.code||'Sin cuenta de IVA',account.description],['Origen','Cuenta','Referencia','Fecha fiscal','Tercero','Concepto','Tratamiento','Base','Tipo %','IVA registrado','IVA incluido en el modelo','% deducible','Revisado']);
   for(const row of account.rows)rows.push([row.kind==='invoice'?'Factura':'Asiento',account.code,row.reference,row.date,row.party_name,row.description,vatCategories[row.category].label,amount(row.base),amount(row.rate),amount(row.tax_amount),amount(row.included_tax),group.code==='472'?amount(row.deductible_percent):'',row.reviewed?'Sí':'No']);
   rows.push(['Subtotal '+(account.code||'sin cuota'),'','','','','','',amount(account.totals.base),'',amount(account.totals.tax),amount(account.totals.included),'','']);
  }
  rows.push(['Total '+group.label,'','','','','','',amount(group.totals.base),'',amount(group.totals.tax),amount(group.totals.included),'','']);
 }
}
