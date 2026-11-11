import { createHash } from 'node:crypto';
import { HttpError } from '../middleware/errors.js';
import {reconciliationReceiptPayment} from './reconciliation-partials.js';
import { id, date, fail } from './validation.js';
import { amount } from './report-amount.js';
import { decimal } from '../../../shared/money.js';
import { withTransaction } from '../db/transaction.js';
import { lockCompany } from './subaccounts.js';
import { BANK_BALANCE_MAX_DAYS,BANK_BALANCE_TOLERANCE_CENTS,bankDayNumber,bankLedgerReadThrough,bankReconciliationDates } from '../../../shared/bank-reconciliation.js';
import {buildBankAnalysis} from './bank-analysis.js';
import {readPendingDocumentInvoices} from './document-invoice-data.js';
import {matchPendingInvoices} from './bank-invoice-matches.js';
import {parseBankCsv,isBankStatementPdf} from './bank-statement.js';
import {readBankStatementPdf} from './bank-pdf-reader.js';
import {readReconciliationRules,validateManualReconciliation,saveReconciliationRule,removeReconciliationRule} from './reconciliation-rules.js';
import {postJournalEntry} from './accounting.js';
import {reconciliationProposal} from '../../../shared/reconciliation-proposals.js';
import {bankStatementArchiveInfo} from './bank-statement-archive.js';
import {readReconciliationMatches} from './reconciliation-matches.js';
import {settlePortfolioReceipt} from './portfolio.js';
import {receiptDetail} from './portfolio-data.js';
import {hash as requestHash,method,requestId,text} from './invoice-validation.js';
import {reconciliationPostingState} from '../../../shared/reconciliation-postings.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
// Include every account: the proposals also depend on VAT and prior journal criteria.
export function reconciliationLedgerHash(lines) {
  const keys = ['exercise_id','entry_id','number','entry_date','status','entry_type','code','account_name','position','description','debit','credit'];
  return createHash('sha256').update(JSON.stringify(lines.map(row => keys.map(key => row[key])))).digest('hex');
}
export async function readReconciliationLedger(db, companyId, exerciseId, through) {
  const [rows] = await db.execute(`SELECT e.exercise_id,e.id AS entry_id,e.number,e.entry_date,e.status,e.entry_type,
    a.code,a.description AS account_name,l.position,l.description,l.debit,l.credit
    FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id
    JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
    WHERE e.company_id=? AND e.exercise_id=? AND e.entry_date<=?
    ORDER BY e.entry_date,e.number,l.position`, [companyId,exerciseId,through]);
  return rows;
}
function balance(lines, code, through) {
  return lines.filter(row => row.status === 'posted' && row.code === code && row.entry_date <= through)
    .reduce((sum,row) => sum + amount(row.debit) - amount(row.credit), 0n);
}
async function exercise(db, companyId, exerciseId) {
  const [[row]] = await db.execute('SELECT id,name,start_date,end_date,status FROM accounting_exercises WHERE company_id=? AND id=?', [companyId,id(exerciseId)]);
  if (!row) throw new HttpError(404, 'EXERCISE_NOT_FOUND');
  return row;
}

export function createBankReconciliationService(pool, companyId) {
  async function find(db, reconciliationId,lock=false) {
      const [[row]] = await db.execute(`SELECT id,company_id,exercise_id,account_id,source_name,source_mime,source_sha256,snapshot,ledger_hash,version,created_at
      FROM bank_reconciliations WHERE company_id=? AND id=?`+(lock?' FOR UPDATE':''), [companyId,id(reconciliationId)]);
    if (!row) throw new HttpError(404, 'RECONCILIATION_NOT_FOUND');
    return {...row,snapshot:parse(row.snapshot)};
  }
  async function rebuild(db,row){
    const previous=row.snapshot,period=await exercise(db,companyId,row.exercise_id);
    const [[company]]=await db.execute('SELECT id,name FROM companies WHERE id=?',[companyId]);
    const [accounts]=await db.execute('SELECT id,code,description,kind FROM accounts WHERE company_id=?',[companyId]);
    const account=accounts.find(candidate=>candidate.id===row.account_id),savedRows=Array.isArray(previous.bank_rows)&&previous.bank_rows.length;
    let statement;
    if(savedRows)statement={rows:previous.bank_rows,bank:{name:previous.account.name_by_user,iban_masked:previous.account.iban_masked,holder:previous.account.holder||''},mime:row.source_mime,pages:previous.source.pages,from:previous.source.full_from||previous.source.from,to:previous.source.full_to||previous.source.to,initial_balance:previous.source.initial_balance_inferred,statement_date:previous.source.statement_date,statement_date_origin:previous.source.statement_date_origin};
    else{
      const [[original]]=await db.execute('SELECT source_pdf FROM bank_reconciliations WHERE company_id=? AND id=?',[companyId,row.id]);
      statement=isBankStatementPdf(original.source_pdf)?await readBankStatementPdf(original.source_pdf):parseBankCsv(original.source_pdf);statement.bank.name=previous.account.name_by_user;
    }
    const periodRows=statement.rows.filter(movement=>movement.date>=period.start_date&&movement.date<=period.end_date);
    if(!periodRows.length)fail('BANK_STATEMENT_PERIOD_MISMATCH',409);
    const lastDate=periodRows.at(-1).date,through=bankLedgerReadThrough(lastDate,period.end_date),lines=await readReconciliationLedger(db,companyId,period.id,through);
    const [history]=await db.execute(`SELECT e.exercise_id,e.id AS entry_id,e.number,e.entry_date,e.status,e.entry_type,e.description AS entry_description,a.code,a.description AS account_name,l.position,l.description,l.debit,l.credit
      FROM journal_entries e JOIN journal_lines l ON l.company_id=e.company_id AND l.entry_id=e.id JOIN accounts a ON a.company_id=l.company_id AND a.id=l.account_id
      WHERE e.company_id=? AND e.entry_date<=? ORDER BY e.entry_date,e.number,l.position`,[companyId,lastDate]);
    const pendingInvoices=await readPendingDocumentInvoices(db,companyId),rules=await readReconciliationRules(db,companyId,row.account_id);
    const snapshot=buildBankAnalysis({company,exercise:period,account,statement,lines,history,accounts,pendingInvoices,rules,manualProposals:previous.manual_proposals||[],postedMovements:previous.posted_movements||[],sourceName:row.source_name,sourceHash:row.source_sha256});
    for(const field of ['workflow','work_start_date','work_anchor','posted_movements'])if(Object.hasOwn(previous,field))snapshot[field]=previous[field];
    if(savedRows)snapshot.source.rows=previous.source.rows??snapshot.source.rows;
    if(snapshot.source.rows!==snapshot.source.selected_rows){const note=snapshot.review_notes.find(item=>item.title==='Otros ejercicios');if(note)note.detail='El documento abarca varios ejercicios. Este informe utiliza únicamente las fechas del ejercicio seleccionado; conserva el documento completo.';}
    return {snapshot,ledgerHash:reconciliationLedgerHash(lines),account,accounts,period};
  }
  async function storeAnalysis(db,row,result){await db.execute('UPDATE bank_reconciliations SET snapshot=?,ledger_hash=?,version=version+1 WHERE company_id=? AND id=?',[JSON.stringify(result.snapshot),result.ledgerHash,companyId,row.id]);}
  async function requireUnpostedMovement(db,row,movement){
    const records=(row.snapshot.posted_movements||[]).filter(item=>String(item.movement_id)===String(movement.id));
    if(!records.length)return;
    const ids=[...new Set(records.map(item=>item.entry_id))];
    const [entries]=await db.execute('SELECT e.id,e.number,e.status,(SELECT CAST(COALESCE(SUM(l.debit-l.credit),0) AS DECIMAL(15,2)) FROM journal_lines l WHERE l.company_id=e.company_id AND l.entry_id=e.id AND l.account_id=?) AS bank_amount FROM journal_entries e WHERE e.company_id=? AND e.id IN ('+ids.map(()=>'?').join(',')+')',[row.account_id,companyId,...ids]);
    const state=reconciliationPostingState(records,entries,movement.amount);
    if(state.entries.length)throw new HttpError(409,state.done?'RECONCILIATION_MOVEMENT_MATCHED':'RECONCILIATION_ENTRY_CHANGED');
  }
  return {
    async list(query) {
      const period = await exercise(pool,companyId,query.exercise_id);
      const [rows] = await pool.execute(`SELECT r.id,r.version,r.account_id,r.source_name,r.source_mime,r.created_at,a.code AS account_code,a.description AS account_name,
        OCTET_LENGTH(r.source_pdf) AS source_size,JSON_EXTRACT(r.snapshot,'$.source') AS source_meta,JSON_EXTRACT(r.snapshot,'$.account') AS bank_meta,
        JSON_UNQUOTE(JSON_EXTRACT(r.snapshot,'$.workflow')) AS workflow
        FROM bank_reconciliations r JOIN accounts a ON a.company_id=r.company_id AND a.id=r.account_id
        WHERE r.company_id=? AND r.exercise_id=? ORDER BY r.id DESC`, [companyId,period.id]);
      return rows.map(({source_meta,bank_meta,...row})=>({...row,...bankStatementArchiveInfo({...row,snapshot:{source:parse(source_meta),account:parse(bank_meta)}})}));
    },
    async get(reconciliationId) {
      const db = await pool.getConnection();
      try {
        await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        const row = await find(db,reconciliationId), data = row.snapshot;
        const period = await exercise(db,companyId,row.exercise_id);
        const dates=bankReconciliationDates(data);
        const lines = await readReconciliationLedger(db,companyId,period.id,dates.readThrough);
        const currentBalance = balance(lines,data.account.code,dates.bookThrough);
        const cutoff = dates.bookCutoff ? balance(lines,data.account.code,dates.bookCutoff) : null;
        const [[account]] = await db.execute('SELECT id,code,description FROM accounts WHERE company_id=? AND id=?', [companyId,row.account_id]);
        const lastEntry = lines.find(line => line.status === 'posted' && line.code === account.code && line.entry_date === (data.scope.last_book_entry_date||dates.bookCutoff) && line.number === data.scope.last_book_entry);
        const pendingInvoices=await readPendingDocumentInvoices(db,companyId),forward=(data.bank_rows||data.scope.bank_pending||[]).filter(movement=>!dates.bankCutoff||movement.date>dates.bankCutoff);
        const invoiceMatches=matchPendingInvoices(forward,pendingInvoices);
        const rules=await readReconciliationRules(db,companyId,row.account_id);
        const ids=(data.posted_movements||[]).map(item=>item.entry_id),postedEntries=ids.length?(await db.execute('SELECT e.id,e.number,e.status,e.entry_date,(SELECT CAST(COALESCE(SUM(l.debit-l.credit),0) AS DECIMAL(15,2)) FROM journal_lines l WHERE l.company_id=e.company_id AND l.entry_id=e.id AND l.account_id=?) AS bank_amount FROM journal_entries e WHERE e.company_id=? AND e.id IN ('+ids.map(()=>'?').join(',')+')',[row.account_id,companyId,...ids]))[0]:[];
        await db.commit();
        const { ledger_hash, ...report } = row;
        return {...report,...bankStatementArchiveInfo(row),rules,posted_entries:postedEntries,pending_invoice_matches:invoiceMatches,exercise:period,account,last_matching_entry_id:lastEntry?.entry_id ?? null,current:{
          as_of:dates.bookThrough,ledger_changed:reconciliationLedgerHash(lines) !== ledger_hash,
          book_balance:decimal(currentBalance),cutoff_balance:cutoff === null ? null : decimal(cutoff),
          difference_book_minus_bank:decimal(currentBalance - amount(data.bank_balance)),
        }};
      } catch (error) { await db.rollback(); throw error; }
      finally { db.release(); }
    },
    async matches(reconciliationId,movementId){
      return withTransaction(pool,async db=>{
        const row=await find(db,reconciliationId),movement=(row.snapshot.bank_rows||row.snapshot.scope.bank_pending||[]).find(item=>String(item.id)===String(movementId));
        if(!movement)throw new HttpError(404,'RECONCILIATION_MOVEMENT_NOT_FOUND');
        return {reconciliation_id:row.id,version:row.version,exercise_id:row.exercise_id,bank_account_id:row.account_id,movement,...await readReconciliationMatches(db,companyId,movement)};
      });
    },
    async settleMovement(reconciliationId,body){
      const key=requestId(body?.request_id),input=body?.receipt_ids===undefined?[body?.receipt_id]:body.receipt_ids;
      if(!Array.isArray(input)||!input.length||input.length>60)fail('INVALID_REQUEST');
      const receiptIds=input.map(id).sort((a,b)=>a-b);if(new Set(receiptIds).size!==receiptIds.length)fail('INVALID_REQUEST');
      if(body.partial_payment!==undefined&&typeof body.partial_payment!=='boolean'||body.partial_payment===true&&receiptIds.length!==1)fail('INVALID_REQUEST');
      if(body.partial_payment===true&&(typeof body.expected_remaining_amount!=='string'||!/^\d{1,13}\.\d{2}$/.test(body.expected_remaining_amount)))fail('INVALID_REQUEST');
      const payment={payment_method:method(body?.payment_method),reference:text(body?.reference,100),notes:text(body?.notes,500)};
      return withTransaction(pool,async db=>{
        await lockCompany(db,companyId);const row=await find(db,reconciliationId,true);
        await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,row.exercise_id]);
        const movement=(row.snapshot.bank_rows||[]).find(item=>String(item.id)===String(body.movement_id));
        if(!movement)throw new HttpError(404,'RECONCILIATION_MOVEMENT_NOT_FOUND');
        const digest=requestHash({movement_id:movement.id,...(receiptIds.length===1?{receipt_id:receiptIds[0]}:{receipt_ids:receiptIds}),...payment,...(body.partial_payment===true?{partial_payment:true,expected_remaining_amount:body.expected_remaining_amount}:{})}),previous=(row.snapshot.posted_movements||[]).filter(item=>item.request_id===key);
        if(previous.length){
          if(previous.length!==receiptIds.length||previous.some(item=>item.request_hash!==digest))throw new HttpError(409,'REQUEST_CONFLICT');
          const receipts=[];for(const receiptId of receiptIds)receipts.push(await receiptDetail(db,companyId,receiptId));
          return {...receipts[0],receipts,entry_id:previous[0].entry_id,number:previous[0].number,entry_ids:previous.map(item=>item.entry_id),entry_numbers:previous.map(item=>item.number),replayed:true};
        }
        if(row.version!==body.version||row.snapshot.workflow!=='direct')throw new HttpError(409,'RECONCILIATION_CHANGED');
        const current=await rebuild(db,row);await requireUnpostedMovement(db,row,movement);
        if(!current.snapshot.scope.bank_pending.some(item=>String(item.id)===String(movement.id)))throw new HttpError(409,'RECONCILIATION_MOVEMENT_MATCHED');
        const receipts=[];for(const receiptId of receiptIds)receipts.push(await receiptDetail(db,companyId,receiptId));
        const value=amount(movement.amount),absolute=value<0n?-value:value;
        if(receipts.some(receipt=>!['pending','partial'].includes(receipt.status)||receipt.direction!==(value<0n?'received':'issued')||receipt.invoice_id!==receipts[0].invoice_id)||receiptIds.length>1&&receipts.reduce((sum,receipt)=>sum+amount(receipt.remaining_amount),0n)!==absolute)throw new HttpError(409,'RECONCILIATION_RECEIPT_CHANGED');
        let singleAmount;if(receipts.length===1)try{singleAmount=reconciliationReceiptPayment(receipts[0].remaining_amount,movement.amount,body.partial_payment===true);}catch{throw new HttpError(409,'RECONCILIATION_RECEIPT_CHANGED');}
        if(body.partial_payment===true&&receipts[0].remaining_amount!==body.expected_remaining_amount)throw new HttpError(409,'RECONCILIATION_RECEIPT_CHANGED');
        const results=[],records=[];
        for(const receipt of receipts){
          const hex=requestHash({request_id:key,receipt_id:receipt.id}).slice(0,32),childKey=receiptIds.length===1?key:[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
          const result=await settlePortfolioReceipt(db,companyId,receipt.id,{...payment,request_id:childKey,exercise_id:row.exercise_id,payment_date:movement.date,amount:singleAmount||receipt.remaining_amount,bank_account_id:row.account_id});
          if(result.replayed)throw new HttpError(409,'REQUEST_CONFLICT');
          const settlement=result.settlements.find(item=>item.id===result.settlement_id),[[entry]]=await db.execute('SELECT number FROM journal_entries WHERE company_id=? AND id=?',[companyId,settlement.entry_id]);
          results.push(result);records.push({movement_id:movement.id,entry_id:settlement.entry_id,number:entry.number,request_id:key,request_hash:digest});
        }
        row.snapshot.manual_proposals=(row.snapshot.manual_proposals||[]).filter(item=>String(item.movement_id)!==String(movement.id));
        row.snapshot.posted_movements=[...(row.snapshot.posted_movements||[]).filter(item=>String(item.movement_id)!==String(movement.id)),...records];
        await storeAnalysis(db,row,await rebuild(db,row));
        return {...results[0],receipts:results,entry_id:records[0].entry_id,number:records[0].number,entry_ids:records.map(item=>item.entry_id),entry_numbers:records.map(item=>item.number)};
      });
    },
    async reanalyze(reconciliationId){
      return withTransaction(pool,async db=>{await lockCompany(db,companyId);const row=await find(db,reconciliationId);await storeAnalysis(db,row,await rebuild(db,row));return {id:row.id};});
    },
    async saveProposal(reconciliationId,body){
      return withTransaction(pool,async db=>{
        await lockCompany(db,companyId);const row=await find(db,reconciliationId);
        if(row.version!==body?.version)throw new HttpError(409,'RECONCILIATION_CHANGED');
        const current=await rebuild(db,row),movement=current.snapshot.scope.bank_pending.find(item=>String(item.id)===String(body.movement_id));
        if(!movement)throw new HttpError(409,'RECONCILIATION_MOVEMENT_MATCHED');
        const {manual,pattern,conceptKey}=validateManualReconciliation(body,movement,current.account,current.accounts,current.period);
        row.snapshot.manual_proposals=[...(row.snapshot.manual_proposals||[]).filter(item=>String(item.movement_id)!==String(movement.id)),manual];
        if(body.remember)await saveReconciliationRule(db,companyId,row.account_id,manual,pattern,conceptKey);
        const result=await rebuild(db,row);await storeAnalysis(db,row,result);
        return {id:row.id,remembered:body.remember,proposal:result.snapshot.proposals.find(item=>String(item.movement_id)===String(movement.id))};
      });
    },
    async postMovement(reconciliationId,body){
      return withTransaction(pool,async db=>{
        await lockCompany(db,companyId);const row=await find(db,reconciliationId,true);
        await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND id=? FOR UPDATE',[companyId,row.exercise_id]);
        if(typeof body?.request_id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.request_id))fail('INVALID_REQUEST');
        const current=await rebuild(db,row),movement=current.snapshot.bank_rows.find(item=>String(item.id)===String(body.movement_id));
        if(!movement)throw new HttpError(409,'RECONCILIATION_MOVEMENT_MATCHED');
        const {manual,pattern,conceptKey}=validateManualReconciliation(body,movement,current.account,current.accounts,current.period);
        const digest=createHash('sha256').update(JSON.stringify({manual,remember:body.remember,pattern})).digest('hex');
        const previous=(row.snapshot.posted_movements||[]).find(item=>item.request_id===body.request_id);
        if(previous){if(previous.request_hash!==digest)throw new HttpError(409,'REQUEST_CONFLICT');return {id:row.id,entry_id:previous.entry_id,number:previous.number,remembered:body.remember,replayed:true};}
        if(row.version!==body.version)throw new HttpError(409,'RECONCILIATION_CHANGED');
        await requireUnpostedMovement(db,row,movement);
        if(!current.snapshot.scope.bank_pending.some(item=>String(item.id)===String(movement.id)))throw new HttpError(409,'RECONCILIATION_MOVEMENT_MATCHED');
        const proposal=reconciliationProposal(movement,manual,current.account,current.accounts);if(!proposal)fail('RECONCILIATION_INVALID_PROPOSAL');
        const saved=await postJournalEntry(db,companyId,{exercise_id:row.exercise_id,entry_date:manual.date,description:manual.concept,request_id:body.request_id,lines:proposal.lines.map(line=>({account_id:line.account_id,description:manual.concept,debit:line.debit,credit:line.credit}))});
        if(body.remember)await saveReconciliationRule(db,companyId,row.account_id,manual,pattern,conceptKey);
        row.snapshot.manual_proposals=(row.snapshot.manual_proposals||[]).filter(item=>String(item.movement_id)!==String(movement.id));
        row.snapshot.posted_movements=[...(row.snapshot.posted_movements||[]).filter(item=>String(item.movement_id)!==String(movement.id)),{movement_id:movement.id,entry_id:saved.id,number:saved.number,request_id:body.request_id,request_hash:digest}];
        await storeAnalysis(db,row,await rebuild(db,row));
        return {id:row.id,entry_id:saved.id,number:saved.number,remembered:body.remember,replayed:saved.replayed||false};
      });
    },
    async removeRule(reconciliationId,ruleId,body){
      return withTransaction(pool,async db=>{await lockCompany(db,companyId);const row=await find(db,reconciliationId);await removeReconciliationRule(db,companyId,row.account_id,ruleId,body?.version);await storeAnalysis(db,row,await rebuild(db,row));return {id:row.id};});
    },
    async source(reconciliationId) {
      const [[row]] = await pool.execute('SELECT source_name,source_mime,source_pdf,snapshot FROM bank_reconciliations WHERE company_id=? AND id=?', [companyId,id(reconciliationId)]);
      if (!row) throw new HttpError(404, 'RECONCILIATION_NOT_FOUND');
      const {snapshot,...source}=row;
      return {...source,original_source_name:row.source_name,source_name:bankStatementArchiveInfo(row).archive_name};
    },
    async remove(reconciliationId,body){
      return withTransaction(pool,async db=>{
        await lockCompany(db,companyId);const row=await find(db,reconciliationId,true);
        if(!Number.isSafeInteger(body?.version)||body.version!==row.version)throw new HttpError(409,'RECONCILIATION_CHANGED');
        await db.execute('DELETE FROM bank_reconciliations WHERE company_id=? AND id=?',[companyId,row.id]);
        return {id:row.id,deleted:true};
      });
    },
  };
}

// Internal import of a reviewed report; deliberately no HTTP posting endpoint.
// Saving this record never creates journal entries, invoices or receipts.
export async function storeBankReconciliation(pool, companyId, data, pdf, expectedLedgerHash) {
  if (!data || data.company?.id !== companyId || data.posted !== false || !Buffer.isBuffer(pdf) || pdf.length > 5*1024*1024 || !isBankStatementPdf(pdf)) fail('INVALID_RECONCILIATION');
  const sha = createHash('sha256').update(pdf).digest('hex');
  if (sha !== data.source?.sha256 || typeof data.source.name !== 'string' || !data.source.name || data.source.name.length > 255) fail('INVALID_RECONCILIATION_SOURCE');
  return withTransaction(pool,async db => {
    await lockCompany(db,companyId);
    const period = await exercise(db,companyId,data.exercise?.id);
    const dates=bankReconciliationDates(data);
    const through = date(data.source.to), cutoff = date(data.scope?.last_matching_date);
    const bookCutoff=date(dates.bookCutoff),bookThrough=date(dates.bookThrough),readThrough=date(dates.readThrough);
    if (cutoff < period.start_date || cutoff > through || through > period.end_date
      || bookCutoff<period.start_date || Math.abs(bankDayNumber(bookCutoff)-bankDayNumber(cutoff))>BANK_BALANCE_MAX_DAYS
      || bookThrough<[through,bookCutoff].sort().at(-1) || bookThrough>readThrough || readThrough>bankLedgerReadThrough(through,period.end_date)) fail('DATE_OUTSIDE_EXERCISE');
    const [[account]] = await db.execute("SELECT id,code FROM accounts WHERE company_id=? AND code=? AND kind='subaccount'",[companyId,data.account?.code]);
    if (!account || !account.code.startsWith('57')) fail('INVALID_BANK_ACCOUNT');
    const lines = await readReconciliationLedger(db,companyId,period.id,readThrough), hash = reconciliationLedgerHash(lines);
    if (hash !== expectedLedgerHash) throw new HttpError(409,'RECONCILIATION_LEDGER_CHANGED');
    const book = balance(lines,account.code,bookThrough), matched = balance(lines,account.code,bookCutoff);
    const anchorBank=amount(data.scope.last_matching_balance),anchorDifference=matched-anchorBank;
    if (book !== amount(data.current_book_balance) || matched !== amount(data.scope.last_matching_book_balance??data.scope.last_matching_balance)||anchorDifference>BANK_BALANCE_TOLERANCE_CENTS||anchorDifference< -BANK_BALANCE_TOLERANCE_CENTS) fail('INVALID_RECONCILIATION_BALANCE');
    let running = anchorBank;
    const pending = data.scope.bank_pending;
    if (!Array.isArray(pending) || !pending.length) fail('INVALID_RECONCILIATION');
    let previousDate = cutoff;
    for (const row of pending) {
      const movementDate = date(row.date); date(row.value_date);
      if (movementDate <= cutoff || movementDate < previousDate || movementDate > through || amount(row.amount) === 0n) fail('INVALID_RECONCILIATION');
      previousDate = movementDate;
      running += amount(row.amount);
      if (running !== amount(row.balance)) fail('INVALID_RECONCILIATION_BALANCE');
    }
    const [accounts] = await db.execute('SELECT id,code FROM accounts WHERE company_id=?',[companyId]);
    const byId = new Map(accounts.map(row => [row.id,row.code]));
    let proposedBank = 0n;
    if (!Array.isArray(data.proposals) || !data.proposals.length) fail('INVALID_RECONCILIATION');
    for (const proposal of data.proposals) {
      if (date(proposal.date) < period.start_date || proposal.date > through || !Array.isArray(proposal.lines) || proposal.lines.length < 2) fail('INVALID_RECONCILIATION');
      let debit = 0n, credit = 0n, bank = 0n;
      for (const line of proposal.lines) {
        if (byId.get(line.account_id) !== line.code) fail('INVALID_RECONCILIATION_ACCOUNT');
        const d = amount(line.debit), c = amount(line.credit);
        if (!((d > 0n && c === 0n) || (c > 0n && d === 0n))) fail('INVALID_RECONCILIATION');
        debit += d; credit += c;
        if (line.code === account.code) bank += d-c;
      }
      if (debit !== credit || bank !== amount(proposal.bank_effect)) fail('INVALID_RECONCILIATION_BALANCE');
      proposedBank += bank;
    }
    if (running !== amount(data.bank_balance) || book-running !== amount(data.difference_book_minus_bank)
      || book+proposedBank !== amount(data.projected_balance) || book+proposedBank !== running) fail('INVALID_RECONCILIATION_BALANCE');
    if (data.vat && amount(data.vat.output)-amount(data.vat.input) !== amount(data.vat.due)) fail('INVALID_RECONCILIATION_BALANCE');
    const [[existing]] = await db.execute('SELECT id,ledger_hash FROM bank_reconciliations WHERE company_id=? AND exercise_id=? AND account_id=? AND source_sha256=?',[companyId,period.id,account.id,sha]);
    if (existing) {
      if (existing.ledger_hash !== hash) throw new HttpError(409,'RECONCILIATION_ALREADY_EXISTS');
      return {id:existing.id,replayed:true};
    }
    const [result] = await db.execute(`INSERT INTO bank_reconciliations
      (company_id,exercise_id,account_id,source_name,source_sha256,source_pdf,snapshot,ledger_hash) VALUES (?,?,?,?,?,?,?,?)`,
    [companyId,period.id,account.id,data.source.name,sha,pdf,JSON.stringify(data),hash]);
    return {id:result.insertId,replayed:false};
  });
}
