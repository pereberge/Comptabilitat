import {errorText} from '../locales/accounting.js';
export const reconciliationProposalError=error=>({
 RECONCILIATION_MOVEMENT_NOT_FOUND:'Aquest moviment ja no està disponible en aquest extracte. Actualitza el llistat.',
 RECONCILIATION_RECEIPT_CHANGED:'Els rebuts seleccionats ja no coincideixen amb l’import pendent, la factura o el sentit del moviment. Torna a buscar les coincidències.',
 RECONCILIATION_CHANGED:'El llistat ha canviat. Prem «Actualitzar llistat» i torna a guardar l’assentament.',
 RECONCILIATION_ENTRY_CHANGED:'Aquest moviment ja té un assentament, però s’ha modificat. Revisa l’assentament existent des del llistat.',
 RECONCILIATION_INVALID_PROPOSAL:'Revisa las líneas de la propuesta.',
 RECONCILIATION_UNBALANCED_PROPOSAL:'El debe y el haber deben cuadrar con el importe del movimiento bancario.',
 RECONCILIATION_INVALID_ACCOUNT:'Selecciona subcuentas de esta empresa, distintas del banco y sin repetirlas.',
 RECONCILIATION_INVALID_RULE:'Indica al menos tres caracteres del concepto que se repite.',
 RECONCILIATION_RULE_NOT_FOUND:'El criterio ya no está disponible en este banco.',
 RECONCILIATION_MOVEMENT_MATCHED:'Aquest moviment ja està comptabilitzat o conciliat. Actualitza el llistat per veure’l.',
})[error?.code]||errorText(error);
