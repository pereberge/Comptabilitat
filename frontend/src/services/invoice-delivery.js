import {accessError} from './access-errors.js';
import {companyHeaders} from './company.js';
export function invoiceDeliveryError(error){return accessError(error) || ({
 INVOICE_DELIVERY_INVALID:'Revisa el PDF seleccionado para la factura.',INVOICE_EMAIL_INVALID:'Revisa los datos del correo.',INVOICE_EMAIL_ADDRESS:'Escribe una dirección de correo válida.',INVOICE_EMAIL_SUBJECT:'Completa el asunto del correo, con un máximo de 200 caracteres.',INVOICE_EMAIL_MESSAGE:'El mensaje admite hasta 6.000 caracteres.',INVOICE_PDF_SOURCE_NOT_FOUND:'El PDF original ya no está disponible en esta factura.',INVOICE_PDF_BROWSER:'No se puede abrir el generador de PDF del servidor. Puedes utilizar Imprimir y elegir Guardar como PDF.',INVOICE_PDF_BUSY:'Se están preparando otros PDF. Vuelve a intentarlo en unos segundos.',INVOICE_PDF_GENERATION:'No se ha podido preparar el PDF. Puedes utilizar Imprimir y elegir Guardar como PDF.',INVOICE_PDF_TOO_LARGE:'El PDF supera el tamaño admitido.',INVOICE_NOT_FOUND:'La factura no está disponible en esta empresa.',NETWORK_ERROR:'No se ha podido completar la conexión. Vuelve a intentarlo.',
 })[error?.code]||'No se ha podido preparar la factura para imprimir o enviar.';}
function query(options={}){const params=new URLSearchParams();if(options.source)params.set('source',options.source);if(options.document_id)params.set('document_id',String(options.document_id));return params.size?'?'+params:'';}
async function response(path,options={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
 try{const result=await fetch('/api'+path,{...options,headers:{...companyHeaders(),...(options.body?{'Content-Type':'application/json'}:{})},body:options.body?JSON.stringify(options.body):undefined,signal:controller.signal});if(!result.ok){const data=await result.json().catch(()=>({}));throw Object.assign(new Error('Delivery failed'),{code:data.error?.code||'NETWORK_ERROR'});}return {body:await result.blob(),filename:/filename="([^"]+)"/.exec(result.headers.get('content-disposition')||'')?.[1]};}
 catch(error){if(typeof error.code!=='string')error.code='NETWORK_ERROR';throw error;}
 finally{clearTimeout(timeout);}
}
function download(blob,filename){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return {filename,size:blob.size};}
export async function downloadInvoicePdf(invoiceId,options){const file=await response('/invoices/'+invoiceId+'/pdf'+query(options));return download(file.body,file.filename||'factura.pdf');}
export async function downloadInvoiceEmail(invoiceId,body){const file=await response('/invoices/'+invoiceId+'/email-draft',{method:'POST',body});return download(file.body,file.filename||'factura.eml');}
export function invoiceMailto({to,subject,message}){return 'mailto:'+encodeURIComponent(to||'')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(message);}
export async function printInvoice(invoiceId){
 const file=await response('/invoices/'+invoiceId+'/print'),html=await file.body.text(),frame=document.createElement('iframe');frame.title='Impresión de factura';frame.className='invoice-print-frame';frame.setAttribute('aria-hidden','true');Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'210mm',height:'297mm',border:'0'});
 let timer;const cleanup=()=>{clearTimeout(timer);frame.remove();};
 try{
  await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Print load timeout')),15000);frame.onload=()=>{clearTimeout(timer);resolve();};frame.srcdoc=html;document.body.append(frame);});
  await Promise.all([...frame.contentDocument.images].map(image=>image.decode().catch(()=>{})));await frame.contentDocument.fonts?.ready;
  frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});timer=setTimeout(cleanup,120000);frame.contentWindow.focus();frame.contentWindow.print();
 }catch(error){cleanup();throw error;}
}