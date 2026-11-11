import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseJournalPages,extractJournalPdf} from '../src/services/pdf-journal.js';
import {diariPages,diariPdf} from '../test-support/diari-fixture.js';

test('DIARI retains journal/reference identities, signed lines, blank concepts and original line gaps',()=>{
 const result=parseJournalPages(diariPages());
 assert.equal(result.format,'diari_ca');assert.equal(result.numbering,'sequential');assert.equal(result.period_inferred,true);
 assert.deepEqual(result.totals,{entries:4,lines:8,accounts:3,debit:'110.84',credit:'110.84',negative_entries:1,zero_entries:1,negative_lines:2,zero_lines:2});
 assert.deepEqual(result.entries.map(entry=>[entry.number,entry.source_journal_code,entry.source_entry_reference]),[[1,'01','1'],[2,'D1','1'],[3,'S1','7'],[4,'D1','9']]);
 assert.equal(result.entries[0].entry_type,'opening');assert.equal(result.entries[1].lines[0].description,'');assert.equal(result.entries[1].lines[1].source_line_number,3);
 assert.equal(result.entries[1].lines[0].debit,'-1.50');assert.equal(result.has_closing,false);assert.equal(result.covered_to,'2026-04-01');
});
test('DIARI reconciles entries across pages and separates text merged with account codes',()=>{
 const result=parseJournalPages(diariPages(undefined,{split:true,merged:true}));
 assert.equal(result.entries[0].lines[1].page,2);assert.equal(result.entries[2].lines[0].code,'57200001');assert.equal(result.entries[2].lines[0].description,'VENTA');
 const hashable=report=>report.entries.map(entry=>({...entry,lines:entry.lines.map(({page,...line})=>line)}));
 assert.deepEqual(hashable(result),hashable(parseJournalPages(diariPages())));
});
test('DIARI rejects truncated, duplicated, unbalanced or ambiguous reports including unread zero lines',()=>{
 for(const [change,error]of[
  [pages=>pages[0].items.find(item=>item.y===44.04&&item.x===470).text='111,84','REPORT_TOTAL_MISMATCH'],
  [pages=>pages[0].items.find(item=>item.y===661.2&&item.x===470).text='101,00','ENTRY_TOTAL_MISMATCH'],
  [pages=>pages[0].items.find(item=>item.y===699.88&&item.x===470).text='101,00','UNBALANCED_ENTRY'],
  [pages=>pages[0].items=pages[0].items.filter(item=>item.text!=='Ròssec:'),'MISSING_REPORT_TOTAL'],
  [pages=>pages[0].items.find(item=>item.text==='Pàgina 1').text='Pàgina 2','PAGE_SEQUENCE'],
  [pages=>pages[0].items.find(item=>item.text==='3').text='1','LINE_SEQUENCE'],
  [pages=>pages[0].items=pages[0].items.filter(item=>!(item.x===47.88&&item.y===460)),'UNREAD_ROW|INVALID_ENTRY'],
  [pages=>{pages[0].items.find(item=>item.text==='S1').text='D1';pages[0].items.find(item=>item.text==='7').text='1';},'DUPLICATE_NUMBER'],
 ]){
  const pages=diariPages();change(pages);
  assert.throws(()=>parseJournalPages(pages),new RegExp(error));
 }
});
test('DIARI retains lowercase journal codes and a single zero line, and recognizes the ARB opening description',()=>{
 const pages=diariPages();
 pages[0].items=pages[0].items.filter(item=>!(item.y>=439&&item.y<=440));
 pages[0].items.find(item=>item.text==='D1'&&item.y<450).text='zz';
 for(const item of pages[0].items)if(item.text.includes('Obertura comptable.'))item.text=item.text.replace('Obertura comptable.','Assentament obertura');
 const result=parseJournalPages(pages);assert.equal(result.entries[0].entry_type,'opening');assert.equal(result.entries.at(-1).source_journal_code,'zz');assert.equal(result.entries.at(-1).lines.length,1);assert.equal(result.totals.debit,'110.84');assert.equal(result.totals.zero_lines,1);
 const broken=diariPages();broken[0].items.find(item=>item.text==='D1').text='bad/code';assert.throws(()=>parseJournalPages(broken),/MISSING_REFERENCE/);
});

test('provided ARB 2024 DIARI reconciles all source entries including zero entries and lowercase journals',{skip:!process.env.TEST_ARB_2024_PDF},async()=>{
 const result=await extractJournalPdf(readFileSync(process.env.TEST_ARB_2024_PDF));
 assert.equal(result.source_company,'P. ARB');assert.equal(result.pages,239);assert.equal(result.start_date,'2024-01-01');assert.equal(result.end_date,'2024-12-31');
 assert.deepEqual(result.totals,{entries:1903,lines:8733,accounts:291,debit:'54815485.08',credit:'54815485.08',negative_entries:45,zero_entries:10,negative_lines:430,zero_lines:5});
 const zero=result.entries.find(entry=>entry.source_journal_code==='C1'&&entry.source_entry_reference==='163');assert.equal(zero.lines.length,1);assert.equal(zero.debit,'0.00');
 assert.ok(result.entries.some(entry=>entry.source_journal_code==='za'));assert.ok(result.entries.some(entry=>entry.source_journal_code==='zz'));assert.equal(result.entries[0].entry_type,'opening');assert.equal(result.has_closing,true);
});

test('DIARI extraction reads actual PDF bytes through PDF.js',async()=>{
 const result=await extractJournalPdf(diariPdf(undefined,{split:true}));assert.equal(result.pages,2);assert.equal(result.totals.debit,'110.84');assert.equal(result.entries[0].lines.length,2);
});
test('provided porcine-production DIARI: all 132 pages and 1091 source entries reconcile',{skip:!process.env.TEST_DIARI_PDF},async()=>{
 const result=await extractJournalPdf(readFileSync(process.env.TEST_DIARI_PDF));
 assert.equal(result.pages,132);assert.equal(result.totals.entries,1091);assert.equal(result.totals.lines,4748);assert.equal(result.totals.accounts,206);
 assert.equal(result.totals.debit,'21898935.47');assert.equal(result.totals.credit,'21898935.47');assert.equal(result.covered_to,'2026-10-22');
 assert.equal(new Set(result.entries.map(entry=>entry.source_journal_code+':'+entry.source_entry_reference)).size,1091);
});
