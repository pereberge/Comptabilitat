import {parentPort,workerData} from 'node:worker_threads';
import {extractFarmPdf} from './farm-pdf.js';
try{parentPort.postMessage({type:'farm-result',data:await extractFarmPdf(Buffer.from(workerData))});}
catch(error){parentPort.postMessage({type:'farm-result',error:error.message?.startsWith('FARM_PDF_')?error.message:'FARM_PDF_INVALID',page:error.page});}
