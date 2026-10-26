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
 TOO_LARGE:'El archivo supera el límite de 10 MB.',
})[error?.code]||(error?.code?.startsWith('INVOICE_')?documentError(error):treasuryError(error));}
export const canTransferInvoice=row=>row.source_mime==='application/pdf'||/\.pdf$/i.test(row.source_name||'');
export const transferDocumentInvoice=(row,exerciseId)=>api('/documentation/'+row.id+'/to-invoices',{method:'POST',timeoutMs:90000,body:{version:row.version,exercise_id:exerciseId}});
export function fileSize(bytes){return bytes<1024?bytes+' B':bytes<1024*1024?(bytes/1024).toFixed(1)+' KB':(bytes/1024/1024).toFixed(1)+' MB';}
export async function uploadDocument(file,metadata){
 if(!file||!file.size||file.size>10*1024*1024)throw {code:'DOCUMENTATION_INVALID_FILE'};
 const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject({code:'DOCUMENTATION_INVALID_FILE'});reader.readAsDataURL(file);});
 return api('/documentation',{method:'POST',timeoutMs:90000,body:{...metadata,source_name:file.name,source_mime:file.type||'application/octet-stream',content_base64:encoded}});
}
export async function downloadFile(path,name){
 const response=await fetch('/api'+path,{headers:companyHeaders()});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw {code:data.error?.code||'NETWORK_ERROR'};}
 const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
