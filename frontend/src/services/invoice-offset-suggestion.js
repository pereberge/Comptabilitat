export function invoiceOffsetSuggestion(accounts,parties,direction,partyId){
 if(!partyId||!['issued','received'].includes(direction))return null;
 const previous=parties.find(row=>String(row.account_id)===String(partyId)&&row.direction===direction);
 if(!previous?.last_offset_account_id)return null;
 const account=accounts.find(row=>String(row.id)===String(previous.last_offset_account_id)&&row.kind==='subaccount'&&(direction==='issued'?['7']:['6','2']).some(prefix=>row.code.startsWith(prefix)));
 return account?{account,reference:previous.last_invoice_reference||''}:null;
}
