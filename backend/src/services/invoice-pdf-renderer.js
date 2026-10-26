import {chromium} from 'playwright-core';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpError} from '../middleware/errors.js';
let running=0;
export async function renderInvoicePdf(html){
 if(running>=2)throw new HttpError(429,'INVOICE_PDF_BUSY');running++;let context,profile;
 const tempRoot=path.resolve(process.env.INVOICE_PDF_TEMP_DIR||fileURLToPath(new URL('../../.runtime/invoice-pdf',import.meta.url)));
 try{
  try{await mkdir(tempRoot,{recursive:true,mode:0o700});profile=await mkdtemp(path.join(tempRoot,'render-'));context=await chromium.launchPersistentContext(profile,{headless:true,timeout:20000,env:{...process.env,TMP:tempRoot,TEMP:tempRoot},javaScriptEnabled:false,serviceWorkers:'block',...(process.env.INVOICE_PDF_BROWSER_PATH?{executablePath:process.env.INVOICE_PDF_BROWSER_PATH}:{channel:process.env.INVOICE_PDF_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':'chrome')})});}
  catch{throw new HttpError(503,'INVOICE_PDF_BROWSER');}
  await context.route('**/*',route=>route.abort());const page=await context.newPage();page.setDefaultTimeout(15000);await page.setContent(html,{waitUntil:'load',timeout:15000});
  const file=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,timeout:15000,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:'<div style="font:9px Arial;width:100%;text-align:right;padding-right:14mm;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',margin:{bottom:'18mm'}});
  if(file.length>16*1024*1024)throw new HttpError(413,'INVOICE_PDF_TOO_LARGE');return file;
 }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(503,'INVOICE_PDF_GENERATION');}
 finally{try{await context?.browser()?.close().catch(()=>{});if(profile&&path.dirname(profile)===tempRoot)await rm(profile,{recursive:true,force:true,maxRetries:1}).catch(()=>console.error('No se ha podido limpiar el perfil temporal de PDF.'));}finally{running--;}}
}