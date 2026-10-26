import {parentPort,workerData} from 'node:worker_threads';
import {extractInvoicePdf} from './invoice-pdf.js';
try{parentPort.postMessage({type:'invoice-pdf',data:await extractInvoicePdf(workerData)});}
catch(error){parentPort.postMessage({type:'invoice-pdf',error:error.message?.startsWith('INVOICE_PDF_')?error.message:'INVOICE_PDF_INVALID'});}
