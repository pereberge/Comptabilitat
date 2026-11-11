import test from 'node:test';
import assert from 'node:assert/strict';
import {journalCompanyIdentity as identity} from '../src/services/journal-company-identity.js';

test('journal accepts ARB S.A. and PIENSOS ARB S.A. as the same company in either direction',()=>{
 for(const name of ['ARB S.A.','arb sa',' ARB S. A. ','PIENSOS ARB S.A.','PIENSOS ARB S.A..']){
  assert.equal(identity(name),identity('PIENSOS ARB S.A.'));
  assert.equal(identity(name),identity('ARB S.A.'));
 }
});

test('journal still separates other companies and legal forms and preserves existing normalization',()=>{
 for(const name of ['ARB','ARB SL','PIENSOS ARB SL','OTRA ARB S.A.','NOU FONS SL','P. ARB'])assert.notEqual(identity(name),identity('ARB S.A.'));
 assert.equal(identity('Nóu Fons S.L.'),identity('NOU FONS SL'));
 assert.notEqual(identity('NOU FONS SL'),identity('IMMOBLES TER-1006, SL'));
});
