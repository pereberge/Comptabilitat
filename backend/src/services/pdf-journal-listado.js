import {decimal} from '../../../shared/money.js';

const moneyPattern=/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;
const datePattern=/^\d{2}\/\d{2}\/\d{4}$/;
const fail=code=>{throw new Error('PDF_JOURNAL_'+code);};
const amount=text=>{if(!moneyPattern.test(text))fail('INVALID_AMOUNT');return BigInt(text.replace(/\./g,'').replace(',',''));};
function date(text){
 if(!datePattern.test(text))fail('INVALID_DATE');const [day,month,year]=text.split('/'),value=year+'-'+month+'-'+day,parsed=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail('INVALID_DATE');return value;
}
const normalized=text=>text.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase();

// LISTADO DEL DIARIO: an entry heading followed by account rows and its own total.
// Entries can span pages; every entry total and the final report total must reconcile.
export function parseListadoJournalPages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>300)fail('INVALID');
 const entries=[],accounts=new Map(),numbers=new Set(),lengths=new Set();let current=null,context,totalDebit=0n,totalCredit=0n,ignoredEmpty=0,reportTotal=false;
 for(const [index,page] of pages.entries()){
  const items=page.items.filter(item=>(item.text??item.str)?.trim()).map(item=>({text:(item.text??item.str).trim(),x:item.x??item.transform[4],y:item.y??item.transform[5],width:item.width||0}));
  const find=text=>items.find(item=>item.text===text),codeHeader=find('CUENTA'),nameHeader=find('NOMBRE'),conceptHeader=find('CONCEPTO'),debitHeader=find('DEBE'),creditHeader=find('HABER');
  if(!find('LISTADO DEL DIARIO')||!codeHeader||!nameHeader||!conceptHeader||!debitHeader||!creditHeader||!(codeHeader.x<nameHeader.x&&nameHeader.x<conceptHeader.x&&conceptHeader.x<debitHeader.x&&debitHeader.x<creditHeader.x)||[nameHeader,conceptHeader,debitHeader,creditHeader].some(item=>Math.abs(item.y-codeHeader.y)>2))fail('UNSUPPORTED_LAYOUT');
  const heading=items.filter(item=>item.y>codeHeader.y+4).map(item=>item.text),company=heading.find(text=>/^EMPRESA:\s*\S/.test(text))?.replace(/^EMPRESA:\s*/,'').trim();
  const start=heading.join(' ').match(/DE FECHA:\s*(\d{2}\/\d{2}\/\d{4})/),end=heading.join(' ').match(/(?:^|\s)A FECHA:\s*(\d{2}\/\d{2}\/\d{4})/);
  if(!company||company.length>160||!start||!end)fail('UNSUPPORTED_LAYOUT');
  const next={source_company:company,start_date:date(start[1]),end_date:date(end[1])};if(next.start_date>next.end_date)fail('INVALID_DATE');
  if(context&&JSON.stringify(context)!==JSON.stringify(next))fail('MULTIPLE_CONTEXTS');context=next;
  const pageLabels=items.filter(item=>item.y<20&&item.x>creditHeader.x&&/^\d+$/.test(item.text));if(pageLabels.length!==1||Number(pageLabels[0].text)!==index+1)fail('INCOMPLETE_REPORT');
  const footers=items.filter(item=>item.text==='Total general:');if(footers.length>1||footers.length&&index!==pages.length-1)fail('MULTIPLE_CONTEXTS');
  if(index===pages.length-1&&footers.length!==1)fail('MISSING_REPORT_TOTAL');
  const footer=footers[0];
  // Text below the explicit final total is outside the ledger (some PDFs retain clipped text there).
  const body=items.filter(item=>item.y<codeHeader.y-4&&item.y>20&&(!footer||item.y>=footer.y-1.5)).sort((a,b)=>b.y-a.y||a.x-b.x),rows=[];
  for(const item of body){const previous=rows.at(-1);if(previous&&previous.y-item.y<=1.4)previous.items.push(item);else rows.push({y:item.y,items:[item]});}
  const pair=row=>{
   const cells=row.filter(item=>item.x+item.width>debitHeader.x-20&&moneyPattern.test(item.text));let debit,credit;
   for(const cell of cells){const side=cell.x+cell.width>(debitHeader.x+creditHeader.x)/2?'credit':'debit';if(side==='credit'){if(credit!==undefined)fail('AMBIGUOUS_COLUMNS');credit=amount(cell.text);}else{if(debit!==undefined)fail('AMBIGUOUS_COLUMNS');debit=amount(cell.text);}}
   if(cells.length!==2||debit===undefined||credit===undefined)fail('MISSING_TOTAL');return {debit,credit,cells};
  };
  for(const physical of rows){
   const row=physical.items.sort((a,b)=>a.x-b.x),entryDate=row.find(item=>item.x<nameHeader.x-10&&datePattern.test(item.text));
   if(entryDate){
    if(current)fail('MISSING_ENTRY_TOTAL');
    const numberCells=row.filter(item=>item.x>=nameHeader.x-4&&item.x<nameHeader.x+70&&/^\d+$/.test(item.text));
    if(numberCells.length!==1)fail('INVALID_ROW');const number=Number(numberCells[0].text);
    if(!Number.isSafeInteger(number)||number<0||number>4294967295)fail('INVALID_ROW');if(numbers.has(number))fail('DUPLICATE_NUMBER');
    const entry_date=date(entryDate.text);if(entry_date<context.start_date||entry_date>context.end_date)fail('DATE_OUTSIDE_RANGE');
    const description=row.filter(item=>item.x>=Math.max(nameHeader.x+65,numberCells[0].x+numberCells[0].width+4)&&item.x<debitHeader.x-20).map(item=>item.text).join(' ');
    if(description.length>200)fail('INVALID_ROW');current={number,entry_date,description,lines:[],debit:0n,credit:0n,source_position:0};continue;
   }
   if(row.some(item=>item.text==='Total asiento:')){
    if(!current)fail('ORPHAN_TOTAL');const expected=pair(row);
    if(current.debit!==current.credit)fail('UNBALANCED_ENTRY');if(current.debit!==expected.debit||current.credit!==expected.credit)fail('ENTRY_TOTAL_MISMATCH');if(current.lines.length<2)fail('INVALID_ENTRY');
    const description=current.description||current.lines.find(line=>line.description)?.description||'Asiento '+current.number,concept=normalized(description);
    const entry_type=/^(?:ASIENTO DE )?APERTURA\b/.test(concept)?'opening':/^(?:ASIENTO DE )?CIERRE\b/.test(concept)?'closing':/^(?:ASIENTO DE )?REGULARIZACION\b/.test(concept)?'regularization':'normal';
    const {source_position,...entry}=current;entries.push({...entry,description,entry_type,debit:decimal(current.debit),credit:decimal(current.credit)});numbers.add(current.number);current=null;if(entries.length>5000)fail('TOO_MANY_ROWS');continue;
   }
   if(row.some(item=>item.text==='Total general:')){
    if(current)fail('MISSING_ENTRY_TOTAL');const expected=pair(row);if(expected.debit!==totalDebit||expected.credit!==totalCredit)fail('REPORT_TOTAL_MISMATCH');reportTotal=true;continue;
   }
   if(!current)fail('UNREAD_ROW');
   if(current.source_position===0&&row.every(item=>item.x>=nameHeader.x+65&&item.x<debitHeader.x-20&&!moneyPattern.test(item.text))){
    current.description=[current.description,...row.map(item=>item.text)].filter(Boolean).join(' ');if(current.description.length>200)fail('INVALID_ROW');continue;
   }
   current.source_position++;
   const code=row.find(item=>item.x<nameHeader.x-10&&/^[1-9]\d{5,19}$/.test(item.text)),values=pair(row);
   if(!code){
    // A genuinely blank account/concept row at 0.00/0.00 has no accounting effect.
    if(values.debit===0n&&values.credit===0n&&row.every(item=>values.cells.includes(item)||item.text==='¨')){ignoredEmpty++;continue;}
    fail('UNREAD_ROW');
   }
   const account_name=row.filter(item=>item.x>=nameHeader.x-3&&item.x<conceptHeader.x-3).map(item=>item.text).join(' '),description=row.filter(item=>item.x>=conceptHeader.x-3&&item.x<debitHeader.x-40).map(item=>item.text).join(' ');
   if(!account_name||account_name.length>200||description.length>200)fail('INVALID_ROW');
   if(values.debit!==0n&&values.credit!==0n)fail('INVALID_LINE_AMOUNTS');
   if([values.debit,values.credit].some(value=>value>999999999999999n||value< -999999999999999n))fail('AMOUNT_LIMIT');
   current.lines.push({code:code.text,account_name,description,debit:decimal(values.debit),credit:decimal(values.credit),page:index+1,source_line_number:current.source_position});
   current.debit+=values.debit;current.credit+=values.credit;totalDebit+=values.debit;totalCredit+=values.credit;
   lengths.add(code.text.length);if(!accounts.has(code.text))accounts.set(code.text,account_name);if(current.lines.length>1000)fail('TOO_MANY_ROWS');
  }
 }
 if(current||!reportTotal||!entries.length)fail('INCOMPLETE_REPORT');if(totalDebit!==totalCredit)fail('UNBALANCED_REPORT');if(lengths.size!==1)fail('MIXED_ACCOUNT_LENGTHS');
 const allLines=entries.flatMap(entry=>entry.lines);if(allLines.length>20000)fail('TOO_MANY_ROWS');
 return {...context,format:'libro_diario',layout:'listado_diario',numbering:'source',pages:pages.length,subaccount_length:[...lengths][0],entries,accounts:[...accounts].map(([code,description])=>({code,description})),covered_from:entries.map(entry=>entry.entry_date).sort()[0],covered_to:entries.map(entry=>entry.entry_date).sort().at(-1),
  totals:{entries:entries.length,lines:allLines.length,accounts:accounts.size,debit:decimal(totalDebit),credit:decimal(totalCredit),negative_entries:entries.filter(entry=>entry.debit.startsWith('-')).length,zero_entries:entries.filter(entry=>entry.debit==='0.00').length,negative_lines:allLines.filter(line=>line.debit.startsWith('-')||line.credit.startsWith('-')).length,zero_lines:allLines.filter(line=>line.debit==='0.00'&&line.credit==='0.00').length,ignored_empty_lines:ignoredEmpty},has_closing:entries.at(-1).entry_type==='closing'&&entries.at(-1).entry_date===context.end_date};
}
