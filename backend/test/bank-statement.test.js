import test from 'node:test';
import assert from 'node:assert/strict';
import { bankDate, detectBank, parseBankCsv, parseBankPages, validateBankRows } from '../src/services/bank-statement.js';
const csv=value=>parseBankCsv(Buffer.from(value));
const iban='ES9121000418450200051332';
const error=code=>e=>e.message==='BANK_STATEMENT_'+code;

test('bank dates: Catalan, Spanish, ISO, value date and invalid calendar dates',()=>{
 assert.equal(bankDate('4 Oct 2026'),'2026-10-04');assert.equal(bankDate('3 Gen 2026'),'2026-01-03');
 assert.equal(bankDate('12/08/2025'),'2025-08-12');assert.equal(bankDate('31-12','2025'),'2025-12-31');
 assert.equal(bankDate('31/02/2026'),null);assert.equal(bankDate('random'),null);
});
test('bank detection validates IBAN, recognizes names and rejects several accounts',()=>{
 assert.equal(detectBank(iban).name,'CaixaBank');assert.equal(detectBank('Extracto Cajamar').name,'Cajamar');
 assert.equal(detectBank('BBVA').name,'BBVA');assert.equal(detectBank('unknown').detected,false);
 assert.throws(()=>detectBank(iban.slice(0,-1)+'3'),error('INVALID_IBAN'));
 assert.throws(()=>detectBank(iban+' ES4030584101142720016208'),error('MULTIPLE_ACCOUNTS'));
});
test('CSV: semicolon, quoted multiline concepts, exact signed amounts and reverse chronology',()=>{
 const result=csv('CaixaBank;'+iban+'\nFecha;Fecha valor;Concepto;Importe;Saldo\n04/10/2026;04/10/2026;"Comisión; banco\nDetalle";-0,01;90071992547409,92\n03/10/2026;03/10/2026;Ingreso;10,00;90071992547409,93');
 assert.equal(result.bank.name,'CaixaBank');assert.equal(result.rows.length,2);
 assert.equal(result.initial_balance,'90071992547399.93');assert.equal(result.final_balance,'90071992547409.92');
 assert.equal(result.rows[1].concept,'Comisión; banco\nDetalle');
});
test('CSV: comma delimiter, decimal points, separate debit and credit, and no silent invalid cells',()=>{
 const comma=csv('"Fecha","Concepto","Importe","Saldo"\n"2026-01-01","Payment","-10.01","89.99"\n"2026-01-02","Return","5.00","94.99"');
 assert.equal(comma.final_balance,'94.99');
 const separate=csv('Data\tConcepte\tDebe\tHaber\tSaldo\n01/01/2026\tFee\t10,00\t\t90,00\n02/01/2026\tRefund\t\t5,00\t95,00');
 assert.equal(separate.rows[0].amount,'-10.00');assert.equal(separate.rows[1].amount,'5.00');
 assert.throws(()=>csv('Fecha;Concepto;Debe;Haber;Saldo\n01/01/2026;Fee;invalid;;0,00'),error('INVALID_CSV'));
});
test('CSV rejects missing balances, inconsistent balances, extra rows and invalid dates',()=>{
 assert.throws(()=>csv('Fecha;Concepto;Importe\n01/01/2026;X;1,00'),error('UNSUPPORTED_CSV'));
 assert.throws(()=>csv('Fecha;Concepto;Importe;Saldo\n01/01/2026;X;1,00;1,00\n02/01/2026;Y;2,00;4,00'),error('BALANCE_MISMATCH'));
 assert.throws(()=>csv('Fecha;Concepto;Importe;Saldo\n31/02/2026;X;1,00;1,00'),error('INVALID_CSV'));
 assert.throws(()=>csv('Fecha;Concepto;Importe;Saldo\n01/01/2026;X;1,00;1,00\nTotal;1,00'),error('INVALID_CSV'));
});
test('explicit foreign currency is rejected instead of being presented as euros',()=>{
 assert.throws(()=>csv('Moneda;USD\nFecha;Concepto;Importe;Saldo\n01/01/2026;X;1,00;1,00'),error('UNSUPPORTED_CURRENCY'));
 assert.throws(()=>csv('Fecha;Concepto;Importe;Saldo;Divisa\n01/01/2026;X;1,00;1,00;GBP'),error('UNSUPPORTED_CURRENCY'));
 assert.equal(csv('Fecha;Concepto;Importe;Saldo;Divisa\n01/01/2026;X;1,00;1,00;EUR').final_balance,'1.00');
});
test('PDF table adapter: descending Catalan dates, wrapped concepts, metadata IBAN and no amounts in concepts',()=>{
 const item=(text,x,y,width=20)=>({text,x,y,width});
 const result=parseBankPages([{page:1,items:[item(iban,20,750),item('Data',20,700),item('Concepte',80,700),item('Més dades',220,700),item('Import',465,700,32),item('Saldo',548,700,28),
  item('4 Oct 2026',20,675),item('TRANSF AL SEU',80,680),item('FAVOR',80,670),item('SOCIETAT COOP',220,680),item('CATALANA',220,670),item('+ 1.000,00 €',436,675,61),item('+ 1.090,00 €',515,675,61),
  item('3 Oct 2026',20,650),item('MANTENIMENT',80,650),item('- 10,00 €',450,650,47),item('+ 90,00 €',525,650,51),
 ]}]);
 assert.equal(result.initial_balance,'100.00');assert.equal(result.final_balance,'1090.00');
 assert.equal(result.rows[1].concept,'TRANSF AL SEU FAVOR SOCIETAT COOP CATALANA');assert.equal(result.bank.name,'CaixaBank');
});
test('balance validation does not sort equal-date transactions into an invented order',()=>{
 const rows=[{date:'2026-01-02',amount:'1.00',balance:'13.00'},{date:'2026-01-01',amount:'1.00',balance:'11.00'},{date:'2026-01-01',amount:'1.00',balance:'12.00'}];
 assert.throws(()=>validateBankRows(rows),error('BALANCE_MISMATCH'));
});
