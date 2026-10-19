import { createAccountImportService } from '../services/account-import.js';
import { createReportService } from '../services/reports.js';
import { HttpError } from './errors.js';
import { createAccountingService } from '../services/accounting.js';

// Scope belongs to the request, never to global server state.
export function companyScope(db, defaultCompanyId) {
  return async (req, res, next) => {
    if (req.path === '/health' || req.path === '/companies') return next();
    const value = req.get('X-Company-Id') ?? String(defaultCompanyId);
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new HttpError(400, 'INVALID_COMPANY');
    const companyId = Number(value);
    const [[company]] = await db.execute('SELECT id FROM companies WHERE id=?', [companyId]);
    if (!company) throw new HttpError(404, 'COMPANY_NOT_FOUND');
    req.companyId = companyId;
    req.accountImport = createAccountImportService(db, companyId);
    req.reports = createReportService(db, companyId);
    req.accounting = createAccountingService(db, companyId);
    next();
  };
}
