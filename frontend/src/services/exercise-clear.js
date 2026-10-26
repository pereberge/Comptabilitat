import {accessError} from './access-errors.js';
import { companyHeaders } from './company.js';
import { exerciseError } from '../locales/exercises.js';
export function clearError(error){return accessError(error) || ({
 EXERCISE_CLEAR_CODE:'Escribe exactamente 96 para confirmar el borrado.',
 EXERCISE_CLEAR_PREVIEW_REQUIRED:'Revisa el resumen del período antes de borrar.',
 EXERCISE_CLEAR_STALE:'La contabilidad ha cambiado. Actualiza el resumen y vuelve a escribir 96.',
 EXERCISE_CLEAR_DEPENDENCIES:'Hay movimientos relacionados en otros ejercicios. Actualiza el resumen para ver qué debes resolver.',
 EXERCISE_CLEAR_EMPTY:'El período ya está vacío.',
 EXERCISE_CLEAR_NOT_FOUND:'La copia no está disponible en esta empresa.',
 })[error?.code]||exerciseError(error);}
export async function downloadExerciseBackup(clearId){
 const response=await fetch('/api/exercise-clears/'+clearId+'/backup',{headers:companyHeaders()});
 if(!response.ok){const data=await response.json().catch(()=>({}));throw {code:data.error?.code||'NETWORK_ERROR'};}
 const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='copia-contabilidad-'+clearId+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
