import { HttpError } from '../middleware/errors.js';
export function createContextService(db, companyId) {
  return {
    async getContext(selectedCompanyId = companyId) {
      const [companies] = await db.execute('SELECT id, name, subaccount_length FROM companies WHERE id = ?', [selectedCompanyId]);
      if (!companies.length) throw new HttpError(404, 'COMPANY_NOT_FOUND');
      const [exercises] = await db.execute(
        'SELECT id, name, start_date, end_date, status, is_default FROM accounting_exercises WHERE company_id = ? ORDER BY start_date DESC',
        [selectedCompanyId],
      );
      return { company: companies[0], exercises: exercises.map(row => ({ ...row, is_default: Boolean(row.is_default) })) };
    },
    async listCompanies() { const [rows] = await db.execute('SELECT id, name FROM companies ORDER BY name, id'); return rows; },
    async health() { await db.execute('SELECT 1'); return { status: 'ok', database: 'connected' }; },
  };
}
