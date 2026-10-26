import { HttpError } from '../middleware/errors.js';
import { id } from './validation.js';

const identity=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('es');
export function referenceParts(value){
 if(typeof value!=='string'||!value||value.length>60)return null;
 const match=value.match(/^(.*?)(\d+)(\D*)$/u);if(!match)return null;
 return {prefix:match[1],digits:match[2],suffix:match[3],number:BigInt(match[2])};
}
export function issuedJournalReference(description){
 const match=String(description||'').match(/^(?:N\s*\/\s*FAC(?:TURA)?\.?|NUESTRA\s+FACTURA|FACTURA\s+EMITIDA)\s*(?:(?:N[º°o.]|N[uú]m(?:ero)?\.?)\s*)?[:#]?\s*([A-Z0-9][A-Z0-9/_-]*)(?=$|[\s.·])/i);
 return match&&referenceParts(match[1])?match[1]:null;
}
export function proposeInvoiceReference({exercise,records,occupied=[]}){
 const ordered=records.filter(row=>row.exercise_id===exercise.id).sort((a,b)=>b.date.localeCompare(a.date)||b.order-a.order);
 const numbered=ordered.filter(row=>row.reference),latest=numbered.find(row=>referenceParts(row.reference))||numbered[0]||null;
 const warnings=[];
 if(ordered.some(row=>!row.reference&&(!latest||row.date>latest.date||(row.date===latest.date&&row.order>latest.order))))warnings.push('Hay asientos de ventas sin un número de factura identificable. Comprueba el consecutivo con tus facturas originales.');
 if(latest&&referenceParts(latest.reference)&&numbered.some(row=>!referenceParts(row.reference)&&(row.date>latest.date||(row.date===latest.date&&row.order>latest.order))))warnings.push('Hay números manuales sin una parte numérica reconocible. Se propone el consecutivo del último número identificable; compruébalo antes de guardar.');
 const previous=latest?{reference:latest.reference,date:latest.date,source:latest.source}:null;
 const parts=latest?referenceParts(latest.reference):{prefix:exercise.start_date.slice(0,4)+'/',digits:'0000',number:0n,suffix:''};
 if(!parts)return {reference:'',previous,warnings:[...warnings,'No hay una numeración previa con una parte numérica reconocible. Escribe el número de esta factura.'],automatic_available:false};
 let maximum=parts.number;
 for(const row of numbered){const other=referenceParts(row.reference);if(other&&identity(other.prefix)===identity(parts.prefix)&&identity(other.suffix)===identity(parts.suffix)&&other.number>maximum)maximum=other.number;}
 const used=new Set([...occupied,...records.map(row=>row.reference).filter(Boolean)].map(identity));
 let reference;do{maximum++;reference=parts.prefix+String(maximum).padStart(parts.digits.length,'0')+parts.suffix;}while(used.has(identity(reference)));
 if(reference.length>60)return {reference:'',previous,warnings:[...warnings,'La numeración supera la longitud admitida. Revisa el formato del número.'],automatic_available:false};
 return {reference,previous,warnings,automatic_available:true};
}
export async function nextIssuedReference(db,companyId,exerciseId){
 const [[exercise]]=await db.execute('SELECT id,name,start_date,end_date,status FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,id(exerciseId)]);
 if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
 const [invoices]=await db.execute("SELECT id,entry_id,exercise_id,invoice_date,reference FROM trade_invoices WHERE company_id=? AND direction='issued' ORDER BY invoice_date DESC,id DESC",[companyId]);
 const [journal]=await db.execute(`SELECT e.id,e.exercise_id,e.entry_date,e.description FROM journal_entries e
  WHERE e.company_id=? AND e.status='posted' AND e.entry_type='normal'
   AND EXISTS(SELECT 1 FROM journal_lines l JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id WHERE l.company_id=e.company_id AND l.entry_id=e.id AND (a.code LIKE '430%' OR a.code LIKE '440%') AND l.debit>0)
   AND EXISTS(SELECT 1 FROM journal_lines l JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id WHERE l.company_id=e.company_id AND l.entry_id=e.id AND a.code LIKE '7%' AND l.credit>0)
  ORDER BY e.entry_date DESC,e.id DESC`,[companyId]);
 const linked=new Set(invoices.map(row=>row.entry_id));
 const records=[...invoices.map(row=>({exercise_id:row.exercise_id,reference:row.reference,date:row.invoice_date,order:row.entry_id,source:'invoice'})),
  ...journal.filter(row=>!linked.has(row.id)).map(row=>({exercise_id:row.exercise_id,reference:issuedJournalReference(row.description),date:row.entry_date,order:row.id,source:'journal'}))];
 return {...proposeInvoiceReference({exercise,records,occupied:invoices.map(row=>row.reference)}),exercise_id:exercise.id};
}
