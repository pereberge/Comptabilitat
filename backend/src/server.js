import { companyScope } from './middleware/company-scope.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { createContextService } from './services/context.js';
import { createAccountingService } from './services/accounting.js';
import { createApp } from './app.js';
const server = createApp(createContextService(pool, config.companyId), createAccountingService(pool, config.companyId), companyScope(pool, config.companyId)).listen(config.port, config.host, () => {
  console.log(`Contabilidad: http://${config.host}:${config.port}`);
});
server.on('error', error => { console.error('Server failed:', error.code); process.exitCode = 1; pool.end(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(async () => { await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
});
