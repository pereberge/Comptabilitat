// The separator is presentation only; full codes stay numeric VARCHAR values.
export function parseAccountCode(input, length) {
  if (typeof input !== 'string' || !/^[1-9]\d*(?:\.\d+)?$/.test(input) || input.length > 21) throw new Error('INVALID_CODE');
  const parts = input.split('.');
  let code = parts.join('');
  if (code.length > length) throw new Error('INVALID_CODE');
  if (parts.length === 2) {
    if(parts[0].length<3||parts[0].length>=length)throw new Error('INVALID_SUBACCOUNT_FORMAT');
    code=parts[0]+parts[1].padStart(length-parts[0].length,'0');
  }
  return { code, kind: code.length === length ? 'subaccount' : 'account', parentCode: parts.length === 2 ? parts[0] : null };
}
export function findSubaccount(input,accounts){
  if(typeof input!=='string')return null;
  const value=input.trim(),parsed=new Map();
  return accounts.find(account=>{
    if(account.kind==='account')return false;
    const length=account.code.length;
    if(!parsed.has(length)){try{parsed.set(length,parseAccountCode(value,length));}catch{parsed.set(length,null);}}
    const result=parsed.get(length);
    return result?.kind==='subaccount'&&result.code===account.code&&(!result.parentCode||result.parentCode===account.parent_code);
  })||null;
}
export function displayAccountCode(account) {
  if (account.kind !== 'subaccount' || !account.parent_code || !account.code.startsWith(account.parent_code)) return account.code;
  return account.parent_code + '.' + account.code.slice(account.parent_code.length);
}
