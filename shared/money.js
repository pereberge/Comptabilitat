export function cents(value) {
  if (typeof value !== 'string' || !/^\d{1,13}([.,]\d{1,2})?$/.test(value)) throw new Error('INVALID_AMOUNT');
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function decimal(value) {
  const sign = value < 0n ? '-' : '';
  const positive = value < 0n ? -value : value;
  return sign + (positive / 100n) + '.' + String(positive % 100n).padStart(2, '0');
}
export function displayMoney(value) {
  const [whole, fraction] = decimal(value).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction;
}
