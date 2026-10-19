// Presentation only: arithmetic and totals belong to the backend.
export function reportMoney(value) {
  const [whole, fraction] = String(value).split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction;
}
export const reportDate = value => value.split('-').reverse().join('/');

export function csvCell(value) {
  const cell = value && typeof value === 'object' && 'amount' in value
    ? (/^-?\d+\.\d{2}$/.test(value.amount) ? value.amount.replace('.', ',') : '')
    : String(value ?? '');
  // All untrusted text is literal, including account codes with leading zeros.
  const safe = value && typeof value === 'object' && 'amount' in value ? cell
    : (/^[\s\u0000-\u001f]*[=+@-]/.test(cell) || /^0\d/.test(cell) ? "'" + cell : cell);
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function buildCsv(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'); }
export function downloadCsv(name, rows) {
  const url = URL.createObjectURL(new Blob([buildCsv(rows)], {type:'text/csv;charset=utf-8'}));
  const anchor = document.createElement('a'); anchor.href=url; anchor.download=name; anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
