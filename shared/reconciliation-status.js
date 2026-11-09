import {BANK_BALANCE_TOLERANCE_CENTS} from './bank-reconciliation.js';
import {reconciliationSignedAmount} from './reconciliation-proposals.js';

export function reconciliationStatus(movements,current){
 const pending=movements.filter(row=>!row.done||row.modified).length;
 const difference=/^-?\d+\.\d{2}$/.test(current?.difference_book_minus_bank||'')?current.difference_book_minus_bank:null;
 const cents=difference===null?null:reconciliationSignedAmount(difference);
 const withinTolerance=cents!==null&&cents>=-BANK_BALANCE_TOLERANCE_CENTS&&cents<=BANK_BALANCE_TOLERANCE_CENTS;
 const needsRefresh=!current||!!current.ledger_changed;
 return {pending,difference,withinTolerance,needsRefresh,balanced:pending===0&&withinTolerance&&!needsRefresh};
}
