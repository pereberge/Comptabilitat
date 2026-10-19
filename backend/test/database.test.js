import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';
test('MySQL: integridad de ejercicios y períodos', { skip: process.env.TEST_MYSQL !== '1' }, async () => {
  const db = await mysql.createConnection(config.database);
  await db.beginTransaction();
  try {
    const [company] = await db.execute('INSERT INTO companies (name) VALUES (?)', ['Prueba transaccional']);
    const companyId = company.insertId;
    const insert = (name, start, end, status = 'open', isDefault = 0) =>
      db.execute('INSERT INTO accounting_exercises (company_id, name, start_date, end_date, status, is_default) VALUES (?, ?, ?, ?, ?, ?)',
        [companyId, name, start, end, status, isDefault]);
    const [first] = await insert('2026', '2026-01-01', '2026-12-31', 'open', 1);
    await assert.rejects(insert('Solapado', '2026-12-31', '2027-01-10'), /EXERCISE_PERIOD_OVERLAP/);
    await assert.rejects(insert('Fechas inválidas', '2028-12-31', '2028-01-01'));
    await assert.rejects(insert('Segundo predeterminado', '2027-01-01', '2027-12-31', 'open', 1));
    await assert.rejects(insert('Cerrado predeterminado', '2029-01-01', '2029-12-31', 'closed', 1));
    const [second] = await insert('2027', '2027-01-01', '2027-12-31');
    await assert.rejects(db.execute('UPDATE accounting_exercises SET start_date = ? WHERE id = ?', ['2026-12-31', second.insertId]), /EXERCISE_PERIOD_OVERLAP/);
    await assert.rejects(db.execute('DELETE FROM companies WHERE id = ?', [companyId]));
    const [[count]] = await db.execute('SELECT COUNT(*) AS total FROM accounting_exercises WHERE company_id = ?', [companyId]);
    assert.equal(count.total, 2);
    assert.ok(first.insertId);
  } finally { await db.rollback(); await db.end(); }
});

test('MySQL: altas concurrentes no admiten períodos solapados con una lectura previa', { skip: process.env.TEST_MYSQL !== '1' }, async () => {
  const first = await mysql.createConnection(config.database);
  const second = await mysql.createConnection(config.database);
  let companyId;
  try {
    const [company] = await first.execute('INSERT INTO companies (name) VALUES (?)', ['Prueba de concurrencia']);
    companyId = company.insertId;
    await second.beginTransaction();
    // Establece una instantánea anterior al alta de la primera conexión.
    await second.execute('SELECT id FROM accounting_exercises WHERE company_id = ?', [companyId]);
    await first.beginTransaction();
    const sql = 'INSERT INTO accounting_exercises (company_id, name, start_date, end_date) VALUES (?, ?, ?, ?)';
    await first.execute(sql, [companyId, 'Primero', '2026-01-01', '2026-12-31']);
    const rejected = assert.rejects(
      second.execute(sql, [companyId, 'Solapado', '2026-06-01', '2027-05-31']),
      /EXERCISE_PERIOD_OVERLAP/,
    );
    await first.commit();
    await rejected;
    await second.rollback();
    const [[count]] = await first.execute('SELECT COUNT(*) AS total FROM accounting_exercises WHERE company_id = ?', [companyId]);
    assert.equal(count.total, 1);
  } finally {
    await first.rollback(); await second.rollback();
    if (companyId) {
      await first.execute('DELETE FROM accounting_exercises WHERE company_id = ?', [companyId]);
      await first.execute('DELETE FROM companies WHERE id = ?', [companyId]);
    }
    await first.end(); await second.end();
  }
});
