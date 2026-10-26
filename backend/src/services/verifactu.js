import {randomUUID} from 'node:crypto';
import QRCode from 'qrcode';
import {withTransaction} from '../db/transaction.js';
import {lockCompany} from './subaccounts.js';
import {createCompanyService} from './companies.js';
import {HttpError} from '../middleware/errors.js';
import {id,fail} from './validation.js';
import {VF_VERSION,validNif,normalizeNif,invoicePayload,digest,hashInput,envelope,qrUrl,parseResponse} from './verifactu-format.js';
import {credentialsForCompany,sendToAeat} from './verifactu-transport.js';
const json=value=>typeof value==='string'?JSON.parse(value):value;
const fields=['producer_name','producer_nif','software_name','software_id','version','installation_id'];
export const fiscalTables=['verifactu_settings','verifactu_records','verifactu_deliveries','verifactu_attempts'];
export async function fiscalArchive(db,companyId){
 const result={};for(const table of fiscalTables){const [rows]=await db.execute('SELECT * FROM '+table+' WHERE company_id=? ORDER BY '+(table==='verifactu_settings'?'company_id':table==='verifactu_deliveries'?'record_id':'id'),[companyId]);result[table]=rows;}
 return result.verifactu_settings.length||result.verifactu_records.length?result:null;
}
export function validateFiscalArchive(archive,data){
 if(!archive||Object.keys(archive).sort().join()!==[...fiscalTables].sort().join()||fiscalTables.some(table=>!Array.isArray(archive[table])))fail('BACKUP_INVALID_FILE');
 const companyId=data.tables.companies[0].id,records=archive.verifactu_records,settings=archive.verifactu_settings;
 if(settings.length!==1||settings[0].company_id!==companyId||settings[0].environment!=='test'||!['company','custom'].includes(settings[0].producer_source??'custom'))fail('BACKUP_INVALID_FILE');
 let previous=null;
 const sourceInvoices=new Map(data.tables.trade_invoices.map(row=>[row.id,row]));
 const ids=new Set();for(const record of records){
  const p=record.payload,sourceInvoice=sourceInvoices.get(record.invoice_id);
  if(record.company_id!==companyId||record.sequence_no!==(previous?.sequence_no||0)+1||record.environment!=='test'||!['alta','anulacion'].includes(record.kind)||ids.has(record.id)||!p||p.kind!==record.kind||record.previous_hash!==(previous?.hash||'')||p.Huella!==record.previous_hash||record.hash!==digest(hashInput(p))||record.xml!==envelope(p)||record.generated_at!==p.FechaHoraHusoGenRegistro||p.issuer_nif!==settings[0].issuer_nif||record.qr_url!==(record.kind==='alta'?qrUrl(p):''))fail('BACKUP_INVALID_FILE');
  if(previous&&(p.previous?.nif!==previous.payload.issuer_nif||p.previous?.reference!==(previous.payload.NumSerieFactura||previous.payload.NumSerieFacturaAnulada)||p.previous?.date!==(previous.payload.FechaExpedicionFactura||previous.payload.FechaExpedicionFacturaAnulada))||!previous&&p.previous)fail('BACKUP_INVALID_FILE');
  if(sourceInvoice&&(sourceInvoice.company_id!==companyId||sourceInvoice.exercise_id!==record.exercise_id||sourceInvoice.direction!=='issued'||sourceInvoice.reference!==(p.NumSerieFactura||p.NumSerieFacturaAnulada)||sourceInvoice.invoice_date.split('-').reverse().join('-')!==(p.FechaExpedicionFactura||p.FechaExpedicionFacturaAnulada)))fail('BACKUP_INVALID_FILE');
  ids.add(record.id);previous=record;
 }
 const deliveries=new Set();for(const row of archive.verifactu_deliveries){if(row.company_id!==companyId||!ids.has(row.record_id)||deliveries.has(row.record_id)||!['pending','accepted','accepted_with_errors','rejected','error'].includes(row.status))fail('BACKUP_INVALID_FILE');deliveries.add(row.record_id);}
 if(deliveries.size!==ids.size||archive.verifactu_attempts.some(row=>row.company_id!==companyId||!ids.has(row.record_id)))fail('BACKUP_INVALID_FILE');
}
export async function restoreFiscalArchive(db,companyId,archive,maps){
 const recordIds=new Map();
 for(const table of fiscalTables){
  const [columns]=await db.execute('SHOW COLUMNS FROM '+table),writable=columns.map(column=>column.Field).filter(field=>field!=='id');
  for(const archived of archive[table]){
   // Older archives keep their explicit producer rather than following company data.
   const source=table==='verifactu_settings'?{producer_source:'custom',...archived}:archived;
   if(Object.keys(source).sort().join()!==columns.map(column=>column.Field).sort().join())fail('BACKUP_SCHEMA_MISMATCH');
   const row={...source,company_id:companyId};
   if(table==='verifactu_settings')row.enabled=0;
   if(table==='verifactu_records'){row.invoice_id=maps.trade_invoices.get(source.invoice_id);row.exercise_id=maps.accounting_exercises.get(source.exercise_id);if(!row.invoice_id||!row.exercise_id)fail('VERIFACTU_BACKUP_FULL_REQUIRED');}
   if(['verifactu_deliveries','verifactu_attempts'].includes(table)){row.record_id=recordIds.get(source.record_id);if(!row.record_id)fail('BACKUP_BROKEN_LINKS');}
   const values=writable.map(field=>columns.find(column=>column.Field===field).Type==='json'?JSON.stringify(row[field]):row[field]);
   if(table==='verifactu_settings')await db.execute('DELETE FROM verifactu_settings WHERE company_id=?',[companyId]);
   const [created]=await db.execute('INSERT INTO '+table+' ('+writable.join(',')+') VALUES ('+writable.map(()=>'?').join(',')+')',values);
   if(table==='verifactu_records')recordIds.set(source.id,created.insertId);
  }
 }
}
export async function appendFiscalRecord(db,companyId,invoice,kind='alta'){
 if(invoice.direction!=='issued')return null;
 const [[settings]]=await db.execute('SELECT * FROM verifactu_settings WHERE company_id=?',[companyId]);
 if(!settings?.enabled){if(kind==='anulacion'){const [[original]]=await db.execute("SELECT id FROM verifactu_records WHERE company_id=? AND invoice_id=? AND kind='alta'",[companyId,invoice.id]);if(original)fail('VERIFACTU_DISABLED');}return null;}
 if(normalizeNif(invoice.issuer_snapshot.tax_id)!==settings.issuer_nif)fail('VERIFACTU_ISSUER_CHANGED');
 const [[existing]]=await db.execute('SELECT id FROM verifactu_records WHERE company_id=? AND invoice_id=? AND kind=?',[companyId,invoice.id,kind]);if(existing)return existing;
 if(kind==='anulacion'){const [[original]]=await db.execute("SELECT id FROM verifactu_records WHERE company_id=? AND invoice_id=? AND kind='alta'",[companyId,invoice.id]);if(!original)return null;}
 const [[previous]]=await db.execute('SELECT sequence_no,hash,payload FROM verifactu_records WHERE company_id=? ORDER BY sequence_no DESC LIMIT 1',[companyId]);if(previous)previous.payload=json(previous.payload);
 const payload=invoicePayload(invoice,settings,previous,kind),hash=digest(hashInput(payload)),xml=envelope(payload),url=kind==='alta'?qrUrl(payload):'';
 const [created]=await db.execute('INSERT INTO verifactu_records(company_id,exercise_id,invoice_id,sequence_no,kind,previous_hash,hash,generated_at,payload,xml,qr_url) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[companyId,invoice.exercise_id,invoice.id,(previous?.sequence_no||0)+1,kind,previous?.hash||'',hash,payload.FechaHoraHusoGenRegistro,JSON.stringify(payload),xml,url]);
 await db.execute('INSERT INTO verifactu_deliveries(record_id,company_id) VALUES (?,?)',[created.insertId,companyId]);return {id:created.insertId,hash};
}
export async function invoiceFiscalInfo(db,companyId,invoiceId){
 const [records]=await db.execute('SELECT r.id,r.sequence_no,r.kind,r.hash,r.generated_at,r.qr_url,JSON_UNQUOTE(JSON_EXTRACT(r.payload,"$.ImporteTotal")) AS fiscal_total,d.status,d.csv,d.error_code,d.message FROM verifactu_records r JOIN verifactu_deliveries d ON d.record_id=r.id AND d.company_id=r.company_id WHERE r.company_id=? AND r.invoice_id=? ORDER BY r.sequence_no',[companyId,invoiceId]);
 if(!records.length)return null;
 const original=records.find(record=>record.kind==='alta');return {environment:'test',records,invoice_total:original?.fiscal_total||null,qr_url:original?.qr_url||'',qr_image:original?await QRCode.toDataURL(original.qr_url,{errorCorrectionLevel:'M',margin:4,width:300}):''};
}
export function createVerifactuService(pool,companyId,{transport=sendToAeat,credentials=credentialsForCompany}={}){
 async function state(db){
  const company=await createCompanyService(db).getCompany(companyId),[[stored]]=await db.execute('SELECT * FROM verifactu_settings WHERE company_id=?',[companyId]);
  const settings=stored?{...stored,enabled:!!stored.enabled}:{company_id:companyId,enabled:false,environment:'test',producer_source:'company',producer_name:company.name,producer_nif:normalizeNif(company.tax_id),software_name:'Contabilidad',software_id:'CT',version:VF_VERSION,installation_id:'',issuer_nif:''};
  const [[counts]]=await db.execute("SELECT COUNT(*) AS total,COALESCE(SUM(d.status IN ('pending','error')),0) AS pending,COALESCE(SUM(d.status='accepted'),0) AS accepted,COALESCE(SUM(d.status IN ('rejected','accepted_with_errors')),0) AS review FROM verifactu_records r JOIN verifactu_deliveries d ON d.record_id=r.id AND d.company_id=r.company_id WHERE r.company_id=?",[companyId]);
  if(settings.producer_source==='company'&&!counts.total){settings.producer_name=company.name;settings.producer_nif=normalizeNif(company.tax_id);}
  let certificate=false,certificateError='';try{certificate=!!credentials(companyId);}catch(error){certificateError=error.code;}
  const missing=[];if(!validNif(company.tax_id)||!company.name||company.name.length>120)missing.push('Completa el nombre fiscal y un NIF válido de la empresa.');if(settings.producer_source!=='company'&&(!validNif(settings.producer_nif)||!settings.producer_name))missing.push('Completa el nombre fiscal y el NIF del productor del programa.');
  return {company:{id:company.id,name:company.name,tax_id:company.tax_id},settings,counts,certificate:{configured:certificate,error:certificateError},missing,can_prepare:!missing.length,can_send:settings.enabled&&certificate&&!missing.length,production_available:false};
 }
 return {
  get:()=>withTransaction(pool,db=>state(db)),
  async configure(body){
   if(!body||typeof body.enabled!=='boolean'||body.environment!=='test'||Object.keys(body).some(key=>!['enabled','environment','producer_source',...fields].includes(key)))fail('VERIFACTU_SETTINGS');
   const producerSource=body.producer_source??'custom';if(!['company','custom'].includes(producerSource))fail('VERIFACTU_SETTINGS');
   const limits={producer_name:120,producer_nif:9,software_name:30,software_id:2,version:50,installation_id:100},values={};
   for(const field of fields){
    if(producerSource==='company'&&['producer_name','producer_nif'].includes(field))continue;
    if(typeof body[field]!=='string'||body[field].trim().length>limits[field]||/[\u0000-\u001f]/.test(body[field]))fail('VERIFACTU_SETTINGS');values[field]=body[field].trim();
   }
   values.producer_nif=normalizeNif(values.producer_nif);if(producerSource==='custom'&&values.producer_nif&&!validNif(values.producer_nif))fail('VERIFACTU_PRODUCER');
   for(const field of ['software_name','software_id','version'])if(!values[field])fail('VERIFACTU_SETTINGS');
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);const current=await state(db);values.installation_id||=current.settings.installation_id||randomUUID();
    if(producerSource==='company'){
     const frozen=current.counts.total&&current.settings.producer_source==='company';
     values.producer_name=frozen?current.settings.producer_name:current.company.name;values.producer_nif=frozen?current.settings.producer_nif:normalizeNif(current.company.tax_id);
     if(values.producer_name.length>120||values.producer_nif.length>9)fail('VERIFACTU_ISSUER');
    }
    if(current.counts.total&&(producerSource!==current.settings.producer_source||fields.some(field=>values[field]!==current.settings[field])||current.settings.enabled&&!body.enabled))fail('VERIFACTU_SETTINGS_LOCKED');
    const issuerNif=normalizeNif(current.company.tax_id);
    if(body.enabled&&(!validNif(issuerNif)||current.company.name.length>120))fail('VERIFACTU_ISSUER');
    if(body.enabled&&(!values.producer_name||!validNif(values.producer_nif)))fail('VERIFACTU_PRODUCER');
    if(current.counts.total&&issuerNif!==current.settings.issuer_nif)fail('VERIFACTU_ISSUER_CHANGED');
    await db.execute('INSERT INTO verifactu_settings(company_id,enabled,environment,producer_source,'+fields.join(',')+',issuer_nif) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),producer_source=VALUES(producer_source),'+fields.map(field=>field+'=VALUES('+field+')').join(',')+',issuer_nif=VALUES(issuer_nif)',[companyId,body.enabled,'test',producerSource,...fields.map(field=>values[field]),issuerNif]);
    return state(db);
   });
  },
  async list(){const [rows]=await pool.execute('SELECT r.id,r.invoice_id,r.exercise_id,r.sequence_no,r.kind,r.hash,r.generated_at,i.reference,i.invoice_date,d.status,d.attempts,d.csv,d.error_code,d.message,d.next_attempt_at FROM verifactu_records r JOIN trade_invoices i ON i.company_id=r.company_id AND i.id=r.invoice_id JOIN verifactu_deliveries d ON d.company_id=r.company_id AND d.record_id=r.id WHERE r.company_id=? ORDER BY r.sequence_no DESC LIMIT 200',[companyId]);return rows;},
  async xml(recordId){const [[row]]=await pool.execute('SELECT xml FROM verifactu_records WHERE company_id=? AND id=?',[companyId,id(recordId)]);if(!row)throw new HttpError(404,'VERIFACTU_NOT_FOUND');return row.xml;},
  async send(recordId,body){
   if(body?.confirm_test!==true)fail('VERIFACTU_CONFIRM_TEST');
   return withTransaction(pool,async db=>{
    await lockCompany(db,companyId);const [[row]]=await db.execute('SELECT r.*,d.status,d.attempts,d.next_attempt_at FROM verifactu_records r JOIN verifactu_deliveries d ON d.company_id=r.company_id AND d.record_id=r.id WHERE r.company_id=? AND r.id=?',[companyId,id(recordId)]);
    if(!row)throw new HttpError(404,'VERIFACTU_NOT_FOUND');if(['accepted','accepted_with_errors'].includes(row.status))return {status:row.status,replayed:true};if(row.status==='rejected')fail('VERIFACTU_NEEDS_CORRECTION');
    const [[earlier]]=await db.execute("SELECT r.id FROM verifactu_records r JOIN verifactu_deliveries d ON d.company_id=r.company_id AND d.record_id=r.id WHERE r.company_id=? AND r.sequence_no<? AND d.status NOT IN ('accepted','accepted_with_errors') LIMIT 1",[companyId,row.sequence_no]);if(earlier)fail('VERIFACTU_SEND_ORDER');
    const [[waiting]]=await db.execute('SELECT record_id FROM verifactu_deliveries WHERE company_id=? AND next_attempt_at>UTC_TIMESTAMP() LIMIT 1',[companyId]);if(waiting)fail('VERIFACTU_WAIT');
    const current=await state(db);if(!current.settings.enabled)fail('VERIFACTU_DISABLED');
    const credential=credentials(companyId);if(!credential)fail('VERIFACTU_CERTIFICATE_REQUIRED');
    const payload=json(row.payload);if(row.environment!=='test'||row.hash!==digest(hashInput(payload))||row.xml!==envelope(payload))fail('VERIFACTU_CHAIN');
    let responseXml=null,result;
    try{responseXml=await transport(row.xml,credential);result=parseResponse(responseXml,payload);}
    catch(error){result={status:'error',csv:'',error_code:['VERIFACTU_RESPONSE','VERIFACTU_SOAP_FAULT','VERIFACTU_HTTP','VERIFACTU_NETWORK'].includes(error.code)?error.code:'VERIFACTU_NETWORK',message:'No se ha confirmado la recepción del registro. El reintento conserva el mismo XML y la misma huella.',wait_seconds:60};}
    await db.execute('UPDATE verifactu_deliveries SET status=?,attempts=attempts+1,csv=?,error_code=?,message=?,response_xml=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE company_id=? AND record_id=?',[result.status,result.csv,result.error_code,result.message,responseXml,result.wait_seconds,companyId,row.id]);
    await db.execute('INSERT INTO verifactu_attempts(company_id,record_id,status,error_code,response_xml) VALUES (?,?,?,?,?)',[companyId,row.id,result.status,result.error_code,responseXml]);return {...result,replayed:false};
   });
  },
  archive:()=>withTransaction(pool,async db=>{await lockCompany(db,companyId);return {format:'contabilitat-verifactu-test',version:1,company_id:companyId,created_at:new Date().toISOString(),tables:await fiscalArchive(db,companyId)};}),
 };
}