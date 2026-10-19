import { HttpError } from '../middleware/errors.js';
import { cents, decimal } from '../../../shared/money.js';
export const fail = code => { throw new HttpError(400, code); };
export function id(value) {
 if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)>4294967295) fail('INVALID_ID');
 return Number(value);
}
export function description(value) {
 if(typeof value !== 'string' || !value.trim() || value.trim().length > 200) fail('INVALID_DESCRIPTION');
 return value.trim();
}
export function date(value) {
 if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1000-01-01' || value > '9999-12-31') fail('INVALID_DATE');
 const parsed = new Date(value+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value) fail('INVALID_DATE');
 return value;
}
export function validateEntry(body) {
 if(!body || typeof body!=='object') fail('INVALID_ENTRY');
 const exerciseId=id(body.exercise_id), entryDate=date(body.entry_date), concept=description(body.description);
 if(typeof body.request_id!=='string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.request_id)) fail('INVALID_REQUEST');
 if(!Array.isArray(body.lines) || body.lines.length<2 || body.lines.length>100) fail('INVALID_LINES');
 let debit=0n, credit=0n;
 const lines=body.lines.map(line=>{
  if(!line || typeof line!=='object') fail('INVALID_LINES');
  let d,c;
  try{ d=cents(line.debit);c=cents(line.credit); }catch{fail('INVALID_AMOUNT');}
  if(!((d>0n && c===0n)||(c>0n && d===0n))) fail('INVALID_LINE_AMOUNTS');
  debit+=d;credit+=c;
  return {account_id:id(line.account_id),description:description(line.description),debit:decimal(d),credit:decimal(c)};
 });
 if(debit>999999999999999n || credit>999999999999999n) fail('TOTAL_TOO_LARGE');
 if(debit!==credit) fail('UNBALANCED_ENTRY');
 return {exerciseId,entryDate,concept,lines,requestId:body.request_id};
}
