import {Worker} from 'node:worker_threads';
import {HttpError} from '../middleware/errors.js';
export function readBankStatementPdf(buffer){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./bank-statement-worker.js',import.meta.url),{workerData:buffer,execArgv:[],resourceLimits:{maxOldGenerationSizeMb:256}});
  let done=false;const timer=setTimeout(()=>finish(new HttpError(400,'BANK_STATEMENT_TIMEOUT')),30000);
  function finish(error,data){if(done)return;done=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(data);}
  worker.on('message',message=>{if(message?.type==='bank-result')finish(message.error?new HttpError(400,message.error):null,message.data);});
  worker.once('error',()=>finish(new HttpError(400,'BANK_STATEMENT_INVALID_PDF')));
  worker.once('exit',()=>{if(!done)finish(new HttpError(400,'BANK_STATEMENT_INVALID_PDF'));});
 });
}
