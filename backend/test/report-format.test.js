import test from 'node:test';
import assert from 'node:assert/strict';
import { amount } from '../src/services/reports.js';
import { reportMoney, buildCsv } from '../../frontend/src/services/report-format.js';
test('report totals retain signs and precision beyond Number safe integer',()=>{
 assert.equal(amount('-123456789012345678.90'),-12345678901234567890n);
 assert.equal(reportMoney('-123456789012345678.90'),'-123.456.789.012.345.678,90');
});
test('Excel CSV escapes quotes, newlines and formulas without rounding amounts',()=>{
 const csv=buildCsv([['=SUM(A1)', ' \t+123', '@formula', 'a;"b\nc', '0006', {amount:'-123456789012345678.90'}]]);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes('"\'=SUM(A1)"'));assert.ok(csv.includes('"\' \t+123"'));assert.ok(csv.includes('"\'@formula"'));
 assert.ok(csv.includes('"a;""b\nc"'));assert.ok(csv.includes('"\'0006"'));assert.ok(csv.includes('"-123456789012345678,90"'));
});
