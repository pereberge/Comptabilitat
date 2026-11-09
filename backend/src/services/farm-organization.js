import {randomUUID} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {id} from './validation.js';
import {withTransaction} from '../db/transaction.js';
import {lockCompany} from './subaccounts.js';
const fail=(code,status=400)=>{throw new HttpError(status,code);};
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max||/[\x00-\x1f]/.test(value))fail('FARM_INVALID_FIELD');return value.trim();};
const sourceFields={document:'document_id',integration:'integration_id',invoice:'invoice_id'};
export function createFarmOrganizationService(pool,companyId,{actor='local'}={}){
 async function farm(db,value){const [[row]]=await db.execute('SELECT * FROM pig_farms WHERE company_id=? AND id=?',[companyId,id(value)]);if(!row)fail('FARM_NOT_FOUND',404);return row;}
 async function event(db,action,detail){await db.execute('INSERT INTO integration_events(request_id,company_id,actor,action,detail) VALUES (?,?,?,?,?)',[randomUUID(),companyId,actor,action,JSON.stringify(detail)]);}
 async function source(db,kind,value){
  const key=id(value);if(!Object.hasOwn(sourceFields,kind))fail('FARM_INVALID_SOURCE');
  if(kind==='invoice'){
   const [[row]]=await db.execute("SELECT id FROM trade_invoices WHERE company_id=? AND id=? AND direction='received'",[companyId,key]);if(!row)fail('INVOICE_NOT_FOUND',404);
   const [[document]]=await db.execute('SELECT id FROM invoice_documents WHERE company_id=? AND invoice_id=? ORDER BY id LIMIT 1',[companyId,key]);if(document)return source(db,'document',document.id);
   const [[reception]]=await db.execute('SELECT id FROM integration_received_invoices WHERE company_id=? AND invoice_id=? ORDER BY id LIMIT 1',[companyId,key]);if(reception)return source(db,'integration',reception.id);
  }else if(kind==='integration'){
   const [[row]]=await db.execute('SELECT id FROM integration_received_invoices WHERE company_id=? AND id=?',[companyId,key]);if(!row)fail('INTEGRATION_INVOICE_NOT_FOUND',404);
   const [[document]]=await db.execute('SELECT id FROM invoice_documents WHERE company_id=? AND reception_id=? ORDER BY id LIMIT 1',[companyId,key]);if(document)return source(db,'document',document.id);
  }else{
   const [[row]]=await db.execute("SELECT id,review_kind FROM invoice_documents WHERE company_id=? AND id=? AND direction='received'",[companyId,key]);if(!row)fail('INVOICE_DOCUMENT_NOT_FOUND',404);if(row.review_kind!=='invoice')fail('SUPPLIER_NOT_INVOICE');
  }
  return {kind,field:sourceFields[kind],id:key};
 }
 async function assignment(db,s){const [[row]]=await db.execute('SELECT * FROM farm_expense_assignments WHERE company_id=? AND '+s.field+'=?',[companyId,s.id]);return row||null;}
 return {
  async catalog(){const [farms]=await pool.execute('SELECT * FROM pig_farms WHERE company_id=? ORDER BY name,code',[companyId]);const [groups]=await pool.execute('SELECT * FROM farm_expense_groups WHERE company_id=? ORDER BY name,id',[companyId]);return {farms,groups};},
  async saveFarm(body,farmId){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const name=text(body?.name,160),code=text(body?.code,20),notes=body.notes??'';if(!/^[A-Za-z0-9_.-]+$/.test(code)||typeof notes!=='string'||notes.length>2000)fail('FARM_INVALID_FIELD');
   const [[duplicate]]=await db.execute('SELECT id FROM pig_farms WHERE company_id=? AND code=?',[companyId,code]);if(duplicate&&duplicate.id!==Number(farmId))fail('FARM_DUPLICATE_CODE',409);
   let saved;if(farmId){const row=await farm(db,farmId);if(row.version!==body.version)fail('FARM_CHANGED',409);await db.execute('UPDATE pig_farms SET code=?,name=?,notes=?,version=version+1 WHERE company_id=? AND id=?',[code,name,notes,companyId,row.id]);saved=row.id;}else{const [row]=await db.execute('INSERT INTO pig_farms(company_id,code,name,notes) VALUES (?,?,?,?)',[companyId,code,name,notes]);saved=row.insertId;}
   await event(db,'farm_saved',{farm_id:saved});return farm(db,saved);
  });},
  async saveGroup(farmId,body,groupId){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const f=await farm(db,farmId),name=text(body?.name,160);let saved;
   const [[duplicate]]=await db.execute('SELECT id FROM farm_expense_groups WHERE company_id=? AND farm_id=? AND name=?',[companyId,f.id,name]);if(duplicate&&duplicate.id!==Number(groupId))fail('FARM_DUPLICATE_GROUP',409);
   if(groupId){const [[row]]=await db.execute('SELECT * FROM farm_expense_groups WHERE company_id=? AND farm_id=? AND id=?',[companyId,f.id,id(groupId)]);if(!row)fail('FARM_GROUP_NOT_FOUND',404);if(row.version!==body.version)fail('FARM_CHANGED',409);await db.execute('UPDATE farm_expense_groups SET name=?,version=version+1 WHERE company_id=? AND id=?',[name,companyId,row.id]);saved=row.id;}else{const [row]=await db.execute('INSERT INTO farm_expense_groups(company_id,farm_id,name) VALUES (?,?,?)',[companyId,f.id,name]);saved=row.insertId;}
   await event(db,'farm_group_saved',{farm_id:f.id,group_id:saved});return {id:saved};
  });},
  async getAssignment(kind,value){return assignment(pool,await source(pool,kind,value));},
  async assign(kind,value,body){return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);const s=await source(db,kind,value),previous=await assignment(db,s);
   if((previous?.version??null)!==(body?.version??null))fail('FARM_CHANGED',409);
   if(!body?.farm_id){if(body?.group_id)fail('FARM_INVALID_GROUP');if(previous)await db.execute('DELETE FROM farm_expense_assignments WHERE company_id=? AND id=?',[companyId,previous.id]);await event(db,'farm_expense_unassigned',{source:s,previous});return null;}
   const f=await farm(db,body.farm_id),groupId=body.group_id?id(body.group_id):null;
   if(groupId){const [[group]]=await db.execute('SELECT id FROM farm_expense_groups WHERE company_id=? AND farm_id=? AND id=?',[companyId,f.id,groupId]);if(!group)fail('FARM_GROUP_NOT_FOUND',404);}
   if(previous)await db.execute('UPDATE farm_expense_assignments SET farm_id=?,group_id=?,updated_by=?,version=version+1 WHERE company_id=? AND id=?',[f.id,groupId,actor,companyId,previous.id]);
   else await db.execute('INSERT INTO farm_expense_assignments(company_id,farm_id,group_id,'+s.field+',updated_by) VALUES (?,?,?,?,?)',[companyId,f.id,groupId,s.id,actor]);
   await event(db,'farm_expense_classified',{source:s,previous,farm_id:f.id,group_id:groupId});return assignment(db,s);
  });},
  async expenses(query={}){
   const params=[companyId];let where="a.company_id=? AND (a.document_id IS NULL OR EXISTS(SELECT 1 FROM invoice_documents x WHERE x.company_id=a.company_id AND x.id=a.document_id AND x.review_kind='invoice'))";if(query.farm_id){await farm(pool,query.farm_id);where+=' AND a.farm_id=?';params.push(id(query.farm_id));}if(query.group_id){where+=' AND a.group_id=?';params.push(id(query.group_id));}
   const [rows]=await pool.execute(`SELECT a.*,f.name AS farm_name,g.name AS group_name,COALESCE(i.reference,r.invoice_number,d.reference) AS reference,COALESCE(i.party_name,r.supplier_name,d.party_name) AS supplier_name,COALESCE(i.invoice_date,r.invoice_date,d.invoice_date) AS invoice_date,COALESCE(i.base_total,r.base_total) AS base_amount,COALESCE(i.total_amount,r.total_amount,JSON_UNQUOTE(JSON_EXTRACT(d.supplier_draft,'$.total'))) AS total_amount,r.currency AS reception_currency,JSON_UNQUOTE(JSON_EXTRACT(d.supplier_draft,'$.currency')) AS document_currency,i.id AS accounting_invoice_id,CASE WHEN a.document_id IS NOT NULL THEN 'document' WHEN a.integration_id IS NOT NULL THEN 'integration' ELSE 'invoice' END AS source_kind,COALESCE(a.document_id,a.integration_id,a.invoice_id) AS source_id FROM farm_expense_assignments a JOIN pig_farms f ON f.company_id=a.company_id AND f.id=a.farm_id LEFT JOIN farm_expense_groups g ON g.company_id=a.company_id AND g.id=a.group_id LEFT JOIN invoice_documents d ON d.company_id=a.company_id AND d.id=a.document_id LEFT JOIN integration_received_invoices r ON r.company_id=a.company_id AND r.id=COALESCE(a.integration_id,d.reception_id) LEFT JOIN trade_invoices i ON i.company_id=a.company_id AND i.id=COALESCE(a.invoice_id,d.invoice_id,r.invoice_id) WHERE ${where} ORDER BY a.updated_at DESC,a.id DESC`,params);return rows.map(({reception_currency,document_currency,...row})=>({...row,currency:reception_currency||document_currency||(row.accounting_invoice_id?'EUR':'')}));
  },
 };
}
