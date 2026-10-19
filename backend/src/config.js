import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const envPath = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
function positiveInteger(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
    throw new Error(`Configuración no válida: ${name}`);
  }
  return Number(value);
}
export const config = {
  host: process.env.HOST || '127.0.0.1', port: positiveInteger('PORT', 3000),
  companyId: positiveInteger('COMPANY_ID', 1),
  database: {
    host: process.env.DB_HOST || '127.0.0.1', port: positiveInteger('DB_PORT', 3306),
    database: process.env.DB_NAME || 'contabilidad', user: process.env.DB_USER || 'contabilidad_app',
    password: process.env.DB_PASSWORD || '', connectionLimit: 5, connectTimeout: 5000,
    charset: 'utf8mb4', dateStrings: true, decimalNumbers: false,
  },
};
