import {fail} from './validation.js';
export const backupFrequencies=['daily','weekly','monthly'];
export const backupTimezone='Europe/Madrid';
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:backupTimezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function localBackupDate(value){return localParts(value).date;}
function localParts(value){const parts=Object.fromEntries(formatter.formatToParts(value).map(row=>[row.type,row.value]));return {date:parts.year+'-'+parts.month+'-'+parts.day,time:parts.hour+':'+parts.minute,year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:Number(parts.hour),minute:Number(parts.minute)};}
function addDays(value,days){const day=new Date(value+'T12:00:00Z');day.setUTCDate(day.getUTCDate()+days);return day.toISOString().slice(0,10);}
// Check both UTC offsets around the date. On a repeated hour use the first occurrence;
// on a missing hour advance by the DST gap (02:30 becomes 03:30).
export function scheduledInstant(day,time){
 const [year,month,date]=day.split('-').map(Number),[hour,minute]=time.split(':').map(Number),target=Date.UTC(year,month-1,date,hour,minute);
 const offsets=[-86400000,0,86400000].map(delta=>{const probe=new Date(target+delta),parts=localParts(probe);return Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute)-probe.getTime();});
 const candidates=[...new Set(offsets)].map(offset=>new Date(target-offset)).sort((a,b)=>a-b);
 return candidates.find(value=>{const parts=localParts(value);return parts.date===day&&parts.time===time;})||candidates.find(value=>{const parts=localParts(value);return parts.date===day&&parts.time>time;});
}
function matches(schedule,day){
 if(schedule.frequency==='daily')return true;
 const value=new Date(day+'T12:00:00Z');
 if(schedule.frequency==='weekly')return (value.getUTCDay()||7)===schedule.weekday;
 const last=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate();
 return value.getUTCDate()===Math.min(schedule.month_day,last);
}
export function nextBackupRun(schedule,after){
 const day=localBackupDate(after);
 for(let index=0;index<370;index++){const candidate=addDays(day,index);if(matches(schedule,candidate)){const at=scheduledInstant(candidate,schedule.run_time);if(at>after)return at;}}
 throw new Error('BACKUP_INVALID_SCHEDULE');
}
export function latestBackupDue(schedule,now){
 const day=localBackupDate(now);
 for(let index=0;index<370;index++){const candidate=addDays(day,-index);if(matches(schedule,candidate)){const at=scheduledInstant(candidate,schedule.run_time);if(at<=now)return at;}}
 throw new Error('BACKUP_INVALID_SCHEDULE');
}
export function validateBackupSchedules(body){
 if(!body||!Array.isArray(body.schedules)||body.schedules.length!==3)fail('BACKUP_INVALID_SCHEDULE');
 const seen=new Set();return body.schedules.map(row=>{
  if(!row||!backupFrequencies.includes(row.frequency)||seen.has(row.frequency)||typeof row.enabled!=='boolean'||typeof row.run_time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.run_time)||!Number.isInteger(row.weekday)||row.weekday<1||row.weekday>7||!Number.isInteger(row.month_day)||row.month_day<1||row.month_day>31)fail('BACKUP_INVALID_SCHEDULE');
  seen.add(row.frequency);return {frequency:row.frequency,enabled:row.enabled,run_time:row.run_time,weekday:row.weekday,month_day:row.month_day};
 });
}
export const defaultBackupSchedules=()=>backupFrequencies.map(frequency=>({frequency,enabled:false,run_time:'21:00',weekday:1,month_day:1,next_run_at:null,last_success_at:null,last_error_code:null}));
