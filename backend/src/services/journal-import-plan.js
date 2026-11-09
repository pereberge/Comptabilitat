import {HttpError} from '../middleware/errors.js';
import {amount} from './report-amount.js';
import {decimal} from '../../../shared/money.js';

const conflict=code=>{throw new HttpError(409,code);};
export const journalEntryKey=(entry,sequential=false)=>sequential
 ?JSON.stringify([entry.source_journal_code,entry.source_entry_reference]):String(entry.number);
export function journalEntryContent(entry){
 return JSON.stringify([entry.entry_date,entry.description,entry.entry_type,
  entry.source_journal_code??null,entry.source_entry_reference??null,
  entry.lines.map(line=>[line.code,line.description,line.debit,line.credit])]);
}
export function buildJournalImportPlan(source,entries,lines){
 const sequential=source.numbering==='sequential',byEntry=new Map(),byKey=new Map();
 for(const line of lines){if(!byEntry.has(line.entry_id))byEntry.set(line.entry_id,[]);byEntry.get(line.entry_id).push(line);}
 for(const entry of entries){
  if(sequential&&(!entry.source_journal_code||!entry.source_entry_reference))continue;
  const key=journalEntryKey(entry,sequential);
  if(byKey.has(key))conflict('JOURNAL_ENTRY_CONFLICT');
  byKey.set(key,{...entry,lines:byEntry.get(entry.id)||[]});
 }
 let last=Math.max(0,...entries.map(entry=>entry.number));
 const seen=new Set(),items=source.entries.map(entry=>{
  const key=journalEntryKey(entry,sequential);
  if(seen.has(key))conflict('JOURNAL_ENTRY_CONFLICT');seen.add(key);
  const current=byKey.get(key);
  if(current&&!current.import_id)conflict('JOURNAL_ENTRY_CONFLICT');
  const changed=!!current&&journalEntryContent(current)!==journalEntryContent(entry);
  if(current&&(current.status!=='posted'||current.exercise_operation_id||current.cancelled_by_operation_id||changed&&Number(current.linked_document)))conflict('JOURNAL_ENTRY_PROTECTED');
  const number=current?.number??(sequential?++last:entry.number);
  if(number>4294967295)conflict('JOURNAL_ENTRY_CONFLICT');
  return {source:entry,current,number,action:!current?'added':changed?'updated':'unchanged'};
 });
 const present=new Set(items.filter(item=>item.current).map(item=>item.current.id));
 return {items,summary:{added:items.filter(item=>item.action==='added').length,
  updated:items.filter(item=>item.action==='updated').length,unchanged:items.filter(item=>item.action==='unchanged').length,
  retained:entries.filter(entry=>!present.has(entry.id)).length}};
}

function entrySnapshot(entry){
 if(!entry)return null;
 let debit=0n,credit=0n;
 const lines=entry.lines.map((line,index)=>{
  debit+=amount(line.debit);credit+=amount(line.credit);
  return {position:index+1,code:line.code,account_name:line.account_name??line.source_account_name??'',
   description:line.description,debit:line.debit,credit:line.credit};
 });
 return {entry_date:entry.entry_date,description:entry.description,entry_type:entry.entry_type,
  source_journal_code:entry.source_journal_code??null,source_entry_reference:entry.source_entry_reference??null,
  totals:{debit:decimal(debit),credit:decimal(credit),lines:lines.length},lines};
}
const lineContent=line=>JSON.stringify([line.code,line.description,line.debit,line.credit]);
export function describeJournalImportPlan(plan){
 return plan.items.filter(item=>item.action!=='unchanged').map(item=>{
  const before=entrySnapshot(item.current),after=entrySnapshot(item.source),available=new Map();
  for(const line of before?.lines||[]){
   line.change='removed';const key=lineContent(line);
   if(!available.has(key))available.set(key,[]);available.get(key).push(line);
  }
  for(const line of after.lines){
   const previous=available.get(lineContent(line))?.shift();
   line.change=previous?'unchanged':'added';if(previous)previous.change='unchanged';
  }
  const changedFields=before?['entry_date','description','entry_type','source_journal_code','source_entry_reference'].filter(field=>before[field]!==after[field]):[];
  const orderChanged=!!before&&JSON.stringify(before.lines.map(lineContent))!==JSON.stringify(after.lines.map(lineContent));
  if(orderChanged)changedFields.push('lines');
  return {number:item.number,entry_id:item.current?.id??null,action:item.action,changed_fields:changedFields,
   line_order_changed:orderChanged&&before.lines.every(line=>line.change==='unchanged')&&after.lines.every(line=>line.change==='unchanged'),before,after};
 });
}
