import {companyHeaders} from './company.js';
import {invalidateAccess,refreshAccess} from '../composables/access.js';

export async function requestVatFiling(model,filing,signal){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000),abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
 try{
  const query=new URLSearchParams({year:String(model.period.year),frequency:model.period.frequency,period:String(model.period.period)});
  const response=await fetch('/api/tax/vat/filing?'+query,{method:'POST',headers:{'Content-Type':'application/json',...companyHeaders()},signal:controller.signal,body:JSON.stringify({input:model.input,model_hash:model.model_hash,filing})});
  if(!response.ok){const data=await response.json().catch(()=>({})),code=data.error?.code||'SERVICE_UNAVAILABLE';if(code==='ACCESS_LOGIN_REQUIRED')invalidateAccess();if(code==='ACCESS_COMPANY_DENIED')void refreshAccess();throw Object.assign(new Error(code),{code});}
  const filename=response.headers.get('Content-Disposition')?.match(/filename="([A-Z0-9]{9}_20\d{2}_(?:[1-4]T|0[1-9]|1[0-2])\.303)"/)?.[1];
  if(!filename)throw Object.assign(new Error(),{code:'INVALID_VAT_FILING'});
  return {blob:await response.blob(),filename};
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
}
