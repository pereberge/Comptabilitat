import {HttpError} from '../middleware/errors.js';
import {id,date} from './validation.js';
import {farmLotsOverlap,nextFarmLotCode} from '../../../shared/farm-lots.js';
import {productionDecimal} from '../../../shared/farm-production.js';
import {scaled} from '../../../shared/farm-costs.js';
const fail=(code,status=400)=>{throw new HttpError(status,code);};
function animals(value){if(value===null||value===undefined||value==='')return null;if(!/^\d+$/.test(String(value))||!Number.isSafeInteger(Number(value))||Number(value)>10000000)fail('FARM_LOT_INVALID_ANIMALS');return Number(value);}
export function validateFarmLot(body){
 if(typeof body?.code!=='string'||!body.code.trim()||body.code.trim().length>40||/[\x00-\x1f]/.test(body.code))fail('FARM_LOT_INVALID_FIELD');
 const entry=date(body.entry_date),exit=body.exit_date?date(body.exit_date):null,notes=body.notes??'';
 if(exit&&exit<entry)fail('FARM_LOT_INVALID_DATES');
 if(typeof notes!=='string'||notes.length>2000)fail('FARM_LOT_INVALID_FIELD');
 const animalsOut=animals(body.animals_out);if(!exit&&animalsOut!==null)fail('FARM_LOT_EXIT_REQUIRED');
 const included=body.entry_cost_included??0;if(![true,false,0,1].includes(included))fail('FARM_LOT_INVALID_FIELD');
 let values;try{values={entry_kg_per_pig:productionDecimal(body.entry_kg_per_pig,3,{positive:true,maxWhole:4}),entry_price_per_pig:productionDecimal(body.entry_price_per_pig,2,{maxWhole:7}),feed_opening_kg:productionDecimal(body.feed_opening_kg,3),feed_closing_kg:productionDecimal(body.feed_closing_kg,3)};}catch{fail('FARM_PRODUCTION_NUMBER');}
 const incoming=animals(body.animals_in);if((values.entry_kg_per_pig!==null||values.entry_price_per_pig!==null)&&!incoming)fail('FARM_PRODUCTION_ENTRY_COUNT');
 if(values.entry_price_per_pig!==null&&incoming&&BigInt(incoming)*scaled(values.entry_price_per_pig,2)>999999999999999n)fail('FARM_SALE_TOTAL_TOO_LARGE');
 return {farm_id:id(body.farm_id),code:body.code.trim(),entry_date:entry,exit_date:exit,animals_in:incoming,animals_out:animalsOut,notes,...values,entry_cost_included:Number(included)};
}
export async function saveFarmLot(db,companyId,body,lotId){
 const selectedId=lotId?id(lotId):null;
 const [[prior]]=selectedId?await db.execute('SELECT * FROM farm_lots WHERE company_id=? AND id=?',[companyId,selectedId]):[[null]];
 const farmId=id(body?.farm_id??prior?.farm_id);
 const [[farm]]=await db.execute('SELECT id,code FROM pig_farms WHERE company_id=? AND id=?',[companyId,farmId]);if(!farm)fail('FARM_NOT_FOUND',404);
 const [existing]=await db.execute('SELECT * FROM farm_lots WHERE company_id=? AND farm_id=? ORDER BY entry_date',[companyId,farmId]);
 const automatic=!selectedId&&(body?.auto_code===true||!String(body?.code??'').trim());
 const lot=validateFarmLot({...prior,...body,farm_id:farmId,...(automatic?{code:nextFarmLotCode(farm.code,existing)}:{})});
 if(selectedId){const previous=existing.find(row=>row.id===selectedId);if(!previous||previous.version!==id(body.version))fail('FARM_CHANGED',409);}
 const others=existing.filter(row=>row.id!==selectedId);
 if(others.some(row=>row.code===lot.code))fail('FARM_LOT_DUPLICATE_CODE',409);
 if(!lot.exit_date&&others.some(row=>!row.exit_date))fail('FARM_LOT_ALREADY_OPEN',409);
 if(others.some(row=>farmLotsOverlap(row,lot)))fail('FARM_LOT_OVERLAP',409);
 const fields=['code','entry_date','exit_date','animals_in','animals_out','notes','entry_kg_per_pig','entry_price_per_pig','entry_cost_included','feed_opening_kg','feed_closing_kg'];
 if(selectedId){await db.execute('UPDATE farm_lots SET '+fields.map(field=>field+'=?').join(',')+',version=version+1 WHERE company_id=? AND id=? AND version=?',[...fields.map(field=>lot[field]),companyId,selectedId,id(body.version)]);return {id:selectedId};}
 const [created]=await db.execute('INSERT INTO farm_lots(company_id,farm_id,'+fields.join(',')+') VALUES ('+Array(fields.length+2).fill('?').join(',')+')',[companyId,lot.farm_id,...fields.map(field=>lot[field])]);return {id:created.insertId};
}
