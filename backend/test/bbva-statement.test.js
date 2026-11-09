import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBankPages,isBankStatementPdf} from '../src/services/bank-statement.js';
import {buildBankAnalysis} from '../src/services/bank-analysis.js';
import {createBankImportService} from '../src/services/bank-import.js';
import {journalPagesPdf} from '../test-support/journal-fixture.js';

const item=(text,x,y,width=30)=>({text,x,y,width});
const account='01820000000000000000';
const iban='ES'+String(98n-BigInt(account+'142800')%97n).padStart(2,'0')+account;
const header=y=>[
 item('F. CONTABLE',30,y,46),item('F. VALOR',96,y,32),item('CÓDIGO',163,y,28),
 item('CONCEPTO|BENEF./ORDENANTE',205,y,115),item('IMPORTE',441,y,32),item('SALDO',543,y,24),
];
const movement=(date,value,y,concept,amount,balance)=>[
 item(date,30,y),item(value,96,y),item('00007',163,y),item(concept,205,y+10),
 item('Referència del pagament',205,y-10),item(amount,420,y,53),item(balance,515,y,52),
];
const metadata=(holder='EMPRESA DE PROVA S.L.',currency='EUR')=>[
 item('Titular',26,713,23),item(holder,88,713,93),item('Fecha',298,713),item('06/11/2026 Hora 17:27',361,713),
 item('Cuenta',26,694),item(iban,88,694),item('Periodo',298,694),item('08/08/2026-11/11/2026',361,694),
 item('Divisa',26,676),item(currency,88,676),item('Banco',26,658),item('BANCO BILBAO VIZCAYA ARGENTARIA S.A.',88,658),
];
const pages=()=>[
 {page:1,items:[...header(611),...movement('02/11/2026','01/11/2026',574,'TRANSFERENCIAS | CLIENT PROVA','3.448,5 EUR','3.498,50 EUR'),...metadata()]},
 {page:2,items:[...header(728),...movement('17/08/2026','17/08/2026',692,'ADEUDO DE SEGUROS | PROVEÏDOR PROVA','-50,00 EUR','50,00 EUR')]},
];

test('BBVA history: holder and IBAN, two pages, value dates, one decimal and complete concepts',()=>{
 const result=parseBankPages(pages());
 assert.equal(result.bank.name,'BBVA');assert.equal(result.bank.holder,'EMPRESA DE PROVA S.L.');assert.equal(result.bank.iban,iban);
 assert.equal(result.pages,2);assert.equal(result.rows.length,2);
 assert.equal(result.statement_date,'2026-11-06');assert.equal(result.statement_date_origin,'document');
 assert.equal(result.initial_balance,'100.00');assert.equal(result.final_balance,'3498.50');
 assert.equal(result.rows[1].amount,'3448.50');assert.equal(result.rows[1].value_date,'2026-11-01');
 assert.equal(result.rows[1].concept,'TRANSFERENCIAS | CLIENT PROVA Referència del pagament');
 assert.equal(result.rows[0].concept,'ADEUDO DE SEGUROS | PROVEÏDOR PROVA Referència del pagament');
 const account={id:1,code:'57200001',description:'BBVA',kind:'subaccount'};
 const analysis=buildBankAnalysis({company:{id:1,name:'Empresa de prova'},exercise:{id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31'},account,statement:result,lines:[],history:[],accounts:[account],sourceName:'bbva.pdf',sourceHash:'test'});
 assert.equal(analysis.account.holder,result.bank.holder);assert.equal(analysis.bank_rows.length,2);
});
test('BBVA rejects conflicting holders, foreign currency and an inconsistent running balance',()=>{
 const conflicting=pages();conflicting[1].items=[...header(611),...movement('17/08/2026','17/08/2026',574,'ADEUDO DE SEGUROS','-50,00 EUR','50,00 EUR'),...metadata('ALTRE TITULAR')];
 assert.throws(()=>parseBankPages(conflicting),/BANK_STATEMENT_MULTIPLE_HOLDERS/);
 const foreign=pages();foreign[0].items=foreign[0].items.map(row=>row.text==='EUR'?{...row,text:'USD'}:row);
 assert.throws(()=>parseBankPages(foreign),/BANK_STATEMENT_UNSUPPORTED_CURRENCY/);
 const broken=pages();broken[0].items=broken[0].items.map(row=>row.text==='3.498,50 EUR'?{...row,text:'3.498,51 EUR'}:row);
 assert.throws(()=>parseBankPages(broken),/BANK_STATEMENT_BALANCE_MISMATCH/);
});

test('BBVA upload accepts a PDF with a MIME preamble through the preview service and PDF worker',async()=>{
 const company={id:1,name:'Empresa de prova',subaccount_length:8};
 const exercise={id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open'};
 const pool={async execute(sql){
  if(sql.includes('FROM companies WHERE'))return [[company]];
  if(sql.includes('FROM accounting_exercises WHERE'))return [[exercise]];
  return [[]];
 }};
 const pdf=journalPagesPdf(pages());
 const wrapped=Buffer.concat([Buffer.from('\r\n--uuid:bbva-download\r\nContent-Type: multipart/mixed\r\nContent-Type: application/pdf\r\n\r\n'),pdf,Buffer.from('\r\n--uuid:bbva-download--\r\n')]);
 assert.equal(isBankStatementPdf(pdf),true);assert.equal(isBankStatementPdf(wrapped),true);
 assert.equal(isBankStatementPdf(Buffer.from('Fecha;Concepto;Importe;Saldo')),false);
 assert.equal(isBankStatementPdf(Buffer.concat([Buffer.alloc(1024,32),pdf])),false);
 const service=createBankImportService(pool,company.id);
 const result=await service.preview(wrapped,exercise.id,'historico.pdf','application/pdf');
 try{
  assert.equal(result.format,'pdf');assert.equal(result.rows,2);assert.equal(result.pages,2);
  assert.equal(result.bank.holder,'EMPRESA DE PROVA S.L.');assert.equal(result.bank.name,'BBVA');
  assert.equal(result.final_balance,'3498.50');
 }finally{await service.discard({token:result.token});}
});
