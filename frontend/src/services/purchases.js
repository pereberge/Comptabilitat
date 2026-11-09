import {api} from './accounting.js';
import {companyHeaders} from './company.js';
import {accessError} from './access-errors.js';
import {treasuryError} from '../locales/treasury.js';
export const purchaseApi=(path,options={})=>api('/purchases'+path,{timeoutMs:60000,...options});
const errors={
 DATABASE_NOT_INITIALIZED:'La base de dades d’aquesta empresa no està preparada per a Compres. Cal aplicar les migracions pendents del mòdul abans de pujar factures.',
 SERVICE_UNAVAILABLE:'El servidor no ha pogut completar l’operació de Compres. Comprova que MySQL estigui disponible i que les migracions del mòdul estiguin aplicades.',
 PURCHASE_TOO_MANY_LINES:'El document supera el límit de línies: 40 per factura i 100 per comanda o albarà.',
 PURCHASE_INVALID_TYPE:'Tipus de document no vàlid.',PURCHASE_INVALID_AMOUNT:'Revisa quantitats, preus i percentatges. Quantitat i preu admeten fins a 6 decimals; el descompte, 5, i l’IVA, 2.',
 PURCHASE_INVALID_LINES:'Completa les línies del document.',PURCHASE_INVALID_ITEM:'Selecciona un article d’aquesta empresa.',PURCHASE_INVALID_UNIT:'Selecciona una unitat d’aquesta empresa.',
 PURCHASE_INVALID_SUPPLIER:'Selecciona un proveïdor amb subcompte 400 o 410.',PURCHASE_INVALID_LINK:'El vincle no correspon a un document confirmat del mateix article i proveïdor.',
 PURCHASE_QUANTITY_EXCEEDED:'La quantitat supera la disponible a la comanda, l’albarà o la línia. Actualitza i revisa els repartiments.',
 PURCHASE_NOT_FOUND:'No s’ha trobat el document en aquesta empresa.',PURCHASE_NOT_DRAFT:'Aquest document ja està confirmat o cancel·lat.',PURCHASE_CHANGED:'El document ha canviat. Tanca’l i torna a obrir-lo.',
 PURCHASE_REVIEW_REQUIRED:'Revisa el document original i marca la confirmació.',PURCHASE_DIFFERENCES_REVIEW:'Cal revisar i acceptar les diferències abans de confirmar.',
 PURCHASE_INCOMPLETE:'Completa referència, proveïdor, data, articles i preus abans de confirmar.',PURCHASE_DUPLICATE:'Ja existeix aquest codi o document del proveïdor. Revisa els duplicats.',
 PURCHASE_INVALID_SOURCE:'L’original no pertany a aquesta empresa.',PURCHASE_INVALID_FILE:'Selecciona un PDF, JPG o PNG real de fins a 10 MB.',
 PURCHASE_TOO_MANY_PAGES:'El document supera les 20 pàgines.',PURCHASE_IMAGE_TOO_LARGE:'La imatge és massa gran per llegir-la amb seguretat.',PURCHASE_TEXT_TOO_LARGE:'El document conté massa text.',
 PURCHASE_OCR_TIMEOUT:'S’ha esgotat el temps de lectura. Divideix el document o redueix-ne la resolució.',PURCHASE_OCR_FAILED:'No s’ha pogut llegir el document. L’original es conserva i pots completar les dades manualment.',
 PURCHASE_HAS_DEPENDENCIES:'Hi ha altres documents vinculats. Revisa’ls abans de cancel·lar.',PURCHASE_INVOICE_POSTED:'La factura ja està comptabilitzada. Gestiona’n l’anul·lació des de Factures.',
 PURCHASE_WRONG_COMPANY:'El destinatari del document correspon a una altra empresa. Revisa l’empresa seleccionada.',
 PURCHASE_OCR_PENDING:'El reconeixement continua pendent al servidor. Pots tornar a comprovar-lo sense pujar el fitxer de nou.',
 PURCHASE_INVALID_RESPONSE:'No s’ha pogut recuperar la proposta. Torna a comprovar el treball existent.',
 NETWORK_ERROR:'S’ha interromput la connexió. Pots reprendre l’operació; es comprovarà el treball existent per evitar duplicats.',
};
export const purchaseError=error=>accessError(error)||errors[error.code]||treasuryError(error);
export async function uploadPurchase(file,key,{signal,forceOcr=false}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 const abort=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});
 try{
  const response=await fetch('/api/purchases/ocr',{method:'POST',body:file,signal:controller.signal,headers:{...companyHeaders(),'Content-Type':/\.pdf$/i.test(file.name)?'application/pdf':/\.png$/i.test(file.name)?'image/png':'image/jpeg','X-File-Name':encodeURIComponent(file.name),'X-Request-Id':key,'X-Ocr-Mode':forceOcr?'tesseract':'auto'}});
  const result=await response.json().catch(()=>null);if(!response.ok)throw {code:result?.error?.code||'NETWORK_ERROR'};
  if(!Number.isSafeInteger(result?.id)||result.id<1||!['queued','running','done','error'].includes(result.status))throw {code:'PURCHASE_INVALID_RESPONSE'};
  return result;
 }catch(error){if(typeof error?.code==='string')throw error;throw {code:'NETWORK_ERROR'};}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
