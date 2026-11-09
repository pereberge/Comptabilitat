import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInputDate,displayInputDate} from '../../frontend/src/services/date-input.js';
test('date entry requires the complete year and preserves day/month/year',()=>{
 for(const value of ['17/10/2','17/10/20','17/10/202','17/10/20266','31/02/2026','29/02/2025','01/13/2026','00/10/2026',''])assert.equal(parseInputDate(value),null,value);
 assert.equal(parseInputDate('17/10/2026'),'2026-10-17');assert.equal(parseInputDate('29/02/2024'),'2024-02-29');
 assert.equal(parseInputDate('1/2/2026'),'2026-02-01');assert.equal(displayInputDate('2026-10-17'),'17/10/2026');assert.equal(displayInputDate(''),'');
});
