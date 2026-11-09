import {parentPort,workerData} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,copyFileSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {createWorker} from 'tesseract.js';
import {recognizePurchasePages} from './purchase-document-layout.js';
const require=createRequire(import.meta.url);let ocr;
async function recognize(image,page){
 if(!ocr){
  const langPath=fileURLToPath(new URL('../../.runtime/ocr-languages/',import.meta.url));mkdirSync(langPath,{recursive:true});
  for(const code of ['cat','spa','eng']){const target=join(langPath,code+'.traineddata.gz');if(!existsSync(target))copyFileSync(join(dirname(require.resolve('@tesseract.js-data/'+code+'/package.json')),'4.0.0_best_int',code+'.traineddata.gz'),target);}
  ocr=await createWorker('cat+spa+eng',1,{langPath,cacheMethod:'none',gzip:true});await ocr.setParameters({preserve_interword_spaces:'1'});
 }
 const {data}=await ocr.recognize(image,{}, {blocks:true,text:true});
 const lines=(data.blocks||[]).flatMap(block=>(block.paragraphs||[]).flatMap(paragraph=>paragraph.lines||[]));
 const items=lines.length?lines.flatMap(line=>(line.words||[]).map(word=>({text:word.text,x:word.bbox.x0,y:100000-(line.bbox?.y0??word.bbox.y0)}))):data.text.split('\n').map((text,index)=>({text,x:0,y:100000-index*20}));
 return {page,items,confidence:data.confidence,text:data.text};
}
let task;
try{
 const buffer=Buffer.from(workerData.buffer),pages=[],digitalPages=[];let usedOcr=false;
 if(workerData.mime==='application/pdf'){
  task=getDocument({data:Uint8Array.from(buffer),isEvalSupported:false,useSystemFonts:true,verbosity:0});const pdf=await task.promise;if(pdf.numPages>20)throw new Error('PURCHASE_TOO_MANY_PAGES');
  for(let number=1;number<=pdf.numPages;number++){
   const page=await pdf.getPage(number),content=await page.getTextContent(),items=content.items.filter(item=>item.str?.trim()).map(item=>({text:item.str,x:item.transform[4],y:item.transform[5]}));
   digitalPages.push({page:number,items});
   if(!workerData.forceOcr&&items.reduce((sum,item)=>sum+item.text.length,0)>40){pages.push({page:number,items});continue;}
   const viewport=page.getViewport({scale:2.5});if(viewport.width*viewport.height>30000000)throw new Error('PURCHASE_IMAGE_TOO_LARGE');
   const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'}).promise;
   pages.push(await recognize(canvas.toBuffer('image/png'),number));usedOcr=true;page.cleanup();
  }
 }else{
  const image=await loadImage(buffer);if(image.width*image.height>30000000)throw new Error('PURCHASE_IMAGE_TOO_LARGE');
  const canvas=createCanvas(image.width,image.height),context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,image.width,image.height);context.drawImage(image,0,0);
  pages.push(await recognize(canvas.toBuffer('image/png'),1));usedOcr=true;
 }
 const text=pages.map(page=>page.text||page.items.slice().sort((a,b)=>b.y-a.y||a.x-b.x).map(item=>item.text).join('\n')).join('\n');if(text.length>500000)throw new Error('PURCHASE_TEXT_TOO_LARGE');
 let result=recognizePurchasePages(pages);const scores=pages.filter(page=>page.confidence!==undefined).map(page=>page.confidence);
 if(workerData.forceOcr&&digitalPages.some(page=>page.items.length)){
  const digital=recognizePurchasePages(digitalPages);
  const score=value=>(value.totals_verified?100:0)+['reference','invoice_date','base_total','tax_total','total_amount'].filter(key=>value[key]).length+(value.supplier?.tax_id?2:0);
  if(score(digital)>=score(result)){
   const disagreement=result.reference&&digital.reference&&result.reference!==digital.reference;
   result={...digital,field_source:'pdf-text',warnings:[...digital.warnings,'També s’ha llegit el document amb Tesseract. S’han conservat els camps més complets del text del PDF.',...(disagreement?['Tesseract i el text del PDF difereixen en el número de factura. Revisa’l amb l’original.']:[])]};
  }else result={...result,field_source:'tesseract'};
 }
 parentPort.postMessage({type:'purchase-document-result',result:{...result,recognized_text:text,engine:usedOcr?'tesseract-local':'pdf-text',confidence:scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null,pages:pages.length}});
}catch(error){if(!error.message?.startsWith('PURCHASE_'))console.error('Purchase document recognition failed:',error.code||error.name,error.stack);parentPort.postMessage({type:'purchase-document-result',error:error.message?.startsWith('PURCHASE_')?error.message:'PURCHASE_OCR_FAILED'});}
finally{await ocr?.terminate();await task?.destroy();}
