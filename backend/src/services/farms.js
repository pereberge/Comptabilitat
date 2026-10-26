import {Worker} from 'node:worker_threads';
import {randomUUID,createHash} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {id,date} from './validation.js';
import {withTransaction} from '../db/transaction.js';
import {lockCompany} from './subaccounts.js';
import {companyHasCapability} from '../../../shared/company-formats.js';
import {farmCostCategories,scaled,fixed} from '../../../shared/farm-costs.js';
import {renderInvoicePdf} from './invoice-pdf-renderer.js';
import {farmReportHtml} from './farms-report.js';
import {saveFarmLot} from './farm-lots.js';
import {resolveFarmLot} from '../../../shared/farm-lots.js';
import {saveFarmSale,removeFarmSale} from './farm-sales.js';
import {readProductionEvents,saveProductionEvent,removeProductionEvent} from './farm-production.js';
import {lotProduction,productionDecimal} from '../../../shared/farm-production.js';
const previews=new Map(),lifetime=15*60*1000;let parsing=0;
const fail=(code,status=400)=>{throw new HttpError(status,code);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const normalize=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const sum=(rows,field)=>fixed(rows.reduce((total,row)=>total+scaled(row[field],2),0n),2);
function text(value,max){if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('FARM_INVALID_FIELD');return value.trim();}
function parsePdf(buffer){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./farm-pdf-worker.js',import.meta.url),{workerData:buffer,resourceLimits:{maxOldGenerationSizeMb:256},execArgv:[]});
  let done=false;const finish=(error,data)=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(data);};
  const timer=setTimeout(()=>finish(new HttpError(422,'FARM_PDF_TIMEOUT')),60000);
  worker.on('message',result=>{if(result?.type==='farm-result')result.error?finish(new HttpError(422,result.error)):finish(null,result.data);});
  worker.on('error',()=>finish(new HttpError(422,'FARM_PDF_INVALID')));worker.on('exit',()=>{if(!done)finish(new HttpError(422,'FARM_PDF_INVALID'));});
 });
}
export function createFarmService(pool,companyId,{extract=parsePdf}={}){
 async function company(db=pool){
  const [[row]]=await db.execute('SELECT c.id,c.name,c.business_format,d.tax_id FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);
  if(!row)fail('COMPANY_NOT_FOUND',404);
  if(!companyHasCapability(row,'pig_production'))fail('FARM_FORMAT_REQUIRED',403);
  return row;
 }
 async function exercise(value,db=pool){const [[row]]=await db.execute('SELECT * FROM accounting_exercises WHERE company_id=? AND id=?',[companyId,id(value)]);if(!row)fail('EXERCISE_NOT_FOUND',404);return row;}
 async function review(parsed,exerciseId,db=pool){
  const c=await company(db),period=await exercise(exerciseId,db);
  if(!normalize(c.tax_id)||normalize(c.tax_id)!==normalize(parsed.customer_tax_id))fail('FARM_COMPANY_MISMATCH');
  if(parsed.invoices.some(invoice=>invoice.invoice_date<period.start_date||invoice.invoice_date>period.end_date))fail('FARM_DATE_OUTSIDE_EXERCISE');
  const [existing]=await db.execute('SELECT supplier_tax_id,reference,content_hash FROM farm_invoices WHERE company_id=?',[companyId]);
  const known=new Map(existing.map(row=>[row.supplier_tax_id+':'+row.reference,row]));
  const fresh=[],duplicates=[],conflicts=[];
  for(const invoice of parsed.invoices){const previous=known.get(invoice.supplier_tax_id+':'+invoice.reference);if(!previous)fresh.push(invoice);else if(previous.content_hash===invoice.content_hash)duplicates.push(invoice.reference);else conflicts.push(invoice.reference);}
  const [farms]=await db.execute('SELECT * FROM pig_farms WHERE company_id=? ORDER BY name,code',[companyId]);
  const lines=fresh.flatMap(invoice=>invoice.lines),farmTotals=parsed.farms.map(farm=>{const selected=lines.filter(line=>line.farm_code===farm.code);return {...farm,existing:farms.some(row=>row.code===farm.code),lines:selected.length,base:sum(selected,'base_amount'),vat:sum(selected,'vat_amount'),total:sum(selected,'total_amount')};});
  return {period,fresh,summary:{company_name:c.name,exercise_name:period.name,pages:parsed.pages,totals:{...parsed.totals,invoices:fresh.length,lines:lines.length,base:sum(fresh,'base_total'),vat:sum(fresh,'vat_total'),total:sum(fresh,'total_amount'),unassigned_base:sum(lines.filter(line=>!line.farm_code),'base_amount'),unassigned_lines:lines.filter(line=>!line.farm_code&&scaled(line.base_amount,2)!==0n).length},farms:farmTotals,duplicates,conflicts,ready:conflicts.length===0&&fresh.length>0}};
 }
 async function data(query={},db=pool){
  const c=await company(db),period=query.exercise_id&&query.exercise_id!=='all'?await exercise(query.exercise_id,db):null;
  const where=['i.company_id=?'],params=[companyId];
  if(period){where.push('i.exercise_id=?');params.push(period.id);}
  if(query.from){where.push('i.invoice_date>=?');params.push(date(query.from));}if(query.to){where.push('i.invoice_date<=?');params.push(date(query.to));}
  if(query.from&&query.to&&query.from>query.to)fail('INVALID_DATE');
  if(query.farm_id==='pending')where.push('l.farm_id IS NULL');else if(query.farm_id){where.push('l.farm_id=?');params.push(id(query.farm_id));}
  if(query.category&&!farmCostCategories.includes(query.category))fail('FARM_INVALID_FIELD');
  const [farms]=await db.execute('SELECT * FROM pig_farms WHERE company_id=? ORDER BY name,code',[companyId]);
  const [lots]=await db.execute('SELECT * FROM farm_lots WHERE company_id=? ORDER BY entry_date DESC,id DESC',[companyId]);
  const requestedLot=query.lot_id&&query.lot_id!=='pending'?lots.find(row=>row.id===id(query.lot_id)):null;
  if(query.lot_id&&query.lot_id!=='pending'&&(!requestedLot||query.farm_id&&Number(query.farm_id)!==requestedLot.farm_id))fail('FARM_LOT_NOT_FOUND',404);
  const allEvents=await readProductionEvents(db,companyId),inDates=row=>(!period||row.exercise_id===period.id)&&(!query.from||row.event_date>=query.from)&&(!query.to||row.event_date<=query.to);
  const matchesLot=lotId=>{const row=lots.find(lot=>lot.id===lotId);return !!row&&query.farm_id!=='pending'&&query.lot_id!=='pending'&&(!query.farm_id||row.farm_id===Number(query.farm_id))&&(!requestedLot||row.id===requestedLot.id);};
  const care=allEvents.care.filter(row=>inDates(row)&&matchesLot(row.lot_id));
  const [sourceLines]=await db.execute(`SELECT l.*,f.code AS farm_code,f.name AS farm_name,i.reference,i.invoice_date,i.supplier_name,i.supplier_tax_id,i.exercise_id,i.document_id FROM farm_cost_lines l JOIN farm_invoices i ON i.id=l.invoice_id AND i.company_id=l.company_id LEFT JOIN pig_farms f ON f.id=l.farm_id AND f.company_id=l.company_id WHERE ${where.join(' AND ')} ORDER BY i.invoice_date,i.reference,l.position`,params);
  const resolved=[...sourceLines.map(line=>{const match=resolveFarmLot(line,lots);return {...line,source_kind:'invoice',effective_lot_id:match.lot?.id??null,lot_code:match.lot?.code??null,lot_reason:match.reason};}),...care.map(row=>({...row,source_kind:'care',category:'care',effective_lot_id:row.lot_id,invoice_id:null,invoice_date:row.event_date,reference:'Cuido',description:row.notes||'Cuido',lot_assignment:'manual',lot_reason:'manual',quantity:null,product_code:'',base_amount:row.amount,vat_amount:'0.00',total_amount:row.amount,source_page:null,document_id:null,informational:0}))].sort((a,b)=>a.invoice_date.localeCompare(b.invoice_date)||a.id-b.id);
  const scopedLines=query.lot_id?resolved.filter(line=>query.lot_id==='pending'?line.effective_lot_id===null:line.effective_lot_id===requestedLot.id):resolved;
  const lines=query.category?scopedLines.filter(line=>line.category===query.category):scopedLines;
  const saleWhere=['s.company_id=?','s.voided=0'],saleParams=[companyId];
  if(period){saleWhere.push('s.exercise_id=?');saleParams.push(period.id);}
  if(query.from){saleWhere.push('s.sale_date>=?');saleParams.push(query.from);}if(query.to){saleWhere.push('s.sale_date<=?');saleParams.push(query.to);}
  if(query.farm_id==='pending'||query.lot_id==='pending')saleWhere.push('1=0');
  else{if(query.farm_id){saleWhere.push('t.farm_id=?');saleParams.push(id(query.farm_id));}if(requestedLot){saleWhere.push('s.lot_id=?');saleParams.push(requestedLot.id);}}
  const [sales]=await db.execute('SELECT s.*,t.code AS lot_code,t.farm_id,f.name AS farm_name FROM farm_sales s JOIN farm_lots t ON t.id=s.lot_id AND t.company_id=s.company_id JOIN pig_farms f ON f.id=t.farm_id AND f.company_id=t.company_id WHERE '+saleWhere.join(' AND ')+' ORDER BY s.sale_date,s.id',saleParams);
  const deaths=allEvents.deaths.filter(row=>inDates(row)&&matchesLot(row.lot_id)),transfers=allEvents.transfers.filter(row=>inDates(row)&&(matchesLot(row.source_lot_id)||matchesLot(row.destination_lot_id)));
  const transferCents=transfers.reduce((sum,row)=>sum+(matchesLot(row.destination_lot_id)?scaled(row.total_amount,2):0n)-(matchesLot(row.source_lot_id)?scaled(row.total_amount,2):0n),0n);
  const entryLots=lots.filter(row=>matchesLot(row.id)&&(!period||row.entry_date>=period.start_date&&row.entry_date<=period.end_date)&&(!query.from||row.entry_date>=query.from)&&(!query.to||row.entry_date<=query.to));
  const entryCents=entryLots.reduce((sum,row)=>sum+(!row.entry_cost_included&&row.animals_in!==null&&row.entry_price_per_pig!==null?BigInt(row.animals_in)*scaled(row.entry_price_per_pig,2):0n),0n);
  const revenueCents=sales.reduce((total,sale)=>total+scaled(sale.total_amount,2),0n),costCents=scopedLines.reduce((total,line)=>total+scaled(line.base_amount,2),0n)+transferCents+entryCents;
  const salesTotals={count:sales.length,pigs:sales.reduce((total,sale)=>total+sale.pigs,0),total_kg:fixed(sales.reduce((total,sale)=>total+scaled(sale.total_kg,3),0n),3),revenue:fixed(revenueCents,2),cost:fixed(costCents,2),result:fixed(revenueCents-costCents,2)};
  const production=requestedLot&&!period&&!query.from&&!query.to&&!query.category?lotProduction(requestedLot,scopedLines,sales,deaths,transfers):null;
  const [documents]=await db.execute('SELECT id,source_name,source_size,page_count,created_at FROM farm_documents WHERE company_id=? ORDER BY id DESC',[companyId]);
  const group=selected=>({lines:selected.length,base:sum(selected,'base_amount'),vat:sum(selected,'vat_amount'),total:sum(selected,'total_amount')});
  const groups=farms.map(farm=>({...farm,...group(lines.filter(line=>line.farm_id===farm.id))}));
  const pending={id:null,code:'',name:'Pendiente de asignar',...group(lines.filter(line=>line.farm_id===null))};
  return {company:c,exercise:period,farms,groups,pending,sales,sales_totals:salesTotals,deaths,transfers,care,production,scope_totals:group(scopedLines),entry_cost_added:fixed(entryCents,2),transfer_adjustment:fixed(transferCents,2),lots:lots.map(lot=>({...lot,status:lot.exit_date?'closed':'open',...group(lines.filter(line=>line.effective_lot_id===lot.id))})),selected_lot:requestedLot,unassigned_lot:group(lines.filter(line=>line.farm_id&&line.effective_lot_id===null)),totals:{...group(lines),invoices:new Set(lines.filter(line=>line.invoice_id!=null).map(line=>line.invoice_id)).size},categories:farmCostCategories.map(category=>({category,...group(lines.filter(line=>line.category===category))})),months:[...new Set(lines.map(line=>line.invoice_date.slice(0,7)))].sort().map(month=>({month,...group(lines.filter(line=>line.invoice_date.startsWith(month)))})),lines,documents};
 }
 async function reportData(query){const farmId=id(query?.farm_id),lotId=id(query?.lot_id);return withTransaction(pool,async db=>{await lockCompany(db,companyId);return data({farm_id:farmId,lot_id:lotId,exercise_id:'all'},db);});}
 return {
  list:data,
  reportData,
  async saveProductionEvent(kind,body,eventId){return withTransaction(pool,async db=>{await lockCompany(db,companyId);await company(db);return saveProductionEvent(db,companyId,kind,body,eventId);});},
  async removeProductionEvent(kind,eventId,body){return withTransaction(pool,async db=>{await lockCompany(db,companyId);await company(db);return removeProductionEvent(db,companyId,kind,eventId,body);});},
  async saveSale(body,saleId){return withTransaction(pool,async db=>{await lockCompany(db,companyId);await company(db);return saveFarmSale(db,companyId,body,saleId);});},
  async removeSale(saleId,body){return withTransaction(pool,async db=>{await lockCompany(db,companyId);await company(db);return removeFarmSale(db,companyId,saleId,body);});},
  async saveLot(body,lotId){return withTransaction(pool,async db=>{await lockCompany(db,companyId);await company(db);return saveFarmLot(db,companyId,body,lotId);});},
  async saveFarm(body,farmId){
   const code=text(body?.code,20),name=text(body?.name,160),notes=body?.notes??'';
   if(typeof notes!=='string'||notes.length>2000)fail('FARM_INVALID_FIELD');
   if(!/^[A-Za-z0-9_.-]+$/.test(code))fail('FARM_INVALID_FIELD');
   return withTransaction(pool,async db=>{await lockCompany(db,companyId);await company(db);
    const [[duplicate]]=await db.execute('SELECT id FROM pig_farms WHERE company_id=? AND code=?',[companyId,code]);
    if(duplicate&&duplicate.id!==Number(farmId))fail('FARM_DUPLICATE_CODE',409);
    if(farmId){const [result]=await db.execute('UPDATE pig_farms SET code=?,name=?,notes=?,version=version+1 WHERE company_id=? AND id=? AND version=?',[code,name,notes,companyId,id(farmId),id(body.version)]);if(!result.affectedRows)fail('FARM_CHANGED',409);return {id:id(farmId)};}
    const [result]=await db.execute('INSERT INTO pig_farms(company_id,code,name,notes) VALUES (?,?,?,?)',[companyId,code,name,notes]);return {id:result.insertId};
   });
  },
  async updateCost(lineId,body){
   const farmId=body?.farm_id===null?null:id(body?.farm_id),category=body?.category;
   if(!farmCostCategories.includes(category))fail('FARM_INVALID_FIELD');
   return withTransaction(pool,async db=>{await lockCompany(db,companyId);await company(db);
    const [[previous]]=await db.execute('SELECT farm_id,lot_id,lot_assignment,feed_kg FROM farm_cost_lines WHERE company_id=? AND id=? AND version=? FOR UPDATE',[companyId,id(lineId),id(body.version)]);
    if(!previous)fail('FARM_CHANGED',409);
    if(farmId){const [[farm]]=await db.execute('SELECT id FROM pig_farms WHERE company_id=? AND id=?',[companyId,farmId]);if(!farm)fail('FARM_NOT_FOUND',404);}
    const mode=body.lot_assignment??(farmId===previous.farm_id?previous.lot_assignment:'auto');
    if(!['auto','manual','unassigned'].includes(mode))fail('FARM_LOT_INVALID_FIELD');
    const lotId=mode==='manual'?id(body.lot_id??previous.lot_id):null;
    if(lotId){const [[lot]]=await db.execute('SELECT id FROM farm_lots WHERE company_id=? AND farm_id=? AND id=?',[companyId,farmId,lotId]);if(!lot)fail('FARM_LOT_NOT_FOUND',404);}
    let feedKg;try{feedKg=body.feed_kg===undefined?previous.feed_kg:productionDecimal(body.feed_kg,3);}catch{fail('FARM_PRODUCTION_NUMBER');}
    const [result]=await db.execute('UPDATE farm_cost_lines SET farm_id=?,category=?,lot_id=?,lot_assignment=?,feed_kg=?,version=version+1 WHERE company_id=? AND id=? AND version=?',[farmId,category,lotId,mode,feedKg,companyId,id(lineId),id(body.version)]);
    if(!result.affectedRows)fail('FARM_CHANGED',409);return {updated:true};
   });
  },
  async preview(buffer,exerciseId,filename='facturas.pdf'){
   await company();await exercise(exerciseId);
   if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>15*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-')fail('FARM_PDF_INVALID');
   for(const [token,item]of previews)if(item.expires<Date.now())previews.delete(token);
   if(previews.size>=3)fail('FARM_PREVIEW_BUSY',429);
   if(parsing>=2)fail('FARM_PREVIEW_BUSY',429);
   let parsed;parsing++;try{parsed=await extract(buffer);}finally{parsing--;}
   if(previews.size>=3)fail('FARM_PREVIEW_BUSY',429);
   const {summary}=await review(parsed,exerciseId),token=randomUUID();
   previews.set(token,{companyId,exerciseId:id(exerciseId),parsed,buffer,filename:String(filename).replace(/[\x00-\x1f]/g,'').slice(0,255)||'facturas.pdf',sha:digest(buffer),expires:Date.now()+lifetime});
   return {token,...summary};
  },
  async discard(token){if(previews.get(token)?.companyId===companyId)previews.delete(token);return {discarded:true};},
  async commit(token){
   const cached=previews.get(token);if(!cached||cached.companyId!==companyId||cached.expires<Date.now())fail('FARM_PREVIEW_EXPIRED',409);
   return withTransaction(pool,async db=>{await lockCompany(db,companyId);const {fresh,summary}=await review(cached.parsed,cached.exerciseId,db);
    if(summary.conflicts.length)fail('FARM_INVOICE_CONFLICT',409);
    if(!fresh.length)return {imported:0,duplicates:summary.duplicates.length,totals:summary.totals};
    const [[existingDocument]]=await db.execute('SELECT id FROM farm_documents WHERE company_id=? AND source_sha256=?',[companyId,cached.sha]);
    let documentId=existingDocument?.id;
    if(!documentId){const [created]=await db.execute('INSERT INTO farm_documents(company_id,source_name,source_sha256,source_size,source_pdf,page_count,parser_summary) VALUES (?,?,?,?,?,?,?)',[companyId,cached.filename,cached.sha,cached.buffer.length,cached.buffer,cached.parsed.pages,JSON.stringify({parser:cached.parsed.parser,customer_tax_id:cached.parsed.customer_tax_id,totals:cached.parsed.totals})]);documentId=created.insertId;}
    const [existingFarms]=await db.execute('SELECT id,code FROM pig_farms WHERE company_id=?',[companyId]),farms=new Map(existingFarms.map(farm=>[farm.code,farm.id]));
    for(const farm of cached.parsed.farms)if(!farms.has(farm.code)){const [created]=await db.execute('INSERT INTO pig_farms(company_id,code,name) VALUES (?,?,?)',[companyId,farm.code,farm.name]);farms.set(farm.code,created.insertId);}
    for(const invoice of fresh){
     const [created]=await db.execute('INSERT INTO farm_invoices(company_id,exercise_id,document_id,reference,invoice_date,supplier_tax_id,supplier_name,base_total,vat_total,total_amount,content_hash,source_pages) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[companyId,cached.exerciseId,documentId,invoice.reference,invoice.invoice_date,invoice.supplier_tax_id,invoice.supplier_name,invoice.base_total,invoice.vat_total,invoice.total_amount,invoice.content_hash,JSON.stringify(invoice.pages)]);
     const fields=['position','product_code','description','notes','category','quantity','unit_price','source_amount','base_amount','vat_amount','total_amount','vat_rate','delivery_reference','delivery_date','source_page'];
     for(let offset=0;offset<invoice.lines.length;offset+=100){const batch=invoice.lines.slice(offset,offset+100),values=batch.flatMap(line=>[companyId,created.insertId,line.farm_code?farms.get(line.farm_code):null,...fields.map(field=>line[field]),line.farm_code,Number(line.informational)]);
      await db.execute('INSERT INTO farm_cost_lines(company_id,invoice_id,farm_id,'+fields.join(',')+',source_farm_code,informational) VALUES '+batch.map(()=> '('+Array(fields.length+5).fill('?').join(',')+')').join(','),values);
     }
    }
    return {imported:fresh.length,duplicates:summary.duplicates.length,document_id:documentId,totals:summary.totals};
   });
  },
  async source(documentId){await company();const [[row]]=await pool.execute('SELECT source_name,source_pdf FROM farm_documents WHERE company_id=? AND id=?',[companyId,id(documentId)]);if(!row)fail('FARM_DOCUMENT_NOT_FOUND',404);return row;},
  async reportPreview(query){return farmReportHtml(await reportData(query));},
  async report(query){return renderInvoicePdf(farmReportHtml(await reportData(query)));},
 };
}
