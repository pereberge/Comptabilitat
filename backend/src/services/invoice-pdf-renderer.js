import {chromium} from 'playwright-core';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpError} from '../middleware/errors.js';

async function launchBrowser(){
 const tempRoot=path.resolve(process.env.INVOICE_PDF_TEMP_DIR||fileURLToPath(new URL('../../.runtime/invoice-pdf',import.meta.url)));
 await mkdir(tempRoot,{recursive:true,mode:0o700});
 const server=await chromium.launchServer({host:'127.0.0.1',headless:true,timeout:20000,env:{...process.env,TMP:tempRoot,TEMP:tempRoot},...(process.env.INVOICE_PDF_BROWSER_PATH?{executablePath:process.env.INVOICE_PDF_BROWSER_PATH}:{channel:process.env.INVOICE_PDF_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':'chrome')})});
 const close=()=>{
  const child=server.process(),stopped=child.exitCode!==null||child.signalCode!==null?Promise.resolve():new Promise(resolve=>server.once('close',resolve));
  // Temporary-directory cleanup can continue after the owned browser has exited.
  void server.kill().catch(()=>{});
  // Windows can keep inherited debugging pipes open after the browser exits.
  if(process.platform==='win32')for(const stream of child.stdio)stream?.destroy();
  return stopped;
 };
 try{
  const browser=await chromium.connect(server.wsEndpoint(),{timeout:20000});
  return {on:(...args)=>browser.on(...args),newContext:options=>browser.newContext(options),close};
 }catch(error){await close().catch(()=>{});throw error;}
}

export function createInvoicePdfRenderer({launch=launchBrowser,now=Date.now,idleMs=60000,cacheTtlMs=10*60*1000,maxCacheEntries=16,maxCacheBytes=32*1024*1024}={}){
 let browserPromise=null,running=0,idleTimer=null,cacheBytes=0;
 const cache=new Map(),pending=new Map();
 function remove(key){const entry=cache.get(key);if(entry){cacheBytes-=entry.file.length;cache.delete(key);}}
 function cached(key){
  const entry=cache.get(key);if(!entry)return null;
  if(entry.expires<=now()){remove(key);return null;}
  cache.delete(key);cache.set(key,entry);return entry.file;
 }
 function remember(key,file){
  for(const [old,entry]of cache)if(entry.expires<=now())remove(old);
  if(!maxCacheEntries||file.length>maxCacheBytes||cacheTtlMs<=0)return;
  remove(key);cache.set(key,{file,expires:now()+cacheTtlMs});cacheBytes+=file.length;
  while(cache.size>maxCacheEntries||cacheBytes>maxCacheBytes)remove(cache.keys().next().value);
 }
 async function closeBrowser(){
  clearTimeout(idleTimer);idleTimer=null;
  const current=browserPromise;browserPromise=null;
  if(current)await current.then(browser=>browser.close()).catch(()=>{});
 }
 function idle(){
  clearTimeout(idleTimer);idleTimer=null;
  if(!running&&browserPromise){idleTimer=setTimeout(()=>{if(!running)void closeBrowser();},idleMs);idleTimer.unref?.();}
 }
 async function browser(){
  clearTimeout(idleTimer);idleTimer=null;
  if(!browserPromise){
   const launching=Promise.resolve().then(launch);browserPromise=launching;
   launching.then(instance=>instance.on('disconnected',()=>{if(browserPromise===launching)browserPromise=null;}),()=>{if(browserPromise===launching)browserPromise=null;});
  }
  try{return await browserPromise;}catch{throw new HttpError(503,'INVOICE_PDF_BROWSER');}
 }
 async function generate(html){
  running++;let context;
  try{
   context=await(await browser()).newContext({javaScriptEnabled:false,serviceWorkers:'block'});
   await context.route('**/*',route=>route.abort());
   const page=await context.newPage();page.setDefaultTimeout(15000);
   await page.setContent(html,{waitUntil:'load',timeout:15000});
   const file=await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,timeout:15000,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:'<div style="font:9px Arial;width:100%;text-align:right;padding-right:14mm;color:#64748b"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',margin:{bottom:'18mm'}});
   if(file.length>16*1024*1024)throw new HttpError(413,'INVOICE_PDF_TOO_LARGE');
   return file;
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(503,'INVOICE_PDF_GENERATION');}
  finally{await context?.close().catch(()=>{});running--;idle();}
 }
 return {
  async render(html){
   // Fiscal data and the logo are part of the key, so any printed change gets a new PDF.
   const key=createHash('sha256').update(html).digest('hex'),hit=cached(key);
   if(hit)return Buffer.from(hit);
   let job=pending.get(key);
   if(!job){
    if(running>=2)throw new HttpError(429,'INVOICE_PDF_BUSY');
    job=generate(html).then(file=>{remember(key,file);return file;}).finally(()=>pending.delete(key));pending.set(key,job);
   }
   return Buffer.from(await job);
  },
  async close(){await Promise.allSettled([...pending.values()]);await closeBrowser();cache.clear();cacheBytes=0;},
 };
}

const renderer=createInvoicePdfRenderer();
export const renderInvoicePdf=html=>renderer.render(html);
export const closeInvoicePdfRenderer=()=>renderer.close();
