import {accessError} from './access-errors.js';
import { api } from './accounting.js';
import { companyHeaders } from './company.js';
export const backupCounts={
 accounting_exercises:'Ejercicios',accounts:'Cuentas y subcuentas',journal_entries:'Asientos',journal_lines:'Apuntes',
 trade_invoices:'Facturas',portfolio_receipts:'Recibos',portfolio_settlements:'Cobros y pagos',
 invoice_documents:'PDF de facturas y propuestas',journal_imports:'Libros diarios originales',bank_reconciliations:'Conciliaciones y extractos',
 company_documents:'Documentación común',exercise_operations:'Operaciones de apertura y cierre',suppliers:'Fichas de proveedores',bank_connections:'Cuentas bancarias',
};
export function backupError(error){return accessError(error) || ({
 BACKUP_INVALID_FILE:'Selecciona una copia de esta aplicación (.json.gz o .json).',
 BACKUP_CHECKSUM:'El archivo está incompleto o ha sido modificado. Selecciona la copia original.',
 BACKUP_SCHEMA_MISMATCH:'La copia no es compatible con la estructura de esta versión de la aplicación.',
 BACKUP_INVALID_ACCOUNTING:'La copia contiene importes o asientos que no cuadran. No se ha importado ningún dato.',
 BACKUP_BROKEN_LINKS:'La copia contiene vínculos incompletos. No se ha importado ningún dato.',
 BACKUP_SCOPE_MISMATCH:'Marca los mismos ejercicios que contiene la copia o selecciona todos los ejercicios para recuperar el contenido completo del archivo.',
 BACKUP_INVALID_SCOPE:'Marca al menos un ejercicio válido para la copia.',
 BACKUP_DESTINATION_NOT_EMPTY:'El destino ya contiene datos. Marca «Sustituir los datos existentes» y revisa de nuevo la copia.',
 BACKUP_REPLACEMENT_CODE:'Escribe exactamente 96 para confirmar la sustitución.',
 BACKUP_REPLACEMENT_DEPENDENCIES:'Hay vínculos con otros ejercicios. Revisa el resumen e incluye también esos períodos en la copia.',
 BACKUP_DESTINATION_CHANGED:'Los datos de destino han cambiado desde la revisión. Vuelve a revisar el archivo.',
 BACKUP_PREVIEW_EXPIRED:'La revisión ha caducado. Selecciona de nuevo el archivo.',
 BACKUP_PREVIEW_BUSY:'Hay varias copias en revisión. Cierra una y vuelve a intentarlo.',
 BACKUP_CONFIRM_REQUIRED:'Revisa y confirma la empresa y los ejercicios antes de importar.',
 BACKUP_TOO_LARGE:'La copia supera el límite admitido (100 MB de archivo o 256 MB descomprimidos).',
 TOO_LARGE:'El archivo supera el límite de 100 MB.',
 EXERCISE_NOT_FOUND:'El ejercicio ya no está disponible en la empresa seleccionada.',
 NETWORK_ERROR:'No se ha podido completar la conexión. Puedes reintentar la misma operación.',
})[error?.code]||'No se ha podido completar la operación. No se ha importado ningún dato.';}
async function checked(response){
 if(response.ok)return response;
 const data=await response.json().catch(()=>({}));throw {code:data.error?.code||'NETWORK_ERROR'};
}
export async function downloadDataBackup(exerciseId,signal){
 const response=await checked(await fetch('/api/data-backups/export?exercise_id='+encodeURIComponent(exerciseId),{headers:companyHeaders(),signal}));
 const blob=await response.blob(),name=/filename="([^"]+)"/.exec(response.headers.get('content-disposition')||'')?.[1]||'copia-contabilidad.json.gz';
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 return {name,size:blob.size};
}
export async function previewDataBackup(file,exerciseId,signal,replaceExisting=false){
 if(!file||!file.size||file.size>100*1024*1024)throw {code:'BACKUP_INVALID_FILE'};
 const response=await checked(await fetch('/api/data-backups/preview?exercise_id='+encodeURIComponent(exerciseId)+'&replace_existing='+(replaceExisting?'1':'0'),{method:'POST',headers:{...companyHeaders(),'Content-Type':'application/octet-stream'},body:file,signal}));
 return response.json();
}
export const discardDataBackup=token=>api('/data-backups/discard',{method:'POST',body:{token}});
export const restoreDataBackup=body=>api('/data-backups/restore',{method:'POST',timeoutMs:240000,body});
