import {Worker} from 'node:worker_threads';
import {HttpError} from '../middleware/errors.js';
export function purchaseDocumentMime(buffer){
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>10*1024*1024)throw new HttpError(400,'PURCHASE_INVALID_FILE');
 if(/%PDF-\d\.\d\b/.test(buffer.subarray(0,1024).toString('latin1')))return 'application/pdf';
 if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)return 'image/jpeg';
 throw new HttpError(400,'PURCHASE_INVALID_FILE');
}
export function readPurchaseDocument(buffer,{forceOcr=false}={}){
 const mime=purchaseDocumentMime(buffer);
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./purchase-document-worker.js',import.meta.url),{workerData:{buffer,mime,forceOcr:forceOcr===true},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:768}});let finished=false;
  const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(result);};
  const timer=setTimeout(()=>finish(new HttpError(400,'PURCHASE_OCR_TIMEOUT')),180000);
  // Node --watch also posts dependency reports from workers. Only our own
  // terminal messages can finish recognition; a watch report has no result.
  worker.on('message',message=>{if(message?.type!=='purchase-document-result')return;finish(message.error?new HttpError(400,message.error):message.result?null:new HttpError(400,'PURCHASE_OCR_FAILED'),message.result);});worker.once('error',error=>{console.error('Purchase document worker failed:',error.code||error.name,error.stack);finish(new HttpError(400,'PURCHASE_OCR_FAILED'));});worker.once('exit',()=>{if(!finished)finish(new HttpError(400,'PURCHASE_OCR_FAILED'));});
 });
}
