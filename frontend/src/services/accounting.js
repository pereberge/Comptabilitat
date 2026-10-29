import { companyHeaders } from './company.js';
import {invalidateAccess,refreshAccess} from '../composables/access.js';
export async function api(path, options={}) {
 const {timeoutMs=15000,...requestOptions}=options;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetch('/api'+path,{...requestOptions,signal:controller.signal,headers:{'Content-Type':'application/json',...companyHeaders()},body:options.body?JSON.stringify(options.body):undefined});
  const data=await response.json().catch(()=>({error:{code:response.status===502||response.status===504?'NETWORK_ERROR':'SERVICE_UNAVAILABLE'}}));
  if(!response.ok){if(response.status===401&&data.error?.code==='ACCESS_LOGIN_REQUIRED')invalidateAccess();if(data.error?.code==='ACCESS_COMPANY_DENIED')void refreshAccess();throw Object.assign(new Error('API'),{code:data.error?.code || 'SERVICE_UNAVAILABLE'});}
  return data;
 }catch(error){if(!error.code||typeof error.code!=='string')error.code='NETWORK_ERROR';throw error;}
 finally{clearTimeout(timeout);}
}
