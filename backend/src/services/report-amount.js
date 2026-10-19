// SUM(DECIMAL) may exceed a single line's precision. Never convert to Number.
export function amount(value) {
  if (!/^-?\d+\.\d{2}$/.test(String(value))) throw new Error('INVALID_DATABASE_AMOUNT');
  return BigInt(String(value).replace('.', ''));
}
