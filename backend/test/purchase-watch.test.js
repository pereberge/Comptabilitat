import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Node --watch dependency messages cannot finish PDF recognition early',{timeout:180000},async()=>{
 for(const force of [false,true]){
  const child=spawn(process.execPath,['--watch','test-support/purchase-watch-reader.mjs',...(force?['--force-ocr']:[])],{cwd:fileURLToPath(new URL('../',import.meta.url)),windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',readerPid;
  try{
   await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('WATCH_READER_TIMEOUT')),75000);
    const finish=()=>{if(/Completed running|Failed running/.test(stdout+stderr)){clearTimeout(timer);resolve();}};
    child.stdout.on('data',data=>{stdout+=data;readerPid=Number(stdout.match(/READER_PID (\d+)/)?.[1])||readerPid;finish();});
    child.stderr.on('data',data=>{stderr+=data;finish();});child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',()=>{clearTimeout(timer);resolve();});
   });
   const result=stdout.match(/READER_RESULT ([^\r\n]+)/)?.[1];assert.ok(result,stderr||stdout);
   assert.deepEqual(JSON.parse(result),{engine:force?'tesseract-local':'pdf-text',reference:'WATCH-001',verified:true});
  }finally{
   if(readerPid&&!/Completed running|Failed running/.test(stdout+stderr)){try{process.kill(readerPid);}catch{}}
   child.kill();
  }
 }
});
