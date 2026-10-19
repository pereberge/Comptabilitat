let activeCompanyId = '';
export function setCompanyId(id) { activeCompanyId = String(id || ''); }
export function companyHeaders() { return activeCompanyId ? { 'X-Company-Id': activeCompanyId } : {}; }
