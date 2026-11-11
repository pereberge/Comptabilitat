// Explicit equivalence supplied by the user; never use partial-name matching.
export function journalCompanyIdentity(value){
 const identity=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 return identity==='ARBSA'?'PIENSOSARBSA':identity;
}
