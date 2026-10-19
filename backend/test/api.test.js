import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createContextService } from '../src/services/context.js';
import { HttpError } from '../src/middleware/errors.js';

async function withServer(service, callback) {
  const server = createApp(service).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try { await callback('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
test('contexto limita ambas consultas a la empresa configurada', async () => {
  const calls = [];
  const db = { async execute(sql, params) {
    calls.push({ sql, params });
    return sql.includes('FROM companies') ? [[{ id: 7, name: 'Empresa de prueba' }]]
      : [[{ id: 2, name: '2026', is_default: 1, status: 'open' }]];
  } };
  const result = await createContextService(db, 7).getContext();
  assert.equal(result.company.id, 7);
  assert.equal(result.exercises[0].is_default, true);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.params[0] === 7 && call.sql.includes('?')));
});
test('empresa inexistente devuelve error explícito', async () => {
  await assert.rejects(createContextService({ execute: async () => [[]] }, 99).getContext(),
    error => error instanceof HttpError && error.status === 404 && error.code === 'COMPANY_NOT_FOUND');
});
test('API entrega contexto real del servicio sin caché', async () => {
  await withServer({ getContext: async () => ({ company: { id: 1 }, exercises: [] }) }, async url => {
    const response = await fetch(url + '/api/context');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { company: { id: 1 }, exercises: [] });
  });
});
test('fallo de MySQL no expone SQL, credenciales ni stack', async () => {
  await withServer({ getContext: async () => { throw Object.assign(new Error('password=secret SELECT *'), { code: 'ECONNREFUSED' }); } }, async url => {
    const response = await fetch(url + '/api/context');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});
test('ruta API inexistente no devuelve el HTML del frontend', async () => {
  await withServer({}, async url => {
    const response = await fetch(url + '/api/no-existe');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: { code: 'NOT_FOUND' } });
  });
});

test('missing database tables return an actionable error', async () => {
  await withServer({ getContext: async () => { throw Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }); } }, async url => {
    const response = await fetch(url + '/api/context');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: 'DATABASE_NOT_INITIALIZED' } });
  });
});
