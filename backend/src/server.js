import {createAutomaticBackupManager} from './services/automatic-backups.js';
import {createAccessService,mysqlAccessStore} from './services/access.js';
import {accessControl} from './middleware/access.js';
import { companyScope } from './middleware/company-scope.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { createContextService } from './services/context.js';
import { createAccountingService } from './services/accounting.js';
import { createApp } from './app.js';
import {closeInvoicePdfRenderer} from './services/invoice-pdf-renderer.js';
const automaticBackups=createAutomaticBackupManager(pool,{directory:config.backupDirectory});
const server = createApp(createContextService(pool, config.companyId), createAccountingService(pool, config.companyId), companyScope(pool, config.companyId,{automaticBackups}), accessControl(createAccessService(mysqlAccessStore(pool)))).listen(config.port, config.host, () => {
  automaticBackups.start();
  console.log(`Contabilidad: http://${config.host}:${config.port}`);
});
server.on('error', error => { console.error('Server failed:', error.code); process.exitCode = 1; Promise.all([automaticBackups.stop(),closeInvoicePdfRenderer()]).finally(()=>pool.end()); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(async () => { await Promise.all([automaticBackups.stop(),closeInvoicePdfRenderer()]); await pool.end(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
});
