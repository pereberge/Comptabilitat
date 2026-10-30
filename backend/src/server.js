import {createAutomaticBackupManager} from './services/automatic-backups.js';
import {integrationRouter} from './integrations/router.js';
import {createAccessService,mysqlAccessStore} from './services/access.js';
import {accessControl} from './middleware/access.js';
import { companyScope } from './middleware/company-scope.js';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { createContextService } from './services/context.js';
import { createAccountingService } from './services/accounting.js';
import { createApp } from './app.js';
import {closeInvoicePdfRenderer} from './services/invoice-pdf-renderer.js';
import {createCompanyDatabases} from './db/company-databases.js';
import {createCompanyDatabaseContext} from './services/company-database-context.js';
import {createCompanyDatabaseBackups} from './services/company-database-backups.js';
import {provisionCompanyDatabase} from './services/company-database-provision.js';
const companyDatabases=config.separateCompanyDatabases?createCompanyDatabases(pool,config.database):null;
const context=companyDatabases?createCompanyDatabaseContext(pool,companyDatabases,{provision:companyId=>provisionCompanyDatabase(pool,config.database.database,companyId)}):createContextService(pool,config.companyId);
const automaticBackups=companyDatabases?createCompanyDatabaseBackups(companyDatabases,{directory:config.backupDirectory}):createAutomaticBackupManager(pool,{directory:config.backupDirectory});
const closePools=async()=>{await companyDatabases?.end();await pool.end();};
const server = createApp(context, createAccountingService(pool, config.companyId), companyScope(pool, config.companyId,{automaticBackups,companyDatabases}), accessControl(createAccessService(mysqlAccessStore(pool))),{router:integrationRouter(pool,{...config.integrations,companyDatabases}),trustedProxies:config.integrations.trustedProxies}).listen(config.port, config.host, () => {
  automaticBackups.start();
  console.log(`Contabilidad: http://${config.host}:${config.port}`);
});
server.on('error', error => { console.error('Server failed:', error.code); process.exitCode = 1; Promise.all([automaticBackups.stop(),closeInvoicePdfRenderer()]).finally(closePools); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  server.close(async () => { await Promise.all([automaticBackups.stop(),closeInvoicePdfRenderer()]); await closePools(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
});
