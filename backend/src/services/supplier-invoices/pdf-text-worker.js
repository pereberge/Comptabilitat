import {parentPort,workerData} from 'node:worker_threads';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const task=getDocument({data:Uint8Array.from(workerData),useSystemFonts:true,isEvalSupported:false,verbosity:0});
try{
 const pdf=await task.promise;
 if(pdf.numPages>40)throw new Error('INVOICE_PDF_TOO_MANY_PAGES');
 const pages=[];
 for(let n=1;n<=pdf.numPages;n++){
  const content=await (await pdf.getPage(n)).getTextContent();let y,text='';
  for(const item of content.items){if(typeof item.str!=='string')continue;const next=item.transform?.[5];text+=(y===undefined||Math.abs(y-next)<2?' ':'\n')+item.str;y=next;}
  pages.push(text.trim());
 }
 parentPort.postMessage({pages:pdf.numPages,text:pages.join('\n').slice(0,120000),partial:pages.some(page=>page.length<40)});
}catch(error){parentPort.postMessage({error:error.message==='INVOICE_PDF_TOO_MANY_PAGES'?error.message:'INVOICE_PDF_INVALID'});}
finally{await task.destroy();}
