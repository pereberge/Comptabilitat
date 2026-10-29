import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvoicePdfRenderer} from '../src/services/invoice-pdf-renderer.js';

function fixture(options={}){
 const calls={launches:0,contexts:[],renders:[],closedContexts:0,closedBrowsers:0};let disconnect;
 const launch=async()=>{
  calls.launches++;if(options.launch)await options.launch();
  return {on(event,listener){if(event==='disconnected')disconnect=listener;},async close(){calls.closedBrowsers++;disconnect?.();},async newContext(settings){
   calls.contexts.push(settings);let html='';
   const page={setDefaultTimeout(){},async setContent(value){html=value;},async pdf(){calls.renders.push(html);if(options.render)return options.render(html);return Buffer.from('%PDF-'+html);}};
   return {async route(pattern,handler){assert.equal(pattern,'**/*');let aborted=false;await handler({abort(){aborted=true;}});assert.equal(aborted,true);},async newPage(){return page;},async close(){calls.closedContexts++;}};
  }};
 };
 return {calls,launch,disconnect:()=>disconnect?.()};
}
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}

test('reopening the same PDF skips rendering, printed changes regenerate and each job has its own context',async t=>{
 const mock=fixture(),renderer=createInvoicePdfRenderer({launch:mock.launch});t.after(()=>renderer.close());
 const first=await renderer.render('NIF B11111111 · dirección A'),second=await renderer.render('NIF B11111111 · dirección A');assert.deepEqual(first,second);
 first[0]=0;assert.equal((await renderer.render('NIF B11111111 · dirección A')).subarray(0,5).toString(),'%PDF-');
 const changed=await renderer.render('NIF B11111111 · dirección B');assert.notDeepEqual(changed,second);
 assert.equal(mock.calls.launches,1);assert.equal(mock.calls.renders.length,2);assert.equal(mock.calls.closedContexts,2);
 assert.ok(mock.calls.contexts.every(settings=>settings.javaScriptEnabled===false&&settings.serviceWorkers==='block'));
});

test('simultaneous requests for one PDF share a job while different documents respect the concurrency limit',async t=>{
 const gate=deferred(),mock=fixture({render:async html=>{await gate.promise;return Buffer.from('%PDF-'+html);}}),renderer=createInvoicePdfRenderer({launch:mock.launch});t.after(()=>renderer.close());
 const one=renderer.render('invoice A'),same=renderer.render('invoice A'),two=renderer.render('invoice B');
 await assert.rejects(renderer.render('invoice C'),error=>error.code==='INVOICE_PDF_BUSY');
 gate.resolve();const [a,b,c]=await Promise.all([one,same,two]);assert.deepEqual(a,b);assert.notDeepEqual(a,c);assert.equal(mock.calls.renders.length,2);assert.equal(mock.calls.launches,1);
});

test('PDF cache expires and evicts older entries when its entry or byte budget is reached',async t=>{
 let time=0;const mock=fixture(),renderer=createInvoicePdfRenderer({launch:mock.launch,now:()=>time,cacheTtlMs:10,maxCacheEntries:2,maxCacheBytes:14});t.after(()=>renderer.close());
 await renderer.render('a');await renderer.render('b');await renderer.render('a');await renderer.render('c');await renderer.render('b');assert.equal(mock.calls.renders.length,4);
 time=11;await renderer.render('b');assert.equal(mock.calls.renders.length,5);
 const small=fixture(),uncached=createInvoicePdfRenderer({launch:small.launch,maxCacheBytes:1});t.after(()=>uncached.close());await uncached.render('large');await uncached.render('large');assert.equal(small.calls.renders.length,2);
});

test('failed launches and rendering failures can be retried without caching errors or leaking contexts',async t=>{
 let failLaunch=true,failRender=true;
 const mock=fixture({launch:async()=>{if(failLaunch){failLaunch=false;throw new Error('Launch failed');}},render:async()=>{if(failRender){failRender=false;throw new Error('Render failed');}return Buffer.from('%PDF-ok');}}),renderer=createInvoicePdfRenderer({launch:mock.launch});t.after(()=>renderer.close());
 await assert.rejects(renderer.render('same'),error=>error.code==='INVOICE_PDF_BROWSER');
 await assert.rejects(renderer.render('same'),error=>error.code==='INVOICE_PDF_GENERATION');
 assert.equal((await renderer.render('same')).toString(),'%PDF-ok');assert.equal(mock.calls.closedContexts,2);assert.equal(mock.calls.launches,2);
});

test('the browser closes while idle and relaunches after disconnection without retaining document state',async t=>{
 const mock=fixture(),renderer=createInvoicePdfRenderer({launch:mock.launch,idleMs:5,maxCacheEntries:0});t.after(()=>renderer.close());
 await renderer.render('first');await new Promise(resolve=>setTimeout(resolve,15));assert.equal(mock.calls.closedBrowsers,1);
 await renderer.render('second');assert.equal(mock.calls.launches,2);mock.disconnect();await renderer.render('third');assert.equal(mock.calls.launches,3);
});
