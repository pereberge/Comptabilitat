// Every API request is mocked; this script cannot read or change MySQL.
import assert from 'node:assert/strict';
import {writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
const origin='http://127.0.0.1:5183',name='bank-partial-preview-'+process.pid+'.html',file=resolve('frontend',name);
const fixture=`<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h} from 'vue';import Matches from '/src/components/ReconciliationMatches.vue';import {useContext} from '/src/composables/context.js';
await useContext().refresh('85');const direction=new URLSearchParams(location.search).get('direction');
const app=createApp({render:()=>h(Matches,{report:{id:7},movement:{id:2,date:'2026-06-02',amount:direction==='issued'?'40.00':'-40.00',concept:'PARTIAL-UI'},canWrite:true,onSaved:result=>window.savedPartial=result})});
app.component('RouterLink',{template:'<a><slot /></a>'});app.mount('#app');
</script></body></html>`;
let server,browser,page,created=false,passed=false,direction='received';const writes=[],unexpected=[],pageErrors=[];
try{
 writeFileSync(file,fixture);created=true;
 server=spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5183','--strictPort'],{cwd:resolve('frontend'),windowsHide:true,stdio:'ignore'});
 let ready=false;for(let n=0;n<300;n++){try{if((await fetch(origin+'/'+name)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready,'Isolated Vite did not start');
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(path==='/api/companies')return route.fulfill({json:[{id:85,name:'Test'}]});
  if(path==='/api/context')return route.fulfill({json:{company:{id:85,name:'Test'},exercises:[{id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open'}]}});
  if(path==='/api/accounts')return route.fulfill({json:[{id:11,code:'57200001',description:'Bank'}]});
  if(path==='/api/bank-reconciliations/7/movements/2/matches')return route.fulfill({json:{version:1,bank_account_id:11,exercise_id:1,invoices:[],receipts:[{id:15,invoice_id:12,direction,reference:'PARTIAL-UI',party_name:'Test supplier',exercise_name:'2026',invoice_date:'2026-01-01',due_date:'2026-06-02',remaining_amount:'100.00',amount:'100.00',paid_amount:'0.00',status:'pending',partial_payment:true,payment_amount:'40.00',remaining_after_payment:'60.00',match_basis:'Reference matched; review'}]}});
  if(path==='/api/bank-reconciliations/7/settlements'&&request.method()==='POST'){writes.push({body:request.postDataJSON(),company:request.headers()['x-company-id']});return route.fulfill({json:{remaining_amount:'60.00',status:'partial',entry_id:9}});}
  unexpected.push(path);return route.abort();
 });
 for(direction of ['received','issued']){
  const before=writes.length;await page.goto(origin+'/'+name+'?direction='+direction);await page.getByText('Test supplier',{exact:false}).first().waitFor();
  assert.equal(writes.length,before,'A suggested match must never pay automatically');
  await page.getByRole('button',{name:direction==='issued'?'Cobrar i conciliar':'Pagar i conciliar',exact:true}).click();
  await page.locator('input[name="settlement_amount"]').waitFor();
  assert.equal(await page.locator('input[name="settlement_amount"]').inputValue(),'40.00');assert.equal(await page.locator('input[name="settlement_amount"]').isEditable(),false);
  assert.match(await page.getByRole('dialog').innerText(),/Quedarà pendent: 60,00/);
  assert.equal(await page.locator('select[name="bank_account_id"]').isDisabled(),true);
  await page.waitForFunction(()=>!document.querySelector('form .actions button.primary')?.disabled);
  await page.locator('form .actions button.primary').click();await page.waitForFunction(()=>window.savedPartial?.status==='partial');
  assert.equal(writes.length,before+1);assert.equal(writes.at(-1).company,'85');assert.equal(writes.at(-1).body.partial_payment,true);assert.equal(writes.at(-1).body.expected_remaining_amount,'100.00');assert.equal(writes.at(-1).body.receipt_id,15);
 }
 assert.deepEqual(unexpected,[]);assert.deepEqual(pageErrors,[]);passed=true;console.log('PASS: partial payments and collections require confirmation, preserve bank amount and send the expected outstanding balance. All API mocked.');
}finally{
 if(created)unlinkSync(file);server?.kill();const timer=setTimeout(()=>process.exit(passed?0:1),5000);timer.unref();await page?.close();await browser?.close();clearTimeout(timer);
}
