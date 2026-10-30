import {randomUUID,createHash} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {withTransaction} from '../db/transaction.js';
import {lockCompany} from '../services/subaccounts.js';
import {id} from '../services/validation.js';
import {validateInvoice} from '../services/invoice-validation.js';
import {createInvoiceService} from '../services/invoices.js';
import {normalizeReceivedInvoice,accountingCompatibility,identifier,invalid} from './invoice-contract.js';
import {findPartyAccount} from '../services/party-identification.js';
import {supplierExpensePreference,rememberSupplierExpense} from '../services/supplier-expenses.js';
import {requireAccount} from '../services/trade-posting.js';
import {cents} from '../../../shared/money.js';

const json=value=>typeof value==='string'?JSON.parse(value):value;
const conflict=code=>{throw new HttpError(409,code);};
const fiscalSql="REGEXP_REPLACE(UPPER(reference),'[[:space:]]','')";
const taxSql=field=>"REGEXP_REPLACE(UPPER("+field+"),'[^A-Z0-9]','')";
const effectiveStatus="CASE WHEN r.status='posted' AND i.id IS NULL THEN 'issues' WHEN r.status='posted' AND i.status='void' THEN 'cancelled' ELSE r.status END";
export async function integrationEvent(db,{requestId=randomUUID(),clientId=null,companyId=null,invoiceId=null,actor='integration',action,status=null,code=null,detail=null}){
 await db.execute('INSERT INTO integration_events(request_id,client_id,company_id,integration_invoice_id,actor,action,http_status,error_code,detail) VALUES (?,?,?,?,?,?,?,?,?)',[requestId,clientId,companyId,invoiceId,actor,action,status,code,detail?JSON.stringify(detail):null]);
}
async function supplierMatch(db,companyId,taxId,name){
 const match=await findPartyAccount(db,companyId,'received',taxId,name);
 return {accountId:match.accountId,matchedBy:match.matchedBy,issue:match.accountId?null:match.ambiguous?'SUPPLIER_AMBIGUOUS':'SUPPLIER_REVIEW_REQUIRED'};
}
async function fiscalDuplicates(db,companyId,taxId,number,excludeId=0){
 const [queued]=await db.execute("SELECT r.id FROM integration_received_invoices r WHERE r.company_id=? AND r.supplier_tax_id=? AND r.fiscal_number=? AND r.id<>? AND (r.status IN ('pending','issues') OR r.status='posted' AND EXISTS(SELECT 1 FROM trade_invoices i WHERE i.company_id=r.company_id AND i.id=r.invoice_id AND i.status='posted'))",[companyId,taxId,number,excludeId]);
 const [posted]=await db.execute(`SELECT id FROM trade_invoices WHERE company_id=? AND direction='received' AND ${taxSql('party_tax_id')}=? AND ${fiscalSql}=? AND status='posted'`,[companyId,taxId,number]);
 return {queued,posted,duplicate:!!(queued.length||posted.length)};
}
export function createIntegrationReceptionService(pool,{companyDatabases}={}){return {
 async receive(client,body,requestId){
  const normalized=normalizeReceivedInvoice(body),{payload}=normalized;
  if(payload.sourceSystem!==client.sourceSystem)throw new HttpError(403,'INTEGRATION_SOURCE_FORBIDDEN');
  // The caller never selects an internal company ID or bypasses this server mapping.
  const [[link]]=await pool.execute('SELECT company_id,enabled FROM integration_company_links WHERE client_id=? AND source_system=? AND external_company_id=?',[client.clientId,client.sourceSystem,payload.companyExternalId]);
  if(!link?.enabled)throw new HttpError(403,'INTEGRATION_COMPANY_FORBIDDEN');
  const {companyExternalId,...canonical}=payload,digest=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  const companyPool=companyDatabases?await companyDatabases.forCompany(link.company_id):pool;
  return withTransaction(companyPool,async db=>{
   await lockCompany(db,link.company_id);
   const [[authorized]]=await (companyDatabases?pool:db).execute('SELECT enabled FROM integration_company_links WHERE client_id=? AND source_system=? AND external_company_id=? AND company_id=? LOCK IN SHARE MODE',[client.clientId,client.sourceSystem,companyExternalId,link.company_id]);
   if(!authorized?.enabled)throw new HttpError(403,'INTEGRATION_COMPANY_FORBIDDEN');
   const [[existing]]=await db.execute(`SELECT r.id,r.payload_hash,${effectiveStatus} AS status,r.possible_duplicate,r.issues FROM integration_received_invoices r LEFT JOIN trade_invoices i ON i.company_id=r.company_id AND i.id=r.invoice_id WHERE r.company_id=? AND r.source_system=? AND r.external_id=?`,[link.company_id,payload.sourceSystem,payload.externalId]);
   if(existing){if(existing.payload_hash!==digest)conflict('INTEGRATION_IDEMPOTENCY_CONFLICT');await integrationEvent(db,{requestId,clientId:client.clientId,companyId:link.company_id,invoiceId:existing.id,action:'invoice_replayed',status:200});return {id:existing.id,companyId:link.company_id,sourceSystem:payload.sourceSystem,externalId:payload.externalId,status:existing.status,possibleDuplicate:!!existing.possible_duplicate,issues:json(existing.issues),replayed:true};}
   const [[period]]=await db.execute('SELECT id,status FROM accounting_exercises WHERE company_id=? AND start_date<=? AND end_date>=?',[link.company_id,payload.invoiceDate,payload.invoiceDate]);
   const supplier=await supplierMatch(db,link.company_id,payload.supplier.taxId,payload.supplier.name),duplicates=await fiscalDuplicates(db,link.company_id,payload.supplier.taxId,normalized.fiscalNumber);
   const issues=[...accountingCompatibility(payload),...(supplier.issue?[supplier.issue]:[]),...(!period?['EXERCISE_REVIEW_REQUIRED']:period.status!=='open'?['EXERCISE_CLOSED']:[]),...(duplicates.duplicate?['POSSIBLE_FISCAL_DUPLICATE']:[])];
   const status=duplicates.duplicate||accountingCompatibility(payload).length?'issues':'pending';
   const [created]=await db.execute(`INSERT INTO integration_received_invoices(company_id,exercise_id,client_id,source_system,external_id,payload_hash,payload,supplier_name,supplier_tax_id,supplier_account_id,invoice_number,fiscal_number,invoice_date,due_date,currency,invoice_type,base_total,tax_total,withholding_total,total_amount,document_external_id,status,possible_duplicate,issues)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[link.company_id,period?.id||null,client.clientId,payload.sourceSystem,payload.externalId,digest,JSON.stringify(payload),payload.supplier.name,payload.supplier.taxId,supplier.accountId,payload.invoiceNumber,normalized.fiscalNumber,payload.invoiceDate,payload.dueDate,payload.currency,payload.invoiceType,normalized.baseTotal,normalized.taxTotal,normalized.withholdingTotal,payload.total,payload.documentExternalId,status,duplicates.duplicate,JSON.stringify(issues)]);
   if(duplicates.queued.length)await db.execute("UPDATE integration_received_invoices SET possible_duplicate=TRUE,version=version+1 WHERE company_id=? AND supplier_tax_id=? AND fiscal_number=? AND id<>? AND status NOT IN ('cancelled','rectified')",[link.company_id,payload.supplier.taxId,normalized.fiscalNumber,created.insertId]);
   await integrationEvent(db,{requestId,clientId:client.clientId,companyId:link.company_id,invoiceId:created.insertId,action:'invoice_received',status:201});
   return {id:created.insertId,companyId:link.company_id,sourceSystem:payload.sourceSystem,externalId:payload.externalId,status,possibleDuplicate:duplicates.duplicate,issues,replayed:false};
  });
 },
 async linkCompany({clientId,sourceSystem,externalCompanyId,companyId,enabled=true}){
  if(typeof enabled!=='boolean')invalid('INTEGRATION_INVALID_FIELD','enabled');
  identifier(clientId,'clientId',64);identifier(sourceSystem,'sourceSystem',64);identifier(externalCompanyId,'externalCompanyId');id(companyId);
  const [[company]]=await pool.execute('SELECT id FROM companies WHERE id=?',[companyId]);if(!company)throw new HttpError(404,'COMPANY_NOT_FOUND');
  await withTransaction(pool,async db=>{await lockCompany(db,companyId);await db.execute('INSERT INTO integration_company_links(client_id,source_system,external_company_id,company_id,enabled) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE company_id=VALUES(company_id),enabled=VALUES(enabled)',[clientId,sourceSystem,externalCompanyId,companyId,enabled]);await integrationEvent(db,{clientId,companyId,actor:'administrator',action:enabled?'company_linked':'company_disabled'});});return {companyId,enabled};
 },
};}

export function createImportedInvoiceService(pool,companyId){
 async function find(db,invoiceId){const [[row]]=await db.execute(`SELECT r.*,${effectiveStatus} AS accounting_status,c.name AS company_name FROM integration_received_invoices r JOIN companies c ON c.id=r.company_id LEFT JOIN trade_invoices i ON i.company_id=r.company_id AND i.id=r.invoice_id WHERE r.company_id=? AND r.id=?`,[companyId,id(invoiceId)]);if(!row)throw new HttpError(404,'INTEGRATION_INVOICE_NOT_FOUND');return {...row,payload:json(row.payload),issues:json(row.issues)};}
 async function details(db,invoiceId){
  const row=await find(db,invoiceId),supplier=await supplierMatch(db,companyId,row.supplier_tax_id,row.supplier_name),p=row.payload;
  const [[period]]=await db.execute('SELECT id,status FROM accounting_exercises WHERE company_id=? AND start_date<=? AND end_date>=?',[companyId,p.invoiceDate,p.invoiceDate]);
  const compatibility=accountingCompatibility(p),duplicates=await fiscalDuplicates(db,companyId,row.supplier_tax_id,row.fiscal_number,row.id);
  const expenseSuggestion=await supplierExpensePreference(db,companyId,row.supplier_tax_id);
  const [[currentExpense]]=await db.execute("SELECT a.id AS account_id,a.code,a.description,e.status AS exercise_status FROM trade_invoices i JOIN accounts a ON a.company_id=i.company_id AND a.id=i.offset_account_id JOIN accounting_exercises e ON e.company_id=i.company_id AND e.id=i.exercise_id WHERE i.company_id=? AND i.id=?",[companyId,row.invoice_id]);
  const form={exercise_id:period?.id||null,direction:'received',reference:p.invoiceNumber,invoice_date:p.invoiceDate,posting_date:p.invoiceDate,party:{name:p.supplier.name,tax_id:p.supplier.taxId,address:p.supplier.address,email:p.supplier.email},party_account_id:supplier.accountId||'',party_parent:'4000',offset_account_id:'',vat_account_id:'',withholding_account_id:'',withholding_rate:p.withholdings[0]?.rate||'0',payment_method:'transfer',notes:p.description.slice(0,1000),lines:p.taxBreakdown.map(t=>({description:p.description.slice(0,200),base:t.taxableBase,tax_rate:t.taxRate})),receipts:[{due_date:p.dueDate,amount:p.total}],request_id:createHash('sha256').update('integration-invoice:'+companyId+':'+row.id).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/,'$1-$2-$3-$4-$5')};
  const issues=[...compatibility,...(supplier.issue?[supplier.issue]:[]),...(!period?['EXERCISE_REVIEW_REQUIRED']:period.status!=='open'?['EXERCISE_CLOSED']:[]),...(duplicates.duplicate?['POSSIBLE_FISCAL_DUPLICATE']:[]),...(row.status==='posted'&&!row.invoice_id?['POSTED_INVOICE_REMOVED']:[])];
  form.offset_account_id=expenseSuggestion?.account_id||'';
  return {...row,issues,expense_suggestion:expenseSuggestion,current_expense_account:currentExpense||null,can_change_expense:row.accounting_status==='posted'&&currentExpense?.exercise_status==='open',possible_duplicate:duplicates.duplicate,can_post:['pending','issues'].includes(row.accounting_status)&&!!period&&period.status==='open'&&!compatibility.length&&!duplicates.duplicate,form};
 }
 return {
  async list(query={}){
   const search=String(query.search||'').trim(),page=Number(query.page||1);if(search.length>200||!Number.isSafeInteger(page)||page<1||page>100000)invalid('INTEGRATION_INVALID_FILTER','query');
   const params=[companyId];let where='r.company_id=?';if(search){where+=' AND (LOCATE(?,r.invoice_number)>0 OR LOCATE(?,r.supplier_name)>0 OR LOCATE(?,r.external_id)>0)';params.push(search,search,search);}
   if(query.exercise_id){where+=' AND (r.exercise_id=? OR r.exercise_id IS NULL)';params.push(id(query.exercise_id));}
   const [[count]]=await pool.execute('SELECT COUNT(*) AS total FROM integration_received_invoices r WHERE '+where,params);
   const [rows]=await pool.execute(`SELECT r.id,r.source_system,r.external_id,r.supplier_name,r.supplier_tax_id,r.invoice_number,r.invoice_date,r.total_amount,r.currency,r.invoice_type,${effectiveStatus} AS accounting_status,r.possible_duplicate,r.issues,r.document_external_id,r.imported_at,r.invoice_id,r.entry_id,r.version,c.name AS company_name FROM integration_received_invoices r JOIN companies c ON c.id=r.company_id LEFT JOIN trade_invoices i ON i.company_id=r.company_id AND i.id=r.invoice_id WHERE ${where} ORDER BY r.imported_at DESC,r.id DESC LIMIT 50 OFFSET `+((page-1)*50),params);
   return {rows:rows.map(row=>({...row,issues:json(row.issues)})),total:Number(count.total),page,pageSize:50};
  },
  get:invoiceId=>withTransaction(pool,db=>details(db,invoiceId)),
  async cancel(invoiceId,body,actor){return withTransaction(pool,async db=>{await lockCompany(db,companyId);const row=await find(db,invoiceId);if(row.version!==body?.version)conflict('INTEGRATION_INVOICE_CHANGED');if(!['pending','issues'].includes(row.accounting_status))conflict('INTEGRATION_INVOICE_STATE');await db.execute("UPDATE integration_received_invoices SET status='cancelled',version=version+1 WHERE company_id=? AND id=?",[companyId,row.id]);await integrationEvent(db,{companyId,invoiceId:row.id,actor,action:'reception_cancelled'});return {id:row.id,status:'cancelled'};});},
  async post(invoiceId,body,actor){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await details(db,invoiceId);
   if(row.accounting_status==='posted')return {id:row.invoice_id,replayed:true};if(row.version!==body?.version)conflict('INTEGRATION_INVOICE_CHANGED');if(!row.can_post)conflict('INTEGRATION_REVIEW_REQUIRED');
   if(!body?.form?.offset_account_id)throw new HttpError(400,'INTEGRATION_EXPENSE_ACCOUNT_REQUIRED');
   if(body.remember_expense!==undefined&&typeof body.remember_expense!=='boolean')throw new HttpError(400,'INTEGRATION_INVALID_EXPENSE_PREFERENCE');
   const form=validateInvoice({...body.form,request_id:row.form.request_id,direction:'received'}),expected=validateInvoice(row.form);
   // Account selection, posting date and installments may be reviewed. Validated source totals and identity cannot silently change.
   for(const key of ['reference','invoice_date','base_total','tax_total','withholding_total','total_amount','withholding_rate'])if(form[key]!==expected[key])conflict('INTEGRATION_SOURCE_DATA_CHANGED');
   if(form.party.tax_id!==expected.party.tax_id||JSON.stringify(form.lines.map(line=>[line.base,line.tax_rate,line.tax_amount]))!==JSON.stringify(expected.lines.map(line=>[line.base,line.tax_rate,line.tax_amount])))conflict('INTEGRATION_SOURCE_DATA_CHANGED');
   const supplier=await supplierMatch(db,companyId,row.supplier_tax_id,row.supplier_name);
   if(supplier.matchedBy==='tax_id'&&supplier.accountId&&form.party_account_id&&form.party_account_id!==supplier.accountId)conflict('INTEGRATION_SUPPLIER_ACCOUNT_CONFLICT');
   if(form.party_account_id){const [[wrong]]=await db.execute(`SELECT id FROM trade_invoices WHERE company_id=? AND direction='received' AND party_account_id=? AND party_tax_id<>'' AND ${taxSql('party_tax_id')}<>? UNION SELECT id FROM suppliers WHERE company_id=? AND account_id=? AND tax_id<>'' AND ${taxSql('tax_id')}<>? LIMIT 1`,[companyId,form.party_account_id,row.supplier_tax_id,companyId,form.party_account_id,row.supplier_tax_id]);if(wrong)conflict('INTEGRATION_SUPPLIER_ACCOUNT_CONFLICT');}
   const [[period]]=await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,form.exercise_id]);if(!period)throw new HttpError(404,'EXERCISE_NOT_FOUND');
   const invoice=await createInvoiceService(pool,companyId).create(form,{db,accounting_only:true});
   await db.execute("UPDATE integration_received_invoices SET status='posted',exercise_id=?,supplier_account_id=?,invoice_id=?,entry_id=?,issues=JSON_ARRAY(),version=version+1 WHERE company_id=? AND id=?",[invoice.exercise_id,invoice.party_account_id,invoice.id,invoice.entry_id,companyId,row.id]);
   if(body.remember_expense!==false)await rememberSupplierExpense(db,companyId,{taxId:row.supplier_tax_id,name:row.supplier_name,accountId:invoice.offset_account_id},actor);
   await integrationEvent(db,{companyId,invoiceId:row.id,actor,action:'invoice_posted'});return {id:invoice.id,integrationId:row.id,replayed:false};
  });},
  async changeExpense(invoiceId,body,actor){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const row=await find(db,invoiceId);
   if(row.version!==body?.version)conflict('INTEGRATION_INVOICE_CHANGED');
   if(row.accounting_status!=='posted'||!row.invoice_id)conflict('INTEGRATION_INVOICE_STATE');
   if(body.remember!==undefined&&typeof body.remember!=='boolean')throw new HttpError(400,'INTEGRATION_INVALID_EXPENSE_PREFERENCE');
   const target=await requireAccount(db,companyId,body.account_id,['6','2']);
   const [[invoice]]=await db.execute("SELECT i.*,e.status AS exercise_status FROM trade_invoices i JOIN accounting_exercises e ON e.company_id=i.company_id AND e.id=i.exercise_id WHERE i.company_id=? AND i.id=? FOR UPDATE",[companyId,row.invoice_id]);
   if(!invoice||invoice.status!=='posted'||invoice.direction!=='received'||invoice.exercise_status!=='open')conflict('INTEGRATION_EXPENSE_CHANGE_BLOCKED');
   const [[entry]]=await db.execute('SELECT status,entry_type,exercise_operation_id,cancelled_by_operation_id FROM journal_entries WHERE company_id=? AND id=? FOR UPDATE',[companyId,invoice.entry_id]);
   if(!entry||entry.status!=='posted'||entry.entry_type!=='normal'||entry.exercise_operation_id||entry.cancelled_by_operation_id)conflict('INTEGRATION_EXPENSE_CHANGE_BLOCKED');
   const [lines]=await db.execute('SELECT id,account_id,debit,credit FROM journal_lines WHERE company_id=? AND entry_id=? ORDER BY position FOR UPDATE',[companyId,invoice.entry_id]);
   const expenseLines=lines.filter(line=>line.account_id===invoice.offset_account_id&&line.debit===invoice.base_total&&cents(line.credit)===0n);
   if(expenseLines.length!==1||lines.reduce((sum,line)=>sum+cents(line.debit)-cents(line.credit),0n)!==0n)conflict('INTEGRATION_EXPENSE_CHANGE_BLOCKED');
   if(target.id!==invoice.offset_account_id){
    await db.execute('UPDATE journal_lines SET account_id=?,source_account_name=NULL WHERE company_id=? AND entry_id=? AND id=?',[target.id,companyId,invoice.entry_id,expenseLines[0].id]);
    await db.execute('UPDATE trade_invoices SET offset_account_id=? WHERE company_id=? AND id=?',[target.id,companyId,invoice.id]);
   }
   if(body.remember!==false)await rememberSupplierExpense(db,companyId,{taxId:row.supplier_tax_id,name:row.supplier_name,accountId:target.id},actor);
   await db.execute('UPDATE integration_received_invoices SET version=version+1 WHERE company_id=? AND id=?',[companyId,row.id]);
   await integrationEvent(db,{companyId,invoiceId:row.id,actor,action:'expense_account_changed',detail:{invoice_id:invoice.id,entry_id:invoice.entry_id,previous_account_id:invoice.offset_account_id,account_id:target.id,remembered:body.remember!==false}});
   return details(db,row.id);
  });},
 };
}
