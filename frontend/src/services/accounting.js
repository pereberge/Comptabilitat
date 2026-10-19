import { companyHeaders } from './company.js';
export async function api(path, options={}) {
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/api'+path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...companyHeaders()},body:options.body?JSON.stringify(options.body):undefined});
  const data=await response.json().catch(()=>({error:{code:response.status===502||response.status===504?'NETWORK_ERROR':'SERVICE_UNAVAILABLE'}}));
  if(!response.ok)throw Object.assign(new Error('API'),{code:data.error?.code || 'SERVICE_UNAVAILABLE'});
  return data;
 }catch(error){if(!error.code||typeof error.code!=='string')error.code='NETWORK_ERROR';throw error;}
 finally{clearTimeout(timeout);}
}
