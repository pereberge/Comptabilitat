import { companyHeaders } from './company.js';
export async function previewPdf(file,prefixLength) {
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try {
  const response=await fetch('/api/account-import/preview?'+new URLSearchParams({prefix_length:prefixLength}),{method:'POST',body:file,headers:{'Content-Type':'application/pdf',...companyHeaders()},signal:controller.signal});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error('PDF'),{code:data.error?.code||'SERVICE_UNAVAILABLE'});
  return data;
 }catch(error){if(!error.code||typeof error.code!=='string')error.code='NETWORK_ERROR';throw error;}
 finally{clearTimeout(timer);}
}
