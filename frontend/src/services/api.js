import {invalidateAccess} from '../composables/access.js';
export async function getContext(companyId) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api/context', { signal: controller.signal, headers: companyId ? { 'X-Company-Id': String(companyId) } : {} });
    const data = await response.json();
    if (!response.ok){if(response.status===401&&data.error?.code==='ACCESS_LOGIN_REQUIRED')invalidateAccess();throw Object.assign(new Error('API error'), { code: data.error?.code || 'SERVICE_UNAVAILABLE' });}
    return data;
  } catch (error) {
    if (!error.code || typeof error.code !== 'string') error.code = 'NETWORK_ERROR';
    throw error;
  } finally { clearTimeout(timeout); }
}
