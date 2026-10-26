import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCompanyProfile } from '../src/services/company-profile.js';
import { companyProfileKeys, emptyCompanyProfile, isValidIban } from '../../shared/company-profile.js';

test('company profile normalizes tax IDs and bank codes and keeps omitted fields absent', () => {
  assert.deepEqual(validateCompanyProfile({ tax_id: ' b 12345674 ', iban: ' es91 2100 0418 4502 0005 1332 ', bic: ' caixesbbxxx ', city: ' Lleida ' }),
    { tax_id: 'B12345674', iban: 'ES9121000418450200051332', bic: 'CAIXESBBXXX', city: 'Lleida' });
  assert.deepEqual(validateCompanyProfile({ address: '' }), { address: '' });
  assert.deepEqual(validateCompanyProfile({ name: 'Name only' }), {});
  assert.deepEqual(Object.keys(emptyCompanyProfile()), companyProfileKeys);
  assert.ok(Object.values(emptyCompanyProfile()).every(value => value === ''));
  assert.equal(validateCompanyProfile({ invoice_notes: 'Line one\nLine two' }).invoice_notes, 'Line one\nLine two');
});

test('IBAN validates international check digits and Spanish account length', () => {
  for (const iban of ['ES9121000418450200051332', 'GB82WEST12345698765432', 'DE89370400440532013000']) assert.equal(isValidIban(iban), true, iban);
  for (const iban of ['', 'ES9121000418450200051333', 'ES0021000418450200051332', 'ES912100041845020005133',
    'ES912100041845020005133200', 'ES91A1000418450200051332', '1S9121000418450200051332', 'ES91 2100 0418 4502 0005 1332']) assert.equal(isValidIban(iban), false, iban);
});

test('company profile rejects malformed contact and bank details before storage', () => {
  const cases = [
    [{ tax_id: '<script>' }, 'INVALID_TAX_ID'], [{ address: 'a'.repeat(251) }, 'INVALID_COMPANY_DETAILS'],
    [{ city: 'one\ntwo' }, 'INVALID_COMPANY_DETAILS'], [{ country: null }, 'INVALID_COMPANY_DETAILS'],
    [{ phone: 123 }, 'INVALID_COMPANY_DETAILS'], [{ email: 'not-an-email' }, 'INVALID_COMPANY_EMAIL'],
    [{ billing_email: 'x@y' }, 'INVALID_COMPANY_EMAIL'], [{ email: 'x@example.test\nBcc:x' }, 'INVALID_COMPANY_DETAILS'],
    [{ website: 'javascript:alert(1)' }, 'INVALID_COMPANY_WEBSITE'], [{ website: 'ftp://example.test' }, 'INVALID_COMPANY_WEBSITE'],
    [{ website: 'not a URL' }, 'INVALID_COMPANY_WEBSITE'], [{ iban: 'ES9121000418450200051333' }, 'INVALID_IBAN'],
    [{ bic: 'CAIXESB' }, 'INVALID_BIC'], [{ bic: 'CAIXESBBXXXX' }, 'INVALID_COMPANY_DETAILS'],
    [{ payment_method: 'unknown' }, 'INVALID_PAYMENT_METHOD'], [{ payment_method: null }, 'INVALID_PAYMENT_METHOD'],
  ];
  for (const [body, code] of cases) assert.throws(() => validateCompanyProfile(body), error => error.code === code, JSON.stringify(body));
  assert.equal(validateCompanyProfile({ website: 'https://example.test', payment_method: 'direct_debit', bic: 'DEUTDEFF' }).bic, 'DEUTDEFF');
});
