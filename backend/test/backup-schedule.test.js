import test from 'node:test';
import assert from 'node:assert/strict';
import {nextBackupRun,latestBackupDue,scheduledInstant,validateBackupSchedules,defaultBackupSchedules} from '../src/services/backup-schedule.js';
import {requiredPermission} from '../src/middleware/access.js';
const schedule=(frequency,extra={})=>({frequency,run_time:'21:00',weekday:1,month_day:1,...extra});
test('Madrid daily and weekly schedules cross days, years and DST',()=>{
 assert.equal(nextBackupRun(schedule('daily'),new Date('2026-10-22T19:00:00Z')).toISOString(),'2026-10-23T19:00:00.000Z');
 assert.equal(nextBackupRun(schedule('weekly'),new Date('2026-12-31T22:00:00Z')).toISOString(),'2027-01-04T20:00:00.000Z');
 assert.equal(scheduledInstant('2026-03-29','02:30').toISOString(),'2026-03-29T01:30:00.000Z');
 assert.equal(scheduledInstant('2026-10-25','02:30').toISOString(),'2026-10-25T00:30:00.000Z');
 assert.equal(nextBackupRun(schedule('daily',{run_time:'02:30'}),new Date('2026-10-25T01:00:00Z')).toISOString(),'2026-10-26T01:30:00.000Z');
});
test('monthly days clamp to month end including leap years and missed jobs use the latest slot',()=>{
 const monthly=schedule('monthly',{month_day:31});
 assert.equal(nextBackupRun(monthly,new Date('2024-02-01T00:00:00Z')).toISOString(),'2024-02-29T20:00:00.000Z');
 assert.equal(nextBackupRun(monthly,new Date('2026-02-01T00:00:00Z')).toISOString(),'2026-02-28T20:00:00.000Z');
 assert.equal(latestBackupDue(schedule('daily'),new Date('2026-10-25T12:00:00Z')).toISOString(),'2026-10-24T19:00:00.000Z');
 assert.equal(latestBackupDue(monthly,new Date('2026-03-30T10:00:00Z')).toISOString(),'2026-02-28T20:00:00.000Z');
});
test('schedule inputs require three unique types, booleans and valid clock/calendar fields',()=>{
 assert.deepEqual(validateBackupSchedules({schedules:defaultBackupSchedules()}).map(row=>row.enabled),[false,false,false]);
 for(const patch of [{run_time:'24:00'},{run_time:'2:00'},{enabled:1},{month_day:0},{month_day:32},{weekday:8},{frequency:'yearly'}])assert.throws(()=>validateBackupSchedules({schedules:defaultBackupSchedules().map((row,index)=>index?row:{...row,...patch})}),error=>error.code==='BACKUP_INVALID_SCHEDULE');
 assert.throws(()=>validateBackupSchedules({schedules:[schedule('daily'),schedule('daily'),schedule('monthly')]}));
});
test('automatic backup management follows accounting write permission and preserves import restrictions',()=>{
 for(const method of ['POST','PUT','DELETE'])for(const route of ['settings','run','delete-preview','delete'])assert.equal(requiredPermission(method,'/DATA-BACKUPS/AUTOMATIC/'+route+'/'),'accounting_write');
 for(const method of ['GET','HEAD'])assert.equal(requiredPermission(method,'/data-backups/automatic/copies'),null);
 assert.equal(requiredPermission('POST','/data-backups/restore'),'data_import');
});
