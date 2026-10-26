import {api} from './accounting.js';
import {companyHeaders} from './company.js';
import {accessError} from './access-errors.js';
const base='/data-backups/automatic';
export const backupTypes={daily:'Diaria',weekly:'Semanal',monthly:'Mensual'};
export const automaticBackupSettings=()=>api(base+'/settings');
export const saveAutomaticBackupSettings=schedules=>api(base+'/settings',{method:'PUT',body:{schedules}});
export const automaticBackupList=query=>api(base+'/copies?'+new URLSearchParams(query));
export const runAutomaticBackup=body=>api(base+'/run',{method:'POST',timeoutMs:240000,body});
export const previewBackupDeletion=body=>api(base+'/delete-preview',{method:'POST',body});
export const deleteBackups=token=>api(base+'/delete',{method:'POST',timeoutMs:240000,body:{token,confirm:true}});
export function automaticBackupError(error){return accessError(error)||({
 BACKUP_INVALID_SCHEDULE:'Revisa la hora y el día de las tres programaciones.',
 BACKUP_INVALID_FILTER:'Selecciona al menos un tipo y revisa las fechas.',
 BACKUP_BUSY:'Se está preparando otra operación de copias en esta empresa. Espera y vuelve a intentarlo.',
 BACKUP_STORAGE_FULL:'No hay espacio suficiente en la carpeta de copias.',
 BACKUP_STORAGE_ERROR:'No se puede acceder al archivo o a la carpeta de copias del servidor. Revisa que esté disponible y tenga permiso de escritura.',
 BACKUP_COPY_NOT_FOUND:'Esta copia ya no está disponible. Actualiza el listado.',
 BACKUP_COPY_PENDING:'Esta copia tiene un borrado pendiente.',
 BACKUP_ARCHIVE_CHANGED:'El listado ha cambiado desde la revisión. Cierra esta ventana y revisa de nuevo las copias.',
 BACKUP_PREVIEW_EXPIRED:'La revisión ha caducado. Revisa de nuevo las copias antes de borrarlas.',
 BACKUP_PREVIEW_BUSY:'Hay demasiadas revisiones abiertas. Espera unos minutos y vuelve a intentarlo.',
 BACKUP_REQUEST_CONFLICT:'Esta petición corresponde a otra copia. Actualiza el listado antes de repetirla.',
 BACKUP_CHECKSUM:'El archivo está incompleto o ha sido modificado. Comprueba las demás copias.',
 BACKUP_TOO_LARGE:'La copia supera el límite de 100 MB de archivo o 256 MB descomprimidos.',
 EXERCISE_NOT_FOUND:'La empresa necesita al menos un ejercicio para crear una copia.',
 NETWORK_ERROR:'No se ha podido completar la conexión. Actualiza el listado antes de volver a intentarlo.',
})[error?.code]||'No se ha podido completar la operación de copias de seguridad.';}
export async function downloadAutomaticBackup(id,signal){
 const response=await fetch('/api'+base+'/copies/'+encodeURIComponent(id)+'/download',{headers:companyHeaders(),signal});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw {code:data.error?.code||'NETWORK_ERROR'};}
 const blob=await response.blob(),name=/filename="([^"]+)"/.exec(response.headers.get('content-disposition')||'')?.[1]||'copia-contabilidad.json.gz';
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
