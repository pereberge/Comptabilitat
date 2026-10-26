import {accessError} from './access-errors.js';
import { companyHeaders } from './company.js';
import { treasuryError } from '../locales/treasury.js';
export const documentStatus={draft:'Propuesta pendiente',posted:'Contabilizada',linked:'Vinculada a asiento existente'};
export function documentError(error){return accessError(error) || ({
 INVOICE_PDF_INVALID:'No se ha podido leer el PDF. Selecciona un PDF válido de hasta 5 MB.',
 INVOICE_PDF_TOO_MANY_PAGES:'El PDF puede tener hasta 20 páginas. Sube cada factura por separado.',
 INVOICE_PDF_TIMEOUT:'La lectura ha tardado demasiado. Inténtalo con un PDF más pequeño.',
 INVOICE_PDF_BUSY:'Hay otros documentos en lectura. Vuelve a intentarlo en unos segundos.',
 INVOICE_DOCUMENT_COMPANY_MISMATCH:'El titular de la factura no coincide con la empresa seleccionada. Cambia de empresa antes de subirla.',
 INVOICE_DOCUMENT_PREVIEW_EXPIRED:'La vista previa ha caducado. Vuelve a seleccionar el PDF.',
 INVOICE_DOCUMENT_CHANGED:'La propuesta ha cambiado. Cierra y vuelve a abrir el documento para revisarla.',
 INVOICE_DOCUMENT_INCOMPLETE:'Completa las fechas, los importes, los recibos y las cuentas antes de contabilizar.',
 INVOICE_DOCUMENT_ALREADY_POSTED:'Este documento ya tiene una factura vinculada.',
 INVOICE_DOCUMENT_DUPLICATE_CANDIDATE:'Existe un posible asiento de esta factura. Revísalo y vincúlalo para evitar duplicados.',
 INVOICE_DOCUMENT_ENTRY_CHANGED:'El asiento ha cambiado. Reabre la propuesta y comprueba la coincidencia.',
 INVOICE_DOCUMENT_EXISTING_INVOICE:'Ya existe una factura con esta referencia. Comprueba sus datos antes de vincular el documento.',
 INVOICE_DOCUMENT_CONTEXT_MISMATCH:'El documento pertenece a otra empresa, ejercicio o tipo de factura.',
 INVOICE_DOCUMENT_NOT_FOUND:'No se ha encontrado el documento en esta empresa.',
 INVOICE_DOCUMENT_CONFIRM_REQUIRED:'Revisa y confirma los datos antes de continuar.',
})[error?.code]||treasuryError(error);}
export async function previewInvoice(file,exerciseId){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
 try{const response=await fetch('/api/invoice-documents/preview?exercise_id='+encodeURIComponent(exerciseId),{method:'POST',headers:{...companyHeaders(),'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)},body:file,signal:controller.signal});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw {code:data.error?.code||'INVOICE_PDF_INVALID'};return data;
 }catch(error){if(!error.code)error.code='NETWORK_ERROR';throw error;}finally{clearTimeout(timeout);}
}
export async function invoicePdfUrl(id){const response=await fetch('/api/invoice-documents/'+id+'/source',{headers:companyHeaders()});if(!response.ok){const data=await response.json().catch(()=>({}));throw {code:data.error?.code||'NETWORK_ERROR'};}return URL.createObjectURL(await response.blob());}
