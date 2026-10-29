import {companyHeaders} from './company.js';
export async function downloadRemittance(row){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch('/api/bank-remittances/'+row.id+'/file',{headers:companyHeaders(),signal:controller.signal});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw Object.assign(new Error('Remittance download'),{code:data.error?.code||'NETWORK_ERROR'});}
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=row.filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }catch(error){if(typeof error.code!=='string')error.code='NETWORK_ERROR';throw error;}finally{clearTimeout(timeout);}
}
