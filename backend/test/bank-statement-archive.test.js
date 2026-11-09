import test from 'node:test';
import assert from 'node:assert/strict';
import {bankStatementArchiveInfo} from '../src/services/bank-statement-archive.js';
import {bankStatementDocumentDate,parseBankCsv,parseBankPages} from '../src/services/bank-statement.js';

test('archive names use the bank and statement date rather than the upload date',()=>{
 const result=bankStatementArchiveInfo({source_name:'download-123.pdf',source_mime:'application/pdf',created_at:'2026-11-03',snapshot:{account:{name_by_user:'CaixaBank'},source:{from:'2026-10-01',to:'2026-10-29',statement_date:'2026-10-31',statement_date_origin:'document'}}});
 assert.equal(result.archive_name,'Extracte-CaixaBank-2026-10-31.pdf');assert.equal(result.statement_date,'2026-10-31');assert.equal(result.period_to,'2026-10-29');
 assert.equal(result.date_origin,'document');
});
test('old archives, CSVs and unsafe bank names have safe descriptive filenames',()=>{
 const result=bankStatementArchiveInfo({source_name:'movimientos.csv',source_mime:'text/csv',snapshot:JSON.stringify({account:{name_by_user:'Banc / À;\r\n"../../'},source:{from:'2026-10-01',to:'2026-10-20',full_to:'2026-10-31'}})});
 assert.equal(result.archive_name,'Extracte-Banc-A-2026-10-31.csv');assert.equal(result.date_origin,'period_end');
 assert.equal(bankStatementArchiveInfo({snapshot:{}}).archive_name,'Extracte-Banc-sense-data.pdf');
 assert.equal(bankStatementArchiveInfo({snapshot:{source:{statement_date:'2026-02-31',to:'2026-02-28'},account:{name_by_user:'BBVA'}}}).statement_date,'2026-02-28');
});
test('explicit document dates and period end dates are read only from labelled metadata',()=>{
 assert.deepEqual(bankStatementDocumentDate('Fecha de emisión: 03/11/2026'),{statement_date:'2026-11-03',statement_date_origin:'document'});
 assert.deepEqual(bankStatementDocumentDate('Data de l’extracte: 31.10.2026'),{statement_date:'2026-10-31',statement_date_origin:'document'});
 assert.deepEqual(bankStatementDocumentDate('Fecha del extracto: 31/10/2026'),{statement_date:'2026-10-31',statement_date_origin:'document'});
 assert.deepEqual(bankStatementDocumentDate('Periodo del 01/10/2026 al 31/10/2026'),{statement_date:'2026-10-31',statement_date_origin:'period_end'});
 assert.deepEqual(bankStatementDocumentDate('Fecha de apertura 01/02/2020 · primer movimiento 01/10/2026'),{});
 assert.deepEqual(bankStatementDocumentDate('Fecha extracto: 31/02/2026'),{});
 assert.deepEqual(bankStatementDocumentDate('Fecha extracto: 01/10/2026 Fecha extracto: 02/10/2026'),{});
});
test('CSV archive date comes from its header while movement dates stay unchanged',()=>{
 const statement=parseBankCsv(Buffer.from('Cajamar\nFecha de emisión;03/11/2026\nFecha;Concepto;Importe;Saldo\n29/10/2026;Ingreso;1,00;1,00'));
 assert.equal(statement.bank.name,'Cajamar');assert.equal(statement.statement_date,'2026-11-03');assert.equal(statement.to,'2026-10-29');
});
test('PDF statement dates are read from text above the movement table',()=>{
 const item=(text,x,y,width=20)=>({text,x,y,width});
 const statement=parseBankPages([{page:1,items:[item('CaixaBank',20,780),item('Fecha extracto: 31/10/2026',20,750),
  item('Fecha',20,700),item('Concepto',80,700),item('Importe',465,700,32),item('Saldo',548,700,28),
  item('29/10/2026',20,675),item('Ingreso',80,675),item('1,00',465,675,32),item('1,00',548,675,28)]}]);
 assert.equal(statement.statement_date,'2026-10-31');assert.equal(statement.to,'2026-10-29');
});
