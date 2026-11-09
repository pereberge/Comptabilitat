import { Worker } from 'node:worker_threads';
import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { id } from './validation.js';
import { lockCompany } from './subaccounts.js';
import { ensureAccount } from './account-hierarchy.js';
import { withTransaction } from '../db/transaction.js';
import { companyHasCapability } from '../../../shared/company-formats.js';
import { config } from '../config.js';
import { createAutomaticBackupManager } from './automatic-backups.js';
import { buildJournalImportPlan, describeJournalImportPlan } from './journal-import-plan.js';

const previews = new Map(), lifetime = 15 * 60 * 1000;
const sha = value => createHash('sha256').update(value).digest('hex');
const identity = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function extract(buffer) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./pdf-journal-worker.js', import.meta.url), {workerData:buffer,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
    const timer = setTimeout(() => finish(new HttpError(400,'PDF_JOURNAL_TIMEOUT')), 30000);
    let done = false;
    function finish(error, data) { if(done)return;done=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(data); }
    // Node watch mode can forward dependency notices through this same channel.
    worker.on('message', message => {
      if(message?.type !== 'journal-result')return;
      finish(message.error ? new HttpError(400,message.error) : null,message.data);
    });
    worker.once('error', () => finish(new HttpError(400,'PDF_JOURNAL_INVALID')));
    worker.once('exit', () => { if(!done)finish(new HttpError(400,'PDF_JOURNAL_INVALID')); });
  });
}
function result(row, replayed = false) {
  return {id:row.id,entries:row.entry_count,lines:row.line_count,accounts:row.account_count,debit:row.debit_total,credit:row.credit_total,replayed};
}
function validateContext(company, exercise, source) {
  if(!companyHasCapability(company,'journal_'+(source.format||'libro_diario')))throw new HttpError(409,'JOURNAL_FORMAT_MISMATCH');
  if (![company.name,company.journal_source_name].filter(Boolean).some(name=>identity(name)===identity(source.source_company))) throw new HttpError(409,'JOURNAL_COMPANY_MISMATCH');
  if (exercise.start_date !== source.start_date || exercise.end_date !== source.end_date) throw new HttpError(409,'JOURNAL_PERIOD_MISMATCH');
  if (company.subaccount_length !== source.subaccount_length) throw new HttpError(409,'JOURNAL_ACCOUNT_LENGTH_MISMATCH');
}
export function createJournalImportService(pool, companyId, options={}) {
  async function context(exerciseId, db = pool, lock = false) {
    const [[company]] = await db.execute('SELECT c.id,c.name,c.subaccount_length,c.business_format,d.journal_source_name FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);
    if (!company) throw new HttpError(404,'COMPANY_NOT_FOUND');
    const [[exercise]] = await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?' + (lock ? ' FOR UPDATE' : ''),[companyId,id(exerciseId)]);
    if (!exercise) throw new HttpError(404,'EXERCISE_NOT_FOUND');
    return {company,exercise};
  }
  async function state(db,meta){
    const [[existing]]=await db.execute('SELECT * FROM journal_imports WHERE company_id=? AND exercise_id=? ORDER BY id DESC LIMIT 1',[companyId,meta.exercise.id]);
    const [entries]=await db.execute(`SELECT e.*,
      (EXISTS(SELECT 1 FROM trade_invoices i WHERE i.company_id=e.company_id AND (i.entry_id=e.id OR i.void_entry_id=e.id))
       OR EXISTS(SELECT 1 FROM portfolio_settlements s WHERE s.company_id=e.company_id AND (s.entry_id=e.id OR s.reversal_entry_id=e.id))
       OR EXISTS(SELECT 1 FROM invoice_documents d WHERE d.company_id=e.company_id AND d.entry_id=e.id)
       OR EXISTS(SELECT 1 FROM payroll_slips n WHERE n.company_id=e.company_id AND (n.entry_id=e.id OR n.reversal_entry_id=e.id))) AS linked_document
      FROM journal_entries e WHERE e.company_id=? AND e.exercise_id=? ORDER BY e.number,e.id`,[companyId,meta.exercise.id]);
    const [lines]=await db.execute(`SELECT l.*,a.code FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id
      JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id WHERE e.company_id=? AND e.exercise_id=? ORDER BY e.number,l.position,l.id`,[companyId,meta.exercise.id]);
    return {existing,entries,lines,hash:sha(JSON.stringify({meta,existing:existing?{id:existing.id,hash:existing.content_hash}:null,entries,lines}))};
  }
  function plan(meta,current,source){
    if(!current.existing&&current.entries.length)throw new HttpError(409,'JOURNAL_NOT_EMPTY');
    if(current.existing&&(current.existing.source_format||'libro_diario')!==(source.format||'libro_diario'))throw new HttpError(409,'JOURNAL_FORMAT_CONFLICT');
    const proposed=buildJournalImportPlan(source,current.entries,current.lines);
    if(current.existing&&meta.exercise.status==='closed'&&(proposed.summary.added||proposed.summary.updated))throw new HttpError(409,'JOURNAL_UPDATE_CLOSED');
    return proposed;
  }
  return {
    async preview(buffer, exerciseId, filename = 'diario.pdf') {
      if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 5*1024*1024) throw new HttpError(400,'PDF_JOURNAL_INVALID');
      for (const [key,value] of previews) if(value.expires<Date.now())previews.delete(key);
      if ([...previews.values()].filter(value=>!value.result).length >= 10) throw new HttpError(429,'PDF_JOURNAL_BUSY');
      const meta = await context(exerciseId), source = await extract(buffer);
      validateContext(meta.company,meta.exercise,source);
      const canonical = source.entries.map(entry => ({...entry,lines:entry.lines.map(({page,...line}) => line)}));
      const contentHash = sha(JSON.stringify({company:source.source_company,start:source.start_date,end:source.end_date,entries:canonical}));
      const current=await withTransaction(pool,async db=>{
        await lockCompany(db,companyId);
        const fresh=await context(meta.exercise.id,db,true);validateContext(fresh.company,fresh.exercise,source);
        return {meta:fresh,...await state(db,fresh)};
      });
      const replay=current.existing?.content_hash===contentHash;
      const proposed=replay?null:plan(current.meta,current,source);
      const changes=proposed?.summary||{added:0,updated:0,unchanged:source.entries.length,retained:0};
      const token = randomUUID(), sourceName = String(filename).split(/[\\/]/).at(-1).slice(0,255) || 'diario.pdf';
      previews.set(token,{companyId,exerciseId:meta.exercise.id,source,buffer:Buffer.from(buffer),sourceName,sourceHash:sha(buffer),contentHash,stateHash:current.hash,updating:!!current.existing&&!replay,changes,expires:Date.now()+lifetime});
      return {token,company:meta.company,exercise:{id:meta.exercise.id,name:meta.exercise.name},source_company:source.source_company,
        start_date:source.start_date,end_date:source.end_date,pages:source.pages,totals:source.totals,has_closing:source.has_closing,already_imported:replay,updating:!!current.existing&&!replay,changes,
        change_details:current.existing&&proposed?describeJournalImportPlan(proposed):[],
        source_format:source.format||'libro_diario',source_layout:source.layout||null,numbering:source.numbering||'source',period_inferred:!!source.period_inferred,covered_from:source.covered_from||source.entries[0].entry_date,covered_to:source.covered_to||source.entries.at(-1).entry_date,
        sample:[source.entries[0],source.entries.at(-1)].map(({number,entry_date,description,debit,credit,entry_type,source_journal_code,source_entry_reference})=>({number,entry_date,description,debit,credit,entry_type,source_journal_code,source_entry_reference}))};
    },
    async commit(token) {
      const preview = typeof token === 'string' ? previews.get(token) : null;
      if (!preview || preview.companyId !== companyId || preview.expires < Date.now()) throw new HttpError(409,'JOURNAL_PREVIEW_EXPIRED');
      if(preview.result)return {...preview.result,replayed:true};
      // The reviewed state is checked again under the company/exercise locks.
      // The existing backup archive keeps the previous PDFs and all company data.
      if(preview.updating&&!preview.backup){
        const manager=createAutomaticBackupManager(pool,{directory:options.backupDirectory||config.backupDirectory});
        try{
          preview.backupTask||=manager.forCompany(companyId).run({frequency:'daily',request_id:token});
          preview.backup=await preview.backupTask;
        }catch(error){preview.backupTask=null;throw error;}
      }
      const committed=await withTransaction(pool, async db => {
        await lockCompany(db,companyId);
        const meta = await context(preview.exerciseId,db,true), source = preview.source;
        validateContext(meta.company,meta.exercise,source);
        const current=await state(db,meta);
        if(current.existing?.content_hash===preview.contentHash)return result(current.existing,true);
        if(current.hash!==preview.stateHash)throw new HttpError(409,'JOURNAL_PREVIEW_STALE');
        const proposed=plan(meta,current,source);
        const [batch] = await db.execute(`INSERT INTO journal_imports (company_id,exercise_id,source_name,source_company,source_hash,content_hash,source_pdf,pages,entry_count,line_count,account_count,debit_total,credit_total,source_format)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[companyId,meta.exercise.id,preview.sourceName,source.source_company,preview.sourceHash,preview.contentHash,preview.buffer,source.pages,
          source.totals.entries,source.totals.lines,source.totals.accounts,source.totals.debit,source.totals.credit,source.format||'libro_diario']);
        const [existingAccounts] = await db.execute('SELECT id,code,kind FROM accounts WHERE company_id=?',[companyId]);
        const accounts = new Map(existingAccounts.map(account => [account.code,account]));
        for (const account of source.accounts) {
          if (accounts.has(account.code)) {
            if (accounts.get(account.code).kind !== 'subaccount') throw new HttpError(409,'JOURNAL_ACCOUNT_CONFLICT');
            continue;
          }
          const parent = await ensureAccount(db,companyId,account.code.slice(0,4));
          const [created] = await db.execute("INSERT INTO accounts(company_id,code,description,kind,parent_id) VALUES (?,?,?,'subaccount',?)",[companyId,account.code,account.description,parent.id]);
          accounts.set(account.code,{id:created.insertId,kind:'subaccount'});
        }
        for (const item of proposed.items) {
          const entry=item.source;
          let entryId=item.current?.id;
          if(entryId){
            await db.execute('UPDATE journal_entries SET entry_date=?,description=?,entry_type=?,import_id=?,source_journal_code=?,source_entry_reference=? WHERE company_id=? AND id=?',
              [entry.entry_date,entry.description,entry.entry_type,batch.insertId,entry.source_journal_code??null,entry.source_entry_reference??null,companyId,entryId]);
            if(item.action==='unchanged'){
              for(const [index,line]of entry.lines.entries())await db.execute('UPDATE journal_lines SET source_page=?,source_account_name=?,source_line_number=? WHERE company_id=? AND id=?',[line.page,line.account_name,line.source_line_number??null,companyId,item.current.lines[index].id]);
              continue;
            }
            await db.execute('DELETE FROM journal_lines WHERE company_id=? AND entry_id=?',[companyId,entryId]);
          }else{
            const [created]=await db.execute(`INSERT INTO journal_entries(company_id,exercise_id,number,entry_date,description,request_id,request_hash,status,import_id,entry_type,source_journal_code,source_entry_reference)
              VALUES (?,?,?,?,?,?,?,'posted',?,?,?,?)`,[companyId,meta.exercise.id,item.number,entry.entry_date,entry.description,randomUUID(),sha(JSON.stringify(entry)),batch.insertId,entry.entry_type,entry.source_journal_code??null,entry.source_entry_reference??null]);
            entryId=created.insertId;
          }
          for (const [index,line] of entry.lines.entries()) await db.execute(`INSERT INTO journal_lines(company_id,entry_id,account_id,position,description,debit,credit,source_page,source_account_name,source_line_number)
            VALUES (?,?,?,?,?,?,?,?,?,?)`,[companyId,entryId,accounts.get(line.code).id,index+1,line.description,line.debit,line.credit,line.page,line.account_name,line.source_line_number??null]);
        }
        const [[verified]] = await db.execute(`SELECT COUNT(DISTINCT e.id) AS entries,COUNT(l.id) AS line_count,COALESCE(SUM(l.debit),0.00) AS debit,COALESCE(SUM(l.credit),0.00) AS credit
          FROM journal_entries e JOIN journal_lines l ON l.entry_id=e.id AND l.company_id=e.company_id WHERE e.company_id=? AND e.exercise_id=? AND e.import_id=?`,[companyId,meta.exercise.id,batch.insertId]);
        if (verified.entries !== source.totals.entries || verified.line_count !== source.totals.lines || verified.debit !== source.totals.debit || verified.credit !== source.totals.credit) throw new HttpError(409,'JOURNAL_VERIFICATION_FAILED');
        if (source.has_closing) await db.execute("UPDATE accounting_exercises SET is_default=0,status='closed' WHERE company_id=? AND id=?",[companyId,meta.exercise.id]);
        return {id:batch.insertId,entries:verified.entries,lines:verified.line_count,accounts:source.totals.accounts,debit:verified.debit,credit:verified.credit,replayed:false,updated:!!current.existing,changes:proposed.summary,backup_id:preview.backup?.id??null};
      });
      preview.result=committed;
      return committed;
    },
  };
}
