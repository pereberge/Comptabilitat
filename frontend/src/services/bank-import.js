import { companyHeaders } from './company.js';
import { api } from './accounting.js';
export async function previewBankStatement(file,exerciseId) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
  try{
    const pdf=/\.pdf$/i.test(file.name),response=await fetch('/api/bank-import/preview?'+new URLSearchParams({exercise_id:exerciseId}),{
      method:'POST',body:file,signal:controller.signal,headers:{...companyHeaders(),'Content-Type':pdf?'application/pdf':'text/csv','X-File-Name':encodeURIComponent(file.name)},
    });
    const data=await response.json();if(!response.ok)throw Object.assign(new Error('Bank import'),{code:data.error?.code||'SERVICE_UNAVAILABLE'});return data;
  }catch(error){if(typeof error.code!=='string')error.code='NETWORK_ERROR';throw error;}finally{clearTimeout(timer);}
}
export const analyzeBankStatement=body=>api('/bank-import/analyze',{method:'POST',body,timeoutMs:60000});
export const saveBankStatement=token=>api('/bank-import/commit',{method:'POST',body:{token},timeoutMs:60000});
export const discardBankStatement=token=>api('/bank-import/discard',{method:'POST',body:{token}}).catch(()=>{});
const errors={
 BANK_STATEMENT_UNSUPPORTED_CURRENCY:'La contabilidad trabaja en euros. Este extracto indica otra divisa.',
 BANK_STATEMENT_ZERO_MOVEMENT:'El PDF incluye un movimiento de importe cero que no se puede conciliar con este formato. Prueba el CSV de movimientos contabilizados.',
 BANK_STATEMENT_TOO_MANY_PAGES:'El PDF supera las 100 páginas. Divide el extracto por períodos.',
 TOO_LARGE:'Selecciona un archivo de hasta 5 MB.',
 BANK_STATEMENT_TOO_LARGE:'Selecciona un archivo PDF o CSV de hasta 5 MB.',BANK_STATEMENT_UNSUPPORTED_FILE:'Selecciona un PDF o un CSV bancario.',
 BANK_STATEMENT_INVALID_PDF:'No se ha podido leer el PDF. Comprueba que sea un extracto con texto y que no esté protegido.',
 BANK_STATEMENT_SCANNED_PDF:'Este PDF es una imagen escaneada. Exporta el extracto como PDF con texto o como CSV.',
 BANK_STATEMENT_UNSUPPORTED_PDF:'No se reconoce la tabla del PDF. Puedes subir el CSV del banco con fecha, concepto, importe y saldo.',
 BANK_STATEMENT_UNSUPPORTED_CSV:'El CSV necesita fecha, concepto, importe (o debe y haber) y saldo. Se admiten punto y coma, coma o tabulador.',
 BANK_STATEMENT_INVALID_CSV:'El CSV contiene filas incompletas o importes o fechas no válidos.',
 BANK_STATEMENT_MISSING_COLUMNS:'Hay filas del PDF que no se pueden leer con seguridad. Usa el CSV del banco.',
 BANK_STATEMENT_BALANCE_MISMATCH:'Los importes no explican todos los saltos de saldo. Comprueba que el extracto esté completo y sin filtros.',
 BANK_STATEMENT_PERIOD_MISMATCH:'El archivo no contiene movimientos del ejercicio seleccionado. Cambia de ejercicio y vuelve a subirlo.',
 BANK_STATEMENT_INVALID_IBAN:'El IBAN leído no pasa la comprobación. Revisa el documento.',
 BANK_STATEMENT_MULTIPLE_ACCOUNTS:'El archivo contiene varias cuentas. Sube un extracto por cuenta.',
 BANK_STATEMENT_NO_MOVEMENTS:'No se han encontrado movimientos válidos o el archivo supera los 10.000 movimientos.',
 BANK_STATEMENT_TIMEOUT:'El PDF tarda demasiado en leerse. Prueba con un extracto más pequeño o con CSV.',
 BANK_STATEMENT_BUSY:'Hay varios extractos en proceso. Inténtalo de nuevo en unos instantes.',
 BANK_PREVIEW_EXPIRED:'La revisión ha caducado. Vuelve a subir el extracto.',BANK_ANALYSIS_REQUIRED:'Revisa la conciliación antes de guardarla.',
 BANK_ACCOUNT_MISMATCH:'Esta cuenta bancaria ya está vinculada a otra subcuenta de la empresa. Selecciona la subcuenta vinculada.',
 BANK_NAME_REQUIRED:'Indica el nombre del banco para crear su subcuenta.',INVALID_BANK_ACCOUNT:'Selecciona una subcuenta bancaria de esta empresa o crea una nueva.',
 RECONCILIATION_LEDGER_CHANGED:'La contabilidad ha cambiado desde la revisión. Pulsa Preparar conciliación para actualizarla antes de guardar.',
};
export const bankImportError=error=>errors[error.code]||'No se ha podido completar la operación. Comprueba la conexión y vuelve a intentarlo.';
