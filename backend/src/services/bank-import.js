import { createHash, randomUUID } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import { id } from './validation.js';
import { withTransaction } from '../db/transaction.js';
import { lockCompany, nextSubaccountCode } from './subaccounts.js';
import { ensureAccount } from './account-hierarchy.js';
import { parseBankCsv, normalizeBankText } from './bank-statement.js';
import { buildBankAnalysis } from './bank-analysis.js';
import { readReconciliationLedger, reconciliationLedgerHash } from './bank-reconciliations.js';
import { bankLedgerReadThrough,bankReconciliationDates } from '../../../shared/bank-reconciliation.js';
import {readPendingDocumentInvoices} from './document-invoice-data.js';
import {readBankStatementPdf as extractPdf} from './bank-pdf-reader.js';
import {readReconciliationRules} from './reconciliation-rules.js';

const previews = new Map(), lifetime=15*60*1000;
let active=0;
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = (code,status=400) => {throw new HttpError(status,code);};
export function createBankImportService(pool,companyId) {
  async function context(db,exerciseId){
    const [[company]]=await db.execute('SELECT id,name,subaccount_length FROM companies WHERE id=?',[companyId]);
    if(!company)fail('COMPANY_NOT_FOUND',404);
    const [[exercise]]=await db.execute('SELECT id,name,start_date,end_date,status FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,id(exerciseId)]);
    if(!exercise)fail('EXERCISE_NOT_FOUND',404);
    const [accounts]=await db.execute('SELECT id,code,description,kind FROM accounts WHERE company_id=? ORDER BY code',[companyId]);
    return {company,exercise,accounts};
  }
  function get(token){const preview=typeof token==='string'?previews.get(token):null;if(!preview||preview.companyId!==companyId||preview.expires<Date.now())fail('BANK_PREVIEW_EXPIRED',409);return preview;}
  async function bankAccount(db,meta,selection,statement){
    if(selection.create_account===true){
      if(selection.account_id)fail('INVALID_BANK_ACCOUNT');
      const code=await nextSubaccountCode(db,companyId,{kind:'account',code:'5720'},meta.company.subaccount_length);
      const name=statement.bank.detected?statement.bank.name:typeof selection.bank_name==='string'?selection.bank_name.trim():'';
      if(!name||name.length>120)fail('BANK_NAME_REQUIRED');
      return {id:null,code,kind:'subaccount',description:(name+(statement.bank.iban?' · '+statement.bank.iban.slice(-4):'')).slice(0,200)};
    }
    const account=meta.accounts.find(row=>row.id===id(selection.account_id)&&row.kind==='subaccount'&&row.code.startsWith('572'));
    if(!account)fail('INVALID_BANK_ACCOUNT');return account;
  }
  async function analysis(db,preview,selection){
    const meta=await context(db,preview.exerciseId),account=await bankAccount(db,meta,selection,preview.statement);
    const periodRows=preview.statement.rows.filter(row=>row.date>=meta.exercise.start_date&&row.date<=meta.exercise.end_date);
    if(!periodRows.length)fail('BANK_STATEMENT_PERIOD_MISMATCH',409);
    const through=periodRows.at(-1).date;
    const lines=await readReconciliationLedger(db,companyId,meta.exercise.id,bankLedgerReadThrough(through,meta.exercise.end_date));
    const [history]=await db.execute(`SELECT e.exercise_id,e.id AS entry_id,e.number,e.entry_date,e.status,e.entry_type,e.description AS entry_description,
      a.code,a.description AS account_name,l.position,l.description,l.debit,l.credit FROM journal_entries e
      JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
      WHERE e.company_id=? AND e.entry_date<=? ORDER BY e.entry_date,e.number,l.position`,[companyId,through]);
    const statement=preview.statement.bank.detected?preview.statement:{...preview.statement,bank:{...preview.statement.bank,name:account.description}};
    const pendingInvoices=await readPendingDocumentInvoices(db,companyId);
    const rules=await readReconciliationRules(db,companyId,account.id);
    let previous=null;
    if(selection.replace_current&&preview.existing){const [[row]]=await db.execute('SELECT snapshot FROM bank_reconciliations WHERE company_id=? AND id=?',[companyId,preview.existing.id]);if(row)previous=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot;}
    const snapshot=buildBankAnalysis({...meta,account,statement,lines,history,pendingInvoices,rules,manualProposals:previous?.manual_proposals||[],sourceName:preview.sourceName,sourceHash:preview.sourceHash});
    if(selection.replace_current){snapshot.workflow='direct';snapshot.work_start_date=previous?.work_start_date||snapshot.scope.analysis_start_date;snapshot.work_anchor=previous?.work_anchor||{bank_date:snapshot.scope.last_matching_date,book_date:snapshot.scope.last_matching_book_date,bank_balance:snapshot.scope.last_matching_balance,book_balance:snapshot.scope.last_matching_book_balance,difference:snapshot.scope.balance_match_difference};snapshot.posted_movements=previous?.posted_movements||[];}
    return {snapshot,account,ledgerHash:reconciliationLedgerHash(lines)};
  }
  return {
    async discard(body){const preview=get(body?.token);if(!preview.result)previews.delete(body.token);return {discarded:true};},
    async preview(buffer,exerciseId,filename='extracto.pdf',mime='application/pdf'){
      if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>5*1024*1024)fail('BANK_STATEMENT_TOO_LARGE');
      for(const [token,preview]of previews)if(preview.expires<Date.now())previews.delete(token);
      if(active>=3||[...previews.values()].filter(preview=>!preview.result).length>=10)fail('BANK_STATEMENT_BUSY',429);
      active++;
      try{
        const meta=await context(pool,exerciseId),pdf=buffer.subarray(0,5).toString()==='%PDF-';
        if(!pdf&&!['text/csv','application/csv','text/plain'].includes(mime))fail('BANK_STATEMENT_UNSUPPORTED_FILE');
        let statement;
        try{statement=pdf?await extractPdf(buffer):parseBankCsv(buffer);}catch(error){if(error instanceof HttpError)throw error;fail(error.message?.startsWith('BANK_STATEMENT_')?error.message:'BANK_STATEMENT_INVALID_CSV');}
        const selected=statement.rows.filter(row=>row.date>=meta.exercise.start_date&&row.date<=meta.exercise.end_date);
        if(!selected.length)fail('BANK_STATEMENT_PERIOD_MISMATCH',409);
        const sourceHash=sha(buffer),sourceName=String(filename).split(/[\\/]/).at(-1).slice(0,255)||'extracto.'+statement.format;
        const [[existing]]=await pool.execute('SELECT id,account_id FROM bank_reconciliations WHERE company_id=? AND exercise_id=? AND source_sha256=? LIMIT 1',[companyId,meta.exercise.id,sourceHash]);
        const [[binding]]=statement.bank.iban?await pool.execute('SELECT account_id,bank_name FROM bank_connections WHERE company_id=? AND iban=?',[companyId,statement.bank.iban]):[[]];
        if(binding&&!statement.bank.detected){statement.bank.name=binding.bank_name;statement.bank.detected=true;}
        const bankAccounts=meta.accounts.filter(row=>row.kind==='subaccount'&&row.code.startsWith('572'));
        const named=statement.bank.detected?bankAccounts.filter(row=>normalizeBankText(row.description).includes(normalizeBankText(statement.bank.name))):[];
        const detected=existing?.account_id??binding?.account_id??(named.length===1?named[0].id:null);
        const token=randomUUID();previews.set(token,{companyId,exerciseId:meta.exercise.id,buffer:Buffer.from(buffer),statement,sourceName,sourceHash,existing,expires:Date.now()+lifetime});
        return {token,company:meta.company,exercise:meta.exercise,bank:statement.bank,source_name:sourceName,format:statement.format,
          pages:statement.pages,rows:statement.rows.length,selected_rows:selected.length,from:statement.from,to:statement.to,
          period_from:selected[0].date,period_to:selected.at(-1).date,final_balance:selected.at(-1).balance,accounts:bankAccounts,
          detected_account_id:detected,account_reason:existing?'same_document':binding?'saved_iban':detected?'account_name':'selection_required',
          already_imported:!!existing,existing_report_id:existing?.id??null,sample:[selected[0],selected.at(-1)]};
      }finally{active--;}
    },
    async analyze(body){
      const preview=get(body?.token),db=await pool.getConnection();
      try{
        if(preview.result)fail('BANK_PREVIEW_EXPIRED',409);
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        if(preview.existing&&(body.create_account===true||Number(body.account_id)!==preview.existing.account_id))fail('BANK_ACCOUNT_MISMATCH',409);
        const result=await analysis(db,preview,body);await db.commit();
        preview.selection={account_id:body.account_id,create_account:body.create_account===true,bank_name:body.bank_name,replace_current:body.replace_current===true};preview.analysis=result;
        return {token:body.token,snapshot:result.snapshot,account:result.account,new_account:result.account.id===null,already_imported:!!preview.existing};
      }catch(error){await db.rollback();throw error;}finally{db.release();}
    },
    async commit(body){
      const preview=get(body?.token);if(preview.result)return {...preview.result,replayed:true};if(!preview.analysis)fail('BANK_ANALYSIS_REQUIRED',409);
      const saved=await withTransaction(pool,async db=>{
        await lockCompany(db,companyId);
        const meta=await context(db,preview.exerciseId);
        const through=bankReconciliationDates(preview.analysis.snapshot).readThrough;
        const lines=await readReconciliationLedger(db,companyId,meta.exercise.id,through);
        if(reconciliationLedgerHash(lines)!==preview.analysis.ledgerHash)fail('RECONCILIATION_LEDGER_CHANGED',409);
        const [[existing]]=await db.execute('SELECT id,account_id FROM bank_reconciliations WHERE company_id=? AND exercise_id=? AND source_sha256=? LIMIT 1',[companyId,meta.exercise.id,preview.sourceHash]);
        if(existing&&!preview.selection.create_account&&Number(preview.selection.account_id)!==existing.account_id)fail('BANK_ACCOUNT_MISMATCH',409);
        let account;
        if(existing){account=meta.accounts.find(row=>row.id===existing.account_id);}
        else if(preview.selection.create_account){
          account=await bankAccount(db,meta,preview.selection,preview.statement);
          const parent=await ensureAccount(db,companyId,'5720');
          const [created]=await db.execute("INSERT INTO accounts(company_id,code,description,kind,parent_id) VALUES (?,?,?,'subaccount',?)",[companyId,account.code,account.description,parent.id]);
          account={...account,id:created.insertId};
        }else{account=await bankAccount(db,meta,preview.selection,preview.statement);}
        if(preview.statement.bank.iban){
          const [[binding]]=await db.execute('SELECT account_id FROM bank_connections WHERE company_id=? AND iban=?',[companyId,preview.statement.bank.iban]);
          if(binding&&binding.account_id!==account.id)fail('BANK_ACCOUNT_MISMATCH',409);
          if(!binding)await db.execute('INSERT INTO bank_connections(company_id,account_id,iban,bank_code,bank_name) VALUES (?,?,?,?,?)',[companyId,account.id,preview.statement.bank.iban,preview.statement.bank.code,preview.statement.bank.detected?preview.statement.bank.name:account.description]);
        }
        if(existing&&!preview.selection.replace_current)return {id:existing.id,replayed:true};
        const selected={...preview.selection,create_account:false,account_id:account.id};
        const result=await analysis(db,preview,selected);
        if(existing){await db.execute('UPDATE bank_reconciliations SET snapshot=?,ledger_hash=?,version=version+1 WHERE company_id=? AND id=?',[JSON.stringify(result.snapshot),result.ledgerHash,companyId,existing.id]);await db.execute('DELETE FROM bank_reconciliations WHERE company_id=? AND exercise_id=? AND id<>?',[companyId,meta.exercise.id,existing.id]);return {id:existing.id,replayed:false};}
        const [saved]=await db.execute(`INSERT INTO bank_reconciliations(company_id,exercise_id,account_id,source_name,source_sha256,source_pdf,source_mime,snapshot,ledger_hash)
          VALUES (?,?,?,?,?,?,?,?,?)`,[companyId,meta.exercise.id,account.id,preview.sourceName,preview.sourceHash,preview.buffer,preview.statement.mime,JSON.stringify(result.snapshot),result.ledgerHash]);
        if(preview.selection.replace_current)await db.execute('DELETE FROM bank_reconciliations WHERE company_id=? AND exercise_id=? AND id<>?',[companyId,meta.exercise.id,saved.insertId]);
        return {id:saved.insertId,replayed:false};
      });
      previews.set(body.token,{companyId,exerciseId:preview.exerciseId,expires:preview.expires,result:saved});
      const completed=[...previews.entries()].filter(([,value])=>value.result);
      for(const [token]of completed.slice(0,Math.max(0,completed.length-100)))previews.delete(token);
      return saved;
    },
  };
}
