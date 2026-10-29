import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { HttpError } from '../middleware/errors.js';
import { companyFormats } from '../../../shared/company-formats.js';
import {farmLotsOverlap} from '../../../shared/farm-lots.js';
import {calculateFarmSale} from '../../../shared/farm-sale-money.js';
import {transferAmounts,productionDecimal} from '../../../shared/farm-production.js';
import {reconciliationConcept,scaleReconciliationCounterLines} from '../../../shared/reconciliation-proposals.js';
import { normalizeVatInput,vatPeriod } from '../../../shared/vat-model.js';
import {accountPartyType,normalizePartyProfile} from '../../../shared/account-party.js';
import {normalizePartyPaymentProfile} from '../../../shared/party-payments.js';
import {normalizeSepaMandate} from '../../../shared/sepa.js';

export const MAX_BACKUP_FILE = 100 * 1024 * 1024;
export const MAX_BACKUP_JSON = 256 * 1024 * 1024;
export const TABLES = {
 companies: { key: ['id'], refs: {} },
 company_details: { key: ['company_id'], refs: {} },
 company_logos: { key: ['company_id'], refs: {} },
 vat_drafts: { key: ['tax_year','frequency','period'], refs: {} },
 accounting_exercises: { key: ['start_date','end_date'], refs: {} },
 accounts: { key: ['code'], refs: { parent_id:'accounts' } },
 bank_connections: { key: ['iban'], refs: { account_id:'accounts' } },
 bank_reconciliation_rules: {key:['bank_account_id','concept_key','direction'],refs:{bank_account_id:'accounts'}},
 suppliers: { key: ['code'], refs: { account_id:'accounts' } },
 company_documents: { key: ['request_id'], refs: {} },
 pig_farms: { key: ['code'], refs: {} },
 farm_lots: { key: ['farm_id','code'], refs: {farm_id:'pig_farms'} },
 farm_sales: { key: ['request_id'], refs: {exercise_id:'accounting_exercises',lot_id:'farm_lots'} },
 farm_deaths: { key: ['request_id'], refs: {exercise_id:'accounting_exercises',lot_id:'farm_lots'} },
 farm_care_costs: { key: ['request_id'], refs: {exercise_id:'accounting_exercises',lot_id:'farm_lots'} },
 farm_feed_transfers: { key: ['request_id'], refs: {exercise_id:'accounting_exercises',source_lot_id:'farm_lots',destination_lot_id:'farm_lots'} },
 farm_documents: { key: ['source_sha256'], refs: {} },
 farm_invoices: { key: ['supplier_tax_id','reference'], refs: { exercise_id:'accounting_exercises',document_id:'farm_documents' } },
 farm_cost_lines: { key: ['invoice_id','position'], refs: { invoice_id:'farm_invoices',farm_id:'pig_farms',lot_id:'farm_lots' } },
 journal_imports: { key: ['exercise_id'], refs: { exercise_id:'accounting_exercises' } },
 exercise_operations: { key: ['request_id'], refs: { exercise_id:'accounting_exercises',source_exercise_id:'accounting_exercises' } },
 journal_entries: { key: ['request_id'], refs: { exercise_id:'accounting_exercises',import_id:'journal_imports',exercise_operation_id:'exercise_operations',cancelled_by_operation_id:'exercise_operations' } },
 journal_lines: { key: ['entry_id','position'], refs: { entry_id:'journal_entries',account_id:'accounts' } },
 trade_invoices: { key: ['request_id'], refs: { exercise_id:'accounting_exercises',party_account_id:'accounts',offset_account_id:'accounts',vat_account_id:'accounts',withholding_account_id:'accounts',entry_id:'journal_entries',void_entry_id:'journal_entries' } },
 trade_invoice_lines: { key: ['invoice_id','position'], refs: { invoice_id:'trade_invoices' } },
 portfolio_receipts: { key: ['invoice_id','position'], refs: { invoice_id:'trade_invoices' } },
 portfolio_settlements: { key: ['request_id'], refs: { exercise_id:'accounting_exercises',receipt_id:'portfolio_receipts',bank_account_id:'accounts',entry_id:'journal_entries',reversal_entry_id:'journal_entries' } },
 bank_remittances:{key:['request_id'],refs:{}},
 invoice_documents: { key: ['exercise_id','source_sha256'], refs: { exercise_id:'accounting_exercises',invoice_id:'trade_invoices',entry_id:'journal_entries' } },
 bank_reconciliations: { key: ['exercise_id','account_id','source_sha256'], refs: { exercise_id:'accounting_exercises',account_id:'accounts' } },
};
export const TABLE_ORDER = Object.keys(TABLES);
export const SHARED = new Set(['companies','company_details','company_logos','vat_drafts','accounts','bank_connections','bank_reconciliation_rules','bank_remittances','suppliers','company_documents','pig_farms','farm_lots','farm_documents']);
export const FARM_TABLES = new Set(['pig_farms','farm_lots','farm_sales','farm_deaths','farm_care_costs','farm_feed_transfers','farm_documents','farm_invoices','farm_cost_lines']);
export const OPTIONAL_TABLES=new Set([...FARM_TABLES,'bank_reconciliation_rules','vat_drafts','bank_remittances']);
export const fail = (code, status=400) => { throw new HttpError(status, code); };
export const sha = value => createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const encodeRow = row => Object.fromEntries(Object.entries(row).map(([key,value])=>[key,Buffer.isBuffer(value)?{$binary_base64:value.toString('base64')}:value]));
const plain = value => value!==null&&typeof value==='object'&&!Array.isArray(value);
const identity = row => row?.id ?? row?.company_id;
export function sealBackup(data) { return {...data,checksum:sha(data)}; }
export function packBackup(data) {
 const buffer=Buffer.from(JSON.stringify(data));
 if(buffer.length>MAX_BACKUP_JSON)fail('BACKUP_TOO_LARGE',413);
 const file=gzipSync(buffer);
 if(file.length>MAX_BACKUP_FILE)fail('BACKUP_TOO_LARGE',413);
 return file;
}
export function readBackup(buffer) {
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_BACKUP_FILE)fail('BACKUP_INVALID_FILE');
 let data;
 try {
  const decoded=buffer[0]===0x1f&&buffer[1]===0x8b?gunzipSync(buffer,{maxOutputLength:MAX_BACKUP_JSON}):buffer;
  if(decoded.length>MAX_BACKUP_JSON)fail('BACKUP_TOO_LARGE',413);
  data=JSON.parse(decoded.toString('utf8'));
 } catch(error) { if(error instanceof HttpError)throw error;fail('BACKUP_INVALID_FILE'); }
 if(!plain(data)||data.format!=='contabilitat-backup'||data.version!==1)fail('BACKUP_INVALID_FILE');
 const {checksum,...content}=data;
 if(typeof checksum!=='string'||checksum!==sha(content))fail('BACKUP_CHECKSUM');
 // Match the numeric lot naming migration when reading a pre-026 archive.
 if(!Object.hasOwn(data.tables||{},'farm_care_costs')&&Array.isArray(data.tables?.farm_lots)&&Array.isArray(data.tables?.pig_farms)){
  for(const lot of data.tables.farm_lots){if(!plain(lot))continue;const farm=data.tables.pig_farms.find(row=>plain(row)&&row.id===lot.farm_id);if(typeof farm?.code!=='string'||! /^[1-9]\d{0,8}$/.test(String(lot.code)))continue;const code=farm.code+'-'+lot.code;if(!data.tables.farm_lots.some(other=>plain(other)&&other!==lot&&other.farm_id===lot.farm_id&&other.code===code))lot.code=code;}
 }
 // Add wholly absent farm tables from older archives after verifying their original checksum.
 for(const table of OPTIONAL_TABLES)if([data.tables,data.references,data.schema].every(section=>plain(section)&&!Object.hasOwn(section,table))){data.tables[table]=[];data.references[table]=[];data.schema[table]=[];}
 validateBackup(data);
 return data;
}
export function binaryValue(value) {
 if(!plain(value)||Object.keys(value).join()!=='$binary_base64'||typeof value.$binary_base64!=='string')fail('BACKUP_INVALID_FILE');
 const decoded=Buffer.from(value.$binary_base64,'base64');
 if(decoded.toString('base64')!==value.$binary_base64||decoded.length>16*1024*1024)fail('BACKUP_INVALID_FILE');
 return decoded;
}
const money = value => {
 if(typeof value!=='string'||! /^-?\d{1,22}\.\d{2}$/.test(value))fail('BACKUP_INVALID_ACCOUNTING');
 return BigInt(value.replace('.',''));
};
export function validateBackup(data) {
 if(!plain(data.tables)||!plain(data.references)||!plain(data.schema)||!plain(data.scope)||!['company','exercise','exercises'].includes(data.scope.kind))fail('BACKUP_INVALID_FILE');
 for(const section of [data.tables,data.references,data.schema])if(Object.keys(section).some(table=>!Object.hasOwn(TABLES,table)))fail('BACKUP_INVALID_FILE');
 const company=data.tables.companies?.[0];
 if(data.tables.companies?.length!==1||!Number.isSafeInteger(company?.id)||company.id<1||typeof company.name!=='string')fail('BACKUP_INVALID_FILE');
 if(company.business_format!==undefined&&!companyFormats.includes(company.business_format))fail('BACKUP_INVALID_FILE');
 const indexes={},owned={};let total=0;
 for(const table of TABLE_ORDER){
  if(!Array.isArray(data.tables[table])||!Array.isArray(data.references[table])||!Array.isArray(data.schema[table]))fail('BACKUP_INVALID_FILE');
  const index=new Map();indexes[table]=index;owned[table]=new Set(data.tables[table].map(identity));
  for(const row of [...data.tables[table],...data.references[table]]){
   if(!plain(row)||!Number.isSafeInteger(identity(row))||identity(row)<1||index.has(identity(row))||(table!=='companies'&&row.company_id!==company.id))fail('BACKUP_INVALID_FILE');
   if(Object.keys(row).some(key=>!data.schema[table].includes(key)||['__proto__','constructor','prototype'].includes(key)))fail('BACKUP_INVALID_FILE');
   index.set(identity(row),row);if(++total>300000)fail('BACKUP_TOO_LARGE',413);
  }
 }
 if(!data.tables.accounting_exercises.length||data.scope.kind==='exercise'&&(data.tables.accounting_exercises.length!==1||data.scope.exercise_id!==data.tables.accounting_exercises[0].id))fail('BACKUP_INVALID_FILE');
 if(data.scope.kind==='exercises'){
  const ids=data.scope.exercise_ids;
  if(!Array.isArray(ids)||ids.length<2||ids.length>1000||new Set(ids).size!==ids.length||ids.some(value=>!Number.isSafeInteger(value)||value<1)||ids.length!==data.tables.accounting_exercises.length||data.tables.accounting_exercises.some(row=>!ids.includes(row.id)))fail('BACKUP_INVALID_FILE');
 }
 const periods=new Map(data.tables.accounting_exercises.map(row=>[row.id,row]));
 for(const table of TABLE_ORDER)for(const row of [...data.tables[table],...data.references[table]]){
  for(const [field,target]of Object.entries(TABLES[table].refs))if(row[field]!=null&&!indexes[target].has(row[field]))fail('BACKUP_BROKEN_LINKS');
  if(!SHARED.has(table)&&row.exercise_id!=null&&owned[table].has(identity(row))&&!periods.has(row.exercise_id))fail('BACKUP_INVALID_FILE');
  if(owned[table].has(identity(row))&&table==='journal_lines'&&!owned.journal_entries.has(row.entry_id))fail('BACKUP_BROKEN_LINKS');
  if(owned[table].has(identity(row))&&['trade_invoice_lines','portfolio_receipts'].includes(table)&&!owned.trade_invoices.has(row.invoice_id))fail('BACKUP_BROKEN_LINKS');
  if(owned[table].has(identity(row))&&table==='farm_cost_lines'&&!owned.farm_invoices.has(row.invoice_id))fail('BACKUP_BROKEN_LINKS');
 }
 const codes=new Set();
 for(const account of [...data.tables.accounts,...data.references.accounts])if(account.sepa_mandate!=null){try{if(accountPartyType(account)!=='customer')throw new Error();normalizeSepaMandate(account.sepa_mandate);}catch{fail('BACKUP_INVALID_ACCOUNTING');}}
 for(const receipt of [...data.tables.portfolio_receipts,...data.references.portfolio_receipts])if(receipt.split_history!=null){
  if(!Array.isArray(receipt.split_history))fail('BACKUP_INVALID_ACCOUNTING');
  for(const split of receipt.split_history){
   if(!plain(split)||!Array.isArray(split.parts)||split.parts.length<2||split.parts.length>60||!plain(split.before)||typeof split.request_id!=='string'||! /^[a-f0-9]{64}$/.test(split.request_hash)||new Set(split.parts.map(row=>row.receipt_id)).size!==split.parts.length)fail('BACKUP_INVALID_ACCOUNTING');
   if(split.parts.some(row=>indexes.portfolio_receipts.get(row.receipt_id)?.invoice_id!==receipt.invoice_id||money(row.amount)<=0n)||split.parts.reduce((sum,row)=>sum+money(row.amount),0n)!==money(split.before.amount)-money(split.before.paid_amount))fail('BACKUP_INVALID_ACCOUNTING');
  }
 }
 for(const remittance of data.tables.bank_remittances){
  if(!['issued','received'].includes(remittance.direction)||!['prepared','cancelled','archived'].includes(remittance.status)||!Array.isArray(remittance.receipt_ids)||remittance.receipt_ids.some(value=>!Number.isSafeInteger(value)||value<1)||new Set(remittance.receipt_ids).size!==remittance.receipt_ids.length||!plain(remittance.snapshot)||!Array.isArray(remittance.snapshot.items)||!remittance.snapshot.items.length||remittance.snapshot.items.length>1000||!plain(remittance.snapshot.bank)||! /^[A-Za-z0-9.-]+\.xml$/.test(remittance.filename))fail('BACKUP_INVALID_FILE');
  if(sha(binaryValue(remittance.xml_content))!==remittance.xml_sha256)fail('BACKUP_CHECKSUM');
  if(remittance.snapshot.items.reduce((sum,row)=>sum+money(row.amount),0n)!==money(remittance.snapshot.total))fail('BACKUP_INVALID_ACCOUNTING');
 }
 for(const account of [...data.tables.accounts,...data.references.accounts])if(account.payment_profile!=null){try{if(!accountPartyType(account))throw new Error();normalizePartyPaymentProfile(account.payment_profile);}catch{fail('BACKUP_INVALID_ACCOUNTING');}}
 for(const invoice of [...data.tables.trade_invoices,...data.references.trade_invoices])if(invoice.payment_snapshot!=null){try{normalizePartyPaymentProfile(invoice.payment_snapshot);}catch{fail('BACKUP_INVALID_ACCOUNTING');}}
 for(const account of [...data.tables.accounts,...data.references.accounts])if(account.party_profile!=null){
  try{if(!accountPartyType(account))throw new Error();normalizePartyProfile(account.party_profile);}catch{fail('BACKUP_INVALID_ACCOUNTING');}
 }
 for(const invoice of [...data.tables.trade_invoices,...data.references.trade_invoices])if(invoice.party_snapshot!=null){
  try{const profile=normalizePartyProfile(invoice.party_snapshot);if(['name','tax_id','address','email'].some(key=>profile[key]!==invoice['party_'+key]))throw new Error();}catch{fail('BACKUP_INVALID_ACCOUNTING');}
 }
 for(const draft of data.tables.vat_drafts){
  try{vatPeriod({year:draft.tax_year,frequency:draft.frequency,period:draft.period});normalizeVatInput(draft.payload);if(!Number.isSafeInteger(draft.version)||draft.version<1)throw new Error();}catch{fail('BACKUP_INVALID_ACCOUNTING');}
 }
 for(const rule of data.tables.bank_reconciliation_rules){
  if(typeof rule.concept!=='string'||rule.concept.length>200||rule.concept_key!==reconciliationConcept(rule.concept)||rule.concept_key.length<3||!['in','out'].includes(rule.direction)||indexes.accounts.get(rule.bank_account_id)?.kind!=='subaccount')fail('BACKUP_INVALID_ACCOUNTING');
  const value=money(rule.bank_amount);if(!value||(value<0n)!==(rule.direction==='out'))fail('BACKUP_INVALID_ACCOUNTING');
  try{scaleReconciliationCounterLines(rule.counter_lines,rule.bank_amount,rule.bank_amount);}catch{fail('BACKUP_INVALID_ACCOUNTING');}
  if(new Set(rule.counter_lines.map(line=>line.account_id)).size!==rule.counter_lines.length||rule.counter_lines.some(line=>line.account_id===rule.bank_account_id||indexes.accounts.get(line.account_id)?.kind!=='subaccount'))fail('BACKUP_BROKEN_LINKS');
 }
 for(const report of data.tables.bank_reconciliations){
  const posted=report.snapshot?.posted_movements;if(posted!==undefined){if(!Array.isArray(posted)||posted.length>10000)fail('BACKUP_INVALID_ACCOUNTING');for(const movement of posted)if(indexes.journal_entries.get(movement.entry_id)?.exercise_id!==report.exercise_id)fail('BACKUP_BROKEN_LINKS');}
  const manual=report.snapshot?.manual_proposals;if(manual===undefined)continue;if(!Array.isArray(manual)||manual.length>10000)fail('BACKUP_INVALID_ACCOUNTING');
  for(const proposal of manual){try{scaleReconciliationCounterLines(proposal.counter_lines,proposal.bank_amount,proposal.bank_amount);}catch{fail('BACKUP_INVALID_ACCOUNTING');}if(proposal.counter_lines.some(line=>line.account_id===report.account_id||indexes.accounts.get(line.account_id)?.kind!=='subaccount'))fail('BACKUP_BROKEN_LINKS');}
 }
 const lots=data.tables.farm_lots;
 for(const [index,lot]of lots.entries()){
  try{for(const field of ['entry_kg_per_pig','entry_price_per_pig','feed_opening_kg','feed_closing_kg'])if(lot[field]!=null)productionDecimal(lot[field],field==='entry_price_per_pig'?2:3,{positive:field==='entry_kg_per_pig'});}catch{fail('BACKUP_INVALID_ACCOUNTING');}
  if(lot.entry_cost_included!==undefined&&![0,1].includes(lot.entry_cost_included))fail('BACKUP_INVALID_ACCOUNTING');
  if(lot.exit_date&&lot.exit_date<lot.entry_date)fail('BACKUP_INVALID_ACCOUNTING');
  if(lots.slice(0,index).some(other=>other.farm_id===lot.farm_id&&(other.code===lot.code||!other.exit_date&&!lot.exit_date||farmLotsOverlap(other,lot))))fail('BACKUP_INVALID_ACCOUNTING');
 }
 for(const line of data.tables.farm_cost_lines){
  if(line.lot_id!=null&&indexes.farm_lots.get(line.lot_id)?.farm_id!==line.farm_id)fail('BACKUP_BROKEN_LINKS');
  if(line.lot_assignment!==undefined&&(!['auto','manual','unassigned'].includes(line.lot_assignment)||(line.lot_assignment==='manual')!==(line.lot_id!=null)))fail('BACKUP_INVALID_ACCOUNTING');
 }
 for(const sale of data.tables.farm_sales){
  let calculated;try{calculated=calculateFarmSale(sale);}catch{fail('BACKUP_INVALID_ACCOUNTING');}
  const period=periods.get(sale.exercise_id);
  if(!period||sale.sale_date<period.start_date||sale.sale_date>period.end_date||calculated.total_kg!==sale.total_kg||calculated.total_amount!==sale.total_amount||![0,1].includes(sale.voided))fail('BACKUP_INVALID_ACCOUNTING');
 }
 for(const [name,dateField]of [['farm_deaths','event_date'],['farm_feed_transfers','event_date']])for(const event of data.tables[name]){
  const period=periods.get(event.exercise_id);if(!period||event[dateField]<period.start_date||event[dateField]>period.end_date||![0,1].includes(event.voided))fail('BACKUP_INVALID_ACCOUNTING');
  if(name==='farm_deaths'){if(!Number.isInteger(event.pigs)||event.pigs<1||event.pigs>10000000)fail('BACKUP_INVALID_ACCOUNTING');}
  else{let amounts;try{amounts=transferAmounts(event);}catch{fail('BACKUP_INVALID_ACCOUNTING');}if(event.source_lot_id===event.destination_lot_id||amounts.total_amount!==event.total_amount)fail('BACKUP_INVALID_ACCOUNTING');}
 }
 for(const row of data.tables.farm_care_costs){const period=periods.get(row.exercise_id);if(!period||row.event_date<period.start_date||row.event_date>period.end_date||money(row.amount)<=0n||![0,1].includes(row.voided))fail('BACKUP_INVALID_ACCOUNTING');}
 for(const row of data.tables.accounts){
  if(typeof row.code!=='string'||!/^[1-9]\d*$/.test(row.code)||codes.has(row.code)||!['account','subaccount'].includes(row.kind))fail('BACKUP_INVALID_ACCOUNTING');
  codes.add(row.code);
  if(row.parent_id!=null){const parent=indexes.accounts.get(row.parent_id);if(parent.kind!=='account'||!row.code.startsWith(parent.code)||parent.code.length>=row.code.length)fail('BACKUP_INVALID_ACCOUNTING');}
 }
 const byEntry=new Map(),byInvoice=new Map(),byReceipt=new Map();
 for(const line of data.tables.journal_lines){
  if(indexes.accounts.get(line.account_id)?.kind!=='subaccount')fail('BACKUP_INVALID_ACCOUNTING');
  const sum=byEntry.get(line.entry_id)||{debit:0n,credit:0n,count:0};
  sum.debit+=money(line.debit);sum.credit+=money(line.credit);sum.count++;byEntry.set(line.entry_id,sum);
 }
 for(const entry of data.tables.journal_entries){
  const sums=byEntry.get(entry.id),period=periods.get(entry.exercise_id);
  if(!sums||sums.debit!==sums.credit||!period||entry.entry_date<period.start_date||entry.entry_date>period.end_date)fail('BACKUP_INVALID_ACCOUNTING');
 }
 for(const line of data.tables.trade_invoice_lines){const rows=byInvoice.get(line.invoice_id)||[];rows.push(line);byInvoice.set(line.invoice_id,rows);}
 for(const receipt of data.tables.portfolio_receipts){const rows=byReceipt.get(receipt.invoice_id)||[];rows.push(receipt);byReceipt.set(receipt.invoice_id,rows);}
 for(const invoice of data.tables.trade_invoices){
  const lines=byInvoice.get(invoice.id)||[],receipts=byReceipt.get(invoice.id)||[];
  const sum=(rows,field)=>rows.reduce((total,row)=>total+money(row[field]),0n);
  if(!lines.length||!receipts.length||sum(lines,'base')!==money(invoice.base_total)||sum(lines,'tax_amount')!==money(invoice.tax_total)||sum(receipts,'amount')!==money(invoice.total_amount)||money(invoice.base_total)+money(invoice.tax_total)-money(invoice.withholding_total)!==money(invoice.total_amount))fail('BACKUP_INVALID_ACCOUNTING');
 }
 for(const invoice of data.tables.farm_invoices){
  const lines=data.tables.farm_cost_lines.filter(line=>line.invoice_id===invoice.id),period=periods.get(invoice.exercise_id);
  if(!period||invoice.invoice_date<period.start_date||invoice.invoice_date>period.end_date||!lines.length||lines.reduce((total,line)=>total+money(line.base_amount),0n)!==money(invoice.base_total)||lines.reduce((total,line)=>total+money(line.vat_amount),0n)!==money(invoice.vat_total)||money(invoice.base_total)+money(invoice.vat_total)!==money(invoice.total_amount))fail('BACKUP_INVALID_ACCOUNTING');
  for(const line of lines)if(money(line.base_amount)+money(line.vat_amount)!==money(line.total_amount))fail('BACKUP_INVALID_ACCOUNTING');
 }
 return data;
}
