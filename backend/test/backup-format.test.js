import test from 'node:test';
import assert from 'node:assert/strict';
import {TABLE_ORDER,sealBackup,packBackup,readBackup,binaryValue} from '../src/services/backup-format.js';
function fixture(){
 const tables=Object.fromEntries(TABLE_ORDER.map(table=>[table,[]]));
 tables.companies=[{id:1,name:'Test SL',subaccount_length:8}];
 tables.accounting_exercises=[{id:2,company_id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open'}];
 tables.accounts=[{id:3,company_id:1,code:'1',description:'Group',kind:'account',parent_id:null},{id:4,company_id:1,code:'10000001',description:'Capital',kind:'subaccount',parent_id:3},{id:5,company_id:1,code:'5',description:'Group',kind:'account',parent_id:null},{id:6,company_id:1,code:'57200001',description:'Bank',kind:'subaccount',parent_id:5}];
 tables.journal_entries=[{id:7,company_id:1,exercise_id:2,number:1,entry_date:'2026-01-01',description:'Capital'}];
 tables.journal_lines=[{id:8,company_id:1,entry_id:7,account_id:6,position:1,debit:'9999999999999.99',credit:'0.00'},{id:9,company_id:1,entry_id:7,account_id:4,position:2,debit:'0.00',credit:'9999999999999.99'}];
 return {format:'contabilitat-backup',version:1,created_at:'2026-10-21T10:00:00Z',scope:{kind:'exercise',exercise_id:2},tables,references:Object.fromEntries(TABLE_ORDER.map(table=>[table,[]])),schema:Object.fromEntries(TABLE_ORDER.map(table=>[table,Object.keys(tables[table][0]||{})]))};
}
const code=expected=>error=>error.code===expected;
test('pre-care backups adapt numeric lot names only after verifying their original checksum',()=>{
 const data=fixture();data.tables.pig_farms=[{id:30,company_id:1,code:'12',name:'Farm'}];data.tables.farm_lots=[{id:31,company_id:1,farm_id:30,code:'1',entry_date:'2026-01-01',exit_date:null}];data.schema.pig_farms=Object.keys(data.tables.pig_farms[0]);data.schema.farm_lots=Object.keys(data.tables.farm_lots[0]);
 for(const section of ['schema','tables','references'])delete data[section].farm_care_costs;
 const archive=sealBackup(data),loaded=readBackup(packBackup(archive));assert.equal(loaded.tables.farm_lots[0].code,'12-1');assert.equal(loaded.checksum,archive.checksum);assert.equal(archive.tables.farm_lots[0].code,'1');
 for(const table of ['pig_farms','farm_lots']){const broken=structuredClone(data);broken.tables[table]=[null];assert.throws(()=>readBackup(packBackup(sealBackup(broken))),code('BACKUP_INVALID_FILE'));}
});
test('backup format preserves exact cents beyond Number precision in compressed and JSON files',()=>{
 const data=sealBackup(fixture());
 for(const file of [packBackup(data),Buffer.from(JSON.stringify(data))])assert.deepEqual(readBackup(file),data);
 const changed=fixture();changed.tables.journal_lines[0].debit='9999999999999.98';
 assert.throws(()=>readBackup(packBackup(sealBackup(changed))),code('BACKUP_INVALID_ACCOUNTING'));
});
test('backup format rejects corruption, foreign company rows, duplicated keys and missing links',()=>{
 const data=sealBackup(fixture()),modified=structuredClone(data);modified.tables.companies[0].name='Changed';
 assert.throws(()=>readBackup(packBackup(modified)),code('BACKUP_CHECKSUM'));
 for(const [mutate,expected]of [
  [value=>value.tables.accounts[0].company_id=99,'BACKUP_INVALID_FILE'],
  [value=>value.tables.accounts.push(value.tables.accounts[0]),'BACKUP_INVALID_FILE'],
  [value=>value.tables.journal_lines[0].account_id=999,'BACKUP_BROKEN_LINKS'],
  [value=>value.tables.journal_entries[0].entry_date='2027-01-01','BACKUP_INVALID_ACCOUNTING'],
  [value=>value.tables.secrets=[],'BACKUP_INVALID_FILE'],
  [value=>value.tables.accounts[0].parent_id=4,'BACKUP_INVALID_ACCOUNTING'],
 ]){
  const value=fixture();mutate(value);assert.throws(()=>readBackup(packBackup(sealBackup(value))),code(expected));
 }
 for(const file of [Buffer.alloc(0),Buffer.from('null'),Buffer.from('{'),Buffer.from([0x1f,0x8b,0,0])])assert.throws(()=>readBackup(file),code('BACKUP_INVALID_FILE'));
});
test('multiple-year backup metadata must identify exactly its selected periods',()=>{
 const data=fixture();data.tables.accounting_exercises.push({...data.tables.accounting_exercises[0],id:20,name:'2025',start_date:'2025-01-01',end_date:'2025-12-31'});data.scope={kind:'exercises',exercise_ids:[20,2]};
 assert.equal(readBackup(packBackup(sealBackup(data))).tables.accounting_exercises.length,2);
 for(const exercise_ids of [[],[2],[2,2],[2,21],['2',20]]){
  const changed=structuredClone(data);changed.scope.exercise_ids=exercise_ids;assert.throws(()=>readBackup(packBackup(sealBackup(changed))),code('BACKUP_INVALID_FILE'));
 }
});
test('binary backup values preserve every byte and reject invalid or ambiguous base64',()=>{
 const data=Buffer.from([0,1,127,128,255]);
 assert.deepEqual(binaryValue({$binary_base64:data.toString('base64')}),data);
 for(const value of [null,{},'AAAA',{$binary_base64:'not base64'},{$binary_base64:'YQ'},{ $binary_base64:'YQ==',extra:true }])assert.throws(()=>binaryValue(value),code('BACKUP_INVALID_FILE'));
});
