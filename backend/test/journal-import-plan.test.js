import test from 'node:test';
import assert from 'node:assert/strict';
import {buildJournalImportPlan,describeJournalImportPlan} from '../src/services/journal-import-plan.js';

const line=(code,debit,credit,description='Movement')=>({code,debit,credit,description});
const sourceEntry=(number,value='10.00')=>({number,entry_date:'2026-09-29',description:'Receipt',entry_type:'normal',
 lines:[line('57200001',value,'0.00'),line('43000001','0.00',value)]});
const stored=(entry,id=10)=>({...entry,id,import_id:3,status:'posted',lines:undefined});
const storedLines=(entry,id=10)=>entry.lines.map((row,index)=>({...row,entry_id:id,position:index+1,id:id*10+index}));
test('journal updates identify changed entries, new entries and retained entries without merging lines',()=>{
 const original=sourceEntry(1904),retained=sourceEntry(1905);
 const plan=buildJournalImportPlan({entries:[sourceEntry(1904,'20.00'),sourceEntry(1906)]},
  [stored(original),stored(retained,11)],[...storedLines(original),...storedLines(retained,11)]);
 assert.deepEqual(plan.summary,{added:1,updated:1,unchanged:0,retained:1});
 assert.equal(plan.items[0].current.id,10);assert.equal(plan.items[0].source.lines.length,2);
});
test('page changes and aliases preserve unchanged accounting identity, signed amounts and zero lines',()=>{
 const entry=sourceEntry(0,'-1.50');entry.lines.push(line('57200001','0.00','0.00',''));
 const plan=buildJournalImportPlan({entries:[entry]},[stored(entry)],storedLines(entry).map(row=>({...row,source_page:9,source_account_name:'Old alias'})));
 assert.equal(plan.summary.unchanged,1);assert.equal(plan.items[0].current.id,10);
});
test('DIARI matches journal and reference, retaining numbers when source order changes',()=>{
 const a={...sourceEntry(1),source_journal_code:'S1',source_entry_reference:'7'},b={...sourceEntry(2),source_journal_code:'D1',source_entry_reference:'7'};
 const c={...sourceEntry(2),source_journal_code:'S1',source_entry_reference:'8'};
 const plan=buildJournalImportPlan({numbering:'sequential',entries:[{...b,number:1},c,{...a,number:3}]},
  [stored(a),stored(b,11)],[...storedLines(a),...storedLines(b,11)]);
 assert.deepEqual(plan.items.map(item=>item.number),[2,3,1]);assert.equal(plan.summary.unchanged,2);
});
test('manual, cancelled and linked entries cannot be overwritten by an import',()=>{
 const original=sourceEntry(1904),changed={entries:[sourceEntry(1904,'20.00')]},lines=storedLines(original);
 for(const extra of [{import_id:null},{status:'cancelled'},{linked_document:1},{exercise_operation_id:4}]){
  assert.throws(()=>buildJournalImportPlan(changed,[{...stored(original),...extra}],lines),error=>/^JOURNAL_ENTRY_(CONFLICT|PROTECTED)$/.test(error.code));
 }
 assert.throws(()=>buildJournalImportPlan({entries:[original]},[{...stored(original),status:'cancelled'}],lines),error=>error.code==='JOURNAL_ENTRY_PROTECTED');
});

test('change details show exact header, account and amount changes without returning unchanged entries',()=>{
 const previous=sourceEntry(1904),same=sourceEntry(1905),next={...sourceEntry(1904,'20.00'),entry_date:'2026-09-30',description:'Corrected receipt'};
 next.lines[0].code='57200002';
 const plan=buildJournalImportPlan({entries:[next,same,sourceEntry(1906)]},
  [stored(previous),stored(same,11)],[...storedLines(previous),...storedLines(same,11)]);
 const details=describeJournalImportPlan(plan);
 assert.deepEqual(details.map(item=>[item.number,item.action]),[[1904,'updated'],[1906,'added']]);
 assert.deepEqual(details[0].changed_fields,['entry_date','description','lines']);
 assert.equal(details[0].before.entry_date,'2026-09-29');assert.equal(details[0].after.entry_date,'2026-09-30');
 assert.equal(details[0].before.description,'Receipt');assert.equal(details[0].after.description,'Corrected receipt');
 assert.equal(details[0].before.totals.debit,'10.00');assert.equal(details[0].after.totals.debit,'20.00');
 assert.equal(details[0].before.lines[0].code,'57200001');assert.equal(details[0].after.lines[0].code,'57200002');
 assert.equal(details[0].before.lines[0].change,'removed');assert.equal(details[0].after.lines[0].change,'added');
 assert.equal(details[1].before,null);assert.ok(details[1].after.lines.every(row=>row.change==='added'));
 assert.equal(previous.lines[0].change,undefined);assert.equal(next.lines[0].change,undefined);
});

test('duplicate removal is shown with multiplicity: four copies become one and six lines are removed',()=>{
 const previous=sourceEntry(1904,'5525.43');previous.lines=previous.lines.flatMap(row=>Array.from({length:4},()=>({...row})));
 const plan=buildJournalImportPlan({entries:[sourceEntry(1904,'5525.43')]},[stored(previous)],storedLines(previous));
 const [details]=describeJournalImportPlan(plan);
 assert.equal(details.before.totals.debit,'22101.72');assert.equal(details.after.totals.debit,'5525.43');
 assert.equal(details.before.totals.lines,8);assert.equal(details.after.totals.lines,2);
 assert.equal(details.before.lines.filter(row=>row.change==='removed').length,6);
 assert.ok(details.after.lines.every(row=>row.change==='unchanged'));
 assert.equal(details.line_order_changed,false);
});

test('detail totals preserve signed, zero and large imported amounts exactly',()=>{
 const previous=sourceEntry(1),next=sourceEntry(1);
 next.lines=Array.from({length:10},()=>line('57200001','9999999999999.99','0.00'));
 next.lines.push(line('57200001','-1.50','0.00',''),line('57200001','0.00','0.00',''),
  ...Array.from({length:10},()=>line('43000001','0.00','9999999999999.99')),line('43000001','0.00','-1.50',''));
 const [details]=describeJournalImportPlan(buildJournalImportPlan({entries:[next]},[stored(previous)],storedLines(previous)));
 assert.equal(details.after.totals.debit,'99999999999998.40');assert.equal(details.after.totals.credit,'99999999999998.40');
 assert.equal(details.after.lines[10].debit,'-1.50');assert.equal(details.after.lines[11].description,'');
 assert.equal(details.after.lines[11].debit,'0.00');
});

test('reordering lines is distinguished from changed accounts or amounts',()=>{
 const previous=sourceEntry(1),next={...previous,lines:[...previous.lines].reverse()};
 const [details]=describeJournalImportPlan(buildJournalImportPlan({entries:[next]},[stored(previous)],storedLines(previous)));
 assert.equal(details.line_order_changed,true);assert.deepEqual(details.changed_fields,['lines']);
 assert.ok([...details.before.lines,...details.after.lines].every(row=>row.change==='unchanged'));
 assert.deepEqual(describeJournalImportPlan(buildJournalImportPlan({entries:[previous]},[stored(previous)],storedLines(previous))),[]);
});

test('DIARI detail reports the number that will actually be assigned to a new reference',()=>{
 const old={...sourceEntry(12),source_journal_code:'S1',source_entry_reference:'7'},next={...sourceEntry(1),source_journal_code:'S1',source_entry_reference:'8'};
 const [details]=describeJournalImportPlan(buildJournalImportPlan({numbering:'sequential',entries:[next]},[stored(old)],storedLines(old)));
 assert.equal(details.number,13);assert.equal(details.after.source_journal_code,'S1');assert.equal(details.after.source_entry_reference,'8');
});
