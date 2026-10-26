import {scaled,fixed,rounded} from './farm-costs.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
function input(value,whole,places){
 const text=String(value??'').trim().replace(',','.');
 if(!new RegExp('^\\d{1,'+whole+'}(?:\\.\\d{1,'+places+'})?$').test(text))fail('FARM_SALE_INVALID_NUMBER');
 const number=scaled(text,places);if(number<=0n)fail('FARM_SALE_INVALID_NUMBER');return number;
}
export function calculateFarmSale(body){
 if(!/^\d{1,8}$/.test(String(body?.pigs??''))||Number(body.pigs)<1||Number(body.pigs)>10000000)fail('FARM_SALE_INVALID_PIGS');
 const pigs=Number(body.pigs),weight=input(body.kg_per_pig,4,3),price=input(body.price_per_kg,6,5);
 const totalKg=BigInt(pigs)*weight,amount=rounded(totalKg*price,1000000n);
 if(amount>999999999999999n)fail('FARM_SALE_TOTAL_TOO_LARGE');
 return {pigs,kg_per_pig:fixed(weight,3),price_per_kg:fixed(price,5),total_kg:fixed(totalKg,3),total_amount:fixed(amount,2)};
}
