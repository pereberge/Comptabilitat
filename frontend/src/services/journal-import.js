import { companyHeaders } from './company.js';
async function request(path, options) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('/api/journal-import/' + path, {...options,signal:controller.signal,headers:{...companyHeaders(),...options.headers}});
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error('Import'),{code:data.error?.code || 'SERVICE_UNAVAILABLE'});
    return data;
  } catch (cause) { if (!cause.code || typeof cause.code !== 'string') cause.code='NETWORK_ERROR'; throw cause; }
  finally { clearTimeout(timer); }
}
export const previewJournal = (file, exerciseId) => request('preview?exercise_id=' + exerciseId, {method:'POST',headers:{'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)},body:file});
export const commitJournal = token => request('commit', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
