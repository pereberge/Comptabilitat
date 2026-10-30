export const partyTaxId=value=>String(value||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const partyName=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function partyIdentityMatches(party,known){
 const actual=partyTaxId(party?.tax_id),expected=partyTaxId(known?.tax_id);
 if(actual&&expected)return actual===expected;
 return !!(party?.name&&known?.name&&partyName(party.name)===partyName(known.name));
}
export function partyAccountsByTaxId(parties,direction,taxId){
 const normalized=partyTaxId(taxId);if(!normalized)return [];
 return [...new Set(parties.filter(row=>row.direction===direction&&partyTaxId(row.tax_id)===normalized).map(row=>Number(row.account_id)))];
}
const legalWords=new Set(['SL','SLU','SA','SAU','S','L','U','SCOOP','SCCL','SCL','SCP','SOCIEDAD','SOCIEDADLIMITADA','LIMITADA','ANONIMA','UNIPERSONAL','DE','DEL','LA','EL','LOS','LAS','I','Y']);
function nameWords(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().split(/[^A-Z0-9]+/).filter(word=>word&&!legalWords.has(word));}
function nearWord(a,b){
 if(a===b)return true;if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)return false;
 if(a.length===b.length){const differences=[];for(let n=0;n<a.length;n++)if(a[n]!==b[n])differences.push(n);return differences.length===1||differences.length===2&&differences[1]===differences[0]+1&&a[differences[0]]===b[differences[1]]&&a[differences[1]]===b[differences[0]];}
 const shorter=a.length<b.length?a:b,longer=a.length<b.length?b:a;let i=0,j=0;while(i<shorter.length&&j<longer.length){if(shorter[i]===longer[j]){i++;j++;}else{j++;if(j-i>1)return false;}}return true;
}
export function partyNameSimilarity(left,right){
 const a=nameWords(left),b=nameWords(right);if(!a.length||!b.length)return 0;
 if(a.slice().sort().join(' ')===b.slice().sort().join(' '))return 1;
 const shorter=a.length<=b.length?a:b,longer=a.length<=b.length?b:a,used=new Set();let exact=0;
 for(const word of shorter){let index=longer.findIndex((candidate,n)=>!used.has(n)&&candidate===word);if(index>=0)exact++;else index=longer.findIndex((candidate,n)=>!used.has(n)&&nearWord(word,candidate));if(index<0)return 0;used.add(index);}
 if(shorter.length/longer.length<0.75)return 0;
 if(shorter.length===1&&Math.min(shorter[0].length,longer[0].length)<6)return 0;
 return (exact===shorter.length?0.96:0.90)*(shorter.length/longer.length);
}
export function partyAccountsByName(accounts,parties,direction,name,taxId=''){
 const normalized=partyTaxId(taxId),prefix=direction==='received'?/^(400|410)/:/^(430|440)/;
 return accounts.filter(account=>account.kind==='subaccount'&&prefix.test(account.code)).filter(account=>{
  const known=parties.filter(row=>Number(row.account_id)===Number(account.id)&&row.direction===direction&&partyTaxId(row.tax_id));
  return !normalized||!known.length||known.some(row=>partyTaxId(row.tax_id)===normalized);
 }).map(account=>({id:Number(account.id),score:Math.max(partyNameSimilarity(name,account.description),...parties.filter(row=>Number(row.account_id)===Number(account.id)&&row.direction===direction).map(row=>partyNameSimilarity(name,row.name)))})).filter(row=>row.score>=0.85).sort((a,b)=>b.score-a.score);
}
