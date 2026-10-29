import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanyService, validateLogo } from '../src/services/companies.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
const logo = 'data:image/png;base64,' + png.toString('base64');

test('logos validate the file content, MIME type, base64 and size', () => {
  assert.deepEqual(validateLogo(logo), { mimeType: 'image/png', content: png });
  assert.equal(validateLogo(null), null);
  for (const value of [42, '', 'https://example.com/logo.png', 'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/jpeg;base64,' + png.toString('base64'),
    'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64'), logo + '?']) {
    assert.throws(() => validateLogo(value), error => error.code === 'INVALID_COMPANY_LOGO');
  }
  assert.throws(() => validateLogo('data:image/png;base64,' + Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')),
    error => error.status === 413 && error.code === 'LOGO_TOO_LARGE');
});

test('company creation rejects invalid names and exercise dates before writing', async () => {
  const service = createCompanyService({ getConnection() { throw new Error('Unexpected database write'); } });
  const valid = { name: 'New company', exercise: { name: '2026', start_date: '2026-01-01', end_date: '2026-12-31' } };
  for (const [body, code] of [
    [{ ...valid, name: ' ' }, 'INVALID_COMPANY_NAME'],
    [{ ...valid, name: 'a'.repeat(161) }, 'INVALID_COMPANY_NAME'],
    [{ ...valid, exercise: null }, 'INVALID_EXERCISE'],
    [{ ...valid, exercise: { ...valid.exercise, start_date: '2026-02-30' } }, 'INVALID_DATE'],
    [{ ...valid, exercise: { ...valid.exercise, end_date: '2025-12-31' } }, 'INVALID_EXERCISE_PERIOD'],
    [{ ...valid, logo: 'invalid' }, 'INVALID_COMPANY_LOGO'],
    ...[5,21,'10',null].map(subaccount_length=>[{...valid,subaccount_length},'INVALID_SUBACCOUNT_LENGTH']),
    [{ ...valid, business_format:'unknown' }, 'INVALID_COMPANY_FORMAT'],
    [{ ...valid, business_format:null }, 'INVALID_COMPANY_FORMAT'],
  ]) await assert.rejects(service.createCompany(body), error => error.code === code);
});

test('failure when creating the initial exercise rolls back the company', async () => {
  const events = [];
  const db = {
    async beginTransaction() { events.push('begin'); },
    async execute(sql) {
      if (sql.startsWith('INSERT INTO companies')) return [{ insertId: 23 }];
      throw new Error('Exercise write failed');
    },
    async commit() { events.push('commit'); },
    async rollback() { events.push('rollback'); },
    release() { events.push('release'); },
  };
  await assert.rejects(createCompanyService({ getConnection: async () => db }).createCompany({
    name: 'Atomic company', exercise: { name: '2026', start_date: '2026-01-01', end_date: '2026-12-31' },
  }), /Exercise write failed/);
  assert.deepEqual(events, ['begin', 'rollback', 'release']);
});

test('deadlock after inserting a company retries the complete transaction once', async () => {
  let attempts = 0, commits = 0, rollbacks = 0, releases = 0;
  const pool = { async getConnection() {
    const attempt = ++attempts;
    return {
      async beginTransaction() {},
      async execute(sql) {
        if (sql.startsWith('INSERT INTO companies')) return [{ insertId: 100 + attempt }];
        if (attempt === 1 && sql.startsWith('INSERT INTO accounting_exercises')) throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' });
        if (sql.startsWith('SELECT')) return [[{ id: 100 + attempt, name: 'Retried company' }]];
        return [{}];
      },
      async commit() { commits++; }, async rollback() { rollbacks++; }, release() { releases++; },
    };
  } };
  const saved = await createCompanyService(pool).createCompany({ name: 'Retried company', exercise: { name: '2026', start_date: '2026-01-01', end_date: '2026-12-31' } });
  assert.equal(saved.id, 102);
  assert.deepEqual({ attempts, commits, rollbacks, releases }, { attempts: 2, commits: 1, rollbacks: 1, releases: 2 });
});

test('persistent deadlocks stop after three rolled back attempts', async () => {
  let attempts = 0, releases = 0;
  const pool = { async getConnection() {
    attempts++;
    return { async beginTransaction() {}, async execute() { throw Object.assign(new Error('Deadlock'), { code: 'ER_LOCK_DEADLOCK' }); },
      async rollback() {}, release() { releases++; } };
  } };
  await assert.rejects(createCompanyService(pool).createCompany({ name: 'Busy company', exercise: { name: '2026', start_date: '2026-01-01', end_date: '2026-12-31' } }), error => error.code === 'ER_LOCK_DEADLOCK');
  assert.equal(attempts, 3);
  assert.equal(releases, 3);
});
