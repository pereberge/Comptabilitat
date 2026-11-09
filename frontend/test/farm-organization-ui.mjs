import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {invoicePdf} from '../../backend/test-support/invoice-fixture.js';
const browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const company={id:1,name:'Organization test',subaccount_length:8,business_format:'general'},exercise={id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open',is_default:true};
const farms=[],groups=[];let assignment=null,accountingWrites=0;
const row={id:1,source_name:'expense.pdf',reference:'F-1',party_name:'Supplier',party_tax_id:'B12345678',version:1,status:'draft',review_kind:'invoice',reception_id:null,extraction:{warnings:[]},history:[],supplier_draft:{supplier:{name:'Supplier',taxId:'B12345678'},invoiceNumber:'F-1',invoiceDate:'',dueDate:'',currency:'EUR',invoiceType:'standard',description:'',taxBreakdown:[],withholdings:[],lines:[],total:'121.00'}};
const pdf=await invoicePdf('generic');
try{
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;let data=[];
  if(path==='/api/access/session')data={user:{key:'master',name:'Master',role:'master',permissions:{accounting_write:true,users_manage:true}},users:[{key:'master',name:'Master',role:'master'}],master_setup_required:false};
  else if(path==='/api/companies')data=[company];else if(path==='/api/context')data={company,exercises:[exercise]};
  else if(path==='/api/farm-organization')data={farms,groups};
  else if(path==='/api/farm-organization/farms'&&req.method()==='POST'){const body=req.postDataJSON();data={id:farms.length+1,company_id:1,version:1,...body};farms.push(data);}
  else if(path==='/api/farm-organization/farms/1/groups'&&req.method()==='POST'){const body=req.postDataJSON();data={id:groups.length+1,company_id:1,farm_id:1,version:1,...body};groups.push(data);}
  else if(path==='/api/farm-organization/expenses')data=assignment?[{...assignment,reference:'F-1',supplier_name:'Supplier',farm_name:farms[0].name,group_name:groups[0].name,total_amount:'121.00',currency:'EUR',source_kind:'document',source_id:1}]:[];
  else if(path==='/api/farm-organization/assignments/document/1'){
   if(req.method()==='PUT'){const body=req.postDataJSON();assert.equal(body.farm_id,'1');assert.equal(body.group_id,'1');assignment={id:1,farm_id:1,group_id:1,document_id:1,version:(assignment?.version||0)+1};}data=assignment;
  }
  else if(path==='/api/supplier-invoices')data=[row];else if(path==='/api/supplier-invoices/1')data=row;
  else if(path==='/api/supplier-invoices/1/source')return route.fulfill({contentType:'application/pdf',body:pdf});
  else if(req.method()!=='GET')accountingWrites++;
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const base=process.env.TEST_UI_URL||'http://127.0.0.1:5180';await page.goto(base+'/granjas');
 await page.getByRole('button',{name:'Nova granja',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByLabel('Codi',{exact:true}).fill('A');await dialog.getByLabel('Nom',{exact:true}).fill('Granja A');await dialog.getByRole('button',{name:'Guardar granja',exact:true}).click();await page.getByRole('button',{name:'Nou grup',exact:true}).waitFor();
 await page.getByRole('button',{name:'Nou grup',exact:true}).click();dialog=page.getByRole('dialog');await dialog.getByLabel('Nom del grup',{exact:true}).fill('Alimentació');await dialog.getByRole('button',{name:'Guardar grup',exact:true}).click();await page.getByRole('button',{name:'Alimentació',exact:true}).waitFor();
 await page.goto(base+'/facturas-proveedores');await page.getByRole('button',{name:'Obrir',exact:true}).click();const classification=page.locator('.farm-classification');await classification.waitFor({timeout:5000}).catch(async cause=>{console.log('UI errors:',errors);console.log(await page.locator('body').innerText());throw cause;});await classification.getByLabel('Granja',{exact:true}).selectOption('1');await classification.getByLabel('Grup',{exact:true}).selectOption('1');await classification.getByRole('button',{name:'Guardar classificació',exact:true}).click();await classification.getByText('Classificació guardada.',{exact:true}).waitFor();assert.ok(assignment);
 await page.goto(base+'/granjas');await page.getByText('F-1',{exact:true}).waitFor();assert.equal(accountingWrites,0);assert.deepEqual(errors,[]);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.getByRole('button',{name:'Nova granja',exact:true}).isVisible(),true);
 console.log('Farm organization UI passed: create farm and group, classify from a supplier invoice and view the expense, without accounting writes.');
}finally{await browser.close();}
