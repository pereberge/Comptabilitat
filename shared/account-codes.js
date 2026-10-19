// The separator is presentation only; full codes stay numeric VARCHAR values.
export function parseAccountCode(input, length) {
  if (typeof input !== 'string' || !/^[1-9]\d*(?:\.\d+)?$/.test(input) || input.length > 21) throw new Error('INVALID_CODE');
  const parts = input.split('.');
  const code = parts.join('');
  if (code.length > length) throw new Error('INVALID_CODE');
  if (parts.length === 2 && (parts[0].length < 3 || code.length !== length)) throw new Error('INVALID_SUBACCOUNT_FORMAT');
  return { code, kind: code.length === length ? 'subaccount' : 'account', parentCode: parts.length === 2 ? parts[0] : null };
}
export function displayAccountCode(account) {
  if (account.kind !== 'subaccount' || !account.parent_code || !account.code.startsWith(account.parent_code)) return account.code;
  return account.parent_code + '.' + account.code.slice(account.parent_code.length);
}
