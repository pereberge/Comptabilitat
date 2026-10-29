import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseJournalPages,extractJournalPdf} from '../src/services/pdf-journal.js';
import {listadoPages} from '../test-support/journal-listado-fixture.js';
import {journalPagesPdf} from '../test-support/journal-fixture.js';

test('LISTADO preserves source numbers, wrapped headings, signed sides and page continuations',()=>{
 const source=parseJournalPages(listadoPages());
 assert.equal(source.layout,'listado_diario');assert.equal(source.subaccount_length,10);assert.equal(source.pages,2);
 assert.deepEqual(source.totals,{entries:3,lines:6,accounts:2,debit:'98.50',credit:'98.50',negative_entries:1,zero_entries:1,negative_lines:2,zero_lines:2,ignored_empty_lines:1});
 assert.deepEqual(source.entries.map(entry=>entry.number),[2026000000,2026000040,2026000042]);
 assert.equal(source.entries[0].entry_type,'opening');assert.equal(source.entries[0].lines[1].page,2);assert.equal(source.has_closing,false);
 assert.equal(source.entries[1].description,'RECTIFICACION FACTURA');assert.equal(source.entries[1].lines[0].debit,'-1.50');
 assert.equal(source.entries[1].lines[0].account_name,'BANCO ANTIGUO');assert.equal(source.accounts[0].description,'BANCO');
 assert.equal(source.entries[1].lines[1].source_line_number,3);assert.equal(source.entries[1].source_journal_code,undefined);
});

test('LISTADO rejects missing financial rows, changed totals, missing pages and mixed contexts',()=>{
 for(const [change,error] of [
  [pages=>{pages[1].items.find(item=>item.y===60&&item.x===455).text='99,00';},'REPORT_TOTAL_MISMATCH'],
  [pages=>{pages[1].items.find(item=>item.y===724&&item.x===455).text='99,00';},'ENTRY_TOTAL_MISMATCH'],
  [pages=>{pages[0].items.find(item=>item.y===724&&item.x===455).text='99,00';},'UNBALANCED_ENTRY'],
  [pages=>{pages[0].items=pages[0].items.filter(item=>!(item.y===724&&item.x===23.2));},'UNREAD_ROW'],
  [pages=>{pages[1].items.find(item=>item.y===654&&item.x===455).text='1,00';},'UNREAD_ROW'],
  [pages=>{pages[1].items.push({text:'UNKNOWN ACCOUNT',x:80.7,y:654,width:40});},'UNREAD_ROW'],
  [pages=>{pages[1].items=pages[1].items.filter(item=>item.text!=='Total general:');},'MISSING_REPORT_TOTAL'],
  [pages=>{pages[1].items.find(item=>item.y===13).text='3';},'INCOMPLETE_REPORT'],
  [pages=>{pages[1].items.find(item=>item.text.startsWith('EMPRESA:')).text='EMPRESA: OTHER SL';},'MULTIPLE_CONTEXTS'],
  [pages=>{pages[0].items.find(item=>item.text==='01/01/2026').text='31/12/2025';},'DATE_OUTSIDE_RANGE'],
  [pages=>{pages[1].items.find(item=>item.text==='2026000040').text='2026000000';},'DUPLICATE_NUMBER'],
  [pages=>{pages[0].items.find(item=>item.text==='5720000001').text='57200001';},'MIXED_ACCOUNT_LENGTHS'],
 ]){const pages=listadoPages();change(pages);assert.throws(()=>parseJournalPages(pages),new RegExp(error));}
});

test('LISTADO synthetic PDF is detected through the real byte extraction path',async()=>{
 const source=await extractJournalPdf(journalPagesPdf(listadoPages()));
 assert.equal(source.layout,'listado_diario');assert.equal(source.totals.debit,'98.50');assert.equal(source.totals.lines,6);
});

test('provided LISTADO journal reconciles every entry and the printed final total',{skip:!process.env.TEST_LISTADO_JOURNAL_PDF},async()=>{
 const source=await extractJournalPdf(readFileSync(process.env.TEST_LISTADO_JOURNAL_PDF));
 assert.equal(source.pages,144);assert.equal(source.totals.entries,1989);assert.equal(source.totals.lines,6472);assert.equal(source.totals.accounts,419);
 assert.equal(source.totals.debit,'15185874.20');assert.equal(source.totals.credit,'15185874.20');assert.equal(source.totals.ignored_empty_lines,9);
 assert.equal(source.subaccount_length,10);assert.equal(source.has_closing,false);
});
