import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const base=process.env.TEST_UI_URL||'http://127.0.0.1:5180';
const browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const company={id:1,name:'Piensos Arb',subaccount_length:8,business_format:'general'},exercise={id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open',is_default:true};
const row={id:7,source_system:'gestio',external_id:'FAC-987',supplier_name:'Proveedor de prueba',supplier_tax_id:'B12345678',invoice_number:'2026-125',invoice_date:'2026-10-26',due_date:'2026-11-26',total_amount:'1210.00',currency:'EUR',invoice_type:'standard',accounting_status:'pending',possible_duplicate:0,issues:[],document_external_id:'DOC-456',imported_at:'2026-10-26 12:00:00',version:1,company_name:company.name};
let requestedPost=false,correctionScenario=false,remembered=false,mockDetail=null;
try{
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;let data=[];
  if(path==='/api/access/session')data={user:{key:'master',name:'Máster',role:'master',permissions:{accounting_write:true,users_manage:true,invoice_delete:true}},users:[{key:'master',name:'Máster',role:'master'}],master_setup_required:false};
  else if(path==='/api/companies')data=[company];else if(path==='/api/context')data={company,exercises:[exercise]};
  else if(path==='/api/accounts')data=[{id:10,code:'40000001',description:'Nom guardat diferent del detectat',kind:'subaccount'},{id:20,code:'60200001',description:'Compra de materiales',kind:'subaccount'}];
  else if(path==='/api/integration-invoices')data={rows:[row],total:1,page:1,pageSize:50};
  else if(path==='/api/integration-invoices/7')data={...row,company_id:1,status:'pending',can_post:true,payload:{description:'Compra de mercaderías',taxBreakdown:[{taxType:'vat',taxableBase:'1000.00',taxRate:'21.00',taxAmount:'210.00'}],withholdings:[],lines:[]},form:{exercise_id:1,direction:'received',reference:'2026-125',invoice_date:'2026-10-26',posting_date:'2026-10-26',party:{name:row.supplier_name,tax_id:row.supplier_tax_id,address:'',email:''},party_parent:'4000',party_account_id:'',offset_account_id:'',vat_account_id:'',withholding_account_id:'',withholding_rate:'0',payment_method:'transfer',notes:'Imported',lines:[{description:'Mercaderías',base:'1000.00',tax_rate:'21.00'}],receipts:[{due_date:'2026-11-26',amount:'1210.00'}],request_id:'00000000-0000-4000-8000-000000000007'}};
  else if(path==='/api/integration-invoices/7/post'){requestedPost=true;data={id:8,integrationId:7};}
  else if(path==='/api/invoices/8')return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:{code:'INVOICE_NOT_FOUND'}})});
  if(path==='/api/integration-invoices/7'&&correctionScenario){data={...data,accounting_status:'posted',can_post:false,can_change_expense:true,invoice_id:8,version:2,expense_suggestion:null,current_expense_account:{account_id:30,code:'60000000',description:'COMPRES DE GASOIL'}};mockDetail=data;}
  if(path==='/api/integration-invoices/7/expense-account'){const body=route.request().postDataJSON();assert.equal(body.account_id,20);assert.equal(body.remember,true);remembered=true;const account={account_id:20,code:'60200001',description:'Compra de materiales'};data={...mockDetail,version:3,current_expense_account:account,expense_suggestion:account};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base+'/facturas');await page.getByRole('button',{name:'Recibidas de Gestió',exact:true}).click();
 await page.getByText('FAC-987',{exact:true}).waitFor();assert.ok(await page.getByText('Pendiente de contabilizar',{exact:true}).isVisible());
 await page.getByRole('button',{name:'Consultar',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByText('DOC-456',{exact:true}).waitFor();assert.ok(await dialog.getByText(/no es una URL pública/).isVisible());
 await page.getByRole('button',{name:'Revisar y contabilizar',exact:true}).click();await page.getByRole('dialog',{name:'Contabilizar factura recibida de Gestió'}).waitFor();
 assert.equal(await page.locator('input[name="party_tax_id"]').inputValue(),'B12345678');await page.locator('select[name="party_account_id"]').selectOption('10');assert.equal(await page.locator('input[name="party_name"]').inputValue(),'Nom guardat diferent del detectat');assert.equal(await page.locator('input[name="party_tax_id"]').inputValue(),'B12345678');assert.equal(await page.locator('input[name="due_amount_0"]').inputValue(),'1210.00');assert.equal(await page.locator('details.trade-account-settings').getAttribute('open')!==null,true);assert.equal(await page.locator('select[name=offset_account_id]').getAttribute('required')!==null,true);assert.equal(await page.getByRole('button',{name:'Registrar factura y crear recibos',exact:true}).isDisabled(),true);await page.locator('select[name=offset_account_id]').selectOption('20');assert.equal(await page.getByRole('button',{name:'Registrar factura y crear recibos',exact:true}).isEnabled(),true);assert.equal(requestedPost,false);assert.deepEqual(errors,[]);
 await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
 correctionScenario=true;row.accounting_status='posted';row.invoice_id=8;
 await page.reload();await page.getByRole('button',{name:'Recibidas de Gestió',exact:true}).click();await page.getByRole('button',{name:'Consultar',exact:true}).click();
 const correction=page.getByRole('dialog');await correction.locator('select[name=correct_expense_account]').waitFor();assert.ok(await correction.getByText('60000000 · COMPRES DE GASOIL',{exact:true}).isVisible());
 assert.equal(await correction.locator('.expense-memory-choice input').isChecked(),true);assert.equal(await correction.getByRole('button',{name:'Guardar cuenta de gasto',exact:true}).isDisabled(),true);
 await correction.locator('select[name=correct_expense_account]').selectOption('20');await correction.getByRole('button',{name:'Guardar cuenta de gasto',exact:true}).click();await correction.getByText('60200001 · Compra de materiales',{exact:true}).waitFor();assert.equal(remembered,true);assert.deepEqual(errors,[]);
 console.log('UI integration passed: required expense choice, remembering supplier preference, and correcting a posted expense inside the program.');
}finally{await browser.close();}
