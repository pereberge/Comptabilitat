import { companyTextFields, paymentMethods, isValidIban } from '../../../shared/company-profile.js';
import { fail } from './validation.js';
import {isValidCreditorId,sepaIdentifier} from '../../../shared/sepa.js';

export function validateCompanyProfile(body) {
  const result = {};
  for (const [field, limit] of Object.entries(companyTextFields)) {
    if (!Object.hasOwn(body, field)) continue;
    if (typeof body[field] !== 'string') fail('INVALID_COMPANY_DETAILS');
    let value = body[field].trim();
    if (['tax_id', 'iban', 'bic','sepa_creditor_id'].includes(field)) value = value.toUpperCase().replace(/\s/g, '');
    if(field==='sepa_creditor_id'&&value&&!isValidCreditorId(value))fail('INVALID_CREDITOR_ID');
    if(field==='bank_initiator_id'&&value&&!sepaIdentifier(value))fail('INVALID_INITIATOR_ID');
    if ([...value].length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail('INVALID_COMPANY_DETAILS');
    if (!['invoice_notes', 'registry_info'].includes(field) && /[\r\n\t]/.test(value)) fail('INVALID_COMPANY_DETAILS');
    if (field === 'tax_id' && value && !/^[A-Z0-9][A-Z0-9./-]*$/.test(value)) fail('INVALID_TAX_ID');
    if (['email', 'billing_email'].includes(field) && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('INVALID_COMPANY_EMAIL');
    if (field === 'website' && value) {
      try { if (!['http:', 'https:'].includes(new URL(value).protocol)) fail('INVALID_COMPANY_WEBSITE'); }
      catch { fail('INVALID_COMPANY_WEBSITE'); }
    }
    if (field === 'iban' && value && !isValidIban(value)) fail('INVALID_IBAN');
    // ISO 9362: 4 alphanumeric + country + 2 alphanumeric, optionally a 3-character branch.
    if (field === 'bic' && value && !/^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(value)) fail('INVALID_BIC');
    result[field] = value;
  }
  if (Object.hasOwn(body, 'payment_method')) {
    if (body.payment_method !== '' && !paymentMethods.includes(body.payment_method)) fail('INVALID_PAYMENT_METHOD');
    result.payment_method = body.payment_method;
  }
  return result;
}
