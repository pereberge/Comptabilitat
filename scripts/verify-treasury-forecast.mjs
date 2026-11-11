// Isolated Vue verification. Every API request is mocked; no MySQL access.
import assert from 'node:assert/strict';
import {writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
const origin='http://127.0.0.1:5184',name='treasury-preview-'+process.pid+'.html',file=resolve('frontend',name);
const fixture=`<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h} from 'vue';import Forecast from '/src/components/TreasuryForecast.vue';import {setCompanyId} from '/src/services/company.js';
setCompanyId(85);createApp({render:()=>h(Forecast,{exerciseId:7})}).mount('#app');
</script></body></html>`;
let server,browser,page,created=false,passed=false,scenario='normal';const requests=[],unexpected=[],errors=[];
try{
 writeFileSync(file,fixture);created=true;
 server=spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5184','--strictPort'],{cwd:resolve('frontend'),windowsHide:true,stdio:'ignore'});
 let ready=false;for(let n=0;n<300;n++){try{if((await fetch(origin+'/'+name)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready);
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());requests.push({method:request.method(),company:request.headers()['x-company-id'],exercise:url.searchParams.get('exercise_id')});
  if(url.pathname!=='/api/portfolio/forecast'){unexpected.push(url.pathname);return route.abort();}
  if(scenario==='wrong-exercise')return route.fulfill({status:400,json:{error:{code:'TREASURY_EXERCISE_DATE'}}});
  return route.fulfill({json:{as_of:'2026-11-09',opening_balance:'100.00',unassigned_receipts:2,unlinked_future_movements:1,horizons:[30,60,90].map(days=>({days,date:'2026-12-09',collections:'200.00',payments:'300.00',known_bank_net:'0.00',projected_balance:'0.00',liquidity_need:'100.00',first_negative_date:'2026-11-15'})),accounts:[{account_id:1,code:'57200001',description:'Test bank',balance:'100.00',horizons:[30,60,90].map(days=>({days,projected_balance:'100.00'}))}]}});
 });
 await page.goto(origin+'/'+name);await page.getByRole('heading',{name:'Previsió de tresoreria',exact:true}).waitFor();
 await page.getByText(/sense banc assignat/).waitFor();assert.match(await page.getByRole('dialog').innerText(),/moviments futurs registrats sense vincle/);
 for(const days of [30,60,90])assert.equal(await page.getByRole('cell',{name:new RegExp('^'+days+' dies')}).count(),1);
 assert.equal(await page.getByRole('cell',{name:/Test bank/}).count(),1);assert.match(await page.getByRole('dialog').innerText(),/Necessitat de liquiditat/);
 scenario='wrong-exercise';await page.reload();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/exercici que inclou la data/);
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);assert.equal(requests.length,2);assert.ok(requests.every(row=>row.method==='GET'&&row.company==='85'&&row.exercise==='7'));
 passed=true;console.log('PASS: 30/60/90 day forecast, liquidity and unassigned-bank warnings, company-scoped read-only requests and exercise error. All API mocked.');
}finally{
 if(created)unlinkSync(file);server?.kill();const timer=setTimeout(()=>process.exit(passed?0:1),5000);timer.unref();await page?.close();await browser?.close();clearTimeout(timer);
}
