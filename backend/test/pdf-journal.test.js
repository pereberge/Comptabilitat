import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseJournalPages, extractJournalPdf } from '../src/services/pdf-journal.js';
import { journalPages, journalPdf } from '../test-support/journal-fixture.js';

test('journal adapter preserves source number zero, signed sides, zero rows and changing source names',()=>{
  const result=parseJournalPages(journalPages());
  assert.deepEqual(result.totals,{entries:4,lines:8,accounts:2,debit:'197.00',credit:'197.00',negative_entries:1,zero_entries:1,negative_lines:2,zero_lines:2});
  assert.deepEqual(result.entries.map(entry=>[entry.number,entry.entry_type]),[[0,'opening'],[4,'normal'],[50,'normal'],[196,'closing']]);
  assert.equal(result.entries[1].lines[0].debit,'-1.50');assert.equal(result.entries[1].lines[0].credit,'0.00');
  assert.equal(result.entries[1].lines[0].account_name,'BANCO ANTIGUO');assert.equal(result.accounts[0].description,'BANCO');
  assert.equal(result.has_closing,true);
});
test('journal adapter verifies report carries and an opening entry continuing on another page',()=>{
  const result=parseJournalPages(journalPages(undefined,{split:true}));
  assert.equal(result.entries[0].lines[1].page,2);assert.equal(result.entries[0].debit,'100.00');assert.equal(result.totals.debit,'197.00');
  const broken=journalPages(undefined,{split:true});broken[1].items.find(item=>item.y===695&&item.x===480).text='101,00';
  assert.throws(()=>parseJournalPages(broken),/CARRY_MISMATCH/);
});
test('journal adapter rejects missing rows, incomplete totals, unbalanced and ambiguous columns',()=>{
  for(const [change,code] of [
    [pages=>{pages[0].items.find(item=>item.y===42&&item.x===480).text='198,00';},'REPORT_TOTAL_MISMATCH'],
    [pages=>{pages[0].items.find(item=>item.y===650&&item.x===480).text='101,00';},'ENTRY_TOTAL_MISMATCH'],
    [pages=>{pages[0].items.find(item=>item.y===680&&item.x===480).text='101,00';},'UNBALANCED_ENTRY'],
    [pages=>{pages[0].items=pages[0].items.filter(item=>!(item.y===680&&item.x===30));},'UNBALANCED_ENTRY|UNREAD_ROW'],
    [pages=>{pages[0].items=pages[0].items.filter(item=>item.text!=='Total Informe');},'MISSING_REPORT_TOTAL'],
    [pages=>{pages[0].items.find(item=>item.y===650&&item.x===480).x=535;},'AMBIGUOUS_COLUMNS'],
    [pages=>{pages[0].items.find(item=>item.y===588&&item.text==='Total Asiento').text='Missing';},'MISSING_ENTRY_TOTAL'],
  ]) {const pages=journalPages();change(pages);assert.throws(()=>parseJournalPages(pages),new RegExp(code));}
});
test('journal adapter rejects mixed companies, dates outside the range and duplicate entry numbers',()=>{
  const mixed=journalPages(undefined,{split:true});mixed[1].items.find(item=>item.y===765).text='3 - OTHER COMPANY';assert.throws(()=>parseJournalPages(mixed),/MULTIPLE_CONTEXTS/);
  const invalid=journalPages();invalid[0].items.find(item=>item.y===680&&item.x===30).text='31/12/2024';assert.throws(()=>parseJournalPages(invalid),/DATE_OUTSIDE_RANGE/);
  const duplicate=journalPages();for(const item of duplicate[0].items)if([560,540].includes(item.y)&&item.x===78)item.text='4';assert.throws(()=>parseJournalPages(duplicate),/DUPLICATE_NUMBER/);
});
test('journal PDF extraction validates actual bytes and a multipage synthetic PDF',async()=>{
  const result=await extractJournalPdf(journalPdf('JOURNAL TEST SL',{split:true}));
  assert.equal(result.pages,2);assert.equal(result.totals.lines,8);assert.equal(result.totals.debit,'197.00');
  await assert.rejects(extractJournalPdf(Buffer.from('invalid')),/PDF_JOURNAL_INVALID/);
});
test('provided Nou Fons journal: every page and entry total reconciles',{skip:!process.env.TEST_JOURNAL_PDF},async()=>{
  const result=await extractJournalPdf(readFileSync(process.env.TEST_JOURNAL_PDF));
  assert.equal(result.source_company,'NOU FONS SL');assert.equal(result.pages,21);
  assert.equal(result.totals.entries,197);assert.equal(result.totals.lines,639);assert.equal(result.totals.accounts,87);
  assert.equal(result.totals.debit,'1644224.11');assert.equal(result.totals.credit,'1644224.11');
  assert.deepEqual(result.entries.map(entry=>entry.number).sort((a,b)=>a-b),Array.from({length:197},(_,index)=>index));
  assert.equal(result.totals.negative_lines,6);assert.equal(result.totals.zero_lines,13);assert.equal(result.has_closing,true);
});
