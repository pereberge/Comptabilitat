import { createHash } from 'node:crypto';
import { decimal } from '../../../shared/money.js';
import { vatAmount, roundedRatio } from '../../../shared/vat-model.js';

const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const inPeriod=(date,period)=>date>=period.from&&date<=period.to;
const net=row=>vatAmount(row.debit)-vatAmount(row.credit);
const abs=value=>value<0n?-value:value;
const knownRates=['4.00','10.00','21.00'];
function inferRate(base,tax){
 if(base===0n||(base<0n)!==(tax<0n))return null;
 const matches=knownRates.filter(rate=>abs(roundedRatio(base,vatAmount(rate))-tax)<=1n);
 return matches.length===1?matches[0]:null;
}
function seal(source,evidence){return {...source,fingerprint:fingerprint({key:source.key,date:source.date,direction:source.direction,base:source.base,tax_amount:source.tax_amount,evidence})};}

export function invoiceVatSources(rows,period){
 const sources=[];
 for(const row of rows){
  const originalDate=row.direction==='issued'?row.invoice_date:row.posting_date;
  const originalCategory=row.direction==='issued'?(row.tax_rate==='0.00'?'pending':'output'):(row.offset_code.startsWith('2')?'pending':vatAmount(row.tax_amount)===0n?'non_deductible':'domestic');
  for(const reversal of [false,true]){
   const eventDate=reversal?row.void_date:originalDate;
   if(!eventDate||!inPeriod(eventDate,period)||reversal&&row.void_status!=='posted')continue;
   let category=reversal?(row.direction==='issued'?'output_adjustment':'input_adjustment'):originalCategory;
   if(category==='output'&&!knownRates.includes(row.tax_rate))category='pending';
   const sign=reversal?-1n:1n;
   const source={key:'invoice:'+row.request_id+':'+row.position+(reversal?':void':''),kind:'invoice',invoice_id:row.invoice_id,entry_id:reversal?row.void_entry_id:row.entry_id,exercise_id:reversal?row.void_exercise_id:row.exercise_id,
    reference:row.reference,party_name:row.party_name,party_tax_id:row.party_tax_id,description:row.description,date:eventDate,invoice_date:row.invoice_date,direction:row.direction,
    base:decimal(vatAmount(row.base)*sign),tax_amount:decimal(vatAmount(row.tax_amount)*sign),rate:row.tax_rate,category,review_required:reversal||category==='pending',
    review_reason:reversal?'La anulación contable requiere comprobar el documento rectificativo.':row.offset_code.startsWith('2')&&row.direction==='received'?'Confirmar si cumple la definición fiscal de bien de inversión.':category==='pending'?'Confirmar el tratamiento fiscal de esta operación.':'',
    reversal,paired_output:false,vat_accounts:row.vat_account_code?[{id:row.vat_account_id,code:row.vat_account_code,description:row.vat_account_description,tax_amount:decimal(vatAmount(row.tax_amount)*sign)}]:[]};
   sources.push(seal(source,[row.reference,row.party_name,row.party_tax_id,row.description,row.offset_code,row.tax_rate,row.base,row.tax_amount]));
  }
 }
 return sources;
}

export function journalVatSources(rows){
 const groups=new Map(),sources=[],settlements=[];
 for(const row of rows){const group=groups.get(row.entry_id)||[];group.push(row);groups.set(row.entry_id,group);}
 for(const lines of groups.values()){
  const entry=lines[0],vat=lines.filter(row=>/^47[27]/.test(row.code)&&net(row)!==0n),other=lines.filter(row=>!/^47[27]/.test(row.code)&&net(row)!==0n);
  const evidence=lines.map(row=>[row.position,row.code,row.description,row.debit,row.credit]);
  if(other.length&&other.every(row=>/^(4700|4750)/.test(row.code))){settlements.push({entry_id:entry.entry_id,number:entry.number,date:entry.entry_date,description:entry.entry_description});continue;}
  if(!vat.length){
   // Imported zero-rate / exempt invoices can have no 472 or 477 line at all.
   for(const direction of ['issued','received']){
    const offsets=other.filter(row=>(direction==='issued'?/^7/:/^[26]/).test(row.code));
    const parties=other.filter(row=>(direction==='issued'?/^(43[01]|44[01])/:/^(40[01]|41[01])/).test(row.code));
    if(!offsets.length||!parties.length)continue;
    const base=offsets.reduce((sum,row)=>sum+(direction==='issued'?-net(row):net(row)),0n);if(base===0n)continue;
    const source={key:'journal:'+entry.entry_request_id+':no-vat-'+direction,kind:'journal',invoice_id:null,entry_id:entry.entry_id,exercise_id:entry.exercise_id,
     reference:entry.source_entry_reference||'Asiento '+entry.number,party_name:[...new Set(parties.map(row=>row.account_description))].join(' · '),party_tax_id:'',description:entry.entry_description,date:entry.entry_date,invoice_date:null,direction,
     base:decimal(base),tax_amount:'0.00',rate:'0.00',category:direction==='issued'?'pending':'non_deductible',review_required:true,
     review_reason:'Asiento con cliente o proveedor y sin cuota de IVA. Confirmar si es factura, operación exenta o a tipo cero.',reversal:base<0n,paired_output:false,source_available:!!entry.import_id,source_page:offsets[0].source_page||null,vat_accounts:[]};
    sources.push(seal(source,evidence));
   }
   continue;
  }
  const inputs=vat.filter(row=>row.code.startsWith('472')),outputs=vat.filter(row=>row.code.startsWith('477'));
  const paired=inputs.length===1&&outputs.length===1&&net(inputs[0])===-net(outputs[0]);
  for(const line of paired?inputs:vat){
   const direction=line.code.startsWith('472')?'received':'issued',tax=direction==='received'?net(line):-net(line);
   const offsets=other.filter(row=>(direction==='received'?/^[26]/:/^7/).test(row.code));
   const allBase=offsets.reduce((sum,row)=>sum+(direction==='received'?net(row):-net(row)),0n);
   const single=(direction==='received'?inputs:outputs).length===1;
   const base=single?allBase:0n,rate=single?inferRate(base,tax):null,investment=offsets.some(row=>row.code.startsWith('2'));
   let category='pending';
   if(rate&&!paired&&!investment){category=direction==='issued'?(tax<0n?'output_adjustment':'output'):(tax<0n?'input_adjustment':'domestic');}
   const parties=other.filter(row=>/^(40[01]|41[01]|43[01]|44[01])/.test(row.code));
   const partyNames=[...new Set(parties.map(row=>row.account_description))];
   const source={key:'journal:'+entry.entry_request_id+':'+(paired?'paired':line.position),kind:'journal',invoice_id:null,entry_id:entry.entry_id,exercise_id:entry.exercise_id,
    reference:entry.source_entry_reference||'Asiento '+entry.number,party_name:partyNames.join(' · '),party_tax_id:'',description:line.description||entry.entry_description,date:entry.entry_date,invoice_date:null,direction,
    base:decimal(base),tax_amount:decimal(tax),rate:rate||'0.00',category,review_required:true,
    review_reason:paired?'Confirmar adquisición intracomunitaria o inversión del sujeto pasivo.':investment?'Confirmar la base y la condición fiscal de bien de inversión.':!rate?'Falta un desglose fiscal inequívoco de la base y el tipo.':'Base y tipo propuestos a partir del asiento. Confirmar operación interior y deducibilidad.',
    reversal:tax<0n,paired_output:paired,source_available:!!entry.import_id,source_page:line.source_page||null,
    vat_accounts:(paired?[inputs[0],outputs[0]]:[line]).map(account=>({id:account.account_id,code:account.code,description:account.account_description,tax_amount:decimal(account.code.startsWith('472')?net(account):-net(account))}))};
   sources.push(seal(source,evidence));
  }
 }
 return {sources,settlements};
}

export async function readVatSources(db,companyId,period){
 const [invoices]=await db.execute(`SELECT i.id AS invoice_id,i.request_id,i.exercise_id,i.direction,i.reference,i.invoice_date,i.posting_date,i.party_name,i.party_tax_id,i.entry_id,i.void_entry_id,i.void_date,v.status AS void_status,v.exercise_id AS void_exercise_id,
  o.code AS offset_code,l.position,l.description,l.base,l.tax_rate,l.tax_amount,va.id AS vat_account_id,va.code AS vat_account_code,va.description AS vat_account_description
  FROM trade_invoices i JOIN trade_invoice_lines l ON l.company_id=i.company_id AND l.invoice_id=i.id
  JOIN accounts o ON o.company_id=i.company_id AND o.id=i.offset_account_id
  LEFT JOIN accounts va ON va.company_id=i.company_id AND va.id=i.vat_account_id
  JOIN journal_entries e ON e.company_id=i.company_id AND e.id=i.entry_id AND e.status='posted'
  LEFT JOIN journal_entries v ON v.company_id=i.company_id AND v.id=i.void_entry_id
  WHERE i.company_id=? AND ((CASE WHEN i.direction='issued' THEN i.invoice_date ELSE i.posting_date END BETWEEN ? AND ?) OR i.void_date BETWEEN ? AND ?)
  ORDER BY i.id,l.position LIMIT 20001`,[companyId,period.from,period.to,period.from,period.to]);
 const [journal]=await db.execute(`SELECT e.id AS entry_id,e.request_id AS entry_request_id,e.exercise_id,e.number,e.entry_date,e.description AS entry_description,e.source_entry_reference,e.import_id,
  l.position,l.description,l.debit,l.credit,l.source_page,a.id AS account_id,a.code,a.description AS account_description
  FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id
  JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
  WHERE e.company_id=? AND e.entry_date BETWEEN ? AND ? AND e.status='posted' AND e.entry_type='normal'
  AND NOT EXISTS(SELECT 1 FROM trade_invoices i WHERE i.company_id=e.company_id AND (i.entry_id=e.id OR i.void_entry_id=e.id))
  AND (EXISTS(SELECT 1 FROM journal_lines x JOIN accounts xa ON xa.company_id=x.company_id AND xa.id=x.account_id WHERE x.company_id=e.company_id AND x.entry_id=e.id AND (xa.code LIKE '472%' OR xa.code LIKE '477%'))
   OR (EXISTS(SELECT 1 FROM journal_lines x JOIN accounts xa ON xa.company_id=x.company_id AND xa.id=x.account_id WHERE x.company_id=e.company_id AND x.entry_id=e.id AND LEFT(xa.code,1) IN ('2','6','7'))
    AND EXISTS(SELECT 1 FROM journal_lines x JOIN accounts xa ON xa.company_id=x.company_id AND xa.id=x.account_id WHERE x.company_id=e.company_id AND x.entry_id=e.id AND LEFT(xa.code,3) IN ('400','401','410','411','430','431','440','441'))))
  ORDER BY e.entry_date,e.id,l.position LIMIT 100001`,[companyId,period.from,period.to]);
 if(invoices.length>20000||journal.length>100000){const error=new Error('VAT_TOO_MANY_ROWS');error.code=error.message;throw error;}
 const imported=journalVatSources(journal);
 return {sources:[...invoiceVatSources(invoices,period),...imported.sources].sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key)),settlements:imported.settlements};
}
