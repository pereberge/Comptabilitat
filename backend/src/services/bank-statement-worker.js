import { parentPort, workerData } from 'node:worker_threads';
import { extractBankPdf } from './bank-statement.js';
try{parentPort.postMessage({type:'bank-result',data:await extractBankPdf(workerData)});}
catch(error){parentPort.postMessage({type:'bank-result',error:error.message?.startsWith('BANK_STATEMENT_')?error.message:'BANK_STATEMENT_INVALID_PDF'});}
