import { fiscalArchive,validateFiscalArchive,restoreFiscalArchive } from './verifactu.js';
import { randomUUID } from 'node:crypto';
import { createExerciseClearService } from './exercise-clear.js';
import { id } from './validation.js';
import { lockCompany } from './subaccounts.js';
import { withTransaction } from '../db/transaction.js';
import { readReconciliationLedger, reconciliationLedgerHash } from './bank-reconciliations.js';
import { bankReconciliationDates } from '../../../shared/bank-reconciliation.js';
import {farmLotsOverlap} from '../../../shared/farm-lots.js';
import { TABLES,TABLE_ORDER,SHARED,OPTIONAL_TABLES,fail,sha,encodeRow,sealBackup,packBackup,readBackup,binaryValue } from './backup-format.js';

const previews=new Map(),lifetime=15*60*1000;
// Only known additive fields may be absent in older v1 archives.
const legacyDefaults={companies:{business_format:'general'},company_details:{journal_source_name:''},company_documents:{folder:'general',invoice_extraction:null},bank_reconciliations:{version:1},journal_imports:{source_format:'libro_diario'},journal_entries:{source_journal_code:null,source_entry_reference:null},journal_lines:{source_line_number:null},farm_cost_lines:{lot_id:null,lot_assignment:'auto',feed_kg:null},farm_lots:{entry_kg_per_pig:null,entry_price_per_pig:null,entry_cost_included:0,feed_opening_kg:null,feed_closing_kg:null}};
const labels={accounting_exercises:'ejercicios',accounts:'cuentas',journal_entries:'asientos',journal_lines:'apuntes',trade_invoices:'facturas',trade_invoice_lines:'líneas de factura',portfolio_receipts:'recibos',portfolio_settlements:'cobros y pagos',invoice_documents:'documentos y propuestas',bank_reconciliations:'conciliaciones',journal_imports:'libros diarios',exercise_operations:'operaciones de apertura y cierre'};
legacyDefaults.accounts={party_profile:null,payment_profile:null,sepa_mandate:null};
legacyDefaults.portfolio_receipts={split_history:null};
Object.assign(legacyDefaults.company_details,{sepa_creditor_id:'',bank_initiator_id:''});
legacyDefaults.trade_invoices={party_snapshot:null,payment_snapshot:null};
const json=value=>typeof value==='string'?JSON.parse(value):value;
labels.farm_sales='ventas manuales de granjas';
const identity=row=>row.id??row.company_id;
const normalize=value=>String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const marks=rows=>rows.map(()=>'?').join(',');
function scope(value){
 if(value==='all')return 'all';
 const selected=Array.isArray(value)?value:typeof value==='string'?value.split(','):[value];
 if(!selected.length||selected.length>1000)fail('BACKUP_INVALID_SCOPE');
 let ids;try{ids=[...new Set(selected.map(id))].sort((a,b)=>a-b);}catch{fail('BACKUP_INVALID_SCOPE');}
 return ids.length===1?ids[0]:ids;
}
function filter(table,exerciseId){
 if(SHARED.has(table)||exerciseId==='all')return {sql:'1=1',params:[]};
 const ids=Array.isArray(exerciseId)?exerciseId:[exerciseId],clause=' IN ('+marks(ids)+')';
 if(table==='accounting_exercises')return {sql:'r.id'+clause,params:ids};
 if(table==='journal_lines')return {sql:'r.entry_id IN (SELECT id FROM journal_entries WHERE company_id=r.company_id AND exercise_id'+clause+')',params:ids};
 if(table==='farm_cost_lines')return {sql:'r.invoice_id IN (SELECT id FROM farm_invoices WHERE company_id=r.company_id AND exercise_id'+clause+')',params:ids};
 if(['trade_invoice_lines','portfolio_receipts'].includes(table))return {sql:'r.invoice_id IN (SELECT id FROM trade_invoices WHERE company_id=r.company_id AND exercise_id'+clause+')',params:ids};
 return {sql:'r.exercise_id'+clause,params:ids};
}
async function metadata(db){
 const result={};
 for(const table of TABLE_ORDER){
  const [columns]=await db.execute('SHOW COLUMNS FROM '+table);
  result[table]=columns.filter(column=>!/(?:VIRTUAL|STORED) GENERATED/.test(column.Extra));
 }
 return result;
}
function checkSchema(data,meta){
 for(const table of TABLE_ORDER){
  if(OPTIONAL_TABLES.has(table)&&data.schema[table].length===0&&data.tables[table].length===0&&data.references[table].length===0)continue;
  const expected=meta[table].map(column=>column.Field).sort();
  const sourceColumns=[...data.schema[table]].sort(),defaults=legacyDefaults[table]||{};
  if(JSON.stringify(sourceColumns)!==JSON.stringify(expected.filter(field=>sourceColumns.includes(field)||!Object.hasOwn(defaults,field))))fail('BACKUP_SCHEMA_MISMATCH');
  for(const row of [...data.tables[table],...data.references[table]]){
   if(JSON.stringify(Object.keys(row).sort())!==JSON.stringify(sourceColumns))fail('BACKUP_INVALID_FILE');
   for(const column of meta[table]){
    if(!Object.hasOwn(row,column.Field)&&Object.hasOwn(defaults,column.Field))continue;
    const value=row[column.Field];
    if(value==null&&column.Null==='NO')fail('BACKUP_INVALID_FILE');
    if(value!=null&&/int|^tinyint|^smallint|^bigint/.test(column.Type)&&(!Number.isSafeInteger(value)||/unsigned/.test(column.Type)&&value<0))fail('BACKUP_INVALID_FILE');
    if(value!=null&&column.Type.startsWith('enum(')&&!column.Type.slice(5,-1).split(',').map(item=>item.slice(1,-1)).includes(value))fail('BACKUP_INVALID_FILE');
    if(value!=null&&column.Type==='date'&&(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))fail('BACKUP_INVALID_FILE');
    if(/blob|binary/i.test(column.Type)&&row[column.Field]!=null)binaryValue(row[column.Field]);
    if(column.Type==='json'&&typeof row[column.Field]==='string')fail('BACKUP_INVALID_FILE');
   }
   const binary=row.source_pdf||row.content;
   const digest=row.source_sha256||row.source_hash;
   if(binary&&digest&&sha(binaryValue(binary))!==digest)fail('BACKUP_CHECKSUM');
   if(table==='company_documents'&&binaryValue(row.content).length!==row.source_size)fail('BACKUP_INVALID_FILE');
   if(table==='farm_documents'&&(binaryValue(row.source_pdf).length!==row.source_size||row.source_size>15*1024*1024))fail('BACKUP_INVALID_FILE');
  }
 }
}
export function createDataBackupService(pool,companyId){
 const clearService=createExerciseClearService(pool,companyId);
 async function snapshot(db,requested){
  await lockCompany(db,companyId);
  const meta=await metadata(db),tables={},references={},indexes={};
  for(const table of TABLE_ORDER){
   const columns=meta[table].map(column=>'r.'+column.Field).join(','),where=filter(table,requested);
   const [rows]=await db.execute('SELECT '+columns+' FROM '+table+' r WHERE '+(table==='companies'?'r.id=?':'r.company_id=?')+' AND '+where.sql+' ORDER BY '+(table==='company_details'||table==='company_logos'?'r.company_id':'r.id'),[companyId,...where.params]);
   tables[table]=rows.map(encodeRow);references[table]=[];indexes[table]=new Map(tables[table].map(row=>[identity(row),row]));
  }
  if(!tables.accounting_exercises.length)fail('EXERCISE_NOT_FOUND',404);
  if(requested!=='all'&&tables.accounting_exercises.length!==(Array.isArray(requested)?requested.length:1))fail('EXERCISE_NOT_FOUND',404);
  let added=true;
  while(added){
   added=false;
   for(const table of TABLE_ORDER){
    for(const [field,target]of Object.entries(TABLES[table].refs)){
     const missing=[...new Set([...tables[table],...references[table]].map(row=>row[field]).filter(value=>value!=null&&!indexes[target].has(value)))];
     for(let offset=0;offset<missing.length;offset+=100){
      const batch=missing.slice(offset,offset+100),columns=meta[target].map(column=>column.Field).join(',');
      const [rows]=await db.execute('SELECT '+columns+' FROM '+target+' WHERE company_id=? AND id IN ('+marks(batch)+')',[companyId,...batch]);
      if(rows.length!==batch.length)fail('BACKUP_BROKEN_LINKS',409);
      for(const row of rows){const encoded=encodeRow(row);references[target].push(encoded);indexes[target].set(row.id,encoded);added=true;}
     }
    }
   }
  }
  const bankCurrent={};
  for(const row of tables.bank_reconciliations){
   const through=row.snapshot?.source?.to?bankReconciliationDates(row.snapshot).readThrough:null;
   bankCurrent[row.id]=!!through&&reconciliationLedgerHash(await readReconciliationLedger(db,companyId,row.exercise_id,through))===row.ledger_hash;
  }
  const archive=await fiscalArchive(db,companyId);
  const data=sealBackup({...(archive&&(requested==='all'||archive.verifactu_records.length)?{fiscal_archive:archive}:{}),format:'contabilitat-backup',version:1,created_at:new Date().toISOString(),scope:requested==='all'?{kind:'company'}:Array.isArray(requested)?{kind:'exercises',exercise_ids:requested}:{kind:'exercise',exercise_id:requested},
   schema:Object.fromEntries(TABLE_ORDER.map(table=>[table,meta[table].map(column=>column.Field)])),tables,references,bank_current:bankCurrent});
  return {data,file:packBackup(data)};
 }
 async function destination(db,data,requested,replaceExisting=false){
  const [[company]]=await db.execute('SELECT * FROM companies WHERE id=?',[companyId]);
  const [[details]]=await db.execute('SELECT * FROM company_details WHERE company_id=?',[companyId]);
  const [periods]=await db.execute('SELECT id,name,start_date,end_date,status,is_default FROM accounting_exercises WHERE company_id=? ORDER BY start_date',[companyId]);
  const [accounts]=await db.execute('SELECT * FROM accounts WHERE company_id=? ORDER BY code',[companyId]);
  const [banks]=await db.execute('SELECT * FROM bank_connections WHERE company_id=? ORDER BY id',[companyId]);
  const [suppliers]=await db.execute('SELECT id,code,account_id,tax_id FROM suppliers WHERE company_id=? ORDER BY id',[companyId]);
  const [documents]=await db.execute('SELECT id,request_id,source_sha256,version FROM company_documents WHERE company_id=? ORDER BY id',[companyId]);
  const [farms]=await db.execute('SELECT * FROM pig_farms WHERE company_id=? ORDER BY id',[companyId]);
  const [farmDocuments]=await db.execute('SELECT id,source_sha256 FROM farm_documents WHERE company_id=? ORDER BY id',[companyId]);
  const [farmLots]=await db.execute('SELECT * FROM farm_lots WHERE company_id=? ORDER BY id',[companyId]);
  const [[logo]]=await db.execute('SELECT SHA2(content,256) AS digest FROM company_logos WHERE company_id=?',[companyId]);
  const source=data.tables.companies[0],sourceDetails=data.tables.company_details[0],blockers=[];
  const add=(code,message)=>blockers.push({code,message});
  if(normalize(details?.tax_id)&&normalize(sourceDetails?.tax_id)?normalize(details.tax_id)!==normalize(sourceDetails.tax_id):normalize(company.name)!==normalize(source.name))add('company','La copia pertenece a otra empresa. Selecciona su empresa o crea una con el mismo nombre o CIF/NIF.');
  if(accounts.length&&company.subaccount_length!==source.subaccount_length)add('length','La longitud de subcuentas de la empresa no coincide con la copia.');
  if(accounts.length&&source.business_format!==undefined&&source.business_format!==company.business_format)add('format','El formato de la empresa no coincide con el de la copia. Revisa su ficha antes de importar.');
  const maps=Object.fromEntries(TABLE_ORDER.map(table=>[table,new Map()]));maps.companies.set(source.id,companyId);
  for(const exercise of [...data.tables.accounting_exercises,...data.references.accounting_exercises]){
   const found=periods.find(row=>row.start_date===exercise.start_date&&row.end_date===exercise.end_date);
   if(found)maps.accounting_exercises.set(exercise.id,found.id);
   else if(periods.some(row=>row.start_date<=exercise.end_date&&row.end_date>=exercise.start_date))add('overlap','Las fechas del ejercicio '+exercise.name+' se solapan con otro período de la empresa.');
   else if(data.tables.accounting_exercises.includes(exercise)&&periods.some(row=>row.name===exercise.name))add('name','Ya existe un ejercicio llamado '+exercise.name+' con otras fechas.');
  }
  if(requested!=='all'){
   const selected=Array.isArray(requested)?requested:[requested],targets=selected.map(targetId=>periods.find(row=>row.id===targetId));
   if(targets.some(target=>!target))fail('EXERCISE_NOT_FOUND',404);
   if(targets.length!==data.tables.accounting_exercises.length||targets.some(target=>!data.tables.accounting_exercises.some(sourcePeriod=>target.start_date===sourcePeriod.start_date&&target.end_date===sourcePeriod.end_date)))add('period','Los ejercicios marcados no coinciden con los períodos de la copia. Marca los mismos ejercicios que contiene el archivo.');
  }
  const byCode=new Map(accounts.map(row=>[row.code,row])),sourceAccounts=new Map(data.tables.accounts.map(row=>[row.id,row]));
  for(const sourceLot of data.tables.farm_lots){
   const sourceFarm=data.tables.pig_farms.find(row=>row.id===sourceLot.farm_id),farm=farms.find(row=>row.code===sourceFarm?.code);if(!farm)continue;
   const existingLot=farmLots.find(row=>row.farm_id===farm.id&&row.code===sourceLot.code);
   if(existingLot&&['entry_date','exit_date','animals_in','animals_out','entry_kg_per_pig','entry_price_per_pig','entry_cost_included','feed_opening_kg','feed_closing_kg'].some(field=>Object.hasOwn(sourceLot,field)&&String(existingLot[field])!==String(sourceLot[field])))add('farm_lot','Los datos de entrada o cierre del lote '+sourceLot.code+' son distintos en la granja '+farm.name+'. Revisa su ficha antes de restaurar.');
   if(!existingLot&&farmLots.some(row=>row.farm_id===farm.id&&(!row.exit_date&&!sourceLot.exit_date||farmLotsOverlap(row,{...sourceLot,farm_id:farm.id}))))add('farm_lot','El lote '+sourceLot.code+' se solapa con otro ciclo de la granja '+farm.name+'.');
  }
  for(const account of data.tables.accounts){
   const found=byCode.get(account.code);if(!found)continue;
   maps.accounts.set(account.id,found.id);
   const parent=account.parent_id==null?null:sourceAccounts.get(account.parent_id)?.code;
   const currentParent=found.parent_id==null?null:accounts.find(row=>row.id===found.parent_id)?.code;
   if(found.kind!==account.kind||parent!==currentParent)add('account','La estructura de la cuenta '+account.code+' es diferente en la empresa de destino.');
  }
  const affectedIds=data.tables.accounting_exercises.map(row=>maps.accounting_exercises.get(row.id)).filter(Boolean),existingCounts={};
  for(const table of TABLE_ORDER){
   if(SHARED.has(table)||table==='accounting_exercises')continue;
   const where=filter(table,affectedIds.length?affectedIds:[0]),[[count]]=await db.execute('SELECT COUNT(*) AS total,COALESCE(MAX(r.id),0) AS latest FROM '+table+' r WHERE r.company_id=? AND '+where.sql,[companyId,...where.params]);
   existingCounts[table]=count.total;
   if(count.total&&!replaceExisting)add('occupied','El destino contiene '+count.total+' '+(labels[table]||'registros relacionados')+'. Marca «Sustituir los datos existentes» para recuperar la copia.');
  }
  for(const table of TABLE_ORDER){
   for(const row of data.references[table]){
    const values=TABLES[table].key.map(field=>TABLES[table].refs[field]?maps[TABLES[table].refs[field]].get(row[field]):row[field]);
    if(values.some(value=>value==null))continue;
    const [[found]]=await db.execute('SELECT * FROM '+table+' WHERE company_id=? AND '+TABLES[table].key.map(field=>field+'=?').join(' AND '),[companyId,...values]);
    if(found){
     maps[table].set(identity(row),identity(found));
     for(const field of ['amount','total_amount','base_total','tax_total','withholding_total','number','entry_date','start_date','end_date','kind','code']){
      if(Object.hasOwn(row,field)&&String(found[field])!==String(row[field]))add('reference_changed','Los datos vinculados de otro ejercicio han cambiado ('+(labels[table]||'registros relacionados')+'). Usa una copia completa de la empresa.');
     }
    }
   }
  }
  for(const table of TABLE_ORDER){
   const missing=data.references[table].filter(row=>!maps[table].has(identity(row)));
   if(missing.length)add('dependency','Faltan '+missing.length+' '+(labels[table]||'registros relacionados')+' de otro ejercicio. Restaura primero ese ejercicio o utiliza una copia completa de la empresa.');
  }
  for(const row of data.tables.bank_connections){const found=banks.find(item=>item.iban===row.iban);if(found&&found.account_id!==maps.accounts.get(row.account_id))add('bank','El IBAN '+row.iban+' está asociado a otra subcuenta.');}
  for(const row of data.tables.suppliers){const found=suppliers.find(item=>item.code===row.code);if(found&&(found.account_id!==maps.accounts.get(row.account_id)||normalize(found.tax_id)!==normalize(row.tax_id)))add('supplier','El proveedor '+row.code+' tiene datos incompatibles.');}
  for(const row of data.tables.company_documents){const found=documents.find(item=>item.request_id===row.request_id);if(found&&found.source_sha256!==row.source_sha256)add('document','Un documento común coincide con otro archivo diferente.');}
  if(data.fiscal_archive){
   const fiscalInvoiceIds=new Set(data.tables.trade_invoices.map(row=>row.id));
   const [[existingFiscal]]=await db.execute('SELECT COUNT(*) AS total FROM verifactu_records WHERE company_id=?',[companyId]);
   if(existingFiscal.total)add('verifactu','El destino ya conserva una cadena VERI*FACTU. No se pueden mezclar ni sustituir cadenas fiscales.');
   if(data.fiscal_archive.verifactu_records.length&&(data.scope.kind!=='company'||data.fiscal_archive.verifactu_records.some(row=>!fiscalInvoiceIds.has(row.invoice_id))))add('verifactu_full','Los registros VERI*FACTU se recuperan con una copia completa de la empresa para conservar toda la cadena.');
  }
  const replacement=replaceExisting?await clearService.replacementPreview(db,affectedIds):null;
  if(replacement)blockers.push(...replacement.blockers);
  const state={company,details,periods,accounts,banks,suppliers,documents,farms,farmDocuments,farmLots,logo,blockers,existingCounts,replacement_hash:replacement?.state_hash};
  return {company,periods,maps,blockers,existingCounts,affectedIds,replacement,ready:!blockers.length,state_hash:sha(state)};
 }
 async function insert(db,table,row,meta,maps){
  const fields=meta[table].map(column=>column.Field).filter(field=>field!=='id');
  const values=fields.map(field=>{
   const column=meta[table].find(item=>item.Field===field),target=TABLES[table].refs[field];
   if(field==='company_id')return companyId;
   if(!Object.hasOwn(row,field)&&Object.hasOwn(legacyDefaults[table]||{},field))return legacyDefaults[table][field];
   if(target&&row[field]!=null){const mapped=maps[target].get(row[field]);if(mapped==null)fail('BACKUP_BROKEN_LINKS',409);return mapped;}
   if(column.Type==='json')return row[field]==null?null:JSON.stringify(row[field]);
   if(/blob|binary/i.test(column.Type))return row[field]==null?null:binaryValue(row[field]);
   return row[field];
  });
  const [created]=await db.execute('INSERT INTO '+table+' ('+fields.join(',')+') VALUES ('+marks(fields)+')',values);
  maps[table].set(identity(row),table==='company_details'||table==='company_logos'?companyId:created.insertId);
  return created.insertId;
 }
 return {
  async export(requested='all',options={}){return options.db?snapshot(options.db,scope(requested)):withTransaction(pool,db=>snapshot(db,scope(requested)));},
  async preview(buffer,requested='all',replaceExisting=false){
   if(typeof replaceExisting!=='boolean')fail('BACKUP_INVALID_SCOPE');
   requested=scope(requested);
   const data=readBackup(buffer);if(data.fiscal_archive)validateFiscalArchive(data.fiscal_archive,data);
   if(requested!=='all'&&(Array.isArray(requested)?requested.length:1)!==data.tables.accounting_exercises.length)fail('BACKUP_SCOPE_MISMATCH');
   const result=await withTransaction(pool,async db=>{await lockCompany(db,companyId);checkSchema(data,await metadata(db));return destination(db,data,requested,replaceExisting);});
   for(const [token,preview]of previews)if(preview.expires<Date.now())previews.delete(token);
   const bytes=Buffer.byteLength(JSON.stringify(data));
   if(previews.size>=6||[...previews.values()].reduce((total,preview)=>total+preview.bytes,bytes)>256*1024*1024)fail('BACKUP_PREVIEW_BUSY',429);
   const token=randomUUID();previews.set(token,{companyId,data,bytes,requested,replaceExisting,state_hash:result.state_hash,expires:Date.now()+lifetime});
   return {token,company:{id:companyId,name:result.company.name},source_company:{name:data.tables.companies[0].name},scope:data.scope.kind,created_at:data.created_at,
    exercises:data.tables.accounting_exercises.map(row=>({name:row.name,start_date:row.start_date,end_date:row.end_date,status:row.status})),
    counts:Object.fromEntries(TABLE_ORDER.map(table=>[table,data.tables[table].length])),existing_counts:result.existingCounts,replace_existing:replaceExisting,blockers:result.blockers,ready:result.ready};
  },
  async discard(token){const cached=previews.get(token);if(cached?.companyId===companyId)previews.delete(token);return {discarded:true};},
  async restore(body,{canReplace=true}={}){
   if(body?.confirm!==true||typeof body.token!=='string'||typeof body.request_id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(body.request_id))fail('BACKUP_CONFIRM_REQUIRED');
   const result=await withTransaction(pool,async db=>{
    await lockCompany(db,companyId);
    const [[previous]]=await db.execute('SELECT preview_token,result FROM data_restores WHERE company_id=? AND request_id=?',[companyId,body.request_id]);
    if(previous){if(previous.preview_token!==body.token)fail('REQUEST_CONFLICT',409);const result=json(previous.result);if(result.replaced&&!canReplace)fail('PERMISSION_DENIED',403);if(result.replaced&&body.confirmation!=='96')fail('BACKUP_REPLACEMENT_CODE');return {...result,replayed:true};}
    const cached=previews.get(body.token);
    if(!cached||cached.companyId!==companyId||cached.expires<Date.now())fail('BACKUP_PREVIEW_EXPIRED',409);
    const {data,requested,replaceExisting}=cached;if(replaceExisting&&!canReplace)fail('PERMISSION_DENIED',403);const meta=await metadata(db);checkSchema(data,meta);
    if(replaceExisting&&body.confirmation!=='96')fail('BACKUP_REPLACEMENT_CODE');
    const target=await destination(db,data,requested,replaceExisting);
    if(target.state_hash!==cached.state_hash)fail('BACKUP_DESTINATION_CHANGED',409);
    if(!target.ready)fail('BACKUP_DESTINATION_NOT_EMPTY',409);
    const backups=replaceExisting?await clearService.replaceForRestore(db,target.affectedIds,body.request_id,target.replacement.state_hash):[];
    const {maps}=target,pending=[];
    const source=data.tables.companies[0];
    if(!target.maps.accounts.size)await db.execute('UPDATE companies SET subaccount_length=? WHERE id=?',[source.subaccount_length,companyId]);
    if(!target.maps.accounts.size&&source.business_format!==undefined)await db.execute('UPDATE companies SET business_format=? WHERE id=?',[source.business_format,companyId]);
    for(const period of data.tables.accounting_exercises){
     if(maps.accounting_exercises.has(period.id))continue;
     await insert(db,'accounting_exercises',{...period,status:'open',is_default:0},meta,maps);
    }
    const accounts=[...data.tables.accounts].sort((a,b)=>a.code.length-b.code.length||a.code.localeCompare(b.code));
    for(const account of accounts)if(!maps.accounts.has(account.id))await insert(db,'accounts',account,meta,maps);
    for(const account of accounts)if(account.party_profile&&maps.accounts.has(account.id))await db.execute('UPDATE accounts SET party_profile=? WHERE company_id=? AND id=? AND party_profile IS NULL',[JSON.stringify(account.party_profile),companyId,maps.accounts.get(account.id)]);
    for(const account of accounts)if(account.payment_profile&&maps.accounts.has(account.id))await db.execute('UPDATE accounts SET payment_profile=? WHERE company_id=? AND id=? AND payment_profile IS NULL',[JSON.stringify(account.payment_profile),companyId,maps.accounts.get(account.id)]);
    for(const account of accounts)if(account.sepa_mandate&&maps.accounts.has(account.id))await db.execute('UPDATE accounts SET sepa_mandate=? WHERE company_id=? AND id=? AND sepa_mandate IS NULL',[JSON.stringify(account.sepa_mandate),companyId,maps.accounts.get(account.id)]);
    for(const table of ['company_details','company_logos']){
     const row=data.tables[table][0];if(!row)continue;
     const [[existing]]=await db.execute('SELECT * FROM '+table+' WHERE company_id=?',[companyId]);
     if(!existing)await insert(db,table,row,meta,maps);
     else if(table==='company_details'){
      const fields=meta[table].map(column=>column.Field).filter(field=>!['company_id','updated_at'].includes(field)&&!existing[field]&&row[field]);
      if(fields.length)await db.execute('UPDATE company_details SET '+fields.map(field=>field+'=?').join(',')+' WHERE company_id=?',[...fields.map(field=>row[field]),companyId]);
     }
    }
    for(const table of TABLE_ORDER){
     if(['companies','company_details','company_logos','accounts','accounting_exercises'].includes(table))continue;
     for(const row of data.tables[table]){
      if(SHARED.has(table)){
       const values=TABLES[table].key.map(field=>TABLES[table].refs[field]?maps[TABLES[table].refs[field]].get(row[field]):row[field]),[[existing]]=await db.execute('SELECT id FROM '+table+' WHERE company_id=? AND '+TABLES[table].key.map(field=>field+'=?').join(' AND '),[companyId,...values]);
       if(existing){maps[table].set(row.id,existing.id);continue;}
      }
      const newId=await insert(db,table,row,meta,maps);pending.push({table,row,newId});
     }
    }
    for(const {table,row,newId}of pending){
     if(table==='bank_remittances'){
      const receiptIds=row.receipt_ids.map(value=>maps.portfolio_receipts.get(value)).filter(Boolean),complete=receiptIds.length===row.receipt_ids.length;
      await db.execute('UPDATE bank_remittances SET receipt_ids=?,snapshot=?,status=? WHERE company_id=? AND id=?',[JSON.stringify(receiptIds),JSON.stringify(remapJson(row.snapshot,maps)),complete?row.status:'archived',companyId,newId]);
      continue;
     }
     const columns=meta[table].filter(column=>column.Type==='json'&&row[column.Field]!=null);
     if(!columns.length)continue;
     const values=columns.map(column=>JSON.stringify(remapJson(row[column.Field],maps,table==='trade_invoices'?'company':column.Field==='result'&&table==='exercise_operations'&&row.kind==='create_exercise'?'exercise':'')));
     const timestamps=meta[table].filter(column=>column.Field==='updated_at');
     await db.execute('UPDATE '+table+' SET '+[...columns.map(column=>column.Field+'=?'),...timestamps.map(column=>column.Field+'=?')].join(',')+' WHERE company_id=? AND id=?',[...values,...timestamps.map(column=>row[column.Field]),companyId,newId]);
    }
    for(const row of data.tables.bank_reconciliations){
     let ledgerHash=sha({restored_stale:row.ledger_hash,backup:data.checksum});
     if(data.bank_current?.[row.id]&&row.snapshot?.source?.to){
      const exerciseId=maps.accounting_exercises.get(row.exercise_id),ledger=await readReconciliationLedger(db,companyId,exerciseId,bankReconciliationDates(row.snapshot).readThrough);
      ledgerHash=reconciliationLedgerHash(ledger);
     }
     await db.execute('UPDATE bank_reconciliations SET ledger_hash=? WHERE company_id=? AND id=?',[ledgerHash,companyId,maps.bank_reconciliations.get(row.id)]);
    }
    const fullCompany=requested==='all'&&data.scope.kind==='company'&&target.periods.every(period=>target.affectedIds.includes(period.id));
    if(fullCompany)await db.execute('UPDATE accounting_exercises SET is_default=0 WHERE company_id=?',[companyId]);
    for(const period of data.tables.accounting_exercises){
     const existing=target.periods.find(row=>row.id===maps.accounting_exercises.get(period.id));
     const isDefault=period.status==='open'&&(fullCompany?!!period.is_default:!!existing?.is_default);
     await db.execute('UPDATE accounting_exercises SET status=?,is_default=? WHERE company_id=? AND id=?',[period.status,isDefault,companyId,maps.accounting_exercises.get(period.id)]);
    }
    if(data.fiscal_archive)await restoreFiscalArchive(db,companyId,data.fiscal_archive,maps);
    const result={fiscal_restored:!!data.fiscal_archive?.verifactu_records.length,company_id:companyId,replaced:replaceExisting,backups,exercise_ids:data.tables.accounting_exercises.map(row=>maps.accounting_exercises.get(row.id)),counts:Object.fromEntries(TABLE_ORDER.map(table=>[table,data.tables[table].length])),replayed:false};
    const targetScope=Array.isArray(requested)?'years:'+sha(requested).slice(0,14):String(requested);
    await db.execute('INSERT INTO data_restores(company_id,request_id,preview_token,archive_checksum,target_scope,result) VALUES (?,?,?,?,?,?)',[companyId,body.request_id,body.token,data.checksum,targetScope,JSON.stringify(result)]);
    return result;
   });
   previews.delete(body.token);
   return result;
  },
 };
}
const jsonIds={company_id:'companies',exercise_id:'accounting_exercises',source_exercise_id:'accounting_exercises',entry_id:'journal_entries',void_entry_id:'journal_entries',reversal_entry_id:'journal_entries',last_matching_entry_id:'journal_entries',operation_id:'exercise_operations',exercise_operation_id:'exercise_operations',cancelled_by_operation_id:'exercise_operations',import_id:'journal_imports',invoice_id:'trade_invoices',receipt_id:'portfolio_receipts',settlement_id:'portfolio_settlements',account_id:'accounts',parent_id:'accounts',party_account_id:'accounts',offset_account_id:'accounts',vat_account_id:'accounts',withholding_account_id:'accounts',bank_account_id:'accounts',result_account_id:'accounts'};
const contexts={company:'companies',issuer:'companies',exercise:'accounting_exercises',source:'accounting_exercises',affected_exercises:'accounting_exercises',account:'accounts',result_account:'accounts',entries:'journal_entries',cancel_entries:'journal_entries',cancelled_entries:'journal_entries',lines:'journal_lines',journal:'journal_lines',existing_invoice:'trade_invoices',receipts:'portfolio_receipts'};
function remapJson(value,maps,context=''){
 if(Array.isArray(value))return value.map(item=>remapJson(item,maps,context));
 if(value===null||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,item])=>{
  const table=jsonIds[key]||(key==='id'?contexts[context]||context:null);
  if(table&&Object.hasOwn(maps,table)&&item!=null&&item!=='')return [key,maps[table].get(Number(item))??null];
  if(key==='logo_url'&&typeof item==='string')return [key,item.replace(/\/companies\/(\d+)\/logo/g,(_,old)=>'/companies/'+(maps.companies.get(Number(old))||old)+'/logo')];
  return [key,remapJson(item,maps,contexts[key]||key)];
 }));
}
