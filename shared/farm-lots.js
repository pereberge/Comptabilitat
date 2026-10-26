// Dates include both the entry and exit day. A same-day turnover is ambiguous
// and remains unassigned until the user explicitly chooses its lot.
export function resolveFarmLot(line,lots){
 const mode=line.lot_assignment||'auto';
 if(!line.farm_id)return {lot:null,reason:'no_farm'};
 if(mode==='unassigned')return {lot:null,reason:'unassigned'};
 if(mode==='manual')return {lot:lots.find(lot=>lot.id===line.lot_id&&lot.farm_id===line.farm_id)||null,reason:'manual'};
 const matching=lots.filter(lot=>lot.farm_id===line.farm_id&&lot.entry_date<=line.invoice_date&&(!lot.exit_date||lot.exit_date>=line.invoice_date));
 return {lot:matching.length===1?matching[0]:null,reason:matching.length>1?'ambiguous_date':'auto'};
}
export function farmLotsOverlap(a,b){
 return a.farm_id===b.farm_id&&a.entry_date<(b.exit_date||'9999-12-31')&&b.entry_date<(a.exit_date||'9999-12-31');
}
export function nextFarmLotCode(farmCode,lots){
 const prefix=String(farmCode)+'-';let latest=0n;
 for(const lot of lots){const code=String(lot.code),suffix=code.startsWith(prefix)?code.slice(prefix.length):code;if(/^\d+$/.test(suffix)){const number=BigInt(suffix);if(number>latest)latest=number;}}
 const code=prefix+String(latest+1n);if(code.length>40)throw new Error('FARM_LOT_INVALID_FIELD');return code;
}
