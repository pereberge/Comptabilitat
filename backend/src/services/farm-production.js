import {createHash} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {id,date} from './validation.js';
import {transferAmounts,feedQuantity,feedDeliveryDate,productionDecimal} from '../../../shared/farm-production.js';
import {scaled} from '../../../shared/farm-costs.js';
import {resolveFarmLot} from '../../../shared/farm-lots.js';
const fail=(code,status=400)=>{throw new HttpError(status,code);};
const table=kind=>kind==='death'?'farm_deaths':kind==='care'?'farm_care_costs':kind==='transfer'?'farm_feed_transfers':fail('FARM_PRODUCTION_KIND');
export async function readProductionEvents(db,companyId){
 const [care]=await db.execute('SELECT c.*,t.farm_id,t.code AS lot_code,f.name AS farm_name FROM farm_care_costs c JOIN farm_lots t ON t.id=c.lot_id AND t.company_id=c.company_id JOIN pig_farms f ON f.id=t.farm_id AND f.company_id=t.company_id WHERE c.company_id=? AND c.voided=0 ORDER BY c.event_date,c.id',[companyId]);
 const [deaths]=await db.execute('SELECT d.*,t.farm_id,t.code AS lot_code,f.name AS farm_name FROM farm_deaths d JOIN farm_lots t ON t.id=d.lot_id AND t.company_id=d.company_id JOIN pig_farms f ON f.id=t.farm_id AND f.company_id=t.company_id WHERE d.company_id=? AND d.voided=0 ORDER BY d.event_date,d.id',[companyId]);
 const [transfers]=await db.execute('SELECT x.*,a.farm_id AS source_farm_id,a.code AS source_lot_code,b.farm_id AS destination_farm_id,b.code AS destination_lot_code,fa.name AS source_farm_name,fb.name AS destination_farm_name FROM farm_feed_transfers x JOIN farm_lots a ON a.id=x.source_lot_id AND a.company_id=x.company_id JOIN farm_lots b ON b.id=x.destination_lot_id AND b.company_id=x.company_id JOIN pig_farms fa ON fa.id=a.farm_id AND fa.company_id=a.company_id JOIN pig_farms fb ON fb.id=b.farm_id AND fb.company_id=b.company_id WHERE x.company_id=? AND x.voided=0 ORDER BY x.event_date,x.id',[companyId]);return {deaths,transfers,care};
}
export async function assertFeedBalance(db,companyId,lotIds){
 const [lots]=await db.execute('SELECT * FROM farm_lots WHERE company_id=?',[companyId]);
 const [lines]=await db.execute('SELECT l.*,i.invoice_date FROM farm_cost_lines l JOIN farm_invoices i ON i.id=l.invoice_id AND i.company_id=l.company_id WHERE l.company_id=? AND l.category=?',[companyId,'feed']);
 const {transfers}=await readProductionEvents(db,companyId);
 for(const lotId of new Set(lotIds)){
  const lot=lots.find(row=>row.id===lotId);if(!lot)continue;
  const moves=lines.filter(line=>resolveFarmLot(line,lots).lot?.id===lotId).map(line=>({date:feedDeliveryDate(line),amount:feedQuantity(line)??0n,priority:0}));
  moves.push({date:lot.entry_date,amount:scaled(lot.feed_opening_kg??'0',3),priority:0});
  for(const transfer of transfers){if(transfer.source_lot_id===lotId)moves.push({date:transfer.event_date,amount:-scaled(transfer.kg,3),priority:2});if(transfer.destination_lot_id===lotId)moves.push({date:transfer.event_date,amount:scaled(transfer.kg,3),priority:1});}
  let stock=0n;for(const move of moves.sort((a,b)=>a.date.localeCompare(b.date)||a.priority-b.priority)){stock+=move.amount;if(stock<0n)fail('FARM_TRANSFER_INSUFFICIENT_FEED',409);}
 }
}
export function validateProductionEvent(kind,body){
 const event={event_date:date(body?.event_date),notes:body?.notes??''};if(typeof event.notes!=='string'||event.notes.length>2000)fail('FARM_PRODUCTION_NOTES');
 if(kind==='death'){if(!/^\d+$/.test(String(body?.pigs))||Number(body.pigs)<1||Number(body.pigs)>10000000)fail('FARM_SALE_INVALID_PIGS');return {...event,lot_id:id(body.lot_id),pigs:Number(body.pigs)};}
 if(kind==='care'){let amount;try{amount=productionDecimal(body.amount,2,{positive:true,maxWhole:13});}catch{fail('FARM_CARE_INVALID_AMOUNT');}if(amount===null)fail('FARM_CARE_INVALID_AMOUNT');return {...event,lot_id:id(body.lot_id),amount};}
 if(kind!=='transfer')fail('FARM_PRODUCTION_KIND');
 let amounts;try{amounts=transferAmounts(body);}catch(error){fail(error.code||'FARM_PRODUCTION_NUMBER');}
 const source=id(body.source_lot_id),destination=id(body.destination_lot_id);if(source===destination)fail('FARM_TRANSFER_SAME_LOT');return {...event,source_lot_id:source,destination_lot_id:destination,...amounts};
}
export async function saveProductionEvent(db,companyId,kind,body,eventId){
 const name=table(kind),event=validateProductionEvent(kind,body),lotIds=kind==='transfer'?[event.source_lot_id,event.destination_lot_id]:[event.lot_id];
 for(const lotId of lotIds){const [[lot]]=await db.execute('SELECT id FROM farm_lots WHERE company_id=? AND id=?',[companyId,lotId]);if(!lot)fail('FARM_LOT_NOT_FOUND',404);}
 const [[period]]=await db.execute('SELECT id FROM accounting_exercises WHERE company_id=? AND start_date<=? AND end_date>=?',[companyId,event.event_date,event.event_date]);if(!period)fail('FARM_SALE_EXERCISE_REQUIRED');
 const fields=Object.keys(event),values=Object.values(event);
 if(eventId){
  const [[previous]]=await db.execute('SELECT * FROM '+name+' WHERE company_id=? AND id=? AND version=? AND voided=0',[companyId,id(eventId),id(body.version)]);if(!previous)fail('FARM_CHANGED',409);
  await db.execute('UPDATE '+name+' SET exercise_id=?,'+fields.map(field=>field+'=?').join(',')+',version=version+1 WHERE company_id=? AND id=?',[period.id,...values,companyId,id(eventId)]);
  if(kind==='transfer')await assertFeedBalance(db,companyId,[...lotIds,previous.source_lot_id,previous.destination_lot_id]);return {id:id(eventId)};
 }
 const requestId=body.request_id;if(typeof requestId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId))fail('INVALID_REQUEST');
 const hash=createHash('sha256').update(JSON.stringify(event)).digest('hex'),[[existing]]=await db.execute('SELECT id,request_hash,voided FROM '+name+' WHERE company_id=? AND request_id=?',[companyId,requestId]);
 if(existing){if(existing.request_hash!==hash||existing.voided)fail('REQUEST_CONFLICT',409);return {id:existing.id,replayed:true};}
 const [created]=await db.execute('INSERT INTO '+name+'(company_id,exercise_id,'+fields.join(',')+',request_id,request_hash) VALUES ('+Array(fields.length+4).fill('?').join(',')+')',[companyId,period.id,...values,requestId,hash]);
 if(kind==='transfer')await assertFeedBalance(db,companyId,lotIds);return {id:created.insertId,replayed:false};
}
export async function removeProductionEvent(db,companyId,kind,eventId,body){
 const name=table(kind),[[event]]=await db.execute('SELECT * FROM '+name+' WHERE company_id=? AND id=?',[companyId,id(eventId)]);if(!event)fail('FARM_PRODUCTION_NOT_FOUND',404);if(event.voided)return {removed:true};if(event.version!==id(body?.version))fail('FARM_CHANGED',409);
 await db.execute('UPDATE '+name+' SET voided=1,version=version+1 WHERE company_id=? AND id=?',[companyId,id(eventId)]);if(kind==='transfer')await assertFeedBalance(db,companyId,[event.source_lot_id,event.destination_lot_id]);return {removed:true};
}
