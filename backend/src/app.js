import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';
import { errorHandler } from './middleware/errors.js';
export function createApp(service, accounting, companyScope, access) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/companies', express.json({ limit: '3mb' }));
  app.post('/api/documentation', express.json({ limit: '15mb' }));
  app.post('/api/data-backups/preview', express.raw({ type: 'application/octet-stream', limit: '100mb' }));
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  if (access) { app.use('/api/access', access.router); app.use('/api', access.middleware); }
  if (companyScope) app.use('/api', companyScope);
  app.use('/api', apiRouter(service, accounting));
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND' } }));
  const dist = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(`${dist}/index.html`));
  }
  app.use(errorHandler);
  return app;
}
