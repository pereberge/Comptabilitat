import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBankAnalysis } from '../src/services/bank-analysis.js';
import { validateBankRows } from '../src/services/bank-statement.js';
import {matchPendingInvoices} from '../src/services/bank-invoice-matches.js';
const account={id:1,code:'57200001',kind:'subaccount',description:'Bank'},fee={id:2,code:'62600001',kind:'subaccount',description:'Bank fees'};
const line=(id,date,debit,credit,description='Test',type='normal')=>({entry_id:id,number:id,position:1,exercise_id:1,entry_date:date,status:'posted',entry_type:type,code:account.code,debit,credit,description});
const row=(id,date,concept,amount,balance)=>({id,date,value_date:date,page:1,concept,amount,balance});
test('daily anchors accept up to three cents in both directions and preserve the real difference',()=>{
 for(const [book,accepted]of [['100.00',true],['100.03',true],['99.97',true],['100.04',false],['99.96',false]]){
  const data=build([row(1,'2026-02-10','Transfer','100.00','100.00'),row(2,'2026-02-25','MANTENIMENT','-10.00','90.00')],[line(1,'2026-02-10',book,'0.00')]);
  assert.equal(data.scope.last_matching_date,accepted?'2026-02-10':null,book);
  if(accepted){assert.equal(data.scope.last_matching_book_balance,book);assert.equal(data.scope.balance_match_tolerance,'0.03');assert.deepEqual(data.scope.bank_pending.map(row=>row.id),[2]);assert.equal(data.current_book_balance,book);}
  if(book==='100.03'){assert.equal(data.scope.balance_match_difference,'0.03');assert.equal(data.projected_balance,'90.03');assert.equal(data.scope.opening_difference_bank_minus_book,'-0.03');}
 }
});
test('the ledger resumes after its earlier anchor and links later movements within ten days',()=>{
 const data=build([row(1,'2026-03-20','Transfer','100.00','100.00'),row(2,'2026-03-25','Payment supplier','-20.00','80.00')],[line(1,'2026-03-10','100.03','0.00'),line(2,'2026-03-15','0.00','20.00','Payment supplier')]);
 assert.equal(data.scope.last_matching_date,'2026-03-25');assert.equal(data.scope.last_matching_book_date,'2026-03-25');
 // A separate unmatched entry prevents the final balance from becoming a later anchor.
 const withExtra=build([row(1,'2026-03-20','Transfer','100.00','100.00'),row(2,'2026-03-25','Payment supplier','-20.00','80.00')],[line(1,'2026-03-10','100.03','0.00'),line(2,'2026-03-15','0.00','20.00','Payment supplier'),line(3,'2026-03-15','5.00','0.00','Extra')]);
 assert.equal(withExtra.scope.last_matching_book_date,'2026-03-10');assert.equal(withExtra.scope.book_analysis_start_date,'2026-03-11');
 assert.deepEqual(withExtra.scope.matched_movements.map(row=>row.entry_id),[2]);assert.deepEqual(withExtra.book_unmatched.map(row=>row.entry_id),[3]);
});
test('pending invoice relations require exact totals with date or text evidence and stay proposals',()=>{
 const invoices=[{id:10,version:1,title:'Invoice',source_name:'invoice.pdf',direction:'received',extraction:{total_amount:'10.00',invoice_date:'2026-05-01',due_date:'2026-05-20',reference:'INV-1234',supplier:{name:'Provider Supplies'},currency:'EUR'}},{id:11,version:1,title:'Other',direction:'received',extraction:{total_amount:'10.00',invoice_date:'2026-05-20',supplier:{name:'Another'},currency:'EUR'}}];
 const matches=matchPendingInvoices([row(1,'2026-05-30','Payment','-10.00','90.00'),row(2,'2026-05-31','Payment','-10.00','80.00'),row(3,'2026-07-01','INV-1234 Provider Supplies','-10.00','70.00'),row(4,'2026-05-20','Payment','10.00','80.00'),row(5,'2026-05-20','Payment','-10.01','69.99')],invoices);
 assert.deepEqual(matches.map(row=>row.movement_id),[1,3]);assert.equal(matches[0].ambiguous,true);assert.equal(matches[1].candidates[0].documentation_id,10);
 const data=build([row(1,'2026-05-01','Opening','100.00','100.00'),row(2,'2026-05-20','MANTENIMENT','-10.00','90.00')],[line(1,'2026-05-01','100.00','0.00')],[],[account,fee],invoices);
 assert.equal(data.pending_invoice_matches.length,1);assert.equal(data.pending_invoice_matches[0].movement_id,2);assert.equal(data.proposals.length,0);assert.match(data.unresolved[0].reason,/Documentación/);
});
function build(rows,lines=[],history=lines,accounts=[account,fee],pendingInvoices=[]){
 const statement=validateBankRows(rows,{bank:{name:'Test bank',iban_masked:''},pages:1,mime:'text/csv'});
 return buildBankAnalysis({company:{id:1,name:'Test'},exercise:{id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'},account,statement,lines,history,accounts,pendingInvoices,sourceName:'statement.csv',sourceHash:'a'.repeat(64)});
}
test('reconciliation starts at the latest coincident daily balance and keeps loans unresolved',()=>{
 const data=build([row(1,'2026-01-02','Transfer','50.00','150.00'),row(2,'2026-01-03','MANTENIMENT','-10.00','140.00'),row(3,'2026-01-04','PRES.123456789','-20.00','120.00')],
  [line(1,'2026-01-01','100.00','0.00','Opening','opening'),line(2,'2026-01-02','50.00','0.00')]);
 assert.equal(data.scope.last_matching_date,'2026-01-02');assert.equal(data.scope.bank_pending.length,2);
 assert.equal(data.proposals.length,1);assert.equal(data.proposals[0].lines[0].code,fee.code);
 assert.equal(data.projected_balance,'140.00');assert.equal(data.unresolved_difference_book_minus_bank,'20.00');
 assert.equal(data.unresolved.length,1);assert.match(data.unresolved[0].reason,/capital, intereses/);assert.equal(data.posted,false);
});
test('no coincident date: preserve initial gap, match existing payment and do not invent opening',()=>{
 const data=build([row(1,'2026-01-02','PRES.123456789','-10.00','90.00'),row(2,'2026-01-03','Transfer','50.00','140.00')],[line(1,'2026-01-03','50.00','0.00')]);
 assert.equal(data.scope.last_matching_date,null);assert.equal(data.scope.opening_difference_bank_minus_book,'100.00');
 assert.equal(data.scope.matched_movements.length,1);assert.equal(data.scope.bank_pending.length,1);assert.equal(data.proposals.length,0);assert.equal(data.reconciliation_status,'needs_review');
});
test('ambiguous duplicate amount and date do not produce a false match',()=>{
 const data=build([row(1,'2026-01-03','Transfer','10.00','10.00')],[line(1,'2026-01-03','10.00','0.00'),line(2,'2026-01-03','10.00','0.00')]);
 assert.equal(data.scope.matched_movements.length,0);assert.equal(data.book_unmatched.length,2);assert.equal(data.unresolved.length,1);
});
test('prior user criterion takes precedence over generic fees and handles refunds',()=>{
 const previous=line(5,'2025-12-01','0.00','10.00','COMISION CUSTODIA');
 const history=[previous,{...previous,code:'62900001',position:2,debit:'10.00',credit:'0.00'}];
 const alternative={id:3,code:'62900001',kind:'subaccount',description:'Historic criterion'};
 const data=build([row(1,'2026-01-03','COMISION CUSTODIA','-10.00','90.00'),row(2,'2026-01-04','MANTENIMENT','30.00','120.00')],[],history,[account,fee,alternative]);
 assert.equal(data.proposals[0].lines[0].code,alternative.code);assert.match(data.proposals[0].basis,/Según tus datos/);
 assert.equal(data.proposals[1].lines[0].code,account.code);assert.equal(data.proposals[1].lines[1].credit,'30.00');
});
test('multi-year sources only use selected-year rows and never force transfer income',()=>{
 const data=build([row(1,'2025-12-31','Previous','100.00','100.00'),row(2,'2026-01-03','TRANSFER IMMEDIATA EMPRESA VINCULADA','1000.00','1100.00')]);
 assert.equal(data.source.rows,2);assert.equal(data.source.selected_rows,1);assert.equal(data.scope.period_opening_balance,'100.00');
 assert.equal(data.proposals.length,0);assert.match(data.unresolved[0].reason,/relación entre empresas/);
});


test('without a matching balance, reconcile only statement dates and retain earlier balances',()=>{
 const data=build([
  row(1,'2026-06-10','MANTENIMENT','-10.00','90.00'),
  row(2,'2026-06-12','Transfer client','20.00','110.00'),
 ],[
  line(1,'2026-04-15','100.00','0.00','Earlier normal deposit'),
  line(2,'2026-06-11','0.00','3.00','Extra entry within statement dates'),
  line(3,'2026-06-12','20.00','0.00','Transfer client'),
  line(4,'2026-06-13','5.00','0.00','After statement'),
 ]);
 assert.equal(data.scope.last_matching_date,null);
 assert.equal(data.scope.analysis_start_date,'2026-06-10');
 assert.equal(data.scope.book_opening_balance,'100.00');
 assert.equal(data.scope.opening_difference_bank_minus_book,'0.00');
 assert.deepEqual(data.book_unmatched.map(item=>item.entry_id),[2]);
 assert.deepEqual(data.scope.matched_movements.map(item=>item.entry_id),[3]);
 assert.deepEqual(data.scope.bank_pending.map(item=>item.id),[1]);
 assert.equal(data.current_book_balance,'117.00','earlier entries still contribute to the final balance');
 assert.equal(data.projected_balance,'107.00');
 assert.equal(data.unresolved_difference_book_minus_bank,'-3.00');
 assert.equal(data.reconciliation_status,'needs_review');
});

test('latest coincident daily balance excludes the whole settled date and all earlier movements',()=>{
 const data=build([
  row(1,'2026-06-09','Earlier transfer','50.00','150.00'),
  row(2,'2026-06-10','First payment','-20.00','130.00'),
  row(3,'2026-06-10','Refund','5.00','135.00'),
  row(4,'2026-06-12','MANTENIMENT','-10.00','125.00'),
  row(5,'2026-06-15','Transfer client','3.00','128.00'),
 ],[
  line(1,'2026-01-01','100.00','0.00','Opening','opening'),
  line(2,'2026-06-09','50.00','0.00','Earlier transfer'),
  line(3,'2026-06-10','0.00','15.00','Daily aggregate'),
  line(4,'2026-06-11','0.00','2.00','Extra entry after settled date'),
  line(5,'2026-06-15','3.00','0.00','Transfer client'),
 ]);
 assert.equal(data.scope.last_matching_date,'2026-06-10');
 assert.equal(data.scope.last_matching_balance,'135.00');
 assert.equal(data.scope.analysis_start_date,'2026-06-11');
 assert.deepEqual(data.scope.bank_pending.map(item=>item.id),[4]);
 assert.deepEqual(data.scope.matched_movements.map(item=>item.id),[5]);
 assert.deepEqual(data.book_unmatched.map(item=>item.entry_id),[4]);
 assert.deepEqual(data.proposals.map(item=>item.movement_id),[4]);
});

test('an intermediate balance on the same day is not a daily match, and a final-day match has no pending period',()=>{
 const rows=[row(1,'2026-12-31','First transfer','10.00','110.00'),row(2,'2026-12-31','MANTENIMENT','-5.00','105.00')];
 const lines=[line(1,'2026-01-01','100.00','0.00','Older deposit'),line(2,'2026-12-31','10.00','0.00','First transfer')];
 const intermediate=build(rows,lines);
 assert.equal(intermediate.scope.last_matching_date,null);
 assert.deepEqual(intermediate.scope.matched_movements.map(item=>item.id),[1]);
 assert.deepEqual(intermediate.scope.bank_pending.map(item=>item.id),[2]);
 assert.deepEqual(intermediate.book_unmatched,[]);
 const settled=build(rows,[...lines,line(3,'2026-12-31','0.00','5.00','MANTENIMENT')]);
 assert.equal(settled.scope.last_matching_date,'2026-12-31');
 assert.equal(settled.scope.analysis_start_date,'2027-01-01');
 for(const items of [settled.scope.bank_pending,settled.scope.matched_movements,settled.book_unmatched,settled.proposals,settled.unresolved])assert.deepEqual(items,[]);
 assert.equal(settled.reconciliation_status,'matched');
});


test('equal balances nine days apart resume after the bank and ledger checkpoints separately',()=>{
 const data=build([row(1,'2026-03-10','Transfer','100.00','100.00'),row(2,'2026-03-25','MANTENIMENT','-10.00','90.00')],[
  line(1,'2026-03-19','100.00','0.00','Delayed transfer'),
  line(2,'2026-03-20','0.00','3.00','Extra entry after book checkpoint'),
 ]);
 assert.equal(data.scope.last_matching_date,'2026-03-10');
 assert.equal(data.scope.last_matching_book_date,'2026-03-19');
 assert.equal(data.scope.analysis_start_date,'2026-03-11');
 assert.equal(data.scope.book_analysis_start_date,'2026-03-20');
 assert.equal(data.scope.last_book_entry,1);assert.equal(data.scope.last_book_entry_date,'2026-03-19');
 assert.deepEqual(data.scope.bank_pending.map(item=>item.id),[2]);
 assert.deepEqual(data.book_unmatched.map(item=>item.entry_id),[2]);
 assert.deepEqual(data.proposals.map(item=>item.movement_id),[2]);
 assert.equal(data.current_book_balance,'97.00');assert.equal(data.projected_balance,'87.00');
});

test('the inclusive ten-day limit accepts nine and ten days before or after and rejects eleven',()=>{
 const rows=[row(1,'2026-03-25','Transfer','100.00','100.00')];
 for(const [date,dist,extraDate]of [['2026-03-16',9,'2026-03-17'],['2026-03-15',10,'2026-03-16'],['2026-03-14',11,'2026-03-15'],['2026-04-03',9,null],['2026-04-04',10,null],['2026-04-05',11,null]]){
  const lines=[line(1,date,'100.00','0.00')];
  if(extraDate)lines.push(line(2,extraDate,'1.00','0.00','Different balance by statement date'));
  const data=build(rows,lines);
  assert.equal(data.scope.last_matching_date,dist<=10?'2026-03-25':null,date);
  assert.equal(data.scope.last_matching_book_date,dist<=10?date:null,date);
 }
});

test('a later ledger checkpoint after the statement end retains correct comparison dates and no duplicate proposal',()=>{
 const data=build([row(1,'2026-10-10','MANTENIMENT','-10.00','90.00')],[
  line(1,'2026-01-01','100.00','0.00','Earlier deposit'),
  line(2,'2026-10-19','0.00','10.00','MANTENIMENT'),
  line(3,'2026-10-21','0.00','5.00','Outside the search window'),
 ]);
 assert.equal(data.scope.last_matching_date,'2026-10-10');assert.equal(data.scope.last_matching_book_date,'2026-10-19');
 assert.equal(data.scope.book_balance_date,'2026-10-19');assert.equal(data.scope.ledger_read_through,'2026-10-20');
 assert.equal(data.current_book_balance,'90.00');assert.equal(data.difference_book_minus_bank,'0.00');
 assert.equal(data.reconciliation_status,'matched');assert.deepEqual(data.proposals,[]);assert.deepEqual(data.book_unmatched,[]);
});

test('same-date balance wins over nearby repeats and ties use the most recent book date',()=>{
 const rows=[row(1,'2026-05-10','Transfer','100.00','100.00')];
 const lines=[line(1,'2026-05-08','100.00','0.00'),line(2,'2026-05-09','5.00','0.00'),line(3,'2026-05-12','0.00','5.00')];
 const tied=build(rows,lines);assert.equal(tied.scope.last_matching_book_date,'2026-05-12');
 const exact=build(rows,[...lines,line(4,'2026-05-10','0.00','5.00'),line(5,'2026-05-11','5.00','0.00')]);
 assert.equal(exact.scope.last_matching_book_date,'2026-05-10');
 const near=build(rows,[line(1,'2026-05-01','100.00','0.00'),line(2,'2026-05-02','5.00','0.00'),line(3,'2026-05-12','0.00','5.00')]);
 assert.equal(near.scope.last_matching_book_date,'2026-05-12');
});

test('latest statement checkpoint wins even if an earlier day has an exact-date match',()=>{
 const data=build([row(1,'2026-05-10','Transfer','100.00','100.00'),row(2,'2026-05-20','MANTENIMENT','-10.00','90.00')],[
  line(1,'2026-05-10','100.00','0.00'),line(2,'2026-05-29','0.00','10.00'),
 ]);
 assert.equal(data.scope.last_matching_date,'2026-05-20');assert.equal(data.scope.last_matching_book_date,'2026-05-29');
 assert.deepEqual(data.proposals,[]);assert.equal(data.reconciliation_status,'matched');
});

test('the balance window excludes cancelled entries, other accounts and dates outside the selected exercise',()=>{
 const data=build([row(1,'2026-12-30','Transfer','100.00','100.00')],[
  {...line(1,'2026-12-31','100.00','0.00'),status:'cancelled'},
  {...line(2,'2026-12-31','100.00','0.00'),code:'57200002'},
  line(3,'2027-01-02','100.00','0.00'),
 ]);
 assert.equal(data.scope.last_matching_date,null);assert.equal(data.scope.ledger_read_through,'2026-12-31');
 assert.equal(data.current_book_balance,'0.00');
});
