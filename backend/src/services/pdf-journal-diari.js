import {decimal} from '../../../shared/money.js';

const moneyPattern=/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/;
const datePattern=/^\d{2}\/\d{2}\/\d{4}$/;
const fail=code=>{throw new Error('PDF_JOURNAL_'+code);};
const normalized=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
function sourceDate(value){
 if(!datePattern.test(value))fail('INVALID_DATE');
 const [day,month,year]=value.split('/'),date=year+'-'+month+'-'+day,parsed=new Date(date+'T00:00:00Z');
 if(date<'1000-01-01'||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)fail('INVALID_DATE');return date;
}
const amount=value=>{if(!moneyPattern.test(value))fail('INVALID_AMOUNT');return BigInt(value.replace(/\./g,'').replace(',',''));};

// DIARI identifies an entry at its subtotal, by journal code and reference.
// Apunt is the line position, not an entry number; the original identifiers are retained.
export function parseDiariPages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>300)fail('INVALID');
 const entries=[],identities=new Set(),accounts=new Map();let company,year,current=null,totalDebit=0n,totalCredit=0n;
 for(const [index,page]of pages.entries()){
  const items=page.items.filter(item=>typeof(item.text??item.str)==='string'&&(item.text??item.str).trim()).map(item=>({text:(item.text??item.str).trim(),x:item.x??item.transform[4],y:item.y??item.transform[5],width:item.width||0}));
  const header=text=>items.find(item=>item.text===text),dateHeader=header('Data'),numberHeader=header('Apunt Descripció'),codeHeader=header('Subcompte'),nameHeader=header('Descripció subcompte'),debitHeader=header('Deure'),creditHeader=header('Haver');
  if(!items.some(item=>item.text.replace(/\s/g,'')==='DIARI')||!dateHeader||!numberHeader||!codeHeader||!nameHeader||!debitHeader||!creditHeader||!header('EUR'))fail('UNSUPPORTED_LAYOUT');
  const source=items.filter(item=>item.y>dateHeader.y+8&&item.x<400).map(item=>item.text.match(/^(.+?)\s*-(\d{4})-$/)).find(Boolean);
  const pageLabel=items.find(item=>/^Pàgina\s+\d+$/.test(item.text));
  if(!source||!pageLabel||Number(pageLabel.text.match(/\d+$/)[0])!==index+1||(page.page??index+1)!==index+1)fail('PAGE_SEQUENCE');
  if(index&&(source[1].trim()!==company||source[2]!==year))fail('MULTIPLE_CONTEXTS');
  company=source[1].trim();year=source[2];if(company.length>160)fail('UNSUPPORTED_LAYOUT');
  const footers=items.filter(item=>normalized(item.text)==='ROSSEC:');if(footers.length!==1)fail('MISSING_REPORT_TOTAL');
  const footer=footers[0],consumed=new Set(),usedCodes=new Set();
  const cells=items.filter(item=>item.x>=debitHeader.x-50&&item.y<dateHeader.y-4);
  if(cells.some(item=>!moneyPattern.test(item.text)))fail('INVALID_AMOUNT');
  const side=item=>item.x+item.width>creditHeader.x?'credit':'debit';
  function pair(anchor){
   const found=cells.filter(item=>Math.abs(item.y-anchor.y)<1.8),result={};
   for(const cell of found){const key=side(cell);if(result[key]!==undefined)fail('AMBIGUOUS_COLUMNS');result[key]=amount(cell.text);consumed.add(cell);}
   if(found.length!==2||result.debit===undefined||result.credit===undefined)fail('MISSING_TOTAL');return result;
  }
  const dates=items.filter(item=>datePattern.test(item.text)&&Math.abs(item.x-dateHeader.x)<4&&item.y<dateHeader.y-4&&item.y>footer.y+4);
  const subtotals=items.filter(item=>normalized(item.text)==="SUMA DE L'ASSENTAMENT:");
  const events=[...dates.map(item=>({type:'line',item})),...subtotals.map(item=>({type:'total',item})),{type:'footer',item:footer}].sort((a,b)=>b.item.y-a.item.y);
  for(const event of events){
   if(event.type==='footer'){
    const expected=pair(event.item);if(expected.debit!==totalDebit||expected.credit!==totalCredit)fail('REPORT_TOTAL_MISMATCH');continue;
   }
   if(event.type==='total'){
    if(!current)fail('ORPHAN_TOTAL');
    const expected=pair(event.item),row=items.filter(item=>Math.abs(item.y-event.item.y)<1.8);
    const journalLabel=row.find(item=>item.text==='Diari:'),referenceLabel=row.find(item=>item.text==='Referència:');
    if(!journalLabel||!referenceLabel)fail('MISSING_REFERENCE');
    const journal=row.filter(item=>item.x>journalLabel.x+journalLabel.width+2&&item.x<referenceLabel.x-3).map(item=>item.text).join('');
    const reference=row.filter(item=>item.x>referenceLabel.x+referenceLabel.width+2&&item.x<event.item.x-8).map(item=>item.text).join('');
    if(!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(journal)||!/^\d{1,20}$/.test(reference))fail('MISSING_REFERENCE');
    if(identities.has(journal+':'+reference))fail('DUPLICATE_NUMBER');identities.add(journal+':'+reference);
    if(current.debit!==current.credit)fail('UNBALANCED_ENTRY');
    if(expected.debit!==current.debit||expected.credit!==current.credit)fail('ENTRY_TOTAL_MISMATCH');
    if(current.lines.length<2)fail('INVALID_ENTRY');
    const concept=normalized(current.description);
    const type=/^(?:OBERTURA COMPTABLE|ASSENTAMENT D'OBERTURA)/.test(concept)?'opening':/^(?:TANCAMENT COMPTABLE|ASSENTAMENT DE TANCAMENT)/.test(concept)?'closing':/^(?:REGULARITZACIO COMPTABLE|ASSENTAMENT DE REGULARITZACIO)/.test(concept)?'regularization':'normal';
    entries.push({...current,description:current.description||'Diari '+journal+' · Referència '+reference,number:entries.length+1,source_journal_code:journal,source_entry_reference:reference,entry_type:type,debit:decimal(current.debit),credit:decimal(current.credit)});
    if(entries.length>5000)fail('TOO_MANY_ROWS');current=null;continue;
   }
   const row=items.filter(item=>Math.abs(item.y-event.item.y)<0.8).sort((a,b)=>a.x-b.x);
   let parent=row.find(item=>/^[1-9]\d{3}$/.test(item.text)&&Math.abs(item.x-(codeHeader.x-5))<5);
   let left=row.filter(item=>item.x>=numberHeader.x-3&&item.x<codeHeader.x-8);
   if(!parent){
    // The PDF text layer occasionally combines the final description and the account.
    const combined=left.find(item=>/[1-9]\d{3}$/.test(item.text)&&Math.abs(item.x+item.width-(codeHeader.x+10.4))<5);
    if(!combined)fail('INVALID_ROW');parent={text:combined.text.slice(-4)};
    left=left.map(item=>item===combined?{...item,text:item.text.slice(0,-4).trim()}:item);
   }
   const position=left.map(item=>item.text).join(' ').match(/^(\d+)(?:\s+(.*))?$/);
   const dot=row.find(item=>item.text==='.'&&item.x>codeHeader.x+15&&item.x<nameHeader.x-20);
   const suffix=(dot&&row.find(item=>/^\d{4}$/.test(item.text)&&item.x>dot.x&&item.x<nameHeader.x-10))||row.find(item=>/^\.\s*\d{4}$/.test(item.text)&&item.x>codeHeader.x+15&&item.x<nameHeader.x-10);
   const name=row.filter(item=>item.x>=nameHeader.x-2&&item.x<debitHeader.x-50).map(item=>item.text).join(' ');
   const entryDate=sourceDate(event.item.text),description=position?.[2]?.trim()||'';
   if(!position||!suffix||!name||name.length>200||description.length>200||!entryDate.startsWith(year+'-'))fail('INVALID_ROW');
   const lineNumber=Number(position[1]);if(!Number.isSafeInteger(lineNumber)||lineNumber<1||lineNumber>1000)fail('INVALID_ROW');
   if(current&&current.entry_date!==entryDate)fail('MISSING_ENTRY_TOTAL');
   if(!current)current={entry_date:entryDate,description,lines:[],debit:0n,credit:0n};
   if(!current.description&&description)current.description=description;
   if(current.lines.length&&lineNumber<=current.lines.at(-1).source_line_number)fail('LINE_SEQUENCE');
   let debit=0n,credit=0n;const seen=new Set();
   for(const cell of cells.filter(item=>Math.abs(item.y-event.item.y)<0.8)){
    const key=side(cell);if(seen.has(key))fail('AMBIGUOUS_COLUMNS');seen.add(key);if(key==='debit')debit=amount(cell.text);else credit=amount(cell.text);consumed.add(cell);
   }
   if(debit!==0n&&credit!==0n)fail('INVALID_LINE_AMOUNTS');
   if([debit,credit].some(value=>value>999999999999999n||value< -999999999999999n))fail('AMOUNT_LIMIT');
   const code=parent.text+suffix.text.replace(/^[.\s]+/,'');if(!accounts.has(code))accounts.set(code,name);
   usedCodes.add(suffix);
   current.lines.push({code,account_name:name,description,debit:decimal(debit),credit:decimal(credit),page:index+1,source_line_number:lineNumber});
   current.debit+=debit;current.credit+=credit;totalDebit+=debit;totalCredit+=credit;
  }
  if(cells.some(item=>!consumed.has(item)))fail('UNREAD_AMOUNT');
  if(items.some(item=>/^\.?\s*\d{4}$/.test(item.text)&&item.x>codeHeader.x+15&&item.x<nameHeader.x-10&&item.y<dateHeader.y-4&&item.y>footer.y+4&&!usedCodes.has(item)))fail('UNREAD_ROW');
 }
 if(current||!entries.length)fail('INCOMPLETE_REPORT');if(totalDebit!==totalCredit)fail('UNBALANCED_REPORT');
 const lines=entries.flatMap(entry=>entry.lines);if(lines.length>20000)fail('TOO_MANY_ROWS');
 const dates=entries.map(entry=>entry.entry_date).sort();
 return {format:'diari_ca',numbering:'sequential',source_company:company,start_date:year+'-01-01',end_date:year+'-12-31',period_inferred:true,covered_from:dates[0],covered_to:dates.at(-1),pages:pages.length,subaccount_length:8,entries,accounts:[...accounts].map(([code,description])=>({code,description})),
  totals:{entries:entries.length,lines:lines.length,accounts:accounts.size,debit:decimal(totalDebit),credit:decimal(totalCredit),negative_entries:entries.filter(entry=>entry.debit.startsWith('-')).length,zero_entries:entries.filter(entry=>entry.debit==='0.00').length,negative_lines:lines.filter(line=>line.debit.startsWith('-')||line.credit.startsWith('-')).length,zero_lines:lines.filter(line=>line.debit==='0.00'&&line.credit==='0.00').length},
  has_closing:entries.at(-1).entry_type==='closing'&&entries.at(-1).entry_date===year+'-12-31'};
}
