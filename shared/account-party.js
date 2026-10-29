export const partyProfileFields = {
 name:200, tax_id:32, address:250, postal_code:20, city:100, province:100, country:100,
 contact_person:200, phone:40, email:254,
};
export const emptyPartyProfile = () => Object.fromEntries(Object.keys(partyProfileFields).map(key=>[key,'']));
export function accountPartyType(account){
 if(account?.kind!=='subaccount')return null;
 if(['430','440'].some(prefix=>account.code.startsWith(prefix)))return 'customer';
 if(['400','410'].some(prefix=>account.code.startsWith(prefix)))return 'supplier';
 return null;
}
export function normalizePartyProfile(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!Object.hasOwn(partyProfileFields,key)))throw new Error('INVALID_PARTY_PROFILE');
 const result=emptyPartyProfile();
 for(const [key,max]of Object.entries(partyProfileFields)){
  const item=value[key]??'';
  if(typeof item!=='string'||item.trim().length>max||/[\u0000-\u001f\u007f]/.test(item))throw new Error('INVALID_PARTY_PROFILE');
  result[key]=item.trim();
 }
 result.tax_id=result.tax_id.replace(/\s/g,'').toUpperCase();
 if(result.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email))throw new Error('INVALID_PARTY_EMAIL');
 if(!result.name)throw new Error('INVALID_PARTY_NAME');
 return result;
}
export function invoicePartyProfile(invoice){
 if(invoice.party_fiscal)return invoice.party_fiscal;
 const profile=typeof invoice.party_snapshot==='string'?JSON.parse(invoice.party_snapshot):invoice.party_snapshot;
 return {...emptyPartyProfile(),...profile,name:invoice.party_name,tax_id:invoice.party_tax_id,address:invoice.party_address,email:invoice.party_email};
}
export function completeFiscalProfile(saved,current){
 const result={...emptyPartyProfile(),...saved};
 const taxId=value=>String(value||'').replace(/\s/g,'').toUpperCase();
 // A changed tax identity must not supply an old invoice's missing address.
 if(taxId(saved?.tax_id)&&taxId(current?.tax_id)&&taxId(saved.tax_id)!==taxId(current.tax_id))return result;
 for(const key of Object.keys(partyProfileFields))if(!String(result[key]||'').trim()&&current?.[key])result[key]=current[key];
 return result;
}
export function invoiceFiscalIdentities(invoice){
 const company=invoice.issuer_fiscal||invoice.issuer_snapshot||{},party=invoicePartyProfile(invoice);
 return {company,party,issuer:invoice.direction==='issued'?company:party,recipient:invoice.direction==='issued'?party:company};
}
