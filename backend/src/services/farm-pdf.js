import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createHash} from 'node:crypto';
import {allocateRounded,scaled,fixed,rounded} from '../../../shared/farm-costs.js';
const fail=code=>{throw new Error('FARM_PDF_'+code);};
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const absolute=value=>value<0n?-value:value;
const moneyPattern=places=>new RegExp('^-?(?:\\d{1,3}(?:\\.\\d{3})*|\\d+),\\d{'+places+'}$');
function sourceValue(text,places){if(!moneyPattern(places).test(text))fail('INVALID_AMOUNT');return scaled(text.replace(/\./g,'').replace(',','.'),places);}
const pricePattern=/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{1,5}$/;
function date(text){const match=text?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)fail('INVALID_DATE');const value=match[3]+'-'+match[2]+'-'+match[1],parsed=new Date(value+'T00:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail('INVALID_DATE');return value;}
function category(code,description){
 const text=normalized(description);
 if(/TRANSPORT|XUPONA/.test(text))return 'transport';if(/SEMEN|DOSIS|INSEMIN/.test(text))return 'reproduction';
 if(code.startsWith('65')||/PINSO|VERRES|PORCELLS|PORCS |PMX |PREMIX/.test(text))return 'feed';
 if(/SUSPENSION|INYECTABLE|VACUNA|PORCILIS|INGELVAC|HYOGEN|SUVAXYN|ECOPORC|GENTAMOX|ANTIBIO|MEDICAM|DOX|AMOX|IVERMEC|TIAMUL|MG\/ML|MG\/G|LIOFILIZAD|VIAL|POLVO PARA|FORCERIS|RHEMOX|PARACILLIN|CARBOVET|LINCO|PIRESOL|MYCOFLOR/.test(text))return 'medicines';
 if(/GUANTS|BISTURI|TUB |TENALLA|MARQUES|AGULL|DESINF|KYLEO|DETERGENT/.test(text))return 'supplies';return 'other';
}
export function parseFarmInvoicePages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>300)fail('TOO_MANY_PAGES');
 const invoices=[],identities=new Map(),farms=new Map();let current=null,customerTax=null,duplicates=0;
 for(const [pageIndex,page]of pages.entries()){
  try{
  const items=page.items.filter(item=>typeof(item.text??item.str)==='string'&&(item.text??item.str).trim()).map(item=>({text:(item.text??item.str).trim(),x:item.x??item.transform[4],y:item.y??item.transform[5],width:item.width||0}));
  const header=text=>items.find(item=>item.text===text);
  if(!['Nº FACTURA','DATA FACTURA','C.I.F. CLIENT','QUANTITAT','PREU','IMPORT','TOTAL ALB.','CODI','DESCRIPCIÓ'].every(header))fail('UNSUPPORTED_LAYOUT');
  const reference=items.find(item=>/^\d{4}-\d+-\d+$/.test(item.text)&&item.y>650&&item.x<115)?.text;
  const invoiceDate=date(items.find(item=>/^\d{2}\/\d{2}\/\d{4}$/.test(item.text)&&item.y>650&&item.x>115&&item.x<200)?.text);
  const tax=items.find(item=>/^[A-Z]\d{8}$/.test(item.text)&&item.y>650&&item.x<115)?.text;
  const supplier=items.find(item=>/^NIF:\s*[A-Z]\d{8}$/.test(item.text)),supplierTax=supplier?.text.match(/[A-Z]\d{8}$/)?.[0];
  const supplierName=items.filter(item=>item.x>280&&item.y>790).sort((a,b)=>b.y-a.y)[0]?.text;
  if(!reference||!tax||!supplierTax||!supplierName)fail('UNSUPPORTED_LAYOUT');
  if(customerTax&&customerTax!==tax)fail('MULTIPLE_COMPANIES');customerTax=tax;
  const identity=supplierTax+':'+reference;
  if(!current)current={identity,reference,invoice_date:invoiceDate,supplier_name:supplierName,supplier_tax_id:supplierTax,customer_tax_id:tax,pages:[],lines:[],sum:0n,preciseSum:0n,farm:null,delivery:'',deliveryDate:''};
  else if(current.identity!==identity||current.invoice_date!==invoiceDate)fail('INCOMPLETE_INVOICE');
  current.pages.push(pageIndex+1);
  const invoiceFooter=header('TOTAL EUR'),carryFooter=header('RÒSSEC:'),carry=header('SUMA ANTERIOR:'),bodyBottom=invoiceFooter?invoiceFooter.y+3:carryFooter?carryFooter.y+3:0;
  if(!invoiceFooter&&!carryFooter)fail('MISSING_TOTAL');
  const amounts=items.filter(item=>item.x>=455&&item.x<512&&item.y<625&&item.y>bodyBottom&&moneyPattern(3).test(item.text)),used=new Set();
  function running(anchor){
   const found=items.filter(item=>Math.abs(item.y-anchor.y)<1&&item.x>=455&&item.x<512&&moneyPattern(3).test(item.text));
   // A carry uses unrounded source amounts; each displayed line is rounded to a millieuro.
   if(found.length!==1||absolute(sourceValue(found[0].text,3)-current.sum)*2n>BigInt(current.lines.length))throw Object.assign(new Error('FARM_PDF_CARRY_MISMATCH'),{page:pageIndex+1,reference:current.reference,calculated:fixed(current.sum,3),printed:found.map(item=>item.text)});used.add(found[0]);
  }
  if(carry)running(carry);else if(current.pages.length>1)fail('MISSING_CARRY');
  const productItems=items.filter(item=>/^\d{8}$/.test(item.text)&&Math.abs(item.x-99)<4&&item.y<625&&item.y>bodyBottom);
  const farmItems=items.filter(item=>item.text==='GRANJA:'&&item.y<625&&item.y>bodyBottom);
  const events=[...productItems.map(item=>({type:'line',item})),...farmItems.map(item=>({type:'farm',item}))].sort((a,b)=>b.item.y-a.item.y);
  for(const [eventIndex,event]of events.entries()){
   const row=items.filter(item=>Math.abs(item.y-event.item.y)<0.8).sort((a,b)=>a.x-b.x);
   if(event.type==='farm'){
    const text=row.filter(item=>item.x>=150&&item.x<430).map(item=>item.text).join(' '),match=text.match(/^(\d{1,20})\s+(.+)$/);
    if(!match||match[2].length>160)fail('INVALID_FARM');
    const found=farms.get(match[1]);if(found&&found!==match[2])fail('CONFLICTING_FARM_NAME');farms.set(match[1],match[2]);current.farm=match[1];continue;
   }
   const select=(minimum,maximum,places)=>row.filter(item=>item.x>=minimum&&item.x<maximum&&moneyPattern(places).test(item.text));
   const values=select(455,512,3),quantity=select(345,410,2),price=row.filter(item=>item.x>=405&&item.x<455&&pricePattern.test(item.text));
   const vat=row.find(item=>item.x>=136&&item.x<155&&/^\d{1,2}(?:,\d{1,2})?$/.test(item.text));
   const description=row.filter(item=>item.x>=150&&item.x<345&&!['Kg','KG','Un.','L'].includes(item.text)).map(item=>item.text).join(' ');
   if(values.length>1||quantity.length>1||price.length>1||!vat||!description||description.length>300)fail('INVALID_LINE');
   if(!values.length&&price.length)fail('INVALID_LINE');
   const delivery=row.find(item=>item.x>=48&&item.x<99),deliveryDate=row.find(item=>item.x>=20&&item.x<48&&/^\d{2}\/\d{2}$/.test(item.text));
   if(delivery){current.delivery=delivery.text;current.deliveryDate=deliveryDate?.text||'';}
   const nextY=events[eventIndex+1]?.item.y??bodyBottom;
   const notes=items.filter(item=>item.x>=150&&item.x<345&&item.y<event.item.y-1&&item.y>nextY+1&&!['SUMA ANTERIOR:','RÒSSEC:'].includes(item.text)).sort((a,b)=>b.y-a.y||a.x-b.x).map(item=>item.text).join(' ');
   const value=values.length?sourceValue(values[0].text,3):0n,qty=quantity.length?sourceValue(quantity[0].text,2):null,unitPrice=price.length?scaled(price[0].text.replace(/\./g,'').replace(',','.'),5):null,rate=vat.text.replace(',','.');
   const verified=qty!==null&&unitPrice!==null?absolute(qty*unitPrice-value*10000n)<=50000n:null,precise=verified?qty*unitPrice:value*10000n;
   current.lines.push({position:current.lines.length+1,farm_code:current.farm,product_code:event.item.text,description,notes:notes.slice(0,1000),category:category(event.item.text,description),quantity:qty===null?null:fixed(qty,2),unit_price:unitPrice===null?null:fixed(unitPrice,5),source_amount:fixed(value,3),precise_amount:fixed(precise,7),informational:!values.length,vat_rate:rate,delivery_reference:current.delivery,delivery_date:current.deliveryDate,source_page:pageIndex+1,price_verified:verified});
   current.sum+=value;current.preciseSum+=precise;if(values.length)used.add(values[0]);
  }
  if(amounts.some(item=>!used.has(item)))fail('UNREAD_AMOUNT');
  if(carryFooter){running(carryFooter);continue;}
  const footerValues=(minimum,maximum)=>items.filter(item=>item.x>=minimum&&item.x<maximum&&item.y<invoiceFooter.y&&item.y>75&&moneyPattern(2).test(item.text));
  const bases=footerValues(180,235),taxes=footerValues(278,330),rates=items.filter(item=>item.x>=235&&item.x<278&&item.y<invoiceFooter.y&&item.y>40&&moneyPattern(2).test(item.text)),totals=footerValues(455,515),bruts=footerValues(40,115);
  if(bases.length!==1||taxes.length!==1||!rates.length||totals.length!==1||bruts.length!==1)fail('MISSING_TAX_TOTAL');
  const baseTotal=sourceValue(bases[0].text,2),taxTotal=sourceValue(taxes[0].text,2),total=sourceValue(totals[0].text,2);
  const vatGroups=rates.map(rate=>{
   if(Math.abs(rate.y-bases[0].y)<2)return {rate:fixed(sourceValue(rate.text,2),2),base:baseTotal,tax:taxTotal};
   const base=items.find(item=>item.x>=180&&item.x<235&&Math.abs(item.y-rate.y)<1&&moneyPattern(3).test(item.text)),tax=items.find(item=>item.x>=278&&item.x<330&&Math.abs(item.y-rate.y)<1&&moneyPattern(3).test(item.text));
   if(!base||!tax)fail('AMBIGUOUS_TAX');return {rate:fixed(sourceValue(rate.text,2),2),base:rounded(sourceValue(base.text,3),10n),tax:rounded(sourceValue(tax.text,3),10n)};
  });
  if(vatGroups.reduce((sum,group)=>sum+group.base,0n)!==baseTotal||vatGroups.reduce((sum,group)=>sum+group.tax,0n)!==taxTotal)fail('VAT_TOTAL_MISMATCH');
  if(absolute(baseTotal*10n-current.sum)*2n>BigInt(current.lines.length)+10n||sourceValue(bruts[0].text,2)!==baseTotal)fail('BASE_TOTAL_MISMATCH');
  if(baseTotal+taxTotal!==total)fail('TOTAL_MISMATCH');
  for(const group of vatGroups){
   const lines=current.lines.filter(line=>!line.informational&&scaled(line.vat_rate,2)===scaled(group.rate,2)),values=lines.map(line=>scaled(line.source_amount,3)*10000n);
   if(absolute(group.base*100000n-values.reduce((sum,value)=>sum+value,0n))*2n>(BigInt(lines.length)+10n)*10000n||absolute(rounded(group.base*scaled(group.rate,2),10000n)-group.tax)*2n>BigInt(lines.length)+1n)fail('VAT_TOTAL_MISMATCH');
   const allocated=allocateRounded(values,100000n,group.base),vat=allocateRounded(values.map(value=>value*scaled(group.rate,2)),1000000000n,group.tax);
   lines.forEach((line,index)=>{line.base_amount=fixed(allocated[index],2);line.vat_amount=fixed(vat[index],2);line.total_amount=fixed(allocated[index]+vat[index],2);});
  }
  for(const line of current.lines){if(line.base_amount===undefined&&scaled(line.source_amount,3)===0n){line.base_amount='0.00';line.vat_amount='0.00';line.total_amount='0.00';}if(line.base_amount===undefined)fail('MISSING_VAT_GROUP');}
  const invoice={reference:current.reference,invoice_date:current.invoice_date,supplier_name:current.supplier_name,supplier_tax_id:current.supplier_tax_id,customer_tax_id:current.customer_tax_id,pages:current.pages,base_total:fixed(baseTotal,2),vat_total:fixed(taxTotal,2),total_amount:fixed(total,2),source_total:fixed(current.sum,3),lines:current.lines};
  // Identity follows the source, independently of inferred categories and allocated rounding cents.
  const canonical={...invoice,pages:undefined,lines:invoice.lines.map(({source_page,category,price_verified,precise_amount,base_amount,vat_amount,total_amount,...line})=>line)},hash=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  if(identities.has(current.identity)){if(identities.get(current.identity)!==hash)fail('CONFLICTING_INVOICE');duplicates++;}else{identities.set(current.identity,hash);invoices.push({...invoice,content_hash:hash});}
  current=null;
  }catch(error){error.page??=pageIndex+1;error.reference??=current?.reference;throw error;}
 }
 if(current||!invoices.length)fail('INCOMPLETE_INVOICE');
 const lines=invoices.flatMap(invoice=>invoice.lines),sum=(rows,key)=>fixed(rows.reduce((total,row)=>total+scaled(row[key],2),0n),2);
 return {parser:'sant-isidre-farm-invoices',customer_tax_id:customerTax,pages:pages.length,invoices,farms:[...farms].map(([code,name])=>({code,name})),totals:{invoices:invoices.length,lines:lines.length,farms:farms.size,duplicates,base:sum(invoices,'base_total'),vat:sum(invoices,'vat_total'),total:sum(invoices,'total_amount'),unassigned_lines:lines.filter(line=>!line.farm_code&&scaled(line.base_amount,2)!==0n).length,unassigned_base:sum(lines.filter(line=>!line.farm_code),'base_amount'),price_review_lines:lines.filter(line=>line.price_verified===false).length}};
}
export async function extractFarmPdf(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.length>15*1024*1024||buffer.subarray(0,5).toString()!=='%PDF-')fail('INVALID');
 const task=getDocument({data:new Uint8Array(buffer),isEvalSupported:false,useSystemFonts:true,verbosity:0});
 try{const pdf=await task.promise;if(pdf.numPages>300)fail('TOO_MANY_PAGES');const pages=[];for(let page=1;page<=pdf.numPages;page++)pages.push({page,items:(await(await pdf.getPage(page)).getTextContent()).items});return parseFarmInvoicePages(pages);}finally{await task.destroy();}
}
