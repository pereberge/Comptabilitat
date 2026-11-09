import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {invoicePdf} from '../../backend/test-support/invoice-fixture.js';
const browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
const company={id:1,name:'Test supplier inbox',subaccount_length:8,business_format:'general'},exercise={id:1,name:'2026',start_date:'2026-01-01',end_date:'2026-12-31',status:'open',is_default:true};
let row={id:1,source_name:'example.pdf',reference:'',party_name:'',party_tax_id:'',version:1,status:'draft',review_kind:'invoice',reception_id:null,extraction:{warnings:[]},history:[],supplier_draft:{supplier:{},invoiceNumber:'',invoiceDate:'',dueDate:'',currency:'',invoiceType:'standard',description:'',taxBreakdown:[],withholdings:[],lines:[],total:''}},saved=0,classified=0;
const pdf=await invoicePdf('generic');
try{
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;let data=[];
  if(path==='/api/access/session')data={user:{key:'master',name:'Master',role:'master',permissions:{accounting_write:true,users_manage:true}},users:[{key:'master',name:'Master',role:'master'}],master_setup_required:false};
  else if(path==='/api/companies')data=[company];else if(path==='/api/context')data={company,exercises:[exercise]};
  else if(path==='/api/supplier-invoices')data=url.searchParams.get('kind')===row.review_kind?[row]:[];
  else if(path==='/api/supplier-invoices/1'&&req.method()==='GET')data=row;
  else if(path==='/api/supplier-invoices/1'&&req.method()==='PUT'){const body=req.postDataJSON();assert.equal(body.draft.invoiceNumber,'ABC-2026/01');assert.equal(body.draft.total,'');assert.equal(body.version,row.version);saved++;row={...row,supplier_draft:body.draft,reference:body.draft.invoiceNumber,version:row.version+1};data=row;}
  else if(path==='/api/supplier-invoices/1/classification'){const body=req.postDataJSON();assert.equal(body.version,row.version);assert.equal(body.draft,undefined);classified++;row={...row,review_kind:body.kind,version:row.version+1};data=row;}
  else if(path==='/api/supplier-invoices/1/source')return route.fulfill({contentType:'application/pdf',body:pdf});
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto((process.env.TEST_UI_URL||'http://127.0.0.1:5180')+'/facturas-proveedores');
 await page.getByRole('button',{name:'Obrir',exact:true}).click();let dialog=page.getByRole('dialog');
 await dialog.getByLabel('Número de factura',{exact:true}).fill('ABC-2026/01');
 await dialog.getByRole('button',{name:'Guardar dades',exact:true}).click();await page.getByText('Dades guardades.',{exact:true}).first().waitFor();assert.equal(saved,1);
 await dialog.getByRole('button',{name:'No és una factura',exact:true}).click();await dialog.getByRole('button',{name:'Marcar com a factura',exact:true}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Guardar dades',exact:true}).count(),0);
 await dialog.getByRole('button',{name:'Marcar com a factura',exact:true}).click();await dialog.getByRole('button',{name:'Guardar dades',exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.getByRole('button',{name:'No és una factura',exact:true}).click();await page.getByRole('button',{name:'No factures',exact:true}).click();await page.getByRole('button',{name:'Marcar com a factura',exact:true}).waitFor();assert.equal(classified,3);
 await page.getByRole('button',{name:'Obrir',exact:true}).click();await page.setViewportSize({width:390,height:844});dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Marcar com a factura',exact:true}).waitFor();assert.equal(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+2),true);
 assert.deepEqual(errors,[]);console.log('Supplier UI: incomplete save, direct classification, restoration, tabs, PDF and mobile layout passed.');
}finally{await browser.close();}
