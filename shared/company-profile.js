export const companyTextFields = {
  tax_id: 32, trade_name: 160, address: 250, postal_code: 20, city: 100, province: 100, country: 100,
  contact_person: 160, phone: 40, email: 254, billing_email: 254, website: 254,
  bank_name: 120, account_holder: 160, iban: 34, bic: 11, payment_terms: 160,
  sepa_creditor_id:35,bank_initiator_id:35,
  invoice_notes: 1000, registry_info: 500, journal_source_name: 160,
};
export const paymentMethods = ['transfer', 'direct_debit', 'cash', 'card', 'other'];
export const companyProfileKeys = [...Object.keys(companyTextFields), 'payment_method'];
export function emptyCompanyProfile() {
  return Object.fromEntries(companyProfileKeys.map(key => [key, '']));
}

// ISO 13616 structure and ISO/IEC 7064 MOD97-10 check digits.
// Reference: https://www.swift.com/resource/iban-registry-pdf
export function isValidIban(value) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(value)) return false;
  if (Number(value.slice(2, 4)) < 2 || Number(value.slice(2, 4)) > 98) return false;
  if (value.startsWith('ES') && !/^ES\d{22}$/.test(value)) return false;
  let remainder = 0;
  for (const character of value.slice(4) + value.slice(0, 4)) {
    const digits = /[A-Z]/.test(character) ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}
