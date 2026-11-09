import {api} from './accounting.js';
import {companyHeaders} from './company.js';
const root='/supplier-invoices';
export const supplierInvoices={
 list:query=>api(root+'?'+new URLSearchParams(query)),
 get:id=>api(root+'/'+id),
 save:(id,body)=>api(root+'/'+id,{method:'PUT',body}),
 classify:(id,kind,version)=>api(root+'/'+id+'/classification',{method:'POST',body:{kind,version}}),
 validate:(id,version)=>api(root+'/'+id+'/validate',{method:'POST',body:{version}}),
 mailboxes:()=>api(root+'/mailboxes'),errors:()=>api(root+'/errors'),
 configure:body=>api(root+'/mailboxes',{method:'POST',body}),
 authorize:id=>api(root+'/mailboxes/'+id+'/authorize',{method:'POST'}),
 complete:body=>api(root+'/oauth/complete',{method:'POST',body}),
 disconnect:id=>api(root+'/mailboxes/'+id+'/authorization',{method:'DELETE'}),
 sync:(id,exercise_id)=>api(root+'/mailboxes/'+id+'/sync',{method:'POST',body:{exercise_id},timeoutMs:600000}),
 async upload(file,exerciseId){const response=await fetch('/api'+root+'/import?exercise_id='+encodeURIComponent(exerciseId),{method:'POST',headers:{...companyHeaders(),'Content-Type':'application/pdf','X-File-Name':encodeURIComponent(file.name)},body:file});const data=await response.json();if(!response.ok)throw {code:data.error?.code};return data;},
 async pdf(id){const response=await fetch('/api'+root+'/'+id+'/source',{headers:companyHeaders()});if(!response.ok)throw {code:'INVOICE_PDF_SOURCE_NOT_FOUND'};return URL.createObjectURL(await response.blob());},
};
const errors={
 SUPPLIER_DOCUMENT_LOCKED:'El document ja està validat o comptabilitzat.',SUPPLIER_NOT_INVOICE:'Marca el document com a factura abans de validar.',
 INVOICE_DOCUMENT_CHANGED:'El document ha canviat. Torna a obrir-lo.',GMAIL_NOT_CONFIGURED:'Falta configurar OAuth de Gmail al servidor.',GMAIL_REAUTHORIZE:'Cal autoritzar de nou aquesta bústia.',GMAIL_STATE_INVALID:'L’autorització ha caducat o correspon a una altra empresa o usuari. Torna a connectar la bústia.',GMAIL_ACCOUNT_MISMATCH:'El compte autoritzat no coincideix amb la bústia.',GMAIL_BUSY:'Hi ha una sincronització en curs o cal esperar abans de reintentar.',
 INTEGRATION_TOTAL_MISMATCH:'El total ha de coincidir exactament amb bases + impostos − retencions.',INTEGRATION_INVALID_DATE:'Revisa les dates i el venciment.',INTEGRATION_INVALID_TAX_ID:'Revisa el NIF del proveïdor.',INTEGRATION_TAX_MISMATCH:'Revisa les quotes dels impostos.',INTEGRATION_WITHHOLDING_MISMATCH:'Revisa els imports de les retencions.',INTEGRATION_INVALID_FIELD:'Completa i revisa els camps de la factura.',INTEGRATION_INVALID_TAXES:'Revisa el desglossament fiscal.',INTEGRATION_LINES_MISMATCH:'Les línies opcionals han de coincidir amb el desglossament fiscal.',
};
export const supplierError=error=>errors[error?.code]||'No s’ha pogut completar l’operació ('+(error?.code||'NETWORK_ERROR')+').';
