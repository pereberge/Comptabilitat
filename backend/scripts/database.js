import mysql from 'mysql2/promise';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { config } from '../src/config.js';
const mode = process.argv[2];
if (!['migrate', 'seed'].includes(mode)) throw new Error('Uso: database.js migrate|seed');
let connection;
let locked = false;
const lockName = 'contabilidad:' + createHash('sha256').update(config.database.database).digest('hex').slice(0, 40);
try {
  connection = await mysql.createConnection(config.database);
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
  if (lock.acquired !== 1) throw new Error('DATABASE_LOCK_UNAVAILABLE');
  locked = true;
  await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  const directory = new URL(mode === 'migrate' ? '../../database/migrations/' : '../../database/seeds/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    const key = mode + ':' + file;
    const [existing] = await connection.execute('SELECT name FROM schema_migrations WHERE name = ?', [key]);
    if (existing.length) { console.log('Ya aplicado:', file); continue; }
    const sql = await readFile(new URL(file, directory), 'utf8');
    if (mode === 'seed') await connection.beginTransaction();
    try {
      for (const statement of sql.split(/^-- statement\s*$/m).map(value => value.trim()).filter(Boolean)) await connection.query(statement);
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [key]);
      if (mode === 'seed') await connection.commit();
      console.log('Aplicado:', file);
    } catch (error) { if (mode === 'seed') await connection.rollback(); throw error; }
  }
} catch (error) {
  console.error('No se pudo preparar la base de datos:', error.code || error.message);
  process.exitCode = 1;
} finally {
  if (connection) {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    await connection.end();
  }
}
