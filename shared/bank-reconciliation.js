export const BANK_BALANCE_MAX_DAYS = 10;
export const BANK_BALANCE_TOLERANCE_CENTS = 3n;
export const bankDayNumber = date => Date.parse(date+'T00:00:00Z')/86400000;
export const addBankDays = (date,days) => new Date((bankDayNumber(date)+days)*86400000).toISOString().slice(0,10);
export const bankLedgerReadThrough = (through,end) => [addBankDays(through,BANK_BALANCE_MAX_DAYS),end].sort()[0];
export function bankReconciliationDates(snapshot) {
  const scope=snapshot.scope||{},from=snapshot.source.from,bankThrough=snapshot.source.to;
  const bankCutoff=scope.last_matching_date||null,bookCutoff=scope.last_matching_book_date||bankCutoff;
  const bookThrough=scope.book_balance_date||bankThrough;
  return {bankThrough,bookThrough,readThrough:scope.ledger_read_through||bankThrough,bankCutoff,bookCutoff,
    bankFrom:bankCutoff?addBankDays(bankCutoff,1):from,
    bookFrom:bookCutoff?addBankDays(bookCutoff,1):from};
}
