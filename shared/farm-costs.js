export const farmCostCategories=Object.freeze(['feed','transport','medicines','reproduction','supplies','care','other']);
export function scaled(value,places){
 if(typeof value!=='string'||!new RegExp('^-?\\d{1,15}(?:\\.\\d{1,'+places+'})?$').test(value))throw new Error('INVALID_FARM_AMOUNT');
 const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');
 const result=BigInt(whole)*10n**BigInt(places)+BigInt(fraction.padEnd(places,'0'));return negative?-result:result;
}
export function fixed(value,places){const sign=value<0n?'-':'',positive=value<0n?-value:value,scale=10n**BigInt(places);return sign+(positive/scale)+'.'+String(positive%scale).padStart(places,'0');}
export function rounded(value,divisor){return value<0n?-((-value+divisor/2n)/divisor):(value+divisor/2n)/divisor;}
// Distribute only the printed rounding difference; every invoice retains its exact cents.
export function allocateRounded(values,divisor,target){
 const output=values.map(value=>value/divisor),remaining=target-output.reduce((sum,value)=>sum+value,0n);
 if(remaining>BigInt(values.length)||remaining< -BigInt(values.length))throw new Error('FARM_ROUNDING_MISMATCH');
 const sign=remaining<0n?-1n:1n;
 const order=values.map((value,index)=>({index,remainder:value%divisor})).sort((a,b)=>a.remainder===b.remainder?a.index-b.index:(a.remainder>b.remainder?-1:1)*Number(sign));
 for(let index=0;index<Number(remaining<0n?-remaining:remaining);index++)output[order[index].index]+=sign;
 return output;
}
