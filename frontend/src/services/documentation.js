import {accessError} from './access-errors.js';
import { api } from './accounting.js';
import { companyHeaders } from './company.js';
import { treasuryError } from '../locales/treasury.js';
import {documentError} from './invoice-documents.js';

export function documentationError(error){return accessError(error) || ({
 DOCUMENTATION_INVALID_FILE:'Selecciona un archivo válido de hasta 10 MB.',
 DOCUMENTATION_INVALID_METADATA:'Escribe un título de hasta 200 caracteres y una descripción de hasta 4.000.',
 DOCUMENTATION_NOT_FOUND:'Este documento ya no está disponible en la empresa seleccionada.',
 DOCUMENTATION_CHANGED:'El documento ha cambiado. Actualiza la lista y vuelve a abrirlo.',
 DOCUMENTATION_INVALID_FOLDER:'Selecciona el apartado de documentación. Solo las facturas pendientes o gestionadas pueden cambiar de estado.',
 DOCUMENTATION_INVOICE_PDF_REQUIRED:'El paso directo a Facturas está disponible para archivos PDF.',
 DOCUMENTATION_INVOICE_EXERCISE_REQUIRED:'Crea el ejercicio correspondiente a la fecha de la factura antes de pasarla a Facturas.',
 DOCUMENTATION_COMPANY_REVIEW_REQUIRED:'La factura no coincide con esta empresa. Comprueba la empresa de destino antes de guardarla.',
 DOCUMENTATION_COMPANY_CHANGED:'Han cambiado los datos de las empresas o del documento. Vuelve a comprobar la empresa antes de guardar.',
 DOCUMENTATION_COMPANY_BUSY:'Se están leyendo otros documentos. Vuelve a comprobar la empresa en unos segundos.',
 DOCUMENTATION_COMPANY_DUPLICATE:'Este mismo archivo ya está guardado en la empresa de destino. Revísalo allí antes de trasladarlo otra vez.',
 DOCUMENTATION_COMPANY_LINKED:'Esta factura ya se ha pasado a Facturas en la empresa actual. Revisa su propuesta o contabilización antes de trasladar el documento.',
 DOCUMENTATION_ROUTING_PENDING_ONLY:'Solo se pueden trasladar a otra empresa los documentos que se guardan como facturas pendientes.',
 TOO_LARGE:'El archivo supera el límite de 10 MB.',
})[error?.code]||(error?.code?.startsWith('INVOICE_')?documentError(error):treasuryError(error));}
export const canTransferInvoice=row=>row.source_mime==='application/pdf'||/\.pdf$/i.test(row.source_name||'');
export const transferDocumentInvoice=(row,exerciseId)=>api('/documentation/'+row.id+'/to-invoices',{method:'POST',timeoutMs:90000,body:{version:row.version,exercise_id:exerciseId}});
export function fileSize(bytes){return bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':(bytes/1024/1024).toFixed(1)+' MB';}
const encodedFiles=new WeakMap();
async function encodedFile(file){
 if(!file||!file.size||file.size>10*1024*1024)throw {code:'DOCUMENTATION_INVALID_FILE'};
 if(!encodedFiles.has(file))encodedFiles.set(file,new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>{encodedFiles.delete(file);reject({code:'DOCUMENTATION_INVALID_FILE'});};reader.readAsDataURL(file);}));
 return encodedFiles.get(file);
}
export async function previewDocumentCompany(file){return api('/documentation/preview',{method:'POST',timeoutMs:90000,body:{content_base64:await encodedFile(file)}});}
export async function uploadDocument(file,metadata){
 const encoded=await encodedFile(file);
 return api('/documentation',{method:'POST',timeoutMs:90000,body:{...metadata,source_name:file.name,source_mime:file.type||'application/octet-stream',content_base64:encoded}});
}
export const needsCompanyReview=check=>['other','ambiguous','mismatch'].includes(check?.status);
export function documentCompanyMessage(check){
 if(!check)return '';
 if(check.status==='other')return 'Esta factura corresponde a otra empresa del programa: '+check.matches[0].name+'. Revisa el destino antes de guardarla.';
 if(check.status==='ambiguous')return 'La factura identifica varias empresas del programa. Selecciona en cuál debe guardarse.';
 if(check.status==='mismatch')return 'Los datos fiscales de la factura no coinciden con la empresa actual. No se ha encontrado una empresa de destino entre las que tienes acceso.';
 if(check.status==='unknown')return check.reason==='multiple_invoices'?'El PDF contiene varias referencias de factura. Separa las facturas para comprobar su empresa.':'No se ha podido identificar la empresa de esta factura. Revisa el original; se conservará en la empresa que tienes seleccionada.';
 return 'Empresa identificada: '+check.current_company.name+'.';
}
export async function downloadFile(path,name){
 const response=await fetch('/api'+path,{headers:companyHeaders()});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw {code:data.error?.code||'NETWORK_ERROR'};}
 const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
