// Every API request is mocked. No connection to MySQL or real company data.
import assert from 'node:assert/strict';import {writeFileSync,unlinkSync} from 'node:fs';import {resolve} from 'node:path';import {spawn} from 'node:child_process';import {chromium} from 'playwright-core';
import {buildTreasuryForecast} from '../shared/treasury-forecast.js';
const origin='http://127.0.0.1:5185',name='treasury-planning-preview-'+process.pid+'.html',file=resolve('frontend',name);
const fixture=`<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h} from 'vue';import Forecast from '/src/components/TreasuryForecast.vue';import {setCompanyId} from '/src/services/company.js';import {useAccess} from '/src/composables/access.js';
setCompanyId(85);await useAccess().refresh();createApp({render:()=>h(Forecast,{exerciseId:7})}).mount('#app');
</script></body></html>`;
const accounts=[{account_id:11,code:'57200001',description:'Bank one',balance:'1000.00'},{account_id:12,code:'57200002',description:'Bank two',balance:'0.00'}];
const receipt={id:15,reference:'INV-001',party_name:'Supplier',amount:'100.00',remaining_amount:'60.00',direction:'received',due_date:'2026-11-20',status:'partial',forecast_account_id:null,assignment_version:0};
const plans=[],writes=[],unexpected=[],errors=[],saved=new Map();let server,browser,page,created=false,passed=false,canWrite=true,dropCreate=true,failRead=false;
function forecast(){return {...buildTreasuryForecast({asOf:'2026-11-09',accounts,receipts:[receipt],plans,bankMovements:[{entry_id:9,position:1,account_id:11,date:'2026-11-12',debit:'0.00',credit:'40.00',linked_receipt:1}]}),planning_available:true,plans,receipts:[receipt]};}
try{
 writeFileSync(file,fixture);created=true;server=spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5185','--strictPort'],{cwd:resolve('frontend'),windowsHide:true,stdio:'ignore'});
 let ready=false;for(let n=0;n<300;n++){try{if((await fetch(origin+'/'+name)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready);
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/access/session')return route.fulfill({json:{user:{role:'user',permissions:{accounting_write:canWrite}},users:[]}});
  assert.equal(request.headers()['x-company-id'],'85');
  if(path==='/api/portfolio/forecast'&&request.method()==='GET'){if(failRead){failRead=false;return route.fulfill({status:503,json:{error:{code:'SERVICE_UNAVAILABLE'}}});}return route.fulfill({json:forecast()});}
  const body=request.postDataJSON();writes.push({path,method:request.method(),body});
  if(path==='/api/portfolio/receipts/15/forecast-account'){
   assert.equal(body.version,0);receipt.forecast_account_id=body.bank_account_id;receipt.assignment_version++;return route.fulfill({json:{receipt_id:15,bank_account_id:body.bank_account_id,version:1}});
  }
  if(path==='/api/portfolio/forecast-plans'&&request.method()==='POST'){
   let result=saved.get(body.request_id);if(!result){result={...body,id:1,version:1,status:'pending'};plans.push(result);saved.set(body.request_id,result);}
   if(dropCreate){dropCreate=false;return route.abort('failed');}return route.fulfill({status:201,json:result});
  }
  if(path==='/api/portfolio/forecast-plans/1'&&request.method()==='PATCH'){assert.equal(body.version,1);Object.assign(plans[0],body,{id:1,version:2});failRead=true;return route.fulfill({json:plans[0]});}
  if(path==='/api/portfolio/forecast-plans/1/link'){assert.equal(body.version,2);assert.equal(body.receipt_id,15);Object.assign(plans[0],{status:'linked',linked_receipt_id:15,version:3});return route.fulfill({json:plans[0]});}
  if(path==='/api/portfolio/forecast-plans/1/cancel'){assert.equal(body.version,3);Object.assign(plans[0],{status:'cancelled',linked_receipt_id:null,version:4});return route.fulfill({json:plans[0]});}
  unexpected.push(path);return route.abort();
 });
 const total=()=>page.getByRole('row').filter({hasText:/30 dies/}).first();
 async function changed(action){const reload=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/portfolio/forecast');await action();await reload;await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='Actualitzar previsió')?.disabled);}
 await page.goto(origin+'/'+name);await page.getByLabel('Banc del rebut 15',{exact:true}).waitFor();assert.equal(writes.length,0);assert.match(await total().innerText(),/900,00/);
 await page.getByLabel('Banc del rebut 15',{exact:true}).selectOption('11');await changed(()=>page.getByRole('button',{name:'Guardar banc',exact:true}).click());assert.equal(receipt.forecast_account_id,11);
 await page.locator('[name="plan_description"]').fill('Expected service');await page.locator('[name="plan_amount"]').fill('100.00');await page.locator('[name="plan_date"]').fill('2026-11-21');await page.locator('[name="plan_bank"]').selectOption('12');
 await page.getByRole('button',{name:'Guardar previsió',exact:true}).click();await page.getByRole('alert').waitFor();
 await changed(()=>page.getByRole('button',{name:'Guardar previsió',exact:true}).click());assert.equal(plans.length,1);const attempts=writes.filter(row=>row.path==='/api/portfolio/forecast-plans');assert.equal(attempts.length,2);assert.equal(attempts[0].body.request_id,attempts[1].body.request_id);assert.match(await total().innerText(),/800,00/);
 await page.getByRole('button',{name:'Editar previsió',exact:true}).click();await page.locator('[name="plan_description"]').fill('Reviewed service');await changed(()=>page.getByRole('button',{name:'Guardar previsió',exact:true}).click());assert.equal(plans[0].description,'Reviewed service');
 await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Guardar previsió',exact:true}).isDisabled(),true);await changed(()=>page.getByRole('button',{name:'Actualitzar previsió',exact:true}).click());
 await page.getByLabel('Rebut per a la previsió 1',{exact:true}).selectOption('15');await changed(()=>page.getByRole('button',{name:'Substituir pel rebut',exact:true}).click());assert.match(await total().innerText(),/900,00/);assert.equal(plans[0].status,'linked');
 await changed(()=>page.getByRole('button',{name:'Retirar vincle de la previsió',exact:true}).click());assert.equal(plans[0].status,'cancelled');assert.match(await total().innerText(),/900,00/);
 canWrite=false;const before=writes.length;await page.reload();await page.getByLabel('Banc del rebut 15',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Guardar banc',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Guardar previsió',exact:true}).isDisabled(),true);assert.equal(writes.length,before);
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);passed=true;console.log('PASS: bank assignment, retry-safe manual forecast, editing, replacement by partial receipt, cancellation and read-only permissions. All API mocked.');
}finally{if(created)unlinkSync(file);server?.kill();const timer=setTimeout(()=>process.exit(passed?0:1),5000);timer.unref();await page?.close();await browser?.close();clearTimeout(timer);}
