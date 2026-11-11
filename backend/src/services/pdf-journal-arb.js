import {decimal} from '../../../shared/money.js';

const fail=code=>{throw new Error('PDF_JOURNAL_'+code);};
const money=/^-?(?:\d{1,3}(?:,\d{3})*|\d+)\.\d{2}$/;
const datePattern=/^\d{2}\/\d{2}\/\d{2}$/;
const amount=text=>{if(!money.test(text))fail('INVALID_AMOUNT');return BigInt(text.replace(/,/g,'').replace('.',''));};
function date(text){
 const [day,month,shortYear]=text.split('/'),value='20'+shortYear+'-'+month+'-'+day,parsed=new Date(value+'T00:00:00Z');
 if(!datePattern.test(text)||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail('INVALID_DATE');return value;
}
const display=value=>decimal(value).replace(/\B(?=(\d{3})+\.)/g,',');
// ARB prints cumulative amounts in 12-character fields, clipping the last cent
// above 10 million. Compare the printed prefix; line amounts remain exact.
function matchesTotal(text,value){
 const expected=display(value);
 return text===expected||(expected.length>12&&text.length===12&&/^\-?[\d,]+\.\d$/.test(text)&&text===expected.slice(0,12));
}

export function parseArbJournalPages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>300)fail('INVALID');
 const entries=[],accounts=new Map(),numbers=new Set(),lengths=new Set();
 let company,year,current=null,totalDebit=0n,totalCredit=0n,reportTotal=false,clippedTotals=false,ignoredEmpty=0,ignoredEntries=0;
 for(const [index,page]of pages.entries()){
  const items=page.items.filter(item=>(item.text??item.str)?.trim()).map(item=>({text:(item.text??item.str).trim(),x:item.x??item.transform[4],y:item.y??item.transform[5],width:item.width||0}));
  const find=text=>items.find(item=>item.text===text),header=find('FECHA');
  if(!header||!['LIBRO DIARIO (EURO)','ASIENTO','CUENTA','DEFINICIÓN','DEBE','HABER','DEL MES 1 AL 12'].every(find)||Math.abs(header.x-86)>4||Math.abs(find('CUENTA').x-124)>4||Math.abs(find('DEFINICIÓN').x-313)>4||Math.abs(find('DEBE').x-475)>4||Math.abs(find('HABER').x-525)>4)fail('UNSUPPORTED_LAYOUT');
  const source=items.filter(item=>item.y>header.y+70&&item.x<45);
  const nextCompany=source.find(item=>item.text!=='Fecha:')?.text;
  const pageLabel=find('Página:'),pageNumber=pageLabel&&items.filter(item=>Math.abs(item.y-pageLabel.y)<2&&item.x>pageLabel.x+35&&/^\d+$/.test(item.text));
  if(!pageNumber||pageNumber.length!==1||Number(pageNumber[0].text)!==index+1||(page.page??index+1)!==index+1)fail('PAGE_SEQUENCE');
  if(!nextCompany||nextCompany.length>160)fail('UNSUPPORTED_LAYOUT');if(company&&company!==nextCompany)fail('MULTIPLE_CONTEXTS');company=nextCompany;
  const body=items.filter(item=>item.y<header.y-4&&item.y>20).sort((a,b)=>b.y-a.y||a.x-b.x),rows=[];
  for(const item of body){const row=rows.at(-1);if(row&&Math.abs(row.y-item.y)<1.5)row.items.push(item);else rows.push({y:item.y,items:[item]});}
  let carrySeen=false,footerSeen=false;
  function checkCumulative(row,code,debit=totalDebit,credit=totalCredit){
   const cells=row.filter(item=>item.x>440),values=cells.flatMap(item=>item.text.split(/\s+/));
   if(values.length!==2)fail('MISSING_TOTAL');
   if(cells.length===2&&(cells[0].x+cells[0].width>520||cells[1].x+cells[1].width<=520))fail('AMBIGUOUS_COLUMNS');
   if(cells.length===1&&(cells[0].x>460||cells[0].x+cells[0].width<550))fail('AMBIGUOUS_COLUMNS');
   if(!matchesTotal(values[0],debit)||!matchesTotal(values[1],credit))fail(code);
   if(values.some(value=>!money.test(value)))clippedTotals=true;
  }
  function pair(row){
   const result={debit:0n,credit:0n},seen=new Set();
   for(const item of row.filter(item=>item.x>440)){
    const side=item.x+item.width>520?'credit':'debit';if(seen.has(side))fail('AMBIGUOUS_COLUMNS');seen.add(side);result[side]=amount(item.text);
   }
   return {...result,count:seen.size};
  }
  for(const [position,physical]of rows.entries()){
   const row=physical.items.sort((a,b)=>a.x-b.x),text=row.filter(item=>item.x<440).map(item=>item.text).join(' ');
   if(text.replace(/\s/g,'')==='SUMAANTERIOR'){
    if(index===0||position!==0||carrySeen)fail('CARRY_MISMATCH');checkCumulative(row,'CARRY_MISMATCH');carrySeen=true;continue;
   }
   if(index>0&&!carrySeen)fail('CARRY_MISMATCH');
   if(text==='TOTAL GENERAL'){
    if(index!==pages.length-1||position!==rows.length-1||current||reportTotal)fail('INCOMPLETE_REPORT');checkCumulative(row,'REPORT_TOTAL_MISMATCH');reportTotal=true;footerSeen=true;continue;
   }
   if(!text){
    if(index===pages.length-1||position!==rows.length-1||physical.y>30)fail('UNREAD_AMOUNT');checkCumulative(row,'REPORT_TOTAL_MISMATCH');footerSeen=true;continue;
   }
   const subtotal=text.match(/^TOTAL ASIENTO (\d+)$/);
   if(subtotal){
    if(!current)fail('ORPHAN_TOTAL');if(Number(subtotal[1])!==current.number)fail('MISSING_REFERENCE');
    if(current.debit!==current.credit)fail('UNBALANCED_ENTRY');checkCumulative(row,'ENTRY_TOTAL_MISMATCH',current.debit,current.credit);
    if(!current.lines.length){numbers.add(current.number);ignoredEntries++;current=null;continue;}
    if(!current.lines.length||(current.lines.length===1&&(current.lines[0].debit!=='0.00'||current.lines[0].credit!=='0.00')))fail('INVALID_ENTRY');
    if(!current.description)current.description='Asiento '+current.number;
    const concept=current.description.normalize('NFD').replace(/\p{M}/gu,'').toUpperCase();
    const entry_type=/^ASIENTO DE APERTURA\b/.test(concept)?'opening':/^ASIENTO DE CIERRE\b/.test(concept)?'closing':/^ASIENTO DE REGULARIZACION\b/.test(concept)?'regularization':'normal';
    entries.push({...current,entry_type,debit:decimal(current.debit),credit:decimal(current.credit)});numbers.add(current.number);current=null;if(entries.length>5000)fail('TOO_MANY_ROWS');continue;
   }
   // PDF.js may join an eight-digit account and its name on zero-amount rows.
   const merged=row.find(item=>Math.abs(item.x-141)<4&&/^[1-9]\d{7}[^\d\s]/.test(item.text));
   if(merged){row.push({text:merged.text.slice(8),x:182,y:merged.y,width:0});merged.text=merged.text.slice(0,8);}
   const dateCell=row.find(item=>Math.abs(item.x-83)<4&&datePattern.test(item.text)),code=row.find(item=>Math.abs(item.x-141)<4&&/^[1-9]\d{5,19}$/.test(item.text));
   // Some source entries include a dated concept-only row, with no account or
   // amount. It has no accounting effect; never skip a row carrying money.
   if(dateCell&&!code&&current&&date(dateCell.text)===current.entry_date&&row.every(item=>item===dateCell||(item.x>=310&&item.x<440))){ignoredEmpty++;continue;}
   if(!code&&!(row.length===2&&dateCell&&row.some(item=>item.x<80&&/^\d+$/.test(item.text))))fail('UNREAD_ROW');
   if(!dateCell)fail('UNREAD_ROW');
   const entryDate=date(dateCell.text),nextYear=entryDate.slice(0,4);if(year&&year!==nextYear)fail('MULTIPLE_CONTEXTS');year=nextYear;
   const numberCells=row.filter(item=>item.x<80&&/^\d+$/.test(item.text));if(numberCells.length>1)fail('INVALID_ROW');
   if(numberCells.length){
    if(current)fail('MISSING_ENTRY_TOTAL');const number=Number(numberCells[0].text);if(!Number.isSafeInteger(number)||number<0||number>4294967295)fail('INVALID_ROW');if(numbers.has(number))fail('DUPLICATE_NUMBER');
    current={number,entry_date:entryDate,description:'',lines:[],debit:0n,credit:0n};
   }
   if(!current||current.entry_date!==entryDate)fail('INVALID_ROW');
   // A source entry may consist only of its dated number and a zero subtotal.
   // Keep its identity reserved, but do not invent account lines for it.
   if(!code&&numberCells.length===1&&row.every(item=>item===dateCell||item===numberCells[0]))continue;
   if(!code)fail('UNREAD_ROW');
   const account_name=row.filter(item=>item.x>=180&&item.x<310).map(item=>item.text).join(' '),description=row.filter(item=>item.x>=310&&item.x<440).map(item=>item.text).join(' ');
   if(!account_name||account_name.length>200||description.length>200)fail('INVALID_ROW');if(!current.description)current.description=description;
   const values=pair(row);if(values.debit!==0n&&values.credit!==0n)fail('INVALID_LINE_AMOUNTS');if([values.debit,values.credit].some(value=>value>999999999999999n||value< -999999999999999n))fail('AMOUNT_LIMIT');
   current.lines.push({code:code.text,account_name,description,debit:decimal(values.debit),credit:decimal(values.credit),page:index+1});
   current.debit+=values.debit;current.credit+=values.credit;totalDebit+=values.debit;totalCredit+=values.credit;
   lengths.add(code.text.length);if(!accounts.has(code.text))accounts.set(code.text,account_name);if(current.lines.length>1000)fail('TOO_MANY_ROWS');
  }
  if(!footerSeen)fail('MISSING_REPORT_TOTAL');
 }
 if(current||!entries.length||!reportTotal)fail('INCOMPLETE_REPORT');if(totalDebit!==totalCredit)fail('UNBALANCED_REPORT');if(lengths.size!==1)fail('MIXED_ACCOUNT_LENGTHS');
 const lines=entries.flatMap(entry=>entry.lines);if(lines.length>20000)fail('TOO_MANY_ROWS');
 const dates=entries.map(entry=>entry.entry_date).sort();
 return {format:'libro_diario',layout:'arb_diario',numbering:'source',source_company:company,start_date:year+'-01-01',end_date:year+'-12-31',period_inferred:true,covered_from:dates[0],covered_to:dates.at(-1),pages:pages.length,subaccount_length:[...lengths][0],entries,accounts:[...accounts].map(([code,description])=>({code,description})),clipped_totals:clippedTotals,
  totals:{entries:entries.length,lines:lines.length,accounts:accounts.size,debit:decimal(totalDebit),credit:decimal(totalCredit),negative_entries:entries.filter(entry=>entry.debit.startsWith('-')).length,zero_entries:entries.filter(entry=>entry.debit==='0.00').length,negative_lines:lines.filter(line=>line.debit.startsWith('-')||line.credit.startsWith('-')).length,zero_lines:lines.filter(line=>line.debit==='0.00'&&line.credit==='0.00').length,...(ignoredEmpty?{ignored_empty_lines:ignoredEmpty}:{}),...(ignoredEntries?{ignored_empty_entries:ignoredEntries}:{})},has_closing:entries.at(-1).entry_type==='closing'&&entries.at(-1).entry_date===year+'-12-31'};
}
