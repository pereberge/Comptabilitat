import test from 'node:test';
import assert from 'node:assert/strict';
import {partyTaxId,partyIdentityMatches,partyAccountsByTaxId,partyNameSimilarity,partyAccountsByName} from '../../shared/party-identity.js';
import {findPartyAccount,findPartyAccountByTaxId} from '../src/services/party-identification.js';

test('merged party lookup includes fiscal profiles and preserves ambiguity',async()=>{
 const db={async execute(sql,params){
  assert.match(sql,/JSON_EXTRACT\(party_profile/);
  assert.ok(params.includes('B12345678'));
  return [[{account_id:4},{account_id:7}]];
 }};
 assert.deepEqual(await findPartyAccountByTaxId(db,1,'received','B-12345678'),{accountId:null,ambiguous:true});
});

test('merged party name lookup does not select a profile with a conflicting tax ID',async()=>{
 const db={async execute(sql){
  if(sql.includes('SELECT DISTINCT party_account_id'))return [[]];
  if(sql.includes('SELECT id,code,description,kind'))return [[{id:4,code:'40000004',kind:'subaccount',description:'Example Supplier SL'}]];
  if(sql.includes('SELECT DISTINCT party_account_id AS account_id,direction'))return [[]];
  if(sql.includes('JSON_EXTRACT(party_profile'))return [[{account_id:4,direction:'received',tax_id:'B99999999',name:'Example Supplier SL'}]];
  throw new Error('Unexpected query');
 }};
 assert.deepEqual(await findPartyAccount(db,1,'received','B12345678','Example Supplier SL'),{accountId:null,ambiguous:false,matchedBy:null});
});
test('CIF identity ignores presentation and prevails over differences in company or supplier name',()=>{
 assert.equal(partyTaxId(' b-12.345 678 '),'B12345678');
 assert.equal(partyIdentityMatches({name:'Different trading name',tax_id:'b-12345678'},{name:'Registered legal company SL',tax_id:'B12345678'}),true);
 assert.equal(partyIdentityMatches({name:'Same name',tax_id:'B12345678'},{name:'Same name',tax_id:'B87654321'}),false);
 assert.equal(partyIdentityMatches({name:'Registered SL'},{name:'Registered SL',tax_id:'B12345678'}),true);
});
test('similar supplier names tolerate accents, legal forms, order, and one minor spelling error',()=>{
 assert.equal(partyNameSimilarity('Pinsos Àrb, S.L.','PINSOS ARB SLU'),1);
 assert.equal(partyNameSimilarity('Arb Pinsos','Pinsos Arb'),1);
 assert.ok(partyNameSimilarity('Distribucions Ramon','Distribucions Ramno')>=0.85);
 assert.equal(partyNameSimilarity('Distribucions Ramon','Distribucions Pere'),0);
 const accounts=[{id:1,code:'40000001',kind:'subaccount',description:'Distribucions Ramon S.L.'},{id:2,code:'40000002',kind:'subaccount',description:'Distribucions Pere SA'}];
 assert.deepEqual(partyAccountsByName(accounts,[],'received','Distribucions Ramno').map(row=>row.id),[1]);
 assert.deepEqual(partyAccountsByName(accounts,[{account_id:1,direction:'received',tax_id:'B22222222'}],'received','Distribucions Ramno','B11111111'),[]);
 accounts.push({id:3,code:'40000003',kind:'subaccount',description:'Distribucions Ramon SAU'});assert.equal(partyAccountsByName(accounts,[],'received','Distribucions Ramon').length,2);
});
test('CIF account matching isolates direction, deduplicates history, and preserves ambiguity',()=>{
 const parties=[{account_id:1,direction:'received',tax_id:'B-12345678'},{account_id:1,direction:'received',tax_id:'b12345678'},{account_id:2,direction:'issued',tax_id:'B12345678'}];
 assert.deepEqual(partyAccountsByTaxId(parties,'received',' B12345678 '),[1]);assert.deepEqual(partyAccountsByTaxId(parties,'received',''),[]);
 parties.push({account_id:3,direction:'received',tax_id:'B12345678'});assert.deepEqual(partyAccountsByTaxId(parties,'received','B12345678'),[1,3]);
});
