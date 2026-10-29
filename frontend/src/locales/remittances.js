import {accessError} from '../services/access-errors.js';
import {treasuryError} from './treasury.js';
export const remittanceErrors={
 INVALID_REMITTANCE:'Selecciona cobros o pagos y revisa los datos de la remesa.',INVALID_REMITTANCE_RECEIPTS:'Selecciona entre 1 y 1.000 recibos, sin repetirlos.',REMITTANCE_DATE_PAST:'La fecha de presentación no puede ser anterior a hoy.',
 REMITTANCE_COMPANY_IBAN:'Completa el IBAN de la empresa.',REMITTANCE_PARTY_IBAN:'Falta un IBAN válido en la ficha del cliente o proveedor.',REMITTANCE_PARTY_NAME:'Falta el nombre del titular del recibo.',REMITTANCE_COMPANY_NAME:'Falta el titular de la cuenta de la empresa.',
 REMITTANCE_PARTY_CHANGED:'El NIF de la ficha difiere del de la factura. Revisa el tercero antes de remesar.',REMITTANCE_MANDATE:'Completa la referencia y la fecha de firma del mandato en la ficha del cliente.',REMITTANCE_MANDATE_REUSED:'El mandato de cobro único o final ya está incluido en otra orden. Revisa su secuencia.',
 REMITTANCE_PARTY_ADDRESS:'Completa el domicilio y el país (código de dos letras) del cliente para este cobro fuera del EEE.',REMITTANCE_COMPANY_ADDRESS:'Completa el domicilio y el país de la empresa para pagos fuera del EEE.',
 INVALID_CREDITOR_ID:'Revisa el identificador de acreedor SEPA que te ha facilitado el banco.',INVALID_INITIATOR_ID:'El identificador del presentador admite hasta 35 caracteres SEPA.',INVALID_SEPA_MANDATE:'Revisa la referencia del mandato (hasta 35 caracteres SEPA), su fecha y la secuencia.',
 INVALID_BIC:'El BIC debe tener 8 u 11 caracteres.',REMITTANCE_PREVIEW_REQUIRED:'Revisa la remesa antes de generar el fichero.',REMITTANCE_RECEIPT_UNAVAILABLE:'Algún recibo ya no está disponible para esta remesa. Actualiza la lista.',REMITTANCE_CHANGED:'Los recibos o las fichas han cambiado. Revisa de nuevo la remesa.',REMITTANCE_INCOMPLETE:'Completa los datos indicados antes de generar el fichero.',REMITTANCE_NOT_FOUND:'La remesa no está disponible en esta empresa.',REMITTANCE_AMOUNT_LIMIT:'Un recibo supera el importe máximo SEPA de 999.999.999,99 €.',
};
export function remittanceError(error){return accessError(error)||remittanceErrors[error.code||error.message]||treasuryError(error);}
