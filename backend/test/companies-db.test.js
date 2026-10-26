import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createContextService } from '../src/services/context.js';
import { createAccountingService } from '../src/services/accounting.js';
import { companyScope } from '../src/middleware/company-scope.js';

test('MySQL: company creation, initial exercise, persistent logos and isolated accounting', { skip: process.env.TEST_MYSQL !== '1' }, async () => {
  const pool = mysql.createPool(config.database), ids = [], prefix = 'Companies test ' + randomUUID();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
  const logo = 'data:image/png;base64,' + png.toString('base64');
  const context = createContextService(pool, config.companyId);
  const server = createApp(context, {}, companyScope(pool, config.companyId)).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (path, body, method = 'POST', companyId = 'invalid') => fetch(base + '/api' + path, {
    method, headers: { 'Content-Type': 'application/json', 'X-Company-Id': String(companyId) }, body: JSON.stringify(body),
  });
  try {
    const exercise = { name: '2026', start_date: '2026-01-01', end_date: '2026-12-31' };
    const profile = {
      tax_id: 'B12345674', trade_name: 'Test trade name', address: 'Carrer de prova, 1', postal_code: '25001',
      city: 'Lleida', province: 'Lleida', country: 'España', contact_person: 'Test contact', phone: '+34 900000000',
      email: 'info@example.test', billing_email: 'invoices@example.test', website: 'https://example.test',
      bank_name: 'Test bank', account_holder: 'Test holder', iban: 'ES9121000418450200051332', bic: 'CAIXESBBXXX',
      payment_method: 'transfer', payment_terms: '30 days', invoice_notes: 'Invoice footer\nSecond line', registry_info: 'Test registry data',
    };
    const firstResponse = await request('/companies', { name: prefix + ' One', exercise, logo, ...profile });
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json(); ids.push(first.id);
    const secondResponse = await request('/companies', { name: prefix + ' Two', exercise });
    assert.equal(secondResponse.status, 201);
    const second = await secondResponse.json(); ids.push(second.id);
    assert.notEqual(first.id, second.id);
    assert.equal(second.logo_url, null);
    assert.equal(second.tax_id, '');
    assert.equal(second.iban, '');
    for (const [field, value] of Object.entries(profile)) assert.equal(first[field], value, field);
    const profileResponse = await fetch(base + '/api/companies/' + first.id, { headers: { 'X-Company-Id': String(second.id) } });
    assert.equal(profileResponse.status, 200);
    const reloadedProfile = await profileResponse.json();
    for (const [field, value] of Object.entries(profile)) assert.equal(reloadedProfile[field], value, field);
    const selected = await context.getContext(first.id);
    assert.equal(selected.company.subaccount_length, 8);
    assert.equal(selected.company.iban, profile.iban);
    assert.deepEqual(selected.exercises.map(({ name, start_date, end_date, status, is_default }) => ({ name, start_date, end_date, status, is_default })),
      [{ ...exercise, status: 'open', is_default: true }]);
    const storedLogo = await fetch(base + first.logo_url);
    assert.equal(storedLogo.status, 200);
    assert.equal(storedLogo.headers.get('content-type'), 'image/png');
    assert.equal(storedLogo.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(storedLogo.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await storedLogo.arrayBuffer()), png);
    assert.equal((await context.getCompany(first.id)).logo_url, first.logo_url);

    for (const [index, companyId] of ids.entries()) {
      await createAccountingService(pool, companyId).createAccount({ code: '4300.0001', description: 'Customer ' + index });
      const response = await fetch(base + '/api/accounts?kind=subaccount', { headers: { 'X-Company-Id': String(companyId) } });
      assert.equal(response.status, 200);
      const accounts = await response.json();
      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].company_id, companyId);
      assert.equal(accounts[0].description, 'Customer ' + index);
    }
    const foreignContext = await context.getContext(second.id);
    assert.notEqual(foreignContext.exercises[0].id, selected.exercises[0].id);

    const renamed = await request('/companies/' + second.id, { name: prefix + ' Renamed', logo }, 'PATCH', first.id);
    assert.equal(renamed.status, 200);
    const renamedCompany = await renamed.json();
    assert.ok(renamedCompany.logo_url);
    assert.equal((await context.getCompany(first.id)).name, first.name);
    const preserved = await request('/companies/' + second.id, { name: prefix + ' Again' }, 'PATCH');
    assert.equal((await preserved.json()).logo_url, renamedCompany.logo_url);
    const removed = await request('/companies/' + second.id, { name: prefix + ' Again', logo: null }, 'PATCH');
    assert.equal((await removed.json()).logo_url, null);
    assert.equal((await fetch(base + renamedCompany.logo_url)).status, 404);
    assert.equal((await fetch(base + first.logo_url)).status, 200);

    const listed = await (await fetch(base + '/api/companies')).json();
    assert.equal(listed.find(item => item.id === first.id).logo_url, first.logo_url);
    assert.equal(listed.find(item => item.id === first.id).tax_id, profile.tax_id);
    assert.ok(listed.every(item => !Object.hasOwn(item, 'iban') && !Object.hasOwn(item, 'billing_email')));
    const partial = await request('/companies/' + first.id, { name: first.name, address: 'Updated address' }, 'PATCH');
    assert.equal(partial.status, 200);
    const partialProfile = await partial.json();
    assert.equal(partialProfile.address, 'Updated address');
    assert.equal(partialProfile.tax_id, profile.tax_id);
    assert.equal(partialProfile.iban, profile.iban);
    assert.equal(partialProfile.logo_url, first.logo_url);
    const invalidBank = await request('/companies/' + first.id, { name: prefix + ' Must not save', iban: 'ES9121000418450200051333', email: 'changed@example.test' }, 'PATCH');
    assert.equal(invalidBank.status, 400);
    assert.equal((await invalidBank.json()).error.code, 'INVALID_IBAN');
    assert.deepEqual(await context.getCompany(first.id), partialProfile);
    await Promise.all([
      context.updateCompany(first.id, { name: first.name, phone: 'First concurrent change' }),
      context.updateCompany(first.id, { name: first.name, email: 'concurrent@example.test' }),
    ]);
    const concurrentProfile = await context.getCompany(first.id);
    assert.equal(concurrentProfile.phone, 'First concurrent change');
    assert.equal(concurrentProfile.email, 'concurrent@example.test');
    assert.equal((await context.getCompany(second.id)).iban, '');
    const cleared = await request('/companies/' + first.id, { name: first.name, iban: '', bic: '', billing_email: '' }, 'PATCH');
    assert.equal(cleared.status, 200);
    const clearedProfile = await cleared.json();
    assert.equal(clearedProfile.iban, '');
    assert.equal(clearedProfile.billing_email, '');
    assert.equal(clearedProfile.tax_id, profile.tax_id);
    assert.equal((await request('/companies', { name: prefix + ' Invalid', exercise: { ...exercise, end_date: '2025-01-01' } })).status, 400);
    const [[invalid]] = await pool.execute('SELECT COUNT(*) AS total FROM companies WHERE name = ?', [prefix + ' Invalid']);
    assert.equal(invalid.total, 0);

    const failingPool = { async getConnection() {
      const connection = await pool.getConnection();
      return {
        beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(),
        rollback: () => connection.rollback(), release: () => connection.release(),
        execute: (sql, params) => {
          if (sql.startsWith('INSERT INTO company_logos')) throw new Error('Injected logo failure');
          return connection.execute(sql, params);
        },
      };
    } };
    await assert.rejects(createContextService(failingPool, config.companyId).createCompany({ name: prefix + ' Rollback', exercise, logo }), /Injected logo failure/);
    const [[rollback]] = await pool.execute('SELECT COUNT(*) AS total FROM companies WHERE name = ?', [prefix + ' Rollback']);
    assert.equal(rollback.total, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    for (const companyId of ids) {
      const [accounts] = await pool.execute('SELECT id FROM accounts WHERE company_id = ? ORDER BY LENGTH(code) DESC', [companyId]);
      for (const account of accounts) await pool.execute('DELETE FROM accounts WHERE id = ? AND company_id = ?', [account.id, companyId]);
      await pool.execute('DELETE FROM accounting_exercises WHERE company_id = ?', [companyId]);
      await pool.execute('DELETE FROM companies WHERE id = ?', [companyId]);
    }
    await pool.end();
  }
});
