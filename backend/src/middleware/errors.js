export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: { code: error.code } });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'INVALID_JSON' } });
  if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: { code: 'DUPLICATE_RECORD' } });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE' } });
  if (error.code === 'ER_NO_SUCH_TABLE') return res.status(503).json({ error: { code: 'DATABASE_NOT_INITIALIZED' } });
  console.error('Request failed:', error.code || error.name);
  res.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE' } });
}
