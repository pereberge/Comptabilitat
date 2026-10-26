import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountingReview } from '../src/services/accounting-review.js';
import { reconciliationLedgerHash } from '../src/services/bank-reconciliations.js';

function fixture(extra={}){
 const accounts=[],byCode=new Map();
 function account(code,description){
  if(byCode.has(code))return byCode.get(code);
  const sub=code.length===8,parentCode=code.length===1?'':sub?code.slice(0,4):code.slice(0,-1),parent=parentCode?account(parentCode,'Grupo '+parentCode):null;
  const result={id:accounts.length+1,code,description,kind:sub?'subaccount':'account',parent_id:parent?.id??null,parent_code:parentCode||null};accounts.push(result);byCode.set(code,result);return result;
 }
 account('57200001','Banco de prueba');account('10000001','Capital social');
 const data={company:{id:1,name:'Test',subaccount_length:8,tax_id:'B12345674',address:'Address'},exercise:{id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open'},accounts,entries:[],lines:[],asOf:'2026-10-20',...extra};
 function entry(id,when,values,overrides={}){
  const header={id,number:id,entry_date:when,description:'Movimiento',status:'posted',entry_type:'normal',import_id:null,...overrides};data.entries.push(header);
  for(const [index,[code,debit,credit]]of values.entries()){
   const a=byCode.get(code)||account(code,'Subcuenta '+code);
   data.lines.push({exercise_id:1,entry_id:id,number:header.number,entry_date:when,status:header.status,entry_type:header.entry_type,code,account_name:a.description,account_id:a.id,position:index+1,description:header.description,debit,credit});
  }return header;
 }
 return {data,account,entry,review:()=>buildAccountingReview(data)};
}
const finding=(report,code)=>report.findings.filter(row=>row.code===code);
test('review computes exact totals, detects potential duplicates and excludes cancelled entries',()=>{
 const f=fixture();
 for(const id of [1,2])f.entry(id,'2026-01-03',[['57200001','900719925474.01','0.00'],['10000001','0.00','900719925474.01']]);
 f.entry(3,'2026-01-03',[['57200001','5.00','0.00']],{status:'cancelled'});
 const before=structuredClone(f.data),report=f.review();assert.deepEqual(f.data,before);assert.equal(report.read_only,true);
 assert.equal(report.summary.debit,'1801439850948.02');assert.equal(report.summary.credit,report.summary.debit);assert.equal(report.summary.errors,0);assert.equal(report.summary.cancelled_entries,1);
 assert.equal(finding(report,'POSSIBLE_DUPLICATE').length,1);assert.deepEqual(finding(report,'POSSIBLE_DUPLICATE')[0].entries.map(row=>row.id),[1,2]);
});
test('imported negative and zero lines remain valid; unbalanced or incomplete journals are errors',()=>{
 const f=fixture();
 f.entry(1,'2026-01-03',[['57200001','-1.50','0.00'],['10000001','0.00','-1.50']],{import_id:2});
 f.entry(2,'2026-01-04',[['57200001','0.00','0.00'],['10000001','0.00','0.00']],{import_id:2});
 assert.equal(finding(f.review(),'ENTRY_INVALID_LINES').length,0);
 f.entry(3,'2026-01-05',[['57200001','10.00','0.00']]);
 const report=f.review();assert.equal(finding(report,'ENTRY_INCOMPLETE').length,1);assert.equal(finding(report,'ENTRY_UNBALANCED')[0].amount,'10.00');assert.equal(finding(report,'JOURNAL_UNBALANCED')[0].amount,'10.00');
});
test('account structure errors are distinct from evidence-based naming improvements',()=>{
 const f=fixture();
 f.account('47520001','HP IVA');f.account('47520002','Obligaciones derivadas');
 f.account('47300001','Entrega a compte M202 IS');f.account('76900001','Intereses');
 f.entry(1,'2026-01-17',[['57200001','81.00','0.00'],['47300001','19.00','0.00'],['76900001','0.00','100.00']]);
 let report=f.review();assert.equal(finding(report,'VAT_ACCOUNT_NAME').length,1);assert.equal(finding(report,'WITHHOLDING_ACCOUNT_NAME').length,1);assert.equal(report.summary.errors,0);
 f.account('43000001','Customer').parent_id=null;report=f.review();assert.equal(finding(report,'ACCOUNT_STRUCTURE').length,1);
 assert.ok(finding(report,'VAT_ACCOUNT_NAME')[0].reference.startsWith('https://www.boe.es/'));
});
test('quarterly IVA review isolates an old residual and does not assert a tax debt or future filing period',()=>{
 const f=fixture();
 for(const [code,name]of [['43000001','Client'],['70000001','Sales'],['47700021','IVA repercutido'],['47200021','IVA soportado'],['62200001','Repair'],['41000001','Creditor'],['47500001','HP IVA']])f.account(code,name);
 f.entry(1,'2026-04-01',[['43000001','1210.00','0.00'],['70000001','0.00','1000.00'],['47700021','0.00','210.00']]);
 f.entry(2,'2026-05-01',[['62200001','10.00','0.00'],['47200021','2.10','0.00'],['41000001','0.00','12.10']]);
 f.entry(3,'2026-06-30',[['47700021','200.00','0.00'],['47200021','0.00','2.10'],['47500001','0.00','197.90']]);
 f.entry(4,'2026-09-01',[['43000001','121.00','0.00'],['70000001','0.00','100.00'],['47700021','0.00','21.00']]);
 let report=f.review();assert.equal(finding(report,'VAT_RESIDUAL')[0].amount,'10.00');assert.equal(finding(report,'VAT_SETTLEMENT_REVIEW')[0].amount,'21.00');assert.match(finding(report,'VAT_SETTLEMENT_REVIEW')[0].suggestion,/no una deuda fiscal confirmada/);
 f.data.asOf='2026-07-01';report=f.review();assert.equal(finding(report,'VAT_SETTLEMENT_REVIEW').length,0);
});
test('opening and closing checks preserve manual opening and exclude cancelled closing',()=>{
 const f=fixture({previous:{id:2,status:'closed'}}),bank=f.account('57200001'),capital=f.account('10000001');
 f.data.previousBalances=[{account_id:bank.id,balance:'120.00'},{account_id:capital.id,balance:'-120.00'}];
 f.entry(1,'2026-02-01',[['57200001','100.00','0.00'],['10000001','0.00','100.00']]);
 assert.equal(finding(f.review(),'OPENING_MISSING').length,1);
 f.data.entries[0].entry_date='2026-01-01';f.data.lines.forEach(row=>row.entry_date='2026-01-01');assert.equal(finding(f.review(),'OPENING_MISSING').length,0);
 f.data.entries[0].entry_type='opening';f.data.lines.forEach(row=>row.entry_type='opening');assert.equal(finding(f.review(),'OPENING_DIFFERENCE')[0].count,2);
 f.data.exercise.status='closed';f.entry(2,'2026-12-31',[['10000001','100.00','0.00'],['57200001','0.00','100.00']],{entry_type:'closing',status:'cancelled'});
 const report=f.review();assert.equal(finding(report,'CLOSING_MISSING').length,1);assert.equal(finding(report,'CLOSING_RESIDUAL')[0].count,2);
});
test('bank review uses latest report, statement cutoff, and stale ledger even when the balance matches',()=>{
 const f=fixture();f.entry(1,'2026-01-01',[['57200001','100.00','0.00'],['10000001','0.00','100.00']]);
 const bank=f.account('57200001'),snapshot={account:{name_by_user:'Bank'},source:{to:'2026-01-10'},bank_balance:'90.00',proposals:[{}],unresolved:[]};
 f.data.banks=[{id:1,account_id:bank.id,snapshot:{...snapshot,bank_balance:'0.00'},ledger_hash:reconciliationLedgerHash(f.data.lines)},{id:2,account_id:bank.id,snapshot,ledger_hash:reconciliationLedgerHash(f.data.lines)}];
 f.entry(2,'2026-01-20',[['57200001','50.00','0.00'],['10000001','0.00','50.00']]);
 let report=f.review();assert.equal(finding(report,'BANK_DIFFERENCE').length,1);assert.equal(finding(report,'BANK_DIFFERENCE')[0].amount,'10.00');assert.equal(finding(report,'BANK_DIFFERENCE')[0].bank_report_id,2);assert.equal(finding(report,'BANK_ANALYSIS_STALE').length,0);
 f.data.lines.filter(row=>row.entry_id===1).forEach(row=>{if(row.debit==='100.00')row.debit='90.00';if(row.credit==='100.00')row.credit='90.00';});
 report=f.review();assert.equal(finding(report,'BANK_DIFFERENCE').length,0);assert.equal(finding(report,'BANK_ANALYSIS_STALE').length,1);
});
test('invoice totals, cancelled documents, overpayments and overdue receipts are reviewed separately',()=>{
 const f=fixture();
 f.data.invoices=[{id:1,reference:'F1',status:'posted',total_amount:'100.00',receipt_total:'90.00',entry_status:'posted'},{id:2,status:'void'}];
 f.data.receipts=[{id:1,position:1,reference:'F1',invoice_status:'posted',amount:'100.00',paid_amount:'101.00',due_date:'2026-01-01'},
  {id:2,position:2,reference:'F1',invoice_status:'posted',amount:'30.00',paid_amount:'5.00',due_date:'2026-01-01'},
  {id:3,invoice_status:'void'}];
 const report=f.review();assert.equal(finding(report,'INVOICE_RECEIPT_TOTAL')[0].amount,'10.00');assert.equal(finding(report,'RECEIPT_OVERPAID')[0].amount,'1.00');assert.equal(finding(report,'OVERDUE_RECEIPTS')[0].amount,'25.00');
});
test('several IBAN bindings keep account observations unique and stable',()=>{
 const f=fixture(),bank=f.account('57200001');
 f.data.connections=[{account_id:bank.id,bank_name:'Cajamar'},{account_id:bank.id,bank_name:'Cajamar'},{account_id:bank.id,bank_name:'CaixaBank'}];
 const notes=finding(f.review(),'BANK_ACCOUNT_NAME');assert.equal(notes.length,2);assert.equal(new Set(notes.map(row=>row.id)).size,2);
});


test('bank review compares the later book balance date and fingerprints the complete nine-day window',()=>{
 const f=fixture(),bank=f.account('57200001');
 f.entry(1,'2026-01-19',[['57200001','100.00','0.00'],['10000001','0.00','100.00']]);
 const snapshot={account:{name_by_user:'Bank'},source:{to:'2026-01-10'},scope:{book_balance_date:'2026-01-19',ledger_read_through:'2026-01-19'},bank_balance:'100.00',proposals:[],unresolved:[]};
 f.data.banks=[{id:1,account_id:bank.id,snapshot,ledger_hash:reconciliationLedgerHash(f.data.lines)}];
 let report=f.review();assert.equal(finding(report,'BANK_DIFFERENCE').length,0);assert.equal(finding(report,'BANK_ANALYSIS_STALE').length,0);
 f.entry(2,'2026-01-20',[['57200001','1.00','0.00'],['10000001','0.00','1.00']]);
 report=f.review();assert.equal(finding(report,'BANK_DIFFERENCE').length,0);assert.equal(finding(report,'BANK_ANALYSIS_STALE').length,0);
 f.entry(3,'2026-01-18',[['57200001','1.00','0.00'],['10000001','0.00','1.00']]);
 report=f.review();assert.equal(finding(report,'BANK_DIFFERENCE')[0].amount,'1.00');assert.equal(finding(report,'BANK_ANALYSIS_STALE').length,1);
});
