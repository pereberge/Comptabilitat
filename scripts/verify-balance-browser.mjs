// Run against the local app and an isolated Chromium/Edge debugging session.
// No database writes; the CSV is inspected in memory and not downloaded.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const tabs=await (await fetch('http://127.0.0.1:9333/json/list')).json();
const tab=tabs.find(t=>t.type==='page');
if(!tab)throw new Error('Open an isolated debugging browser on port 9333 first');
const ws=new WebSocket(tab.webSocketDebuggerUrl),pending=new Map(),errors=[];let id=0;
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const request=pending.get(message.id);pending.delete(message.id);message.error?request.reject(message.error):request.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails);};
function send(method,params={}){return new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});ws.send(JSON.stringify({id:request,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function wait(expression){await evaluate(`new Promise((resolve,reject)=>{const end=Date.now()+12000;const check=()=>{if(${expression})resolve(true);else if(Date.now()>end)reject(new Error('Timed out: '+${JSON.stringify(expression)}));else setTimeout(check,100);};check();})`);}
try{
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:5180/balance-situacion'});
 await wait(`document.querySelector('.balance-comparison,.balance-totals')`);
 assert.equal(await evaluate(`document.querySelector('h1').textContent`),'Balance de Situación');
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('.report-filters button')).find(button=>button.hasAttribute('aria-pressed'))?.getAttribute('aria-pressed')`),'true');
 await evaluate(`Array.from(document.querySelectorAll('.report-filters button')).find(button=>button.hasAttribute('aria-pressed')).click()`);
 await wait(`document.querySelectorAll('.balance-column').length===2&&!document.querySelector('.report-filters button').disabled`);
 await evaluate(`document.querySelectorAll('.balance-node,.balance-account').forEach(d=>d.open=true)`);
 const subaccount=await evaluate(`document.querySelector('.balance-subaccount a')?.getAttribute('href')`);
 assert.ok(subaccount?.startsWith('/mayor?'));
 const metadata=await evaluate(`({date:document.querySelector('input[type=date]').value,exercise:document.querySelector('#exercise').value,company:document.querySelector('#company').value})`);
 assert.ok(subaccount.includes('to='+metadata.date));assert.ok(subaccount.includes('exercise_id='+metadata.exercise));assert.ok(subaccount.includes('company_id='+metadata.company));
 await evaluate(`document.querySelector('.balance-subaccount a').click()`);
 await wait(`document.querySelector('h1')?.textContent==='Libro Mayor'&&document.querySelector('tfoot')`);
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('input[type=date]')).at(-1)?.value`),metadata.date);
 await evaluate(`Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='Volver al Balance de Situación').click()`);
 await wait(`document.querySelector('.balance-totals')`);
 assert.equal(await evaluate(`document.querySelector('input[type=date]').value`),metadata.date);
 await evaluate(`const select=Array.from(document.querySelectorAll('.report-filters label')).find(label=>label.textContent.includes('Tipo de balance')).querySelector('select');select.value='normal';select.dispatchEvent(new Event('change',{bubbles:true}))`);
 await wait(`document.querySelector('.page-heading button').disabled`);
 await evaluate(`document.querySelector('form').requestSubmit()`);
 await wait(`location.search.includes('model=normal')&&document.querySelector('.balance-totals')&&!document.querySelector('.page-heading button').disabled`);
 const desktop=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
 const desktopPath=join(tmpdir(),'balance-sheet-desktop.png');writeFileSync(desktopPath,Buffer.from(desktop.data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await wait(`window.innerWidth===390`);
 await wait(`document.querySelector('.sidebar').getBoundingClientRect().right<=0`);
 assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true);
 await evaluate(`document.querySelectorAll('.balance-node,.balance-account').forEach(d=>d.open=true)`);
 assert.equal(await evaluate(`document.documentElement.scrollWidth<=window.innerWidth`),true);
 const mobile=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 const mobilePath=join(tmpdir(),'balance-sheet-mobile.png');writeFileSync(mobilePath,Buffer.from(mobile.data,'base64'));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({desktopPath,mobilePath,ledgerNavigation:true,modelSelection:true,mobileOverflow:false,runtimeErrors:errors.length}));
}finally{ws.close();}
