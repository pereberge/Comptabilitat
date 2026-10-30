import mysql from 'mysql2/promise';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { config } from '../src/config.js';
import {quoteDatabase} from '../src/db/company-databases.js';
const centralMigrations=new Set(['019_app_users.sql','030_user_login_companies.sql','031_administrator_username.sql','032_user_email.sql','037_company_databases.sql']);
const mode = process.argv[2];
if (!['migrate', 'seed'].includes(mode)) throw new Error('Uso: database.js migrate|seed');
let connection;
let locked = false;
let currentFile;
let currentStatement;
const lockName = 'contabilidad:' + createHash('sha256').update(config.database.database).digest('hex').slice(0, 40);
try {
  connection = await mysql.createConnection(config.database);
  const [[server]] = await connection.query('SELECT VERSION() AS version');
  const mariaDB = /mariadb/i.test(server.version);
  const [[lock]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired', [lockName]);
  if (lock.acquired !== 1) throw new Error('DATABASE_LOCK_UNAVAILABLE');
  locked = true;
  await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  const directory = new URL(mode === 'migrate' ? '../../database/migrations/' : '../../database/seeds/', import.meta.url);
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    if(process.env.DATABASE_ROLE==='company'&&centralMigrations.has(file))continue;
    currentFile = file;
    currentStatement = undefined;
    const key = mode + ':' + file;
    const [existing] = await connection.execute('SELECT name FROM schema_migrations WHERE name = ?', [key]);
    if (existing.length) { console.log('Ya aplicado:', file); continue; }
    const sql = await readFile(new URL(file, directory), 'utf8');
    if (mode === 'seed') await connection.beginTransaction();
    try {
      const statements = sql.split(/^-- statement\s*$/m).map(value => value.trim()).filter(Boolean);
      for (const [index, statement] of statements.entries()) {
        currentStatement = index + 1;
        let compatibleStatement = statement;
        if(process.env.DATABASE_ROLE==='company')compatibleStatement=compatibleStatement.replace(/REFERENCES\s+app_users\s*\(/gi,'REFERENCES '+quoteDatabase(process.env.CENTRAL_DB_NAME)+'.app_users(');
        if (mariaDB && /DROP CHECK/i.test(statement)) {
          const table = /^ALTER TABLE\s+(\w+)/i.exec(statement)?.[1];
          const [checks] = await connection.execute(
            'SELECT CONSTRAINT_NAME, CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME=?',
            [config.database.database, table],
          );
          const expressions = {
            journal_entries_chk_1: 'number>0',
            journal_lines_chk_1: 'debit>0andcredit=0orcredit>0anddebit=0',
            farm_cost_lines_chk_2: "categoryin'feed','transport','medicines','reproduction','supplies','other'",
          };
          const normalize = value => value.toLowerCase().replace(/[`\s()]/g, '');
          compatibleStatement = statement.replace(/DROP CHECK\s+(\w+)/gi, (_, name) => {
            const named = checks.filter(check => check.CONSTRAINT_NAME === name);
            const matches = named.length ? named : checks.filter(check => expressions[name] && normalize(check.CHECK_CLAUSE) === expressions[name]);
            if (matches.length !== 1) throw new Error('MARIADB_CHECK_NOT_IDENTIFIED: ' + table + '.' + name);
            return 'DROP CONSTRAINT `' + matches[0].CONSTRAINT_NAME.replace(/`/g, '``') + '`';
          });
        }
        if (mariaDB) {
          compatibleStatement = compatibleStatement.replace(/\butf8mb4_0900_ai_ci\b/g, 'utf8mb4_unicode_ci');
        }
        await connection.query(compatibleStatement);
      }
      await connection.execute('INSERT INTO schema_migrations (name) VALUES (?)', [key]);
      if (mode === 'seed') await connection.commit();
      console.log('Aplicado:', file);
    } catch (error) { if (mode === 'seed') await connection.rollback(); throw error; }
  }
} catch (error) {
  console.error('No se pudo preparar la base de datos:', error.code || error.message);
  if (currentFile) console.error('Archivo:', currentFile, 'Sentencia:', currentStatement ?? '-');
  process.exitCode = 1;
} finally {
  if (connection) {
    if (locked) await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    await connection.end();
  }
}
