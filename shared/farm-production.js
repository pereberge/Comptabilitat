import {scaled,fixed,rounded} from './farm-costs.js';
export function productionDecimal(value,places,{positive=false,maxWhole=12}={}){
 if(value===null||value===undefined||value==='')return null;
 const text=String(value).trim().replace(',','.');
 if(!new RegExp('^\\d{1,'+maxWhole+'}(?:\\.\\d{1,'+places+'})?$').test(text))throw Object.assign(new Error('FARM_PRODUCTION_NUMBER'),{code:'FARM_PRODUCTION_NUMBER'});
 const number=scaled(text,places);if(positive&&number===0n)throw Object.assign(new Error('FARM_PRODUCTION_NUMBER'),{code:'FARM_PRODUCTION_NUMBER'});return fixed(number,places);
}
export function feedQuantity(line){
 if(line.category!=='feed'||line.informational)return 0n;
 if(line.feed_kg!==null&&line.feed_kg!==undefined)return scaled(line.feed_kg,3);
 // The supplier's 65 product family identifies bulk feed supplied in kg.
 if(String(line.product_code).startsWith('65')&&line.quantity!==null)return scaled(String(line.quantity),3);
 return null;
}
export function feedDeliveryDate(line){
 const match=String(line.delivery_date||'').match(/^(\d{2})\/(\d{2})$/);if(!match)return line.invoice_date;
 const year=Number(line.invoice_date.slice(0,4)),suffix='-'+match[2]+'-'+match[1];let value=year+suffix;if(value>line.invoice_date)value=(year-1)+suffix;
 const parsed=new Date(value+'T00:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value?value:line.invoice_date;
}
export function transferAmounts(body){
 const kg=productionDecimal(body.kg,3,{positive:true}),price=productionDecimal(body.price_per_kg,5,{maxWhole:6});
 if(kg===null||price===null)throw Object.assign(new Error('FARM_PRODUCTION_NUMBER'),{code:'FARM_PRODUCTION_NUMBER'});
 const amount=rounded(scaled(kg,3)*scaled(price,5),1000000n);if(amount>999999999999999n)throw Object.assign(new Error('FARM_SALE_TOTAL_TOO_LARGE'),{code:'FARM_SALE_TOTAL_TOO_LARGE'});
 return {kg,price_per_kg:price,total_amount:fixed(amount,2)};
}
export function lotProduction(lot,lines,sales,deaths,transfers){
 const feed=lines.filter(line=>line.category==='feed'),missing=feed.filter(line=>feedQuantity(line)===null),purchased=feed.reduce((sum,line)=>sum+(feedQuantity(line)??0n),0n);
 const incoming=transfers.filter(row=>row.destination_lot_id===lot.id),outgoing=transfers.filter(row=>row.source_lot_id===lot.id);
 const mass=rows=>rows.reduce((sum,row)=>sum+scaled(row.kg,3),0n),value=rows=>rows.reduce((sum,row)=>sum+scaled(row.total_amount,2),0n);
 const entryWeight=lot.animals_in!==null&&lot.entry_kg_per_pig!=null?BigInt(lot.animals_in)*scaled(lot.entry_kg_per_pig,3):null;
 const entryCost=lot.animals_in!==null&&lot.entry_price_per_pig!=null?BigInt(lot.animals_in)*scaled(lot.entry_price_per_pig,2):null;
 const sold=sales.reduce((sum,sale)=>sum+sale.pigs,0),lost=deaths.reduce((sum,row)=>sum+row.pigs,0),soldKg=sales.reduce((sum,sale)=>sum+scaled(sale.total_kg,3),0n);
 const remaining=lot.animals_in===null?null:lot.animals_in-sold-lost;
 const net=purchased+mass(incoming)-mass(outgoing),consumed=net+scaled(lot.feed_opening_kg??'0',3)-scaled(lot.feed_closing_kg??'0',3);
 const gain=entryWeight===null?null:soldKg-entryWeight,adjustment=value(incoming)-value(outgoing),expense=lines.reduce((sum,line)=>sum+scaled(line.base_amount,2),0n),additionalEntry=lot.entry_cost_included?0n:entryCost??0n;
 const costs=expense+adjustment+additionalEntry,revenue=value(sales),reasons=[];
 if(!lot.exit_date)reasons.push('open_lot');if(entryWeight===null)reasons.push('missing_entry_weight');if(lot.feed_closing_kg==null)reasons.push('missing_feed_stock');if(remaining!==0)reasons.push('animal_balance');if(missing.length)reasons.push('missing_feed_quantity');if(consumed<0n)reasons.push('negative_feed');if(consumed===0n)reasons.push('missing_feed');if(gain!==null&&gain<=0n)reasons.push('nonpositive_gain');
 const feedCost=feed.reduce((sum,line)=>sum+scaled(line.base_amount,2),0n)+adjustment;
 if(lot.feed_opening_kg==null)reasons.push('missing_feed_opening_stock');
 if(lot.animals_out!=null&&lot.animals_out!==sold)reasons.push('declared_exits');
 return {entry_pigs:lot.animals_in,entry_kg_per_pig:lot.entry_kg_per_pig??null,entry_total_kg:entryWeight===null?null:fixed(entryWeight,3),entry_price_per_pig:lot.entry_price_per_pig??null,entry_cost:entryCost===null?null:fixed(entryCost,2),entry_cost_added:fixed(additionalEntry,2),entry_cost_missing:entryCost===null&&!lot.entry_cost_included,sold_pigs:sold,sold_kg:fixed(soldKg,3),dead_pigs:lost,mortality_percent:lot.animals_in?fixed(rounded(BigInt(lost)*10000n,BigInt(lot.animals_in)),2):null,remaining_pigs:remaining,feed_purchased_kg:fixed(purchased,3),feed_in_kg:fixed(mass(incoming),3),feed_out_kg:fixed(mass(outgoing),3),feed_net_kg:fixed(net,3),feed_consumed_kg:fixed(consumed,3),feed_missing_lines:missing.length,gain_kg:gain===null?null:fixed(gain,3),conversion:gain!==null&&gain>0n&&consumed>0n&&!missing.length?fixed(rounded(consumed*1000n,gain),3):null,conversion_final:reasons.length===0,conversion_reasons:reasons,invoice_cost:fixed(expense,2),transfer_adjustment:fixed(adjustment,2),average_feed_price:net>0n&&feedCost>=0n?fixed(rounded(feedCost*1000000n,net),5):null,cost:fixed(costs,2),revenue:fixed(revenue,2),result:fixed(revenue-costs,2)};
}
