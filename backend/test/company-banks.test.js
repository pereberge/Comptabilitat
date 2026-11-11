import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompanyBankService,validateCompanyBank} from '../src/services/company-banks.js';
import {buildSepaXml} from '../src/services/sepa-xml.js';
import {TABLES,SHARED,OPTIONAL_TABLES} from '../src/services/backup-format.js';

test('company bank requires its own presenter and valid IBAN without a global default',()=>{
 const data={bank_id:1,iban:'ES91 2100 0418 4502 0005 1332',initiator_id:' ES63000B22299945 '};
 assert.deepEqual(validateCompanyBank(data),{bank_id:1,iban:'ES9121000418450200051332',initiator_id:'ES63000B22299945',creditor_id:''});
 assert.throws(()=>validateCompanyBank({...data,initiator_id:''}),{code:'INVALID_INITIATOR_ID'});
 assert.throws(()=>validateCompanyBank({...data,iban:'ES123'}),{code:'REMITTANCE_COMPANY_IBAN'});
 assert.throws(()=>validateCompanyBank({...data,creditor_id:'bad'}),{code:'INVALID_CREDITOR_ID'});
 assert.ok(TABLES.company_banks&&SHARED.has('company_banks')&&OPTIONAL_TABLES.has('company_banks'));
});

test('company bank lookup isolates company IDs and uses the current shared BIC',async()=>{
 const db={async execute(sql,params){assert.deepEqual(params,[583,7]);return [[{id:7,company_id:583,bank_id:2,iban:'ES9121000418450200051332',initiator_id:'ARB-ONLY',creditor_id:'',version:3}]];}};
 const catalog={async get(bankId){assert.equal(bankId,2);return {name:'BBVA',bic:'BBVAESMMXXX',version:2};}};
 const result=await createCompanyBankService(db,583,catalog).get(7);assert.equal(result.initiator_id,'ARB-ONLY');assert.equal(result.bic,'BBVAESMMXXX');assert.equal(result.bank_version,2);
 await assert.rejects(createCompanyBankService({async execute(sql,params){assert.deepEqual(params,[85,7]);return [[]];}},85,catalog).get(7),{code:'COMPANY_BANK_NOT_FOUND'});
});

test('collections use the creditor ID and payments use the presenter, keeping the BIC and source data',()=>{
 const bank={iban:'ES9121000418450200051332',bic:'BBVAESMMXXX',initiator_id:'ES63000B22299945',creditor_id:'DE98ZZZ09999999999'};
 for(const direction of ['issued','received']){
  const snapshot={direction,bank,company:{name:'ARB'},requested_date:'2099-12-31',items:[{receipt_id:1,name:'Third party',reference:'F1',iban:'DE89370400440532013000',amount:'10.00',execution_date:'2099-12-31',mandate:{sequence:'RCUR',reference:'M1',signed_on:'2025-01-01'}}]};
  const xml=buildSepaXml(snapshot,'MTEST'),party=xml.match(/<InitgPty>(.*?)<\/InitgPty>/)[1];
  assert.ok(party.includes('<Id>'+(direction==='issued'?bank.creditor_id:bank.initiator_id)+'</Id>'));
  assert.ok(!party.includes(direction==='issued'?bank.initiator_id:bank.creditor_id));
  if(direction==='issued'){assert.doesNotMatch(xml,/ES63000B22299945/);assert.match(xml,/<CdtrSchmeId>.*<Id>DE98ZZZ09999999999<\/Id>/);}
  assert.match(xml,/<BICFI>BBVAESMMXXX<\/BICFI>/);assert.equal(bank.initiator_id,'ES63000B22299945');
 }
});
