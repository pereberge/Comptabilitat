import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/api.js';
import { errorHandler } from './middleware/errors.js';
export function createApp(service, accounting, companyScope) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
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
