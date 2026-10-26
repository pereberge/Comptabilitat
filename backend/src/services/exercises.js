import { HttpError } from '../middleware/errors.js';
import { date, fail, id } from './validation.js';
import { lockCompany } from './subaccounts.js';
import { withTransaction } from '../db/transaction.js';
import { operationHash, operationRequest, operationReplay, recordExerciseOperation, finishExerciseOperation, openingWithNewExercise } from './exercise-operations.js';

export function createExerciseService(pool, companyId) {
  return {
    async list() {
      const [rows] = await pool.execute(`SELECT e.id,e.name,e.start_date,e.end_date,e.status,e.is_default,
        (SELECT COUNT(*) FROM journal_entries j WHERE j.company_id=e.company_id AND j.exercise_id=e.id) AS entries_count,
        (SELECT COUNT(*) FROM journal_lines l JOIN journal_entries j ON j.id=l.entry_id AND j.company_id=l.company_id WHERE j.company_id=e.company_id AND j.exercise_id=e.id) AS lines_count,
        i.id AS import_id,i.source_name,i.source_company,i.entry_count,i.line_count,i.account_count,i.debit_total,i.credit_total,i.imported_at
        FROM accounting_exercises e LEFT JOIN journal_imports i ON i.company_id=e.company_id AND i.exercise_id=e.id
        WHERE e.company_id=? ORDER BY e.start_date DESC`, [companyId]);
      const [annual]=await pool.execute("SELECT id,exercise_id,number,entry_date,entry_type,status,import_id FROM journal_entries WHERE company_id=? AND entry_type IN ('opening','regularization','closing') ORDER BY number",[companyId]);
      const [clears]=await pool.execute('SELECT id,exercise_id,created_at FROM exercise_clears WHERE company_id=? ORDER BY id DESC',[companyId]);
      return rows.map(row => ({ last_clear:clears.find(clear=>clear.exercise_id===row.id)||null,id:row.id,name:row.name,start_date:row.start_date,end_date:row.end_date,status:row.status,is_default:!!row.is_default,
        annual_entries:annual.filter(entry=>entry.exercise_id===row.id),
        entries_count:row.entries_count,lines_count:row.lines_count,
        import:row.import_id ? {id:row.import_id,source_name:row.source_name,source_company:row.source_company,entries:row.entry_count,lines:row.line_count,
          accounts:row.account_count,debit:row.debit_total,credit:row.credit_total,imported_at:row.imported_at} : null }));
    },
    async create(body) {
      if (!body || Object.keys(body).some(key => !['name','start_date','end_date','is_default','opening_from_exercise_id','opening_preview_hash','request_id'].includes(key))) fail('INVALID_EXERCISE');
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 60) fail('INVALID_EXERCISE');
      const start = date(body.start_date), end = date(body.end_date), isDefault = body.is_default ?? true;
      if (start > end) fail('INVALID_EXERCISE_PERIOD');
      if (typeof isDefault !== 'boolean') fail('INVALID_EXERCISE');
      const sourceId=body.opening_from_exercise_id ? id(body.opening_from_exercise_id) : null;
      let data;
      if(sourceId){
        if(typeof body.opening_preview_hash!=='string'||!/^[a-f0-9]{64}$/.test(body.opening_preview_hash))fail('ANNUAL_PREVIEW_REQUIRED');
        data={request_id:operationRequest(body.request_id),preview_hash:body.opening_preview_hash};
        data.digest=operationHash({kind:'create_exercise',name:body.name.trim(),start,end,isDefault,sourceId,...data});
      }else if(body.opening_preview_hash!==undefined||body.request_id!==undefined)fail('INVALID_EXERCISE');
      return withTransaction(pool, async db => {
        const settings=await lockCompany(db, companyId);
        if(data){const replay=await operationReplay(db,companyId,data.request_id,data.digest);if(replay)return replay;}
        const [overlaps] = await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND start_date<=? AND end_date>=? FOR UPDATE', [companyId,end,start]);
        if (overlaps.length) throw new HttpError(409, 'EXERCISE_PERIOD_OVERLAP');
        const [duplicates] = await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND name=?', [companyId,body.name.trim()]);
        if (duplicates.length) throw new HttpError(409, 'EXERCISE_NAME_EXISTS');
        if (isDefault) await db.execute('UPDATE accounting_exercises SET is_default=0 WHERE company_id=? AND is_default=1', [companyId]);
        const [created] = await db.execute("INSERT INTO accounting_exercises (company_id,name,start_date,end_date,status,is_default) VALUES (?,?,?,?,'open',?)", [companyId,body.name.trim(),start,end,isDefault]);
        const result={id:created.insertId,name:body.name.trim(),start_date:start,end_date:end,status:'open',is_default:isDefault};
        if(sourceId){
          result.opening=await openingWithNewExercise(db,companyId,settings,created.insertId,sourceId,body.opening_preview_hash);
          const operationId=await recordExerciseOperation(db,companyId,created.insertId,'create_exercise',data,{...result,source_exercise_id:sourceId},sourceId);
          return finishExerciseOperation(db,companyId,operationId,{...result,replayed:false});
        }
        return result;
      });
    },
    async history(exerciseId){
      const [[exercise]]=await pool.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,id(exerciseId)]);
      if(!exercise)throw new HttpError(404,'EXERCISE_NOT_FOUND');
      const [rows]=await pool.execute(`SELECT o.id,o.exercise_id,o.source_exercise_id,o.kind,o.reason,o.created_at,o.result FROM exercise_operations o WHERE o.company_id=? AND (o.exercise_id=? OR EXISTS(SELECT 1 FROM journal_entries j WHERE j.company_id=o.company_id AND j.exercise_id=? AND j.cancelled_by_operation_id=o.id)) ORDER BY o.id DESC`,[companyId,exercise.id,exercise.id]);
      return rows.map(row=>({...row,result:typeof row.result==='string'?JSON.parse(row.result):row.result}));
    },
  };
}
