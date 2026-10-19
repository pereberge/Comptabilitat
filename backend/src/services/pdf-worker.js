import { parentPort, workerData } from 'node:worker_threads';
import { extractPdf } from './pdf-accounts.js';
try { parentPort.postMessage({data:await extractPdf(workerData)}); }
catch(error) { parentPort.postMessage({error:error.message?.startsWith('PDF_')?error.message:'PDF_INVALID'}); }
