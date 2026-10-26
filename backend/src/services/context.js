import { createCompanyService } from './companies.js';
export function createContextService(db, companyId) {
  const companies = createCompanyService(db);
  return {
    ...companies,
    async getContext(selectedCompanyId = companyId) {
      const company = await companies.getCompany(selectedCompanyId);
      const [exercises] = await db.execute(
        'SELECT id, name, start_date, end_date, status, is_default FROM accounting_exercises WHERE company_id = ? ORDER BY start_date DESC',
        [selectedCompanyId],
      );
      return { company, exercises: exercises.map(row => ({ ...row, is_default: Boolean(row.is_default) })) };
    },
    async health() { await db.execute('SELECT 1'); return { status: 'ok', database: 'connected' }; },
  };
}
