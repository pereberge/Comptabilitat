import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseJournalPages,extractJournalPdf} from '../src/services/pdf-journal.js';

function fixture(large=false){
 const item=(text,x,y,width=20)=>({text,x,y,width});
 const header=page=>[
  item('PIENSOS ARB S.A.',36,797),item('Fecha:',36,776),item('10/11/26',68,776),item('Página:',499,776),item(String(page),553,777),
  item('LIBRO DIARIO (EURO)',210,752),item('DEL MES 1 AL 12',82,734),
  ...[['ASIENTO',37],['FECHA',86],['CUENTA',124],['DEFINICIÓN',313],['DEBE',475],['HABER',525]].map(([text,x])=>item(text,x,713))
 ];
 const value=large?'11,573,160.89':'100.00',printed=large?'11,573,160.8':'100.00';
 const line=(y,side,number)=>[item('01/01/23',83,y),...(number===undefined?[]:[item(String(number),60,y)]),item('10000001',141,y),item('CAPITAL',182,y),item('ASIENTO DE APERTURA',313,y),item(value,side==='debit'?470:530,y)];
 const first={page:1,items:[...header(1),...line(693,'debit',1325),item(printed+' 0.00',447,26,111)]};
 const second={page:2,items:[...header(2),item('S U M A',79,699),item('A N T E R I O R',124,699),item(printed+' 0.00',447,699,111),...line(679,'credit'),item('TOTAL ASIENTO 1325',313,665),item(printed+' '+printed,447,665,111)]};
 if(!large){
  second.items.push(item('02/01/23',83,640),item('7',60,640),item('57200001',141,640),item('BANCO',182,640),item('ABONO',313,640),item('-1.50',470,640),
   item('02/01/23',83,626),item('43000001',141,626),item('CLIENTE',182,626),item('-1.50',530,626),item('TOTAL ASIENTO 7',313,612),item('-1.50',470,612),item('-1.50',530,612),
   item('31/12/23',83,590),item('2491',57,590),item('46500001REMUNERACIONES',141,590),item('TOTAL ASIENTO 2491',313,576),item('0.00',470,576),item('0.00',530,576));
 }
 const total=large?printed:'98.50';second.items.push(item('TOTAL GENERAL',313,98),item(total+' '+total,447,98,111));return [first,second];
}

test('ARB retains source numbers, opening across pages, signed and zero rows and merged account names',()=>{
 const result=parseJournalPages(fixture());
 assert.equal(result.layout,'arb_diario');assert.equal(result.format,'libro_diario');assert.equal(result.numbering,'source');
 assert.equal(result.source_company,'PIENSOS ARB S.A.');assert.equal(result.start_date,'2023-01-01');assert.equal(result.end_date,'2023-12-31');assert.equal(result.subaccount_length,8);
 assert.deepEqual(result.entries.map(entry=>entry.number),[1325,7,2491]);assert.equal(result.entries[0].entry_type,'opening');assert.equal(result.entries[0].lines[1].page,2);
 assert.equal(result.entries[1].lines[0].debit,'-1.50');assert.equal(result.entries[2].lines[0].account_name,'REMUNERACIONES');assert.equal(result.entries[2].description,'Asiento 2491');
 assert.equal(result.totals.debit,'98.50');assert.equal(result.totals.credit,'98.50');assert.equal(result.totals.zero_lines,1);assert.equal(result.totals.negative_lines,2);assert.equal(result.has_closing,false);
});

test('ARB skips dated concept-only rows but rejects missing accounts carrying amounts or other content',()=>{
 const pages=fixture();pages[1].items.push({text:'01/01/23',x:83,y:672},{text:'TRANSFERENCIA',x:313,y:672});
 const result=parseJournalPages(pages);assert.equal(result.totals.ignored_empty_lines,1);assert.equal(result.totals.lines,5);assert.equal(result.totals.debit,'98.50');
 for(const extra of [{text:'1.00',x:470,y:672},{text:'0.00',x:530,y:672},{text:'UNKNOWN ACCOUNT',x:182,y:672},{text:'123',x:60,y:672}]){
  const broken=structuredClone(pages);broken[1].items.push(extra);assert.throws(()=>parseJournalPages(broken),/UNREAD_ROW/);
 }
 const wrongDate=structuredClone(pages);wrongDate[1].items.find(i=>i.y===672&&i.x===83).text='02/01/23';assert.throws(()=>parseJournalPages(wrongDate),/UNREAD_ROW/);
});

test('ARB omits a genuinely empty zero entry, reserves its number and rejects nonzero or missing totals',()=>{
 const pages=fixture();pages[1].items.push({text:'03/01/23',x:83,y:550},{text:'2338',x:57,y:550},{text:'TOTAL ASIENTO 2338',x:313,y:536},{text:'0.00',x:470,y:536},{text:'0.00',x:530,y:536});
 const result=parseJournalPages(pages);assert.equal(result.totals.ignored_empty_entries,1);assert.equal(result.totals.entries,3);assert.equal(result.totals.debit,'98.50');
 const nonzero=structuredClone(pages);nonzero[1].items.find(i=>i.y===536&&i.x===470).text='1.00';assert.throws(()=>parseJournalPages(nonzero),/ENTRY_TOTAL_MISMATCH/);
 const missing=structuredClone(pages);missing[1].items=missing[1].items.filter(i=>i.y!==536);assert.throws(()=>parseJournalPages(missing),/INCOMPLETE_REPORT/);
 const duplicate=structuredClone(pages);duplicate[1].items.push({text:'04/01/23',x:83,y:510},{text:'2338',x:57,y:510});assert.throws(()=>parseJournalPages(duplicate),/DUPLICATE_NUMBER/);
});

test('ARB validates clipped totals against exact cents from lines without inventing missing digits',()=>{
 const result=parseJournalPages(fixture(true));assert.equal(result.totals.debit,'11573160.89');assert.equal(result.totals.credit,'11573160.89');assert.equal(result.clipped_totals,true);
 const broken=fixture(true);broken[1].items.at(-1).text='11,573,160.7 11,573,160.8';assert.throws(()=>parseJournalPages(broken),/REPORT_TOTAL_MISMATCH/);
});

test('ARB rejects missing rows, carries, invalid totals, duplicate numbers, dates and changed contexts',()=>{
 for(const [change,error]of[
  [pages=>pages[1].items.find(i=>i.text==='100.00 0.00').text='99.00 0.00','CARRY_MISMATCH'],
  [pages=>pages[1].items=pages[1].items.filter(i=>i.y!==679),'UNBALANCED_ENTRY'],
  [pages=>pages[1].items.find(i=>i.text==='100.00 100.00').text='99.00 100.00','ENTRY_TOTAL_MISMATCH'],
  [pages=>pages[1].items.find(i=>i.text==='7').text='1325','DUPLICATE_NUMBER'],
  [pages=>pages[1].items.find(i=>i.text==='2').text='3','PAGE_SEQUENCE'],
  [pages=>pages[1].items[0].text='OTHER COMPANY','MULTIPLE_CONTEXTS'],
  [pages=>pages[1].items.find(i=>i.text==='01/01/23').text='01/01/24','MULTIPLE_CONTEXTS'],
  [pages=>pages[1].items.find(i=>i.text==='02/01/23').text='31/02/23','INVALID_DATE'],
  [pages=>pages[1].items.find(i=>i.text==='-1.50').text='-1,50','INVALID_AMOUNT'],
  [pages=>pages[1].items.find(i=>i.text==='TOTAL ASIENTO 1325').text='TOTAL ASIENTO 1326','MISSING_REFERENCE'],
  [pages=>pages[1].items.splice(-2),'MISSING_REPORT_TOTAL'],
  [pages=>pages[1].items.push({text:'UNEXPECTED',x:100,y:400}),'UNREAD_ROW'],
 ]){const pages=fixture();change(pages);assert.throws(()=>parseJournalPages(pages),new RegExp('PDF_JOURNAL_'+error));}
});

test('provided ARB 2023 PDF reconciles all 223 pages and every source entry',{skip:!process.env.TEST_ARB_PDF},async()=>{
 const result=await extractJournalPdf(readFileSync(process.env.TEST_ARB_PDF));
 assert.equal(result.pages,223);assert.equal(result.source_company,'PIENSOS ARB S.A.');
 assert.deepEqual(result.totals,{entries:2533,lines:7721,accounts:281,debit:'42289206.69',credit:'42289206.69',negative_entries:41,zero_entries:6,negative_lines:248,zero_lines:164});
 assert.equal(result.covered_from,'2023-01-01');assert.equal(result.covered_to,'2023-12-31');assert.equal(result.entries.find(e=>e.number===1325).entry_type,'opening');
 assert.equal(new Set(result.entries.map(e=>e.number)).size,2533);assert.equal(result.clipped_totals,true);
});

test('provided ARB 2017 PDF reconciles all pages and skips only the empty account row in entry 1820',{skip:!process.env.TEST_ARB_2017_PDF},async()=>{
 const result=await extractJournalPdf(readFileSync(process.env.TEST_ARB_2017_PDF));
 assert.equal(result.pages,233);assert.equal(result.start_date,'2017-01-01');assert.equal(result.end_date,'2017-12-31');
 assert.deepEqual(result.totals,{entries:2247,lines:8427,accounts:325,debit:'78840014.56',credit:'78840014.56',negative_entries:8,zero_entries:0,negative_lines:115,zero_lines:95,ignored_empty_lines:1});
 const entry=result.entries.find(e=>e.number===1820);assert.equal(entry.lines.length,2);assert.equal(entry.debit,'14700.00');assert.equal(entry.credit,'14700.00');
});

test('provided ARB 2013 PDF reconciles all pages and omits the empty zero entry 2338',{skip:!process.env.TEST_ARB_2013_PDF},async()=>{
 const result=await extractJournalPdf(readFileSync(process.env.TEST_ARB_2013_PDF));
 assert.equal(result.source_company,'ARB S.A.');assert.equal(result.pages,240);assert.equal(result.start_date,'2013-01-01');assert.equal(result.end_date,'2013-12-31');
 assert.deepEqual(result.totals,{entries:2665,lines:8372,accounts:344,debit:'81869885.67',credit:'81869885.67',negative_entries:7,zero_entries:5,negative_lines:106,zero_lines:84,ignored_empty_entries:1});
 assert.equal(result.entries.some(e=>e.number===2338),false);
});
