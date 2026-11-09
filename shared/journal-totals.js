import {signedCents} from './money.js';

export function journalTotals(lines){
 let debit=0n,credit=0n,hasMovement=false,linesValid=true;
 try{
  for(const line of lines){
   const d=signedCents(line.debit||'0'),c=signedCents(line.credit||'0');
   debit+=d;credit+=c;hasMovement||=d!==0n||c!==0n;
   if(!((d!==0n&&c===0n)||(c!==0n&&d===0n)))linesValid=false;
  }
  const limit=999999999999999n,withinLimit=debit<=limit&&debit>=-limit&&credit<=limit&&credit>=-limit;
  return {debit,credit,difference:debit-credit,hasMovement,valid:true,balanced:linesValid&&hasMovement&&debit===credit&&withinLimit};
 }catch{return {debit:0n,credit:0n,difference:0n,hasMovement:false,valid:false,balanced:false};}
}
