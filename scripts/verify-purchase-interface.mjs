// Isolated UI verification: every API request is mocked; no database is contacted.
import assert from 'node:assert/strict';
import {writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';
import {purchaseNumber,purchaseDecimal} from '../shared/purchases.js';
import {invoicePdf} from '../backend/test-support/invoice-fixture.js';

const origin='http://127.0.0.1:5182';
const name=`purchase-interface-preview-${process.pid}.html`,file=resolve('frontend',name);
const fixture=`<!doctype html><html><body><div id="app"></div><script type="module">
import {createApp,h,ref} from 'vue';import Editor from '/src/components/PurchaseDocumentEditor.vue';import Upload from '/src/components/PurchaseUpload.vue';
import Purchases from '/src/views/PurchasesView.vue';import {useContext} from '/src/composables/context.js';import {useAccess} from '/src/composables/access.js';
const scenario=new URLSearchParams(location.search).get('scenario');
if(['orders-list','group-list'].includes(scenario)){await useAccess().refresh();await useContext().refresh('85');}
const document={id:scenario==='new'?null:7,kind:'invoices',status:'draft',version:1,reference:'UI-TEST',supplier_account_id:20,document_date:scenario==='new'?'':'2026-11-01',due_date:'',notes:'',original_document_id:scenario==='original'?9:null,source_name:'original.png',source_mime:'image/png',lines:[{id:101,item_id:1,description:'Material',quantity:'1',unit_price:'10',discount_rate:'0',tax_rate:'21',links:[]}],differences:[],price_comparisons:[]};
const catalog={items:[{id:1,code:'MAT-1',description:'Material',unit_code:'kg',active:true}],suppliers:[{id:20,description:'Supplier',code:'40000001'}],sources:[]};
if(scenario==='original-pdf'){document.original_document_id=10;document.source_name='factura.pdf';document.source_mime='application/octet-stream';const {setCompanyId}=await import('/src/services/company.js');setCompanyId(85);}
if(scenario==='cancellation')document.kind='receipts';
if(scenario==='purchase-chain'){
 document.id=81;document.kind='orders';document.status='confirmed';document.reference='CHAIN-ORDER';document.lines[0]={...document.lines[0],id:811,quantity:'3.500001',received_quantity:'0.000000',pending_quantity:'3.500001'};
}
if(scenario==='differences'){
 document.reference='DIFF';document.differences=[{line_id:'101',kind:'unlinked_quantity',quantity:'0.500000'},{line_id:101,kind:'price',source:'order',source_price:'9.123456',invoice_price:'10.000000'}];
}
if(scenario.startsWith('amounts'))document.extraction={base_total:'10.00',tax_total:'2.10',total_amount:scenario==='amounts-match'?'12.10':'12.11',withholding_rate:'0',currency:'EUR'};
if(scenario==='invoice-line-limit')document.lines=Array.from({length:41},(_,index)=>({...document.lines[0],id:101+index}));
if(scenario.startsWith('receipt-invoice')){
 document.id=8;document.kind='receipts';document.status='confirmed';document.reference='RECEIPT-8';
 document.lines=[{id:51,item_id:1,description:'Partial invoicing',quantity:'2.500001',pending_invoice_quantity:'1.500000',unit_price:'10',discount_rate:'5',tax_rate:'21',links:[]},
 {id:52,item_id:1,description:'Unpriced material',quantity:'4',pending_invoice_quantity:'4.000000',unit_price:null,discount_rate:'0',tax_rate:'21',links:[]},
 {id:53,item_id:1,description:'Invoiced material',quantity:'1',pending_invoice_quantity:'0.000000',unit_price:'10',discount_rate:'0',tax_rate:'21',links:[]}];
 if(scenario==='receipt-invoice-complete')document.lines.forEach(line=>line.pending_invoice_quantity='0.000000');
 if(scenario==='receipt-invoice-complete')document.invoice_allocations=[{purchase_invoice_id:71,reference:'INV-71',document_date:'2026-11-05',receipt_line_id:51,description:'Partial invoicing',quantity:'1.000001',unit_code:'kg'},{purchase_invoice_id:72,reference:'INV-72',document_date:'2026-11-06',receipt_line_id:51,description:'Remaining invoicing',quantity:'1.500000',unit_code:'kg'}];
}
if(['order-progress','order-receive','order-complete'].includes(scenario)){
 document.kind='orders';document.status='confirmed';
 document.lines=[{id:101,item_id:1,description:'Partial material',unit_code:'kg',quantity:'2.500001',received_quantity:'1.000001',pending_quantity:'1.500000',unit_price:'10',discount_rate:'0',tax_rate:'21',links:[]},
 {id:102,item_id:1,description:'Pending material',unit_code:'litres',quantity:'4',received_quantity:'0.000000',pending_quantity:'4.000000',unit_price:'10',discount_rate:'0',tax_rate:'21',links:[]},
 {id:103,item_id:1,description:'Complete material',unit_code:'unitats',quantity:'1',received_quantity:'1.000000',pending_quantity:'0.000000',unit_price:'10',discount_rate:'0',tax_rate:'21',links:[]}];
 if(scenario==='order-complete')document.lines=document.lines.map(line=>({...line,pending_quantity:'0.000000'}));
 if(scenario==='order-progress')document.receipt_allocations=[{purchase_receipt_id:62,reference:'RECEIPT-1',document_date:'2026-11-03',order_line_id:101,description:'First reception',quantity:'0.400001',unit_code:'kg'},{purchase_receipt_id:63,reference:'RECEIPT-2',document_date:'2026-11-04',order_line_id:101,description:'Second reception',quantity:'0.600000',unit_code:'kg'}];
}
if(scenario.startsWith('links')){
 catalog.items.push({id:2,code:'MAT-2',description:'Other material',unit_code:'kg',active:true});
 catalog.suppliers.push({id:21,description:'Other supplier',code:'40000002'});
 catalog.sources=[{id:51,kind:'order',item_id:1,supplier_account_id:20,reference:'ORDER-1',quantity:'10',unit_code:'kg'},
 {id:52,kind:'receipt',item_id:1,supplier_account_id:20,reference:'RECEIPT-1',quantity:'10',unit_code:'kg'},
 {id:53,kind:'order',item_id:2,supplier_account_id:20,reference:'WRONG-ITEM',quantity:'10',unit_code:'kg'},
 {id:54,kind:'order',item_id:1,supplier_account_id:21,reference:'OTHER-SUPPLIER',quantity:'10',unit_code:'kg'}];
 if(scenario==='links-receipts')document.kind='receipts';
 if(scenario==='links-invalid')document.lines[0].links=[{kind:'order',line_id:999,quantity:'1'}];
 if(scenario==='links-navigation'){
  catalog.sources[0].document_id=61;catalog.sources[1].document_id=62;
  document.lines[0].links=[{kind:'order',line_id:51,quantity:'0.4'},{kind:'receipt',line_id:52,quantity:'0.6'}];
 }
 if(scenario.startsWith('links-trace')){
  catalog.sources[0].document_id=61;catalog.sources[1].document_id=62;
  document.lines[0].links=[{kind:'order',line_id:51,quantity:'0.6'},{kind:'receipt',line_id:52,quantity:'0.4'}];
  document.lines.push({...document.lines[0],id:102,description:'Second line',quantity:'2',links:[{kind:'receipt',line_id:52,quantity:'1.200001'}]});
  if(scenario.endsWith('confirmed'))document.status='confirmed';
 }
}
createApp({setup:()=>{const company=ref(1);return ()=>['orders-list','group-list'].includes(scenario)?h(Purchases):scenario==='upload'?h('div',[h(Upload,{key:company.value,onDraft:draft=>window.uploadDraft=draft}),h('button',{onClick:()=>company.value++},'Switch company')]):h(Editor,{document,kind:document.kind,catalog,exercise:{id:1,start_date:'2026-01-01',end_date:'2026-12-31',status:scenario==='closed'?'closed':'open'},onInvoice:id=>window.openedInvoice=id,canWrite:scenario!=='readonly',canPostInvoices:scenario!=='receipt-invoice-no-post',canConfirm:scenario!=='readonly'});}}).mount('#app');
</script></body></html>`;
let server,browser,page,created=false,passed=false;
const requests=[],unexpected=[],pageErrors=[];
let uploadHandler;
let originFailure=false;
let receiptOrderComplete=false;
let invoiceReceiptComplete=false;
let groupMode='normal';
let omitGroupReceipt=false;const listLoads=[];
let cancellationBlocked=true,cancellationDone=false;const cancellationCalls=[];
const chainCalls=[];let chainReceipt=null,chainInvoice=null;
const chainOrder=()=>({id:81,kind:'orders',status:'confirmed',version:1,reference:'CHAIN-ORDER',supplier_account_id:20,document_date:'2026-11-01',lines:[{id:811,item_id:1,description:'Material',quantity:'3.500001',unit_price:'10',discount_rate:'0',tax_rate:'21',received_quantity:chainReceipt?.status==='confirmed'?chainReceipt.lines[0].quantity:'0.000000',pending_quantity:purchaseDecimal(purchaseNumber('3.500001')-(chainReceipt?.status==='confirmed'?purchaseNumber(chainReceipt.lines[0].quantity):0n)),links:[]}]});
function currentChainReceipt(){const consumed=chainInvoice?.status==='confirmed'?purchaseNumber(chainInvoice.lines[0].quantity):0n;return {...chainReceipt,lines:chainReceipt.lines.map(line=>({...line,invoiced_quantity:purchaseDecimal(consumed),pending_invoice_quantity:purchaseDecimal(purchaseNumber(line.quantity)-consumed)}))};}
try{
 writeFileSync(file,fixture,{flag:'wx'});created=true;
 server=spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5182','--strictPort'],{cwd:resolve('frontend'),windowsHide:true,stdio:['ignore','pipe','pipe']});
 let serverErrors='';server.stdout.resume();server.stderr.on('data',chunk=>{serverErrors+=chunk.toString().slice(0,1000);});
 let ready=false;
 for(let attempt=0;attempt<300;attempt++){
  if(server.exitCode!==null)throw new Error('Isolated Vite failed: '+serverErrors);
  try{ready=(await fetch(origin+'/'+name)).ok;}catch{}
  if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(ready,true,'Isolated frontend did not start');
 browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}});
 await page.addInitScript(()=>{if(window!==window.top)window.print=()=>{window.top.printedSummary={text:document.body.textContent,inputs:document.querySelectorAll('input').length,buttons:document.querySelectorAll('button').length,images:document.querySelectorAll('img').length};window.dispatchEvent(new Event('afterprint'));};});
 page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(url.origin!==origin){unexpected.push(request.url());return route.abort();}
  if(uploadHandler&&path.startsWith('/api/purchases/'))return uploadHandler(route,path,request);
  if(request.method()==='GET'&&/^\/api\/purchases\/(orders|receipts|invoices)$/.test(path))listLoads.push(path);
  if(new URL(page.url()).searchParams.get('scenario')==='cancellation'&&path.startsWith('/api/purchases/')){
   cancellationCalls.push({path,method:request.method(),body:request.method()==='POST'?request.postDataJSON():null});
   if(path==='/api/purchases/receipts/7/audit')return route.fulfill({json:[{actor:'tester',created_at:'2026-11-08',action:cancellationDone?'cancel':'create'}]});
   if(path==='/api/purchases/receipts/7/dependencies')return route.fulfill({json:[{kind:'invoices',id:71,reference:'BLOCKING-71',document_date:'2026-11-08',status:'draft'}]});
   if(path==='/api/purchases/invoices/71')return route.fulfill({json:{id:71,kind:'invoices',reference:'BLOCKING-71',status:'draft',lines:[],differences:[],price_comparisons:[]}});
   if(path==='/api/purchases/receipts/7/cancel'){
    if(cancellationBlocked)return route.fulfill({status:409,json:{error:{code:'PURCHASE_HAS_DEPENDENCIES'}}});
    cancellationDone=true;return route.fulfill({json:{id:7,kind:'receipts',status:'cancelled',reference:'UI-TEST',version:2,lines:[],differences:[],price_comparisons:[]}});
   }
   unexpected.push(path);return route.abort();
  }
  if(new URL(page.url()).searchParams.get('scenario')==='purchase-chain'&&path.startsWith('/api/purchases/')){
   const method=request.method(),body=method==='POST'?request.postDataJSON():null;chainCalls.push({path,method,body});
   if(path==='/api/purchases/orders/81'&&method==='GET')return route.fulfill({json:chainOrder()});
   if(path==='/api/purchases/receipts'&&method==='POST'){chainReceipt={...body,id:82,kind:'receipts',status:'draft',version:1,lines:body.lines.map((line,index)=>({...line,id:821+index})),differences:[],price_comparisons:[]};return route.fulfill({json:currentChainReceipt()});}
   if(path==='/api/purchases/receipts/82/confirm'&&method==='POST'){chainReceipt={...chainReceipt,status:'confirmed',version:2};return route.fulfill({json:currentChainReceipt()});}
   if(path==='/api/purchases/receipts/82'&&method==='GET')return route.fulfill({json:currentChainReceipt()});
   if(path==='/api/purchases/invoices'&&method==='POST'){chainInvoice={...body,id:83,kind:'invoices',status:'draft',version:1,lines:body.lines.map((line,index)=>({...line,id:831+index})),differences:[],price_comparisons:[]};return route.fulfill({json:chainInvoice});}
   if(path==='/api/purchases/invoices/83/confirm'&&method==='POST'){chainInvoice={...chainInvoice,status:'confirmed',version:2,invoice_id:99};return route.fulfill({json:chainInvoice});}
   unexpected.push(method+' '+path);return route.abort();
  }
  if(path==='/api/purchases/invoices/71'&&request.method()==='GET'){
   if(originFailure)return route.fulfill({status:404,json:{error:{code:'PURCHASE_NOT_FOUND'}}});
   return route.fulfill({json:{id:71,kind:'invoices',status:'confirmed',reference:'INV-71',supplier_account_id:20,document_date:'2026-11-05',lines:[{id:201,item_id:1,description:'Linked invoice line',quantity:'1.000001',unit_price:'10',discount_rate:'0',tax_rate:'21',links:[]}],differences:[],price_comparisons:[]}});
  }
  if(path==='/api/purchases/receipts/8'&&request.method()==='GET')return route.fulfill({json:{id:8,kind:'receipts',status:'confirmed',reference:'RECEIPT-8',supplier_account_id:20,lines:[
   {id:51,item_id:1,description:'Partial invoicing',quantity:'2.500001',pending_invoice_quantity:invoiceReceiptComplete?'0.000000':'1.250001',unit_price:'10',discount_rate:'5',tax_rate:'21'},
   {id:52,item_id:1,description:'Unpriced material',quantity:'4',pending_invoice_quantity:invoiceReceiptComplete?'0.000000':'4.000000',unit_price:null,discount_rate:'0',tax_rate:'21'},
   {id:53,item_id:1,description:'Invoiced material',quantity:'1',pending_invoice_quantity:'0.000000',unit_price:'10',discount_rate:'0',tax_rate:'21'}
  ]}});
  if(path==='/api/purchases/orders/7'&&request.method()==='GET')return route.fulfill({json:{id:7,kind:'orders',status:'confirmed',reference:'UI-TEST',supplier_account_id:20,lines:[
   {id:101,item_id:1,description:'Partial material',quantity:'2.500001',pending_quantity:receiptOrderComplete?'0.000000':'1.250001',unit_price:'10',discount_rate:'5',tax_rate:'21'},
   {id:102,item_id:1,description:'Pending material',quantity:'4',pending_quantity:receiptOrderComplete?'0.000000':'4.000000',unit_price:null,discount_rate:'0',tax_rate:'21'},
   {id:103,item_id:1,description:'Complete material',quantity:'1',pending_quantity:'0.000000',unit_price:'10',discount_rate:'0',tax_rate:'21'}
  ]}});
  if(path==='/api/purchases/receipts'&&request.method()==='POST'){
   const body=request.postDataJSON();requests.push({action:'save-receipt',body});return route.fulfill({json:{...body,id:70,kind:'receipts',status:'draft',version:1,lines:body.lines,differences:[],price_comparisons:[]}});
  }
  if(path==='/api/purchases/receipts/70/confirm'&&request.method()==='POST'){
   receiptOrderComplete=true;return route.fulfill({json:{id:70,kind:'receipts',status:'confirmed',reference:'RECEIVE-TEST',lines:[],differences:[],price_comparisons:[]}});
  }
  if(['/api/purchases/orders/61','/api/purchases/receipts/62'].includes(path)&&request.method()==='GET'){
   requests.push({action:'open-origin',path});
   if(originFailure)return route.fulfill({status:404,json:{error:{code:'PURCHASE_NOT_FOUND'}}});
   const receipt=path.includes('/receipts/');
   return route.fulfill({json:{id:receipt?62:61,kind:receipt?'receipts':'orders',status:'confirmed',reference:receipt?'RECEIPT-1':'ORDER-1',supplier_account_id:20,document_date:'2026-10-20',lines:[{id:receipt?52:51,item_id:1,description:'Original material',quantity:'10',unit_price:'9',discount_rate:'0',tax_rate:'21',links:receipt?[{kind:'order',line_id:51,quantity:'10'}]:[]}],differences:[],price_comparisons:[]}});
  }
  if(path==='/api/accounts')return route.fulfill({json:[]});
  const groupScenario=new URL(page.url()).searchParams.get('scenario')==='group-list';
  const listScenario=groupScenario||new URL(page.url()).searchParams.get('scenario')==='orders-list';
  if(path==='/api/access/session')return route.fulfill({json:{user:listScenario?{id:1,permissions:{purchases_read:true,purchases_write:groupScenario}}:null,users:[],master_setup_required:false}});
  if(groupScenario){
   if(path==='/api/purchases/catalog')return route.fulfill({json:{units:[],items:[{id:1,code:'MAT',description:'Material',unit_code:'kg',active:true}],suppliers:[{id:20,code:'40000001',description:'Alpha'},{id:21,code:'40000002',description:'Beta'}],sources:[{id:151,kind:'receipt',document_id:11,supplier_account_id:20,item_id:1,reference:'GROUP-A',quantity:'10'},{id:152,kind:'receipt',document_id:12,supplier_account_id:20,item_id:1,reference:'GROUP-B',quantity:'10'}]}});
   if(path==='/api/purchases/receipts')return route.fulfill({json:[
    {id:11,reference:'GROUP-A',supplier_account_id:20,supplier_name:'Alpha',status:'confirmed',invoice_progress:'pending'},
    {id:12,reference:'GROUP-B',supplier_account_id:20,supplier_name:'Alpha',status:'confirmed',invoice_progress:'partial'},
    {id:13,reference:'GROUP-OTHER',supplier_account_id:21,supplier_name:'Beta',status:'confirmed',invoice_progress:'pending'},
    {id:14,reference:'GROUP-COMPLETE',supplier_account_id:20,supplier_name:'Alpha',status:'confirmed',invoice_progress:'complete'}
   ].filter(row=>!omitGroupReceipt||row.id!==12).map(row=>({...row,line_count:1,pending_invoice_lines:row.id===14?0:1}))});
   if(['/api/purchases/receipts/11','/api/purchases/receipts/12'].includes(path)){
    const second=path.endsWith('/12');return route.fulfill({json:{id:second?12:11,reference:second?'GROUP-B':'GROUP-A',supplier_account_id:second&&groupMode==='wrong-supplier'?21:20,status:'confirmed',lines:[{id:second?152:151,item_id:1,description:second?'Second material':'First material',quantity:'10',pending_invoice_quantity:second&&groupMode==='completed'?'0.000000':second?'2.000000':groupMode==='changed-quantity'?'0.750001':'1.250001',unit_price:second?(groupMode==='unpriced'?null:'12'):'10',discount_rate:second?'0':'5',tax_rate:second&&groupMode==='mixed-tax'?'10':second&&groupMode==='zero-tax'?'0':'21'}]}});
   }
  }
  if(listScenario){
   if(path==='/api/companies')return route.fulfill({json:[{id:85,name:'Mock company'}]});
   if(path==='/api/context')return route.fulfill({json:{company:{id:85,name:'Mock company'},exercises:[{id:1,start_date:'2026-01-01',end_date:'2026-12-31',status:'open'}]}});
   if(path==='/api/purchases/catalog')return route.fulfill({json:{units:[],items:[],suppliers:[],sources:[]}});
   if(path==='/api/purchases/invoices'&&request.method()==='GET')return route.fulfill({json:[{id:31,reference:'INVOICE-DRAFT',supplier_name:'Alpha',supplier_account_id:20,status:'draft'},{id:32,reference:'INVOICE-CONFIRMED',supplier_name:'Beta',supplier_account_id:21,status:'confirmed'},{id:33,reference:'INVOICE-CANCELLED',supplier_name:'Beta',supplier_account_id:21,status:'cancelled'}]});
   if(path==='/api/purchases/receipts')return route.fulfill({json:[
    {id:11,reference:'RECEIPT-PENDING',supplier_name:'Alpha',status:'confirmed',invoice_progress:'pending',pending_invoice_lines:2},
    {id:12,reference:'RECEIPT-PARTIAL',supplier_name:'Beta',status:'confirmed',invoice_progress:'partial',pending_invoice_lines:1},
    {id:13,reference:'RECEIPT-COMPLETE',supplier_name:'Alpha',status:'confirmed',invoice_progress:'complete',pending_invoice_lines:0},
    {id:14,reference:'RECEIPT-DRAFT',supplier_name:'Alpha',status:'draft',invoice_progress:'draft',pending_invoice_lines:1},
    {id:15,reference:'RECEIPT-CANCELLED',supplier_name:'Beta',status:'cancelled',invoice_progress:'cancelled',pending_invoice_lines:1}
   ].map(row=>({...row,supplier_account_id:row.supplier_name==='Alpha'?20:21,document_date:'2026-11-01',line_count:2}))});
   if(path==='/api/purchases/orders')return route.fulfill({json:[
    {id:1,reference:'ORDER-PENDING',supplier_name:'Alpha',status:'confirmed',progress:'pending'},
    {id:2,reference:'ORDER-PARTIAL',supplier_name:'Beta',status:'confirmed',progress:'partial'},
    {id:3,reference:'ORDER-COMPLETE',supplier_name:'Alpha',status:'confirmed',progress:'complete'},
    {id:4,reference:'ORDER-DRAFT',supplier_name:'Alpha',status:'draft',progress:'pending'},
    {id:5,reference:'ORDER-CANCELLED',supplier_name:'Beta',status:'cancelled',progress:'partial'}
   ].map(row=>({...row,supplier_account_id:row.supplier_name==='Alpha'?20:21,document_date:row.id===5?null:'2026-11-0'+(6-row.id),line_count:1,ordered_quantity:'10',received_quantity:'0'}))});
  }
  if(path==='/api/documentation/9/source')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6QAAAABJRU5ErkJggg==','base64')});
  if(path==='/api/documentation/10/source')return route.fulfill({contentType:'application/pdf',headers:{'Content-Disposition':new URL(route.request().url()).searchParams.get('download')==='1'?'attachment; filename="factura.pdf"':'inline; filename="factura.pdf"','X-Content-Type-Options':'nosniff'},body:invoicePdf('UI test','PDF-UI')});
  if(['/api/purchases/invoices','/api/purchases/invoices/7'].includes(path)&&['POST','PATCH'].includes(request.method())){
   const body=request.postDataJSON();requests.push({action:'save',body});
   return route.fulfill({json:{...body,id:7,kind:'invoices',status:'draft',version:2,original_document_id:null,lines:body.lines,differences:body.reference==='DIFF'?[{line_id:101,kind:'unlinked_quantity',quantity:'0.500000'}]:[],price_comparisons:[]}});
  }
  if(path==='/api/purchases/invoices/7/confirm'&&request.method()==='POST'){
   if(new URL(page.url()).searchParams.get('scenario')==='receipt-invoice')invoiceReceiptComplete=true;
   const body=request.postDataJSON();requests.push({action:'confirm',body});
   return route.fulfill({json:{id:7,kind:'invoices',status:'confirmed',version:3,reference:'UI-TEST',invoice_id:99,lines:[],differences:[],price_comparisons:[]}});
  }
  unexpected.push(request.method()+' '+path);return route.fulfill({status:500,json:{error:{code:'UNEXPECTED_MOCK_REQUEST'}}});
 });
 const open=async scenario=>{
  try{await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('contabilitat:purchase-filters:'))localStorage.removeItem(key);});}catch{}
  return page.goto(origin+'/'+name+'?scenario='+scenario);
 };
 const downloadCsvContent=async(button,filename)=>{
  await page.evaluate(()=>{const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{if(blob.type==='text/csv;charset=utf-8')window.exportedCsv=blob.text();return create(blob);};});
  const [download]=await Promise.all([page.waitForEvent('download'),button.click()]);assert.equal(download.suggestedFilename(),filename);return page.evaluate(()=>window.exportedCsv);
 };
 const dateInput=()=>page.getByLabel('Data',{exact:true});
 const postingInput=()=>page.getByLabel('Data comptable',{exact:true});
 const save=async()=>{
  await Promise.all([page.waitForResponse(response=>response.url().includes('/api/purchases/invoices')&&['POST','PATCH'].includes(response.request().method())),page.getByRole('button',{name:'Guardar esborrany',exact:true}).click()]);
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Guardar esborrany'&&!button.disabled));
 };
 const confirm=()=>page.getByRole('button',{name:'Confirmar factura i comptabilitzar',exact:true});
 const review=()=>page.getByRole('checkbox');

 await open('cancellation');
 await page.getByText('Historial del document',{exact:true}).click();await page.getByText(/tester · create/).waitFor();await page.getByText('Historial del document',{exact:true}).click();
 const cancelDocument=()=>page.getByRole('button',{name:'Cancel·lar document',exact:true});
 page.once('dialog',dialog=>dialog.dismiss());await cancelDocument().click();assert.equal(cancellationCalls.filter(call=>call.method==='POST').length,0,'Dismissing cancellation must not send a request');
 page.once('dialog',dialog=>dialog.accept());await cancelDocument().click();await page.getByRole('alert').waitFor();assert.equal(await cancelDocument().isEnabled(),true,'Dependency failure must preserve the current document');
 const blockers=page.getByRole('region',{name:'Documents que impedeixen cancel·lar',exact:true});await blockers.waitFor();
 assert.deepEqual(await blockers.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].slice(0,4).map(cell=>cell.textContent))),[['Factura','BLOCKING-71','08/11/2026','Esborrany']]);
 await blockers.getByRole('button',{name:'Consultar BLOCKING-71',exact:true}).click();const blockingInvoice=page.getByRole('dialog',{name:'Factura de compra · BLOCKING-71',exact:true});await blockingInvoice.waitFor();assert.equal(await blockingInvoice.getByRole('button',{name:'Guardar esborrany',exact:true}).count(),0);assert.equal(await blockingInvoice.getByRole('button',{name:'Cancel·lar document',exact:true}).count(),0);
 await page.keyboard.press('Escape');await blockingInvoice.waitFor({state:'detached'});await blockers.waitFor();
 cancellationBlocked=false;page.once('dialog',dialog=>dialog.accept());await cancelDocument().click();await cancelDocument().waitFor({state:'detached'});await page.getByText('Document cancel·lat',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Guardar esborrany',exact:true}).count(),0);
 assert.equal(await blockers.count(),0,'Successful cancellation must clear the dependency detail');
 const cancellationPosts=cancellationCalls.filter(call=>call.method==='POST');assert.equal(cancellationPosts.length,2);assert.equal(cancellationPosts[0].body.request_id,cancellationPosts[1].body.request_id,'Retry must preserve its request identifier');
 await page.getByText('Historial del document',{exact:true}).click();await page.getByText(/tester · cancel/).waitFor();assert.equal(cancellationCalls.filter(call=>call.path.endsWith('/audit')).length,2,'Successful cancellation must invalidate cached audit history');

 await open('purchase-chain');await page.getByRole('button',{name:'Crear albarà amb les quantitats pendents',exact:true}).click();
 const chainReceiptDialog=page.getByRole('dialog',{name:'Albarà nova',exact:true});await chainReceiptDialog.waitFor();
 await chainReceiptDialog.getByLabel('Quantitat 1',{exact:true}).fill('1.250001');await chainReceiptDialog.getByLabel('Quantitat vinculada 1 1',{exact:true}).fill('1.250001');await chainReceiptDialog.getByLabel('Referència',{exact:true}).fill('CHAIN-RECEIPT');await chainReceiptDialog.getByLabel('Data',{exact:true}).fill('05/11/2026');await chainReceiptDialog.getByLabel('Data',{exact:true}).press('Tab');
 await chainReceiptDialog.getByRole('button',{name:'Guardar esborrany',exact:true}).click();
 const chainSavedReceipt=page.getByRole('dialog',{name:'Albarà · CHAIN-RECEIPT',exact:true});await chainSavedReceipt.waitFor();await chainSavedReceipt.getByRole('checkbox',{name:/He revisat les dades/}).check();await chainSavedReceipt.getByRole('button',{name:'Confirmar albarà',exact:true}).click();await chainSavedReceipt.getByRole('button',{name:'Crear factura amb les quantitats pendents',exact:true}).waitFor();
 assert.equal(chainReceipt.lines[0].links[0].line_id,811);assert.equal(chainReceipt.lines[0].links[0].quantity,'1.250001');
 await chainSavedReceipt.getByRole('button',{name:'Crear factura amb les quantitats pendents',exact:true}).click();
 const chainInvoiceDialog=page.getByRole('dialog',{name:'Factura de compra nova',exact:true});await chainInvoiceDialog.waitFor();assert.equal(await chainInvoiceDialog.getByLabel('Quantitat 1',{exact:true}).inputValue(),'1.250001');assert.equal(await chainInvoiceDialog.getByLabel('Document origen 1 1',{exact:true}).inputValue(),'receipt:821');
 await chainInvoiceDialog.getByLabel('Quantitat 1',{exact:true}).fill('0.500001');await chainInvoiceDialog.getByLabel('Quantitat vinculada 1 1',{exact:true}).fill('0.500001');await chainInvoiceDialog.getByLabel('Referència',{exact:true}).fill('CHAIN-INVOICE');await chainInvoiceDialog.getByLabel('Data',{exact:true}).fill('06/11/2026');await chainInvoiceDialog.getByLabel('Data',{exact:true}).press('Tab');await save();
 const chainSavedInvoice=page.getByRole('dialog',{name:'Factura de compra · CHAIN-INVOICE',exact:true});await chainSavedInvoice.getByRole('checkbox',{name:/He revisat les dades/}).check();await chainSavedInvoice.getByRole('button',{name:'Confirmar factura i comptabilitzar',exact:true}).click();await chainSavedInvoice.getByRole('button',{name:'Veure factura comptabilitzada',exact:true}).waitFor();
 assert.deepEqual(chainInvoice.lines[0].links,[{kind:'receipt',line_id:821,quantity:'0.500001'}]);assert.equal(chainInvoice.supplier_account_id,20);
 assert.deepEqual(chainCalls.filter(call=>call.path.endsWith('/confirm')).map(call=>[call.path,call.body.reviewed]),[['/api/purchases/receipts/82/confirm',true],['/api/purchases/invoices/83/confirm',true]]);assert.equal(chainCalls.find(call=>call.path==='/api/purchases/invoices/83/confirm').body.posting_date,'2026-11-06');
 await chainSavedReceipt.getByRole('region',{name:'Facturació de l’albarà',exact:true}).getByRole('cell',{name:'0,75',exact:true}).waitFor();
 const chainOrderDialog=page.getByRole('dialog',{name:'Comanda · CHAIN-ORDER',exact:true});await chainOrderDialog.getByRole('region',{name:'Recepció de la comanda',exact:true}).getByRole('cell',{name:'2,25',exact:true}).waitFor();
 await chainSavedInvoice.getByRole('button',{name:'Veure factura comptabilitzada',exact:true}).click();assert.equal(await page.evaluate(()=>window.openedInvoice),99,'Posted invoice navigation must propagate through receipt and order editors');

 await open('orders-list');
 const filter=()=>page.getByRole('checkbox',{name:'Només comandes pendents de rebre (2)',exact:true});
 await filter().waitFor();await page.getByRole('cell',{name:'ORDER-CANCELLED',exact:true}).waitFor();
 const listed=()=>page.locator('tbody tr').evaluateAll(rows=>rows.map(row=>row.cells[0].textContent));
 const documentCount=()=>page.getByRole('status',{name:'Recompte de documents',exact:true});
 const clearFilters=()=>page.getByRole('button',{name:'Netejar filtres',exact:true});
 assert.equal(await clearFilters().isDisabled(),true);
 const activeFilters=()=>page.getByRole('region',{name:'Filtres actius',exact:true});
 const removeFilter=label=>activeFilters().getByRole('button',{name:'Treure filtre: '+label,exact:true}).click();
 assert.equal(await activeFilters().count(),0);
 assert.equal(await documentCount().innerText(),'Mostrant 5 de 5 documents carregats.');
 const sortDocuments=()=>page.getByRole('combobox',{name:'Ordenar documents',exact:true});
 assert.equal(await sortDocuments().inputValue(),'date_desc');await sortDocuments().selectOption('date_asc');assert.deepEqual(await listed(),['ORDER-DRAFT','ORDER-COMPLETE','ORDER-PARTIAL','ORDER-PENDING','ORDER-CANCELLED'],'Missing dates must remain last when sorting oldest first');
 await sortDocuments().selectOption('reference_asc');assert.deepEqual(await listed(),['ORDER-CANCELLED','ORDER-COMPLETE','ORDER-DRAFT','ORDER-PARTIAL','ORDER-PENDING']);
 await sortDocuments().selectOption('reference_desc');assert.deepEqual(await listed(),['ORDER-PENDING','ORDER-PARTIAL','ORDER-DRAFT','ORDER-COMPLETE','ORDER-CANCELLED']);
 await sortDocuments().selectOption('date_desc');assert.deepEqual(await listed(),['ORDER-PENDING','ORDER-PARTIAL','ORDER-COMPLETE','ORDER-DRAFT','ORDER-CANCELLED']);
 const from=()=>page.getByRole('textbox',{name:'Des de',exact:true}),to=()=>page.getByRole('textbox',{name:'Fins a',exact:true});
 const supplierFilter=()=>page.getByRole('combobox',{name:'Filtrar per proveïdor',exact:true}),exportList=()=>page.getByRole('button',{name:'Exportar llistat CSV',exact:true});
 await page.getByRole('button',{name:'Veure esborranys',exact:true}).click();assert.deepEqual(await listed(),['ORDER-DRAFT']);
 await page.getByRole('button',{name:'Veure cancel·lats',exact:true}).click();assert.deepEqual(await listed(),['ORDER-CANCELLED']);
 await page.getByRole('button',{name:'Albarans pendents',exact:true}).click();await page.getByRole('cell',{name:'RECEIPT-PARTIAL',exact:true}).waitFor();assert.deepEqual(await listed(),['RECEIPT-PENDING','RECEIPT-PARTIAL']);await clearFilters().click();
 await page.getByRole('button',{name:'Comandes pendents',exact:true}).click();await page.getByRole('cell',{name:'ORDER-PARTIAL',exact:true}).waitFor();assert.deepEqual(await listed(),['ORDER-PENDING','ORDER-PARTIAL']);await clearFilters().click();
 await page.getByRole('button',{name:'Dates de l’exercici seleccionat',exact:true}).click();assert.equal(await from().inputValue(),'01/01/2026');assert.equal(await to().inputValue(),'31/12/2026');assert.deepEqual(await listed(),['ORDER-PENDING','ORDER-PARTIAL','ORDER-COMPLETE','ORDER-DRAFT']);await clearFilters().click();
 await from().fill('03/11/2026');await from().press('Tab');await to().fill('04/11/2026');await to().press('Tab');assert.deepEqual(await listed(),['ORDER-PARTIAL','ORDER-COMPLETE'],'Date bounds must be inclusive and exclude undated documents');
 await supplierFilter().selectOption('20');assert.deepEqual(await listed(),['ORDER-COMPLETE']);
 assert.match(await activeFilters().innerText(),/Proveïdor: Alpha/);assert.match(await activeFilters().innerText(),/Des de: 03\/11\/2026/);assert.match(await activeFilters().innerText(),/Fins a: 04\/11\/2026/);
 await removeFilter('Proveïdor: Alpha');assert.equal(await supplierFilter().inputValue(),'');assert.equal(await from().inputValue(),'03/11/2026');assert.equal(await to().inputValue(),'04/11/2026');assert.deepEqual(await listed(),['ORDER-PARTIAL','ORDER-COMPLETE']);await supplierFilter().selectOption('20');
 await removeFilter('Des de: 03/11/2026');assert.equal(await from().inputValue(),'');assert.equal(await to().inputValue(),'04/11/2026');await from().fill('03/11/2026');await from().press('Tab');
 await sortDocuments().selectOption('reference_asc');const listLoadCount=listLoads.length;await page.getByRole('button',{name:'Actualitzar llistat',exact:true}).click();await page.getByRole('cell',{name:'ORDER-COMPLETE',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('select')?.disabled);assert.equal(listLoads.length,listLoadCount+1);assert.equal(await from().inputValue(),'03/11/2026');assert.equal(await to().inputValue(),'04/11/2026');assert.equal(await supplierFilter().inputValue(),'20');assert.equal(await sortDocuments().inputValue(),'reference_asc');
 const filteredCsv=await downloadCsvContent(exportList(),'compres-orders-85.csv');assert.match(filteredCsv,/ORDER-COMPLETE/);assert.doesNotMatch(filteredCsv,/ORDER-PENDING|ORDER-PARTIAL|ORDER-CANCELLED/);assert.match(filteredCsv,/2026-11-03/);
 await clearFilters().click();assert.equal(await from().inputValue(),'');assert.equal(await to().inputValue(),'');assert.equal(await supplierFilter().inputValue(),'');
 await from().fill('31/02/2026');await from().press('Tab');await page.getByRole('alert').waitFor();assert.equal(await exportList().isDisabled(),true);assert.equal(await from().evaluate(input=>input.checkValidity()),false);await removeFilter('Dates incorrectes');assert.equal(await from().inputValue(),'');assert.equal(await from().evaluate(input=>input.checkValidity()),true);assert.equal(await activeFilters().count(),0);
 await from().fill('05/11/2026');await from().press('Tab');await to().fill('04/11/2026');await to().press('Tab');await page.getByRole('alert').waitFor();assert.equal(await exportList().isDisabled(),true);await clearFilters().click();await sortDocuments().selectOption('date_desc');
 const documentState=()=>page.getByRole('combobox',{name:'Estat dels documents',exact:true});
 await documentState().selectOption('draft');assert.deepEqual(await listed(),['ORDER-DRAFT']);await documentState().selectOption('confirmed');assert.deepEqual(await listed(),['ORDER-PENDING','ORDER-PARTIAL','ORDER-COMPLETE']);await filter().check();await documentState().selectOption('draft');assert.equal(await filter().isChecked(),false);await clearFilters().click();
 await from().fill('03/11/2026');await from().press('Tab');await to().fill('04/11/2026');await to().press('Tab');await supplierFilter().selectOption('21');await documentState().selectOption('confirmed');await filter().check();await sortDocuments().selectOption('reference_asc');await page.getByRole('searchbox').fill('ORDER');
 await page.getByRole('button',{name:'Albarans',exact:true}).click();await page.getByRole('cell',{name:'RECEIPT-CANCELLED',exact:true}).waitFor();assert.equal(await supplierFilter().inputValue(),'');
 await page.getByRole('button',{name:'Comandes',exact:true}).click();await page.getByRole('cell',{name:'ORDER-PARTIAL',exact:true}).waitFor();assert.equal(await from().inputValue(),'03/11/2026');assert.equal(await supplierFilter().inputValue(),'21');assert.equal(await filter().isChecked(),true);assert.equal(await documentState().inputValue(),'confirmed');assert.equal(await sortDocuments().inputValue(),'reference_asc');assert.equal(await page.getByRole('searchbox').inputValue(),'ORDER');
 await page.reload();await page.getByRole('cell',{name:'ORDER-PARTIAL',exact:true}).waitFor();assert.equal(await to().inputValue(),'04/11/2026');assert.equal(await supplierFilter().inputValue(),'21');assert.equal(await sortDocuments().inputValue(),'reference_asc');assert.equal(await page.getByRole('searchbox').inputValue(),'ORDER');await clearFilters().click();await sortDocuments().selectOption('date_desc');
 assert.equal((await listed()).length,5);await filter().check();assert.deepEqual(await listed(),['ORDER-PENDING','ORDER-PARTIAL']);
 assert.equal(await documentCount().innerText(),'Mostrant 2 de 5 documents carregats.');
 await sortDocuments().selectOption('reference_asc');assert.deepEqual(await listed(),['ORDER-PARTIAL','ORDER-PENDING']);assert.equal(await filter().isChecked(),true);assert.equal(await documentCount().innerText(),'Mostrant 2 de 5 documents carregats.');await sortDocuments().selectOption('date_desc');
 const statusFilter=()=>page.getByRole('combobox',{name:'Estat dels documents',exact:true});
 await statusFilter().selectOption('cancelled');await page.getByRole('cell',{name:'ORDER-CANCELLED',exact:true}).waitFor();assert.deepEqual(await listed(),['ORDER-CANCELLED']);assert.equal(await filter().isChecked(),false,'Cancelled mode must turn off pending filter');
 assert.equal(await documentCount().innerText(),'Mostrant 1 de 5 documents carregats.');
 await page.getByRole('searchbox').fill('alpha');await page.getByRole('cell',{name:'No hi ha documents per mostrar.',exact:true}).waitFor();await page.getByRole('searchbox').fill('beta');assert.deepEqual(await listed(),['ORDER-CANCELLED']);
 await page.getByRole('searchbox').fill('');await filter().check();assert.equal(await statusFilter().inputValue(),'active');assert.deepEqual(await listed(),['ORDER-PENDING','ORDER-PARTIAL']);
 await page.getByRole('searchbox').fill('beta');assert.deepEqual(await listed(),['ORDER-PARTIAL'],'Supplier search must combine with pending filter');
 await page.getByRole('searchbox').fill('order-complete');await page.getByRole('cell',{name:'No hi ha documents per mostrar.',exact:true}).waitFor();
 assert.equal(await documentCount().innerText(),'Mostrant 0 de 5 documents carregats.');
 await clearFilters().click();assert.equal(await page.getByRole('searchbox').inputValue(),'');assert.equal(await statusFilter().inputValue(),'all');assert.equal(await filter().isChecked(),false);assert.equal(await documentCount().innerText(),'Mostrant 5 de 5 documents carregats.');assert.equal(await clearFilters().isDisabled(),true);
 await page.getByRole('searchbox').fill('order-complete');
 await filter().uncheck();await page.getByRole('cell',{name:'ORDER-COMPLETE',exact:true}).waitFor();
 await page.getByRole('searchbox').fill('');await filter().check();await page.getByRole('button',{name:'Albarans',exact:true}).click();assert.equal(await filter().count(),0);
 await page.getByRole('button',{name:'Comandes',exact:true}).click();await filter().waitFor();assert.equal(await filter().isChecked(),true,'Returning to a tab must restore its pending filter');await clearFilters().click();await page.getByRole('cell',{name:'ORDER-CANCELLED',exact:true}).waitFor();

 await page.getByRole('button',{name:'Albarans',exact:true}).click();
 const receiptFilter=()=>page.getByRole('checkbox',{name:'Només albarans pendents de facturar (2)',exact:true});
 await receiptFilter().waitFor();await page.getByRole('cell',{name:'RECEIPT-CANCELLED',exact:true}).waitFor();
 assert.equal((await listed()).length,5);await receiptFilter().check();assert.deepEqual(await listed(),['RECEIPT-PENDING','RECEIPT-PARTIAL']);
 assert.equal(await documentCount().innerText(),'Mostrant 2 de 5 documents carregats.');
 await statusFilter().selectOption('cancelled');await page.getByRole('cell',{name:'RECEIPT-CANCELLED',exact:true}).waitFor();assert.equal(await receiptFilter().isChecked(),false);assert.deepEqual(await listed(),['RECEIPT-CANCELLED']);
 await statusFilter().selectOption('active');assert.deepEqual(await listed(),['RECEIPT-PENDING','RECEIPT-PARTIAL','RECEIPT-COMPLETE','RECEIPT-DRAFT']);await receiptFilter().check();
 await page.getByRole('searchbox').fill('beta');assert.deepEqual(await listed(),['RECEIPT-PARTIAL']);
 await clearFilters().click();assert.equal(await receiptFilter().isChecked(),false);assert.equal(await statusFilter().inputValue(),'all');assert.equal(await documentCount().innerText(),'Mostrant 5 de 5 documents carregats.');await receiptFilter().check();
 await page.getByRole('searchbox').fill('receipt-complete');await page.getByRole('cell',{name:'No hi ha documents per mostrar.',exact:true}).waitFor();await receiptFilter().uncheck();await page.getByRole('cell',{name:'RECEIPT-COMPLETE',exact:true}).waitFor();
 assert.match(await page.locator('tbody').innerText(),/Facturat/);assert.match(await page.locator('tbody').innerText(),/0 línies pendents de facturar/);
 await page.getByRole('searchbox').fill('');await receiptFilter().check();await page.getByRole('button',{name:'Comandes',exact:true}).click();await page.getByRole('cell',{name:'ORDER-CANCELLED',exact:true}).waitFor();await page.getByRole('button',{name:'Albarans',exact:true}).click();await receiptFilter().waitFor();assert.equal(await receiptFilter().isChecked(),true);await clearFilters().click();await page.getByRole('cell',{name:'RECEIPT-CANCELLED',exact:true}).waitFor();
 assert.equal(await statusFilter().inputValue(),'all','Tab change must reset status filter');
 await page.getByRole('button',{name:'Factures de compra',exact:true}).click();await page.getByRole('cell',{name:'INVOICE-CANCELLED',exact:true}).waitFor();await statusFilter().selectOption('cancelled');assert.deepEqual(await listed(),['INVOICE-CANCELLED']);await page.getByRole('searchbox').fill('beta');assert.deepEqual(await listed(),['INVOICE-CANCELLED']);await page.getByRole('searchbox').fill('');await statusFilter().selectOption('active');assert.deepEqual(await listed(),['INVOICE-DRAFT','INVOICE-CONFIRMED']);
 assert.equal(await documentCount().innerText(),'Mostrant 2 de 3 documents carregats.');
 await clearFilters().click();assert.equal(await documentCount().innerText(),'Mostrant 3 de 3 documents carregats.');assert.equal(await statusFilter().inputValue(),'all');
 await statusFilter().selectOption('draft');assert.deepEqual(await listed(),['INVOICE-DRAFT']);await statusFilter().selectOption('confirmed');assert.deepEqual(await listed(),['INVOICE-CONFIRMED']);await clearFilters().click();
 await page.getByRole('button',{name:'Articles i unitats',exact:true}).click();await page.getByRole('cell',{name:'Encara no hi ha articles. Crea primer les unitats.',exact:true}).waitFor();assert.equal(await statusFilter().count(),0);
 assert.equal(await sortDocuments().count(),0);
 assert.equal(await documentCount().count(),0,'Document count must stay scoped to document lists');
 assert.equal(await clearFilters().count(),0);
 assert.equal(await from().count(),0);assert.equal(await supplierFilter().count(),0);assert.equal(await exportList().count(),0);
 await open('group-list');await page.getByRole('button',{name:'Albarans',exact:true}).click();
 const chooseReceipt=name=>page.getByRole('checkbox',{name:'Seleccionar albarà '+name,exact:true});
 const groupButton=()=>page.getByRole('button',{name:'Crear factura dels albarans seleccionats',exact:true});
 await chooseReceipt('GROUP-A').waitFor();assert.equal(await groupButton().isDisabled(),true);assert.equal(await chooseReceipt('GROUP-COMPLETE').isDisabled(),true);
 await chooseReceipt('GROUP-A').check();assert.equal(await chooseReceipt('GROUP-OTHER').isDisabled(),true);await chooseReceipt('GROUP-B').check();
 await page.getByRole('button',{name:'Mostrar només els albarans seleccionats',exact:true}).click();assert.deepEqual(await listed(),['GROUP-A','GROUP-B']);
 await removeFilter('Només albarans seleccionats');assert.equal((await listed()).length,4);assert.equal(await chooseReceipt('GROUP-A').isChecked(),true);assert.equal(await chooseReceipt('GROUP-B').isChecked(),true);
 await page.getByRole('button',{name:'Mostrar només els albarans seleccionats',exact:true}).click();await chooseReceipt('GROUP-B').click();assert.deepEqual(await listed(),['GROUP-A']);await chooseReceipt('GROUP-A').click();assert.equal((await listed()).length,4,'Removing the last selection must leave selected-only mode');await chooseReceipt('GROUP-A').check();await chooseReceipt('GROUP-B').check();
 omitGroupReceipt=true;await page.getByRole('button',{name:'Actualitzar llistat',exact:true}).click();await chooseReceipt('GROUP-B').waitFor({state:'detached'});assert.equal(await chooseReceipt('GROUP-A').isChecked(),true);await page.getByText('Selecciona albarans del mateix proveïdor. Seleccionats: 1.',{exact:true}).waitFor();
 omitGroupReceipt=false;await page.getByRole('button',{name:'Actualitzar llistat',exact:true}).click();await chooseReceipt('GROUP-B').waitFor();await chooseReceipt('GROUP-B').check();
 await sortDocuments().selectOption('reference_desc');assert.equal(await chooseReceipt('GROUP-A').isChecked(),true);assert.equal(await chooseReceipt('GROUP-B').isChecked(),true,'Sorting must preserve selected receipt IDs');await sortDocuments().selectOption('date_desc');
 await page.getByRole('searchbox').fill('GROUP-A');await page.getByText('Selecciona albarans del mateix proveïdor. Seleccionats: 2.',{exact:true}).waitFor();
 await removeFilter('Cerca: GROUP-A');assert.equal(await chooseReceipt('GROUP-A').isChecked(),true);assert.equal(await chooseReceipt('GROUP-B').isChecked(),true,'Removing a filter must preserve receipt selection');assert.equal(await activeFilters().count(),0);await page.getByRole('searchbox').fill('GROUP-A');
 const beforeGroupWrites=requests.filter(request=>request.action==='save').length;await groupButton().click();
 const summary=()=>page.getByRole('dialog',{name:'Resum dels albarans seleccionats',exact:true});
 await summary().waitFor();assert.match(await summary().innerText(),/Proveïdor: Alpha/);assert.match(await summary().innerText(),/2 albarans · 2 línies/);
 const estimate=()=>summary().getByRole('region',{name:'Estimació de la factura',exact:true});
 const exportSummary=async()=>{
  await page.evaluate(()=>{
   const create=URL.createObjectURL.bind(URL);
   URL.createObjectURL=blob=>{if(blob.type==='text/csv;charset=utf-8')window.exportedCsv=blob.text();return create(blob);};
  });
  const [download]=await Promise.all([page.waitForEvent('download'),summary().getByRole('button',{name:'Descarregar resum CSV',exact:true}).click()]);
  assert.equal(download.suggestedFilename(),'resum-albarans-85.csv');return page.evaluate(()=>window.exportedCsv);
 };
 assert.match(await estimate().innerText(),/Base 35,88 € · IVA 7,53 € · Total 43,41 €/);
 const fullCsv=await exportSummary();assert.match(fullCsv,/'?Mock company/);assert.match(fullCsv,/'?Alpha/);assert.match(fullCsv,/'?GROUP-A/);assert.match(fullCsv,/'?GROUP-B/);assert.match(fullCsv,/'?35,88/);assert.match(fullCsv,/'?7,53/);assert.match(fullCsv,/'?43,41/);assert.match(fullCsv,/Subtotals per albarà/);assert.match(fullCsv,/Desglossament de l’IVA/);
 const printSummary=async()=>{await page.evaluate(()=>{window.printedSummary=null;});await summary().getByRole('button',{name:'Imprimir resum / PDF',exact:true}).click();await page.waitForFunction(()=>window.printedSummary);return page.evaluate(()=>window.printedSummary);};
 const printed=await printSummary();assert.match(printed.text,/Empresa: Mock company/);assert.match(printed.text,/GROUP-A/);assert.match(printed.text,/GROUP-B/);assert.match(printed.text,/Total 43,41 €/);assert.equal(printed.inputs,0);assert.equal(printed.buttons,0);
 const subtotal=reference=>summary().getByLabel('Subtotal '+reference,{exact:true});
 const vatRows=()=>summary().getByRole('table',{name:'Desglossament de l’IVA',exact:true}).locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
 assert.match(await subtotal('GROUP-A').innerText(),/base 11,88 € · IVA 2,49 € · total 14,37 €/);
 assert.match(await subtotal('GROUP-B').innerText(),/base 24,00 € · IVA 5,04 € · total 29,04 €/);
 assert.deepEqual(await vatRows(),[['21 %','35,88 €','7,53 €']]);
 assert.deepEqual(await summary().getByRole('region',{name:/^Albar\u00e0 /}).locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.querySelector('input')?.value??cell.textContent))),[['First material','1,250001','1.250001','kg','10','5','11,88 €','2,49 €','14,37 €'],['Second material','2','2.000000','kg','12','0','24,00 €','5,04 €','29,04 €']]);
 assert.equal(await page.getByRole('dialog',{name:'Factura de compra nova',exact:true}).count(),0,'Summary must precede invoice proposal');
 await summary().getByRole('button',{name:'Tornar a la selecció',exact:true}).click();await summary().waitFor({state:'detached'});
 await page.getByText('Selecciona albarans del mateix proveïdor. Seleccionats: 2.',{exact:true}).waitFor();await groupButton().click();await summary().waitFor();
 const groupQuantity=id=>summary().getByRole('textbox',{name:'Quantitat a facturar GROUP-'+(id===151?'A':'B')+' '+id,exact:true});
 const prepareGroup=()=>summary().getByRole('button',{name:'Preparar proposta de factura',exact:true});
 for(const invalid of ['1.250002','-1','1.1234567','1e1','']){await groupQuantity(151).fill(invalid);assert.equal(await prepareGroup().isDisabled(),true);assert.doesNotMatch(await estimate().innerText(),/Base /,'Invalid inputs must hide stale totals');}
 await groupQuantity(151).fill('0');await groupQuantity(152).fill('0');assert.equal(await prepareGroup().isDisabled(),true,'At least one positive quantity is required');
 assert.match(await subtotal('GROUP-A').innerText(),/Cap línia seleccionada/);assert.match(await subtotal('GROUP-B').innerText(),/Cap línia seleccionada/);
 assert.match(await summary().getByRole('region',{name:'Albarà GROUP-A',exact:true}).innerText(),/Exclosa/);
 await groupQuantity(151).fill('0,500001');await groupQuantity(152).fill('1');
 const partialQuantityCsv=await exportSummary();assert.match(partialQuantityCsv,/'?0,500001/);assert.match(partialQuantityCsv,/'?20,27/);
 const printedPartial=await printSummary();assert.match(printedPartial.text,/0,500001/);assert.match(printedPartial.text,/Total 20,27 €/);
 assert.match(await estimate().innerText(),/Base 16,75 € · IVA 3,52 € · Total 20,27 €/,'Estimate must use partial quantities and discounts with exact rounding');
 assert.match(await subtotal('GROUP-A').innerText(),/base 4,75 € · IVA 1,00 € · total 5,75 €/);assert.deepEqual(await vatRows(),[['21 %','16,75 €','3,52 €']]);
 await summary().getByRole('button',{name:'Preparar proposta de factura',exact:true}).click();
 const grouped=page.getByRole('dialog',{name:'Factura de compra nova',exact:true});await grouped.waitFor();
 assert.equal(requests.filter(request=>request.action==='save').length,beforeGroupWrites,'Grouping must only propose a draft');
 assert.equal(await grouped.getByLabel('Quantitat 1',{exact:true}).inputValue(),'0.500001');assert.equal(await grouped.getByLabel('Quantitat 2',{exact:true}).inputValue(),'1.000000');
 assert.equal(await grouped.getByLabel('Document origen 1 1',{exact:true}).inputValue(),'receipt:151');assert.equal(await grouped.getByLabel('Document origen 2 1',{exact:true}).inputValue(),'receipt:152');
 assert.equal(await grouped.getByLabel('Preu 2',{exact:true}).inputValue(),'12');await grouped.getByLabel('Referència',{exact:true}).fill('GROUP-INVOICE');await grouped.getByLabel('Data',{exact:true}).fill('08/11/2026');await grouped.getByLabel('Data',{exact:true}).press('Tab');await save();
 const groupedBody=requests.at(-1).body;assert.equal(groupedBody.supplier_account_id,20);assert.equal(groupedBody.lines.length,2);assert.deepEqual(groupedBody.lines.map(line=>line.links[0].line_id),[151,152]);assert.equal(await confirm().count(),0,'Grouped invoices must retain accounting permission restrictions');
 assert.deepEqual(groupedBody.lines.map(line=>[line.quantity,line.links[0].quantity]),[['0.500001','0.500001'],['1.000000','1.000000']]);
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
 await groupButton().click();await summary().waitFor();groupMode='changed-quantity';await summary().getByRole('button',{name:'Preparar proposta de factura',exact:true}).click();
 await summary().getByText(/Les dades han canviat/).waitFor();assert.equal(await summary().locator('tbody tr').first().locator('td').nth(1).textContent(),'0,750001');assert.equal(await groupQuantity(151).inputValue(),'1.250001','Source changes must preserve entered quantities for correction');assert.equal(await prepareGroup().isDisabled(),true);
 assert.equal(await page.getByRole('dialog',{name:'Factura de compra nova',exact:true}).count(),0,'Changed quantities must require another summary review');
 await groupQuantity(151).fill('0.5');await groupQuantity(152).fill('0');await prepareGroup().click();await grouped.waitFor();
 assert.equal(await grouped.getByLabel('Quantitat 1',{exact:true}).inputValue(),'0.500000');assert.equal(await grouped.getByLabel('Quantitat 2',{exact:true}).count(),0,'Zero quantities must be omitted from invoice');
 assert.equal(await grouped.getByLabel('Document origen 1 1',{exact:true}).inputValue(),'receipt:151');
 await page.keyboard.press('Escape');await grouped.waitFor({state:'detached'});groupMode='normal';
 groupMode='unpriced';await groupButton().click();await summary().waitFor();assert.match(await estimate().innerText(),/Estimació parcial/);assert.match(await estimate().innerText(),/Base 11,88 € · IVA 2,49 € · Total 14,37 €/);assert.match(await estimate().innerText(),/1 línies sense preu/);
 const missingPriceCsv=await exportSummary();assert.match(missingPriceCsv,/Estimació parcial/);assert.match(missingPriceCsv,/Sense preu/);assert.match(missingPriceCsv,/'?14,37/);
 const printedMissing=await printSummary();assert.match(printedMissing.text,/Estimació parcial/);assert.match(printedMissing.text,/línies sense preu/);
 assert.match(await subtotal('GROUP-B').innerText(),/Subtotal pendent de completar els preus/);assert.deepEqual(await vatRows(),[['21 %','11,88 €','2,49 €']]);
 await groupQuantity(151).fill('0');assert.match(await estimate().innerText(),/Cap línia seleccionada té preu informat/);assert.doesNotMatch(await estimate().innerText(),/Base /,'All-unpriced selections must not look like a zero-cost invoice');
 await groupQuantity(151).fill('1');await groupQuantity(152).fill('0');assert.match(await estimate().innerText(),/Total estimat de la factura/);assert.doesNotMatch(await estimate().innerText(),/línies sense preu/,'Excluded lines must not affect the estimate');
 const missingUnitPrice=()=>summary().getByRole('textbox',{name:'Preu unitari GROUP-B 152',exact:true});
 await groupQuantity(151).fill('1.250001');await groupQuantity(152).fill('2');
 assert.equal(await summary().getByRole('textbox',{name:'Preu unitari GROUP-A 151',exact:true}).count(),0,'Existing receipt prices must remain unchanged');
 for(const price of ['-1','1e3','1.1234567']){await missingUnitPrice().fill(price);assert.equal(await prepareGroup().isDisabled(),true);assert.doesNotMatch(await estimate().innerText(),/Base /);}
 await missingUnitPrice().fill('0');assert.match(await estimate().innerText(),/Total estimat de la factura/);assert.doesNotMatch(await estimate().innerText(),/línies sense preu/,'Zero is an informed price');
 await missingUnitPrice().fill('');assert.match(await estimate().innerText(),/Estimació parcial/);
 await missingUnitPrice().fill('7,123456');assert.match(await estimate().innerText(),/Base 26,13 € · IVA 5,48 € · Total 31,61 €/);
 await groupQuantity(151).fill('0.2');await groupQuantity(152).fill('0');await summary().getByRole('button',{name:'Restablir quantitats pendents',exact:true}).click();
 assert.equal(await groupQuantity(151).inputValue(),'1.250001');assert.equal(await groupQuantity(152).inputValue(),'2.000000');assert.equal(await missingUnitPrice().inputValue(),'7,123456','Restoring quantities must preserve entered prices');
 assert.match(await subtotal('GROUP-B').innerText(),/base 14,25 € · IVA 2,99 € · total 17,24 €/);assert.match(await estimate().innerText(),/Total 31,61 €/);
 await prepareGroup().click();await grouped.waitFor();assert.equal(await grouped.getByLabel('Preu 2',{exact:true}).inputValue(),'7.123456','Entered price must transfer exactly to invoice proposal');
 await grouped.getByLabel('Referència',{exact:true}).fill('COMPLETED-PRICES');await grouped.getByLabel('Data',{exact:true}).fill('08/11/2026');await grouped.getByLabel('Data',{exact:true}).press('Tab');await save();
 assert.equal(requests.at(-1).body.lines[1].unit_price,'7.123456');assert.deepEqual(requests.at(-1).body.lines[1].links,[{kind:'receipt',line_id:152,quantity:'2.000000'}]);
 await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});groupMode='normal';
 for(const mode of ['mixed-tax','zero-tax']){
  groupMode=mode;await groupButton().click();await summary().waitFor();
  assert.deepEqual(await vatRows(),mode==='mixed-tax'?[['10 %','24,00 €','2,40 €'],['21 %','11,88 €','2,49 €']]:[['0 %','24,00 €','0,00 €'],['21 %','11,88 €','2,49 €']]);
  assert.match(await estimate().innerText(),mode==='mixed-tax'?/Base 35,88 € · IVA 4,89 € · Total 40,77 €/:/Base 35,88 € · IVA 2,49 € · Total 38,37 €/);
  await summary().getByRole('button',{name:'Tornar a la selecció',exact:true}).click();await summary().waitFor({state:'detached'});
 }
 groupMode='normal';
 for(const mode of ['wrong-supplier','completed']){
  groupMode=mode;await groupButton().click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').count(),0,'Changed sources must block proposal');
 }
 groupMode='normal';await page.getByRole('button',{name:'Netejar selecció',exact:true}).click();assert.equal(await groupButton().isDisabled(),true);
 await page.getByRole('searchbox').fill('');await chooseReceipt('GROUP-A').check();await page.getByRole('button',{name:'Comandes',exact:true}).click();await page.getByRole('button',{name:'Albarans',exact:true}).click();await chooseReceipt('GROUP-A').waitFor();assert.equal(await chooseReceipt('GROUP-A').isChecked(),false);
 await open('invoice-line-limit');await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/límit de 40 línies/);assert.equal(await page.getByRole('button',{name:'Guardar esborrany',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'Afegir línia',exact:true}).isDisabled(),true);await page.getByRole('checkbox',{name:/He revisat les dades/}).check();assert.equal(await confirm().isDisabled(),true);
 await open('new');await dateInput().fill('05/11/2026');await dateInput().press('Tab');await save();
 await review().waitFor();assert.equal(await postingInput().inputValue(),'05/11/2026');
 assert.equal(await confirm().isDisabled(),true,'Review must be explicit');await review().check();await confirm().click();
 await page.getByRole('button',{name:'Veure factura comptabilitzada',exact:true}).waitFor();
 assert.equal(requests.at(-1).body.posting_date,'2026-11-05');

 await open('existing');await postingInput().fill('20/11/2026');await postingInput().press('Tab');
 await dateInput().fill('02/11/2026');await dateInput().press('Tab');assert.equal(await postingInput().inputValue(),'20/11/2026','Explicit accounting date must be preserved');
 await save();await review().check();await confirm().click();await page.getByRole('button',{name:'Veure factura comptabilitzada',exact:true}).waitFor();
 assert.equal(requests.at(-1).body.posting_date,'2026-11-20');

 await open('existing');await postingInput().fill('31/02/2026');await review().check();
 const beforeInvalid=requests.length;await confirm().click();await page.waitForTimeout(150);assert.equal(requests.length,beforeInvalid,'Invalid typed date must not send a request');
 assert.equal(await postingInput().evaluate(input=>input.checkValidity()),false);

 await open('existing');await postingInput().fill('31/10/2026');await postingInput().press('Tab');await review().check();assert.equal(await confirm().isDisabled(),true,'Posting before invoice must be blocked');
 await open('closed');await review().check();assert.equal(await confirm().isDisabled(),true,'Closed exercise must be blocked');
 await open('readonly');await page.getByRole('dialog').waitFor();assert.equal(await confirm().count(),0,'No confirmation without permission');assert.equal(await page.getByRole('button',{name:'Guardar esborrany',exact:true}).count(),0);

 await open('original');await page.getByRole('img',{name:'Factura original',exact:true}).waitFor();
 assert.equal(await page.getByRole('img',{name:'Factura original',exact:true}).evaluate(image=>image.complete&&image.naturalWidth>0),true);
 const previewRequest=page.waitForRequest(request=>request.url().includes('/documentation/10/source'));
 await open('original-pdf');assert.equal((await previewRequest).headers()['x-company-id'],'85');
 const frame=page.locator('iframe[title="Document original"]');await frame.waitFor();
 assert.match(await frame.getAttribute('src'),/^blob:/);assert.equal(await frame.getAttribute('sandbox'),null);
 const downloadRequest=page.waitForRequest(request=>request.url().includes('/documentation/10/source?download=1'));
 await page.getByRole('button',{name:'Descarregar original',exact:true}).click();
 assert.equal((await downloadRequest).headers()['x-company-id'],'85');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile page must not overflow');
 await page.setViewportSize({width:1440,height:1000});
 await open('order-progress');
 const progress=page.getByRole('region',{name:'Recepció de la comanda',exact:true});await progress.waitFor();
 assert.deepEqual(await progress.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent))),[
  ['Partial material','kg','2,500001','1,000001','1,5'],['Pending material','litres','4','0','4'],['Complete material','unitats','1','1','0']]);
 const receptions=page.getByRole('region',{name:'Albarans vinculats a la comanda',exact:true});
 assert.deepEqual(await receptions.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].slice(0,6).map(cell=>cell.textContent))),[['RECEIPT-1','03/11/2026','1','First reception','0,400001','kg'],['RECEIPT-2','04/11/2026','1','Second reception','0,6','kg']]);
 await receptions.getByRole('button',{name:'Obrir albarà RECEIPT-1',exact:true}).click();const receivedReceipt=page.getByRole('dialog',{name:'Albarà · RECEIPT-1',exact:true});await receivedReceipt.waitFor();assert.equal(await receivedReceipt.getByLabel('Concepte 1',{exact:true}).isDisabled(),true);assert.equal(await receivedReceipt.getByRole('button',{name:'Guardar esborrany',exact:true}).count(),0);await page.keyboard.press('Escape');await receivedReceipt.waitFor({state:'detached'});await receptions.waitFor();
 originFailure=true;await receptions.getByRole('button',{name:'Obrir albarà RECEIPT-1',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').count(),1);originFailure=false;
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Order progress must fit mobile viewport');await page.setViewportSize({width:1440,height:1000});
 const receiveButton=()=>page.getByRole('button',{name:'Crear albarà amb les quantitats pendents',exact:true});
 await open('order-complete');await page.getByRole('dialog').waitFor();assert.equal(await receiveButton().count(),0);
 await open('order-receive');const writesBefore=requests.filter(request=>request.action==='save-receipt').length;
 await receiveButton().click();const proposed=page.getByRole('dialog',{name:'Albarà nova',exact:true});await proposed.waitFor();
 assert.equal(await proposed.getByLabel('Quantitat 1',{exact:true}).inputValue(),'1.250001','Proposal must refresh current pending quantities');
 assert.equal(await proposed.getByLabel('Quantitat 2',{exact:true}).inputValue(),'4.000000');assert.equal(await proposed.getByLabel('Quantitat 3',{exact:true}).count(),0,'Fully received lines must be excluded');
 assert.equal(await proposed.getByLabel('Document origen 1 1',{exact:true}).inputValue(),'order:101');
 assert.equal(await proposed.getByLabel('Quantitat vinculada 1 1',{exact:true}).inputValue(),'1.250001');
 assert.equal(await proposed.getByLabel('Descompte 1',{exact:true}).inputValue(),'5');assert.equal(await proposed.getByLabel('Preu 2',{exact:true}).inputValue(),'','Unpriced receipt lines must remain unpriced');
 assert.equal(requests.filter(request=>request.action==='save-receipt').length,writesBefore,'Opening a proposal must not persist it');
 await proposed.getByLabel('Referència',{exact:true}).fill('RECEIVE-TEST');await proposed.getByLabel('Data',{exact:true}).fill('08/11/2026');await proposed.getByLabel('Data',{exact:true}).press('Tab');
 await proposed.getByRole('button',{name:'Guardar esborrany',exact:true}).click();await page.getByRole('dialog',{name:'Albarà · RECEIVE-TEST',exact:true}).waitFor();
 const receiptBody=requests.at(-1).body;assert.equal(receiptBody.supplier_account_id,20);assert.equal(receiptBody.lines.length,2);assert.equal(receiptBody.lines[0].links[0].line_id,101);assert.equal(receiptBody.lines[0].quantity,'1.250001');
 const savedReceipt=page.getByRole('dialog',{name:'Albarà · RECEIVE-TEST',exact:true});await savedReceipt.getByRole('checkbox',{name:/He revisat les dades/}).check();await savedReceipt.getByRole('button',{name:'Confirmar albarà',exact:true}).click();
 await receiveButton().waitFor({state:'detached'});assert.equal(await receiveButton().count(),0,'Confirming the receipt must refresh order pending quantities');
 receiptOrderComplete=true;await open('order-receive');await receiveButton().click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').count(),1,'An order completed meanwhile must not create a receipt');receiptOrderComplete=false;
 const invoiceButton=()=>page.getByRole('button',{name:'Crear factura amb les quantitats pendents',exact:true});
 await open('receipt-invoice-complete');await page.getByRole('dialog').waitFor();assert.equal(await invoiceButton().count(),0);
 const invoiceProgress=page.getByRole('region',{name:'Facturació de l’albarà',exact:true});await invoiceProgress.waitFor();assert.equal(await invoiceProgress.locator('tbody tr').count(),3);assert.deepEqual(await invoiceProgress.locator('tbody tr td:last-child').allTextContents(),['0','0','0']);
 const consumed=page.getByRole('region',{name:'Factures vinculades a l’albarà',exact:true});
 assert.deepEqual(await consumed.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].slice(0,6).map(cell=>cell.textContent))),[['INV-71','05/11/2026','1','Partial invoicing','1,000001','kg'],['INV-72','06/11/2026','1','Remaining invoicing','1,5','kg']]);
 await consumed.getByRole('button',{name:'Obrir factura INV-71',exact:true}).click();const consumingInvoice=page.getByRole('dialog',{name:'Factura de compra · INV-71',exact:true});await consumingInvoice.waitFor();assert.equal(await consumingInvoice.getByRole('button',{name:'Guardar esborrany',exact:true}).count(),0);assert.equal(await consumingInvoice.getByLabel('Concepte 1',{exact:true}).isDisabled(),true);
 await page.keyboard.press('Escape');await consumingInvoice.waitFor({state:'detached'});await consumed.waitFor();originFailure=true;await consumed.getByRole('button',{name:'Obrir factura INV-71',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').count(),1);originFailure=false;
 await open('receipt-invoice');await invoiceButton().click();
 const invoiceProposal=page.getByRole('dialog',{name:'Factura de compra nova',exact:true});await invoiceProposal.waitFor();
 assert.equal(await invoiceProposal.getByLabel('Quantitat 1',{exact:true}).inputValue(),'1.250001');assert.equal(await invoiceProposal.getByLabel('Quantitat 3',{exact:true}).count(),0);
 assert.equal(await invoiceProposal.getByLabel('Document origen 1 1',{exact:true}).inputValue(),'receipt:51');assert.equal(await invoiceProposal.getByLabel('Preu 2',{exact:true}).inputValue(),'');
 await invoiceProposal.getByLabel('Referència',{exact:true}).fill('INVOICE-FROM-RECEIPT');await invoiceProposal.getByLabel('Data',{exact:true}).fill('08/11/2026');await invoiceProposal.getByLabel('Data',{exact:true}).press('Tab');await invoiceProposal.getByLabel('Preu 2',{exact:true}).fill('12');await save();
 const invoiceBody=requests.at(-1).body;assert.equal(invoiceBody.supplier_account_id,20);assert.equal(invoiceBody.lines.length,2);assert.deepEqual(invoiceBody.lines[0].links,[{kind:'receipt',line_id:51,quantity:'1.250001'}]);
 await page.getByRole('checkbox',{name:/He revisat les dades/}).check();await confirm().click();await page.getByRole('button',{name:'Veure factura comptabilitzada',exact:true}).waitFor();await invoiceButton().waitFor({state:'detached'});
 invoiceReceiptComplete=false;await open('receipt-invoice-no-post');await invoiceButton().click();const restricted=page.getByRole('dialog',{name:'Factura de compra nova',exact:true});await restricted.waitFor();
 await restricted.getByLabel('Referència',{exact:true}).fill('DRAFT-ONLY');await restricted.getByLabel('Data',{exact:true}).fill('08/11/2026');await restricted.getByLabel('Data',{exact:true}).press('Tab');await save();assert.equal(await confirm().count(),0,'Purchases permission alone must not allow posting invoices');
 invoiceReceiptComplete=true;await open('receipt-invoice');await invoiceButton().click();await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('dialog').count(),1);invoiceReceiptComplete=false;
 await open('amounts-match');await page.getByRole('dialog').waitFor();assert.equal(await page.getByRole('region',{name:'Diferències per revisar',exact:true}).count(),0,'Matching original amounts must not show false differences');
 await open('amounts');const amountDifferences=page.getByRole('region',{name:'Diferències per revisar',exact:true});await amountDifferences.waitFor();assert.match(await amountDifferences.innerText(),/Total de la factura/);assert.match(await amountDifferences.innerText(),/12,11 €/);assert.match(await amountDifferences.innerText(),/12,10 €/);assert.match(await amountDifferences.innerText(),/-0,01 €/);
 const acceptAmounts=()=>page.getByRole('checkbox',{name:'Accepto les diferències indicades en aquest esborrany.',exact:true});
 await page.getByRole('checkbox',{name:/He revisat les dades/}).check();assert.equal(await confirm().isDisabled(),true);await acceptAmounts().check();assert.equal(await confirm().isDisabled(),false);
 await page.getByLabel('Retenció %',{exact:true}).fill('15');assert.equal(await acceptAmounts().isChecked(),false,'Withholding change must revoke acceptance of amount differences');assert.match(await amountDifferences.innerText(),/10,60 €/);assert.match(await amountDifferences.innerText(),/-1,51 €/);assert.equal(await confirm().isDisabled(),true);
 await page.getByLabel('Retenció %',{exact:true}).fill('0');await acceptAmounts().check();await confirm().click();await page.getByRole('button',{name:'Veure factura comptabilitzada',exact:true}).waitFor();assert.equal(requests.at(-1).body.accept_differences,true);assert.equal(requests.at(-1).body.withholding_rate,'0');
 await open('differences');
 const differences=page.getByRole('region',{name:'Diferències per revisar',exact:true});
 await differences.waitFor();assert.equal(await differences.getByText('Línia 1 · Material',{exact:true}).count(),2);
 assert.match(await differences.innerText(),/0,5 kg sense vincle/);assert.match(await differences.innerText(),/9,123456 €/);assert.match(await differences.innerText(),/Imports sense IVA/);
 const acceptDifferences=()=>page.getByRole('checkbox',{name:'Accepto les diferències indicades en aquest esborrany.',exact:true});
 await page.getByRole('checkbox',{name:/He revisat les dades/}).check();assert.equal(await confirm().isDisabled(),true,'General review alone must not accept differences');
 await acceptDifferences().check();assert.equal(await confirm().isDisabled(),false);
 await page.getByLabel('Concepte 1',{exact:true}).fill('Updated material');await page.getByLabel('Concepte 1',{exact:true}).press('Tab');
 assert.equal(await acceptDifferences().isChecked(),false,'Editing must revoke difference acceptance');assert.equal(await confirm().isDisabled(),true);
 await differences.getByText(/últim esborrany guardat/).waitFor();await save();
 await page.getByRole('checkbox',{name:/He revisat les dades/}).check();assert.equal(await confirm().isDisabled(),true,'Saved differences require renewed acceptance');
 await acceptDifferences().check();await confirm().click();await page.getByRole('button',{name:'Veure factura comptabilitzada',exact:true}).waitFor();
 assert.equal(requests.at(-1).body.accept_differences,true);
 const originSelect=index=>page.getByLabel('Document origen 1 '+index,{exact:true});
 const linkedQuantity=index=>page.getByLabel('Quantitat vinculada 1 '+index,{exact:true});
 const addLink=()=>page.getByRole('button',{name:'Vincular albarà o comanda',exact:true}).click();
 const saveButton=()=>page.getByRole('button',{name:'Guardar esborrany',exact:true});
 await open('links');await addLink();
 assert.deepEqual(await originSelect(1).locator('option').evaluateAll(options=>options.map(option=>option.value)),['order:51','receipt:52'],'Origins must match item and supplier');
 await linkedQuantity(1).fill('0,4');await addLink();
 assert.equal(await linkedQuantity(2).inputValue(),'0.600000','Second allocation must default to the remaining quantity');
 assert.deepEqual(await originSelect(1).locator('option').evaluateAll(options=>options.map(option=>option.value)),['order:51'],'Already selected origins must be excluded');
 assert.equal(await page.getByRole('button',{name:'Vincular albarà o comanda',exact:true}).isDisabled(),true);
 await linkedQuantity(2).fill('0.7');assert.equal(await saveButton().isDisabled(),true,'Over-allocation must be blocked');
 await linkedQuantity(2).fill('-1');assert.equal(await saveButton().isDisabled(),true,'Negative allocation must be blocked');
 await linkedQuantity(2).fill('0');assert.equal(await saveButton().isDisabled(),true,'Zero allocation must be blocked');
 await linkedQuantity(2).fill('0.6');await save();
 assert.deepEqual(requests.at(-1).body.lines[0].links.map(link=>[link.kind,link.line_id,link.quantity]),[['order',51,'0,4'],['receipt',52,'0.6']]);
 await page.locator('label').filter({hasText:/^Proveïdor/}).locator('select').selectOption('21');assert.equal(await originSelect(1).count(),0,'Changing supplier must clear old links');
 await addLink();assert.equal(await originSelect(1).inputValue(),'order:54');
 await page.getByLabel('Article 1',{exact:true}).selectOption('2');assert.equal(await originSelect(1).count(),0,'Changing item must clear old links');
 await open('links-receipts');await page.getByRole('button',{name:'Vincular comanda',exact:true}).click();
 assert.deepEqual(await originSelect(1).locator('option').evaluateAll(options=>options.map(option=>option.value)),['order:51'],'Receipts may only link orders');
 await open('links-invalid');assert.equal(await saveButton().isDisabled(),true,'Missing source must be visible and blocked');
 assert.match(await page.getByRole('table',{name:'Traçabilitat documental',exact:true}).innerText(),/Origen no disponible/);
 await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Treure vincle',exact:true}).click();assert.equal(await saveButton().isDisabled(),false,'Invalid link must be removable');
 const traceRows=()=>page.getByRole('table',{name:'Traçabilitat documental',exact:true}).locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
 await open('links-trace');
 assert.deepEqual(await traceRows(),[['1','Material','Comanda ORDER-1','51','0,6','kg'],['1','Material','Albarà RECEIPT-1','52','0,4','kg'],['2','Second line','Albarà RECEIPT-1','52','1,200001','kg']]);
 assert.equal(await page.getByRole('button',{name:'Obrir albarà RECEIPT-1',exact:true}).count(),1,'Repeated source across lines must keep one open action');
 await page.getByLabel('Quantitat vinculada 1 2',{exact:true}).fill('0.300001');assert.equal((await traceRows())[1][4],'0,300001');
 await page.getByRole('region',{name:'Documents vinculats',exact:true}).getByText(/Guarda els canvis per conservar-los/).waitFor();
 await open('links-trace-confirmed');assert.equal((await traceRows()).length,3);assert.equal(await page.getByRole('button',{name:'Guardar esborrany',exact:true}).count(),0,'Confirmed trace must remain read-only');
 await open('links-navigation');
 const invoice=page.getByRole('dialog',{name:'Factura de compra · UI-TEST',exact:true});
 await invoice.getByLabel('Concepte 1',{exact:true}).fill('Unsaved invoice change');
 await invoice.getByRole('button',{name:'Obrir albarà RECEIPT-1',exact:true}).click();
 const receipt=page.getByRole('dialog',{name:'Albarà · RECEIPT-1',exact:true});await receipt.waitFor();
 assert.equal(await receipt.getByRole('button',{name:'Guardar esborrany',exact:true}).count(),0,'Linked documents must be read-only');
 assert.equal(await receipt.getByLabel('Concepte 1',{exact:true}).isDisabled(),true);
 await receipt.getByRole('button',{name:'Obrir comanda ORDER-1',exact:true}).click();
 const order=page.getByRole('dialog',{name:'Comanda · ORDER-1',exact:true});await order.waitFor();assert.equal(await order.getByRole('button',{name:'Crear albarà amb les quantitats pendents',exact:true}).count(),0,'Read-only origins must not create receipts');await page.keyboard.press('Escape');await order.waitFor({state:'detached'});
 await page.keyboard.press('Escape');await receipt.waitFor({state:'detached'});
 assert.equal(await invoice.getByLabel('Concepte 1',{exact:true}).inputValue(),'Unsaved invoice change','Navigation must preserve unsaved parent changes');
 originFailure=true;await invoice.getByRole('button',{name:'Obrir comanda ORDER-1',exact:true}).click();await invoice.getByRole('alert').waitFor();
 assert.equal(await page.getByRole('dialog').count(),1);assert.equal(await invoice.getByLabel('Concepte 1',{exact:true}).inputValue(),'Unsaved invoice change');originFailure=false;
 const selectedFile={name:'invoice.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\n%%EOF')};
 const select=()=>page.locator('input[type=file]').setInputFiles(selectedFile);
 const uploaded=[],uploadedModes=[],calls=[];let mode='upload-failure',fail=true;
 uploadHandler=async(route,path,request)=>{
  calls.push(request.method()+' '+path);
  if(path==='/api/purchases/ocr'){
   if(mode==='schema-missing')return route.fulfill({status:503,json:{error:{code:'DATABASE_NOT_INITIALIZED'}}});
   uploaded.push(request.headers()['x-request-id']);
   uploadedModes.push(request.headers()['x-ocr-mode']);
   if(mode==='upload-failure'&&fail){fail=false;return route.fulfill({status:503,json:{error:{code:'NETWORK_ERROR'}}});}
   return route.fulfill({json:{id:41,status:mode==='ocr-error'?'error':mode==='poll-failure'?'queued':'done',purchase_invoice_id:7,possible_duplicate:mode==='duplicate'}});
  }
  if(path==='/api/purchases/ocr/41/retry')return route.fulfill({json:{id:41,status:'done',purchase_invoice_id:7}});
  if(path==='/api/purchases/ocr/41'){
   if(fail){fail=false;return route.fulfill({status:503,json:{error:{code:'NETWORK_ERROR'}}});}
   return route.fulfill({json:{id:41,status:'done',purchase_invoice_id:7}});
  }
  if(path==='/api/purchases/invoices/7'){
   if(mode==='open-failure'&&fail){fail=false;return route.fulfill({status:503,json:{error:{code:'NETWORK_ERROR'}}});}
   return route.fulfill({json:{id:7,kind:'invoices',status:'draft'}});
  }
  unexpected.push(path);return route.abort();
 };
 const draft=()=>page.waitForFunction(()=>window.uploadDraft?.id===7);
 mode='schema-missing';await open('upload');await select();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/migracions pendents/);assert.equal(await page.getByRole('button',{name:'Tornar a pujar',exact:true}).isEnabled(),true);mode='upload-failure';
 await open('upload');await select();await page.getByRole('button',{name:'Tornar a pujar',exact:true}).click();await draft();
 assert.equal(uploaded[0],uploaded[1],'Interrupted upload must reuse request ID');
 assert.deepEqual(uploadedModes.slice(0,2),['tesseract','tesseract'],'Tesseract is enabled by default and preserved on retry');
 await page.getByRole('checkbox',{name:'Llegir també amb Tesseract OCR'}).uncheck();
 await select();await draft();assert.notEqual(uploaded[1],uploaded[2],'New file selection needs a new request ID');
 assert.equal(uploadedModes[2],'auto','User can choose automatic text extraction instead');
 for(const [scenario,label] of [['ocr-error','Reintentar reconeixement'],['poll-failure','Tornar a comprovar'],['open-failure','Obrir proposta']]){
  mode=scenario;fail=true;calls.length=0;await open('upload');await select();
  await page.getByRole('button',{name:label,exact:true}).click();await draft();
  assert.equal(calls.filter(call=>call==='POST /api/purchases/ocr').length,1,'Recovery must not upload another original');
  assert.equal(calls.includes('POST /api/purchases/ocr/41/retry'),scenario==='ocr-error');
 }
 mode='duplicate';await open('upload');await select();await draft();assert.equal(await page.getByText(/Es reutilitza el treball existent/).count(),1);
 await open('upload');calls.length=0;await page.locator('input[type=file]').setInputFiles({...selectedFile,name:'invalid.txt'});await page.getByRole('alert').waitFor();assert.equal(calls.length,0);
 mode='poll-failure';await open('upload');calls.length=0;await select();await page.getByRole('button',{name:'Switch company',exact:true}).click();await page.waitForTimeout(1700);
 assert.equal(await page.evaluate(()=>window.uploadDraft),undefined);assert.equal(calls.length,1,'Unmounted upload must stop polling');
 assert.deepEqual(unexpected,[]);assert.deepEqual(pageErrors,[]);
 passed=true;console.log('PASS: recognized-versus-calculated invoice amounts, cent differences, explicit acceptance and withholding re-review; existing purchase chain/UI/CSV/print checks. All API calls mocked; no MySQL access. OS download/print dialogs not verified.');
}catch(error){console.error(error);throw error;}finally{
 if(created)unlinkSync(file);server?.kill();
 const timeout=setTimeout(()=>process.exit(passed?0:1),5000);timeout.unref();await page?.close();await browser?.close();clearTimeout(timeout);
}
process.exit(passed?0:1);
