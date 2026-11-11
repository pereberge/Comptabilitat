import {randomUUID} from 'node:crypto';
import {HttpError} from '../middleware/errors.js';
import {withTransaction} from '../db/transaction.js';
import {lockCompany} from './subaccounts.js';
import {id,date,fail} from './validation.js';
import {hash,requestId,text} from './invoice-validation.js';
import {createInvoiceService} from './invoices.js';
import {calculateInvoice} from '../../../shared/invoice-money.js';
import {purchaseLine,purchaseTotals,purchaseNumber,purchaseDecimal,purchasePriceChange,purchaseAmountDifferences,purchaseLineLimits} from '../../../shared/purchases.js';
import {purchaseDocumentMime} from './purchase-document-reader.js';
import {partyAccount} from './trade-posting.js';
import {normalizePartyProfile} from '../../../shared/account-party.js';
import {partyTaxId} from '../../../shared/party-identity.js';
const types={orders:['purchase_orders','purchase_order_lines'],receipts:['purchase_receipts','purchase_receipt_lines'],invoices:['purchase_invoices','purchase_invoice_lines']};
const type=value=>{if(!types[value])fail('PURCHASE_INVALID_TYPE');return types[value];};
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const optionalId=value=>value==null||value===''?null:id(value);
const asDate=value=>value?date(value):null;
const conflict=code=>{throw new HttpError(409,code);};

export function createPurchaseService(pool,companyId,actor='local'){
 async function audit(db,action,entity,id,before,after){await db.execute('INSERT INTO management_audit_events(company_id,actor,action,entity_type,entity_id,before_data,after_data) VALUES (?,?,?,?,?,?,?)',[companyId,actor,action,entity,id,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);}
 async function operation(action,key,payload,work){
  key=requestId(key);const digest=hash({action,payload});
  return withTransaction(pool,async db=>{
   await lockCompany(db,companyId);
   const [[prior]]=await db.execute('SELECT request_hash,response FROM management_requests WHERE company_id=? AND request_id=?',[companyId,key]);
   if(prior){if(prior.request_hash!==digest)conflict('REQUEST_CONFLICT');return {...parse(prior.response),replayed:true};}
   const result=await work(db);await db.execute('INSERT INTO management_requests(company_id,request_id,request_hash,response) VALUES (?,?,?,?)',[companyId,key,digest,JSON.stringify(result)]);return result;
  });
 }
 async function cancellationDependencies(db,kind,doc){
  const found=new Map();
   for(const line of doc.lines){
    let used=[];
    if(kind==='orders')used=(await db.execute("SELECT DISTINCT d.id,d.reference,d.document_date,d.status,'receipts' AS kind FROM purchase_order_receipts a JOIN purchase_receipt_lines l ON l.company_id=a.company_id AND l.id=a.receipt_line_id JOIN purchase_receipts d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=? AND a.order_line_id=? AND d.status<>'cancelled' UNION ALL SELECT DISTINCT d.id,d.reference,d.document_date,d.status,'invoices' AS kind FROM purchase_invoice_links a JOIN purchase_invoice_lines l ON l.company_id=a.company_id AND l.id=a.invoice_line_id JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=? AND a.order_line_id=? AND d.status<>'cancelled'",[companyId,line.id,companyId,line.id]))[0];
    if(kind==='receipts')used=(await db.execute("SELECT DISTINCT d.id,d.reference,d.document_date,d.status,'invoices' AS kind FROM purchase_invoice_links a JOIN purchase_invoice_lines l ON l.company_id=a.company_id AND l.id=a.invoice_line_id JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=? AND a.receipt_line_id=? AND d.status<>'cancelled'",[companyId,line.id]))[0];
    for(const row of used)found.set(row.kind+':'+row.id,row);
   }
  return [...found.values()];
 }
 async function supplier(db,accountId){
  const [[row]]=await db.execute("SELECT id,code,description,party_profile FROM accounts WHERE company_id=? AND id=? AND kind='subaccount' AND (code LIKE '400%' OR code LIKE '410%')",[companyId,id(accountId)]);
  if(!row)fail('PURCHASE_INVALID_SUPPLIER');return {...row,party_profile:parse(row.party_profile)||{}};
 }
 async function details(db,kind,target){
  const [table,lines]=type(kind);
  const [[doc]]=await db.execute(`SELECT d.*,a.description AS supplier_name,s.source_name,s.source_mime FROM ${table} d LEFT JOIN accounts a ON a.company_id=d.company_id AND a.id=d.supplier_account_id LEFT JOIN company_documents s ON s.company_id=d.company_id AND s.id=d.original_document_id WHERE d.company_id=? AND d.id=?`,[companyId,id(target)]);
  if(!doc)throw new HttpError(404,'PURCHASE_NOT_FOUND');
  const [rows]=await db.execute(`SELECT l.*,i.code AS item_code,i.description AS item_name,u.code AS unit_code FROM ${lines} l LEFT JOIN purchase_items i ON i.company_id=l.company_id AND i.id=l.item_id LEFT JOIN purchase_units u ON u.company_id=i.company_id AND u.id=i.unit_id WHERE l.company_id=? AND l.document_id=? ORDER BY l.position`,[companyId,doc.id]);
  if(kind==='orders'){
   const [received]=await db.execute("SELECT a.order_line_id,d.id AS purchase_receipt_id,d.reference,d.document_date,l.id AS receipt_line_id,l.description,SUM(a.quantity) AS received_quantity FROM purchase_order_receipts a JOIN purchase_receipt_lines l ON l.company_id=a.company_id AND l.id=a.receipt_line_id JOIN purchase_receipts d ON d.company_id=l.company_id AND d.id=l.document_id JOIN purchase_order_lines o ON o.company_id=a.company_id AND o.id=a.order_line_id WHERE a.company_id=? AND o.document_id=? AND d.status='confirmed' GROUP BY a.order_line_id,d.id,d.reference,d.document_date,l.id,l.description ORDER BY d.document_date,d.id,l.id,a.order_line_id",[companyId,doc.id]);
   const quantities=new Map();
   for(const row of received){const key=String(row.order_line_id);quantities.set(key,(quantities.get(key)||0n)+purchaseNumber(row.received_quantity));}
   doc.receipt_allocations=received.map(row=>({...row,quantity:purchaseDecimal(purchaseNumber(row.received_quantity)),unit_code:rows.find(line=>String(line.id)===String(row.order_line_id))?.unit_code||null}));
   for(const line of rows){const amount=quantities.get(String(line.id))||0n,remaining=purchaseNumber(line.quantity)-amount;line.received_quantity=purchaseDecimal(amount);line.pending_quantity=purchaseDecimal(remaining>0n?remaining:0n);}
  }
  if(kind==='receipts'){
   const [invoiced]=await db.execute("SELECT a.receipt_line_id,d.id AS purchase_invoice_id,d.reference,d.document_date,l.id AS invoice_line_id,l.description,SUM(a.quantity) AS invoiced_quantity FROM purchase_invoice_links a JOIN purchase_invoice_lines l ON l.company_id=a.company_id AND l.id=a.invoice_line_id JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id JOIN purchase_receipt_lines r ON r.company_id=a.company_id AND r.id=a.receipt_line_id WHERE a.company_id=? AND r.document_id=? AND d.status='confirmed' GROUP BY a.receipt_line_id,d.id,d.reference,d.document_date,l.id,l.description ORDER BY d.document_date,d.id,l.id,a.receipt_line_id",[companyId,doc.id]);
   const quantities=new Map();
   for(const row of invoiced){const key=String(row.receipt_line_id);quantities.set(key,(quantities.get(key)||0n)+purchaseNumber(row.invoiced_quantity));}
   doc.invoice_allocations=invoiced.map(row=>({...row,quantity:purchaseDecimal(purchaseNumber(row.invoiced_quantity)),unit_code:rows.find(line=>String(line.id)===String(row.receipt_line_id))?.unit_code||null}));
   for(const line of rows){const amount=quantities.get(String(line.id))||0n,remaining=purchaseNumber(line.quantity)-amount;line.invoiced_quantity=purchaseDecimal(amount);line.pending_invoice_quantity=purchaseDecimal(remaining>0n?remaining:0n);}
  }
  for(const line of rows){
   let links=[];
   if(kind==='receipts')links=(await db.execute('SELECT order_line_id AS line_id,quantity FROM purchase_order_receipts WHERE company_id=? AND receipt_line_id=?',[companyId,line.id]))[0].map(row=>({...row,kind:'order'}));
   if(kind==='invoices'){
    const raw=(await db.execute('SELECT receipt_line_id,order_line_id,quantity FROM purchase_invoice_links WHERE company_id=? AND invoice_line_id=?',[companyId,line.id]))[0],grouped=new Map();
    for(const row of raw){const kind=row.receipt_line_id?'receipt':'order',line_id=row.receipt_line_id||row.order_line_id,key=kind+':'+line_id;const old=grouped.get(key)||{kind,line_id,quantity:'0.000000'};old.quantity=purchaseDecimal(purchaseNumber(old.quantity)+purchaseNumber(row.quantity));grouped.set(key,old);}links=[...grouped.values()];
   }
   line.links=links;Object.assign(line,purchaseLine(line,{unpriced:true}));
  }
  const comparisons=[];
  if(kind==='invoices')for(const line of rows.filter(line=>line.item_id&&line.net_unit_price!==null)){
   const [[previous]]=await db.execute(`SELECT l.unit_price,l.discount_rate,d.reference,d.document_date FROM purchase_invoice_lines l JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id JOIN trade_invoices t ON t.company_id=d.company_id AND t.id=d.invoice_id AND t.status='posted' WHERE d.company_id=? AND d.supplier_account_id=? AND l.item_id=? AND d.status='confirmed' AND d.id<>? AND d.document_date<=? ORDER BY d.document_date DESC,d.id DESC LIMIT 1`,[companyId,doc.supplier_account_id,line.item_id,doc.id,doc.document_date||'9999-12-31']);
   if(previous){const old=purchaseLine({quantity:'1',unit_price:previous.unit_price,discount_rate:previous.discount_rate,tax_rate:'0'}).net_unit_price;comparisons.push({line_id:line.id,item_code:line.item_code,previous_reference:previous.reference,previous_date:previous.document_date,previous_price:old,current_price:line.net_unit_price,change_percent:purchasePriceChange(old,line.net_unit_price)});}
  }
  const differences=[];
  if(kind!=='orders')for(const line of rows){
   const assigned=line.links.reduce((sum,link)=>sum+purchaseNumber(link.quantity),0n);
   if(assigned<purchaseNumber(line.quantity))differences.push({line_id:line.id,kind:'unlinked_quantity',quantity:purchaseDecimal(purchaseNumber(line.quantity)-assigned)});
   for(const link of line.links){const [,sourceTable]=link.kind==='order'?types.orders:types.receipts;const [[origin]]=await db.execute(`SELECT quantity,unit_price,discount_rate,tax_rate FROM ${sourceTable} WHERE company_id=? AND id=?`,[companyId,link.line_id]);if(origin?.unit_price!==null&&origin?.unit_price!==undefined&&line.net_unit_price!==null){const price=purchaseLine(origin,{unpriced:true}).net_unit_price;if(price!==line.net_unit_price)differences.push({line_id:line.id,kind:'price',source:link.kind,source_price:price,invoice_price:line.net_unit_price});}}
  }
  const extraction=doc.extraction?parse(doc.extraction):null;
  if(kind==='invoices')differences.push(...purchaseAmountDifferences(rows,extraction));
  return {...doc,extraction,kind,lines:rows,totals:purchaseTotals(rows),price_comparisons:comparisons,differences};
 }
 function normalized(kind,body){
  type(kind);if(!Array.isArray(body?.lines)||!body.lines.length)fail('PURCHASE_INVALID_LINES');
  if(body.lines.length>purchaseLineLimits[kind])fail('PURCHASE_TOO_MANY_LINES');
  return {supplier_account_id:optionalId(body.supplier_account_id),reference:text(body.reference||'',100),document_date:asDate(body.document_date),due_date:asDate(body.due_date),notes:text(body.notes||'',1000),original_document_id:optionalId(body.original_document_id),
   lines:body.lines.map((line,index)=>{
    let amount;try{amount=purchaseLine(line,{unpriced:true});}catch{fail('PURCHASE_INVALID_AMOUNT');}
    return {position:index+1,item_id:optionalId(line.item_id),description:text(line.description||'',300),quantity:amount.quantity,unit_price:amount.unit_price,discount_rate:amount.discount_rate,tax_rate:amount.tax_rate,
     links:(line.links||[]).map(link=>{if(!['order','receipt'].includes(link.kind)||kind==='orders'||kind==='receipts'&&link.kind!=='order')fail('PURCHASE_INVALID_LINK');let quantity;try{quantity=purchaseNumber(link.quantity);}catch{fail('PURCHASE_INVALID_AMOUNT');}if(quantity<=0n)fail('PURCHASE_INVALID_AMOUNT');return {kind:link.kind,line_id:id(link.line_id),quantity:purchaseDecimal(quantity)};})};
   })};
 }
 async function validateItems(db,data){
  if(data.supplier_account_id)await supplier(db,data.supplier_account_id);
  if(data.original_document_id){const [[source]]=await db.execute('SELECT id,content FROM company_documents WHERE company_id=? AND id=?',[companyId,data.original_document_id]);if(!source)fail('PURCHASE_INVALID_SOURCE');purchaseDocumentMime(source.content);}
  for(const line of data.lines){if(line.item_id){const [[item]]=await db.execute('SELECT description FROM purchase_items WHERE company_id=? AND id=? AND active=1',[companyId,line.item_id]);if(!item)fail('PURCHASE_INVALID_ITEM');if(!line.description)line.description=item.description;}if(!line.description)fail('PURCHASE_INVALID_LINES');}
 }
 async function writeLinks(db,kind,doc){
  if(kind==='orders')return;
  const reserved=new Map();
  async function source(sourceKind,target){
   const [table,lines]=sourceKind==='order'?types.orders:types.receipts;
   const [[row]]=await db.execute(`SELECT l.*,d.supplier_account_id,d.status,d.reference FROM ${lines} l JOIN ${table} d ON d.company_id=l.company_id AND d.id=l.document_id WHERE l.company_id=? AND l.id=?`,[companyId,target]);
   if(!row||row.status!=='confirmed'||row.supplier_account_id!==doc.supplier_account_id)fail('PURCHASE_INVALID_LINK');return row;
  }
  async function consume(sourceKind,row,quantity,mode){
   const key=mode+':'+sourceKind+':'+row.id;
   let used;
   if(mode==='receiving')used=(await db.execute("SELECT COALESCE(SUM(a.quantity),0) AS quantity FROM purchase_order_receipts a JOIN purchase_receipt_lines l ON l.company_id=a.company_id AND l.id=a.receipt_line_id JOIN purchase_receipts d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=? AND a.order_line_id=? AND d.status='confirmed'",[companyId,row.id]))[0][0].quantity;
   else used=(await db.execute(`SELECT COALESCE(SUM(a.quantity),0) AS quantity FROM purchase_invoice_links a JOIN purchase_invoice_lines l ON l.company_id=a.company_id AND l.id=a.invoice_line_id JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=? AND a.${sourceKind==='order'?'order_line_id':'receipt_line_id'}=? AND d.status='confirmed'`,[companyId,row.id]))[0][0].quantity;
   const amount=purchaseNumber(used)+(reserved.get(key)||0n)+quantity;
   if(amount>purchaseNumber(row.quantity))conflict('PURCHASE_QUANTITY_EXCEEDED');reserved.set(key,(reserved.get(key)||0n)+quantity);
  }
  for(const line of doc.lines){
   let assigned=0n;const seen=new Set();
   for(const link of line.links){
    const key=link.kind+':'+link.line_id;if(seen.has(key))fail('PURCHASE_INVALID_LINK');seen.add(key);
    const quantity=purchaseNumber(link.quantity);assigned+=quantity;if(assigned>purchaseNumber(line.quantity))conflict('PURCHASE_QUANTITY_EXCEEDED');
    const origin=await source(link.kind,link.line_id);if(!line.item_id||origin.item_id!==line.item_id)fail('PURCHASE_INVALID_LINK');
    if(kind==='receipts'){
     await consume('order',origin,quantity,'receiving');await db.execute('INSERT INTO purchase_order_receipts(company_id,order_line_id,receipt_line_id,quantity) VALUES (?,?,?,?)',[companyId,origin.id,line.id,link.quantity]);
    }else if(link.kind==='order'){
     await consume('order',origin,quantity,'invoicing');await db.execute('INSERT INTO purchase_invoice_links(company_id,invoice_line_id,order_line_id,quantity) VALUES (?,?,?,?)',[companyId,line.id,origin.id,link.quantity]);
    }else{
     await consume('receipt',origin,quantity,'invoicing');
     const [orders]=await db.execute('SELECT a.order_line_id,a.quantity FROM purchase_order_receipts a WHERE a.company_id=? AND a.receipt_line_id=? ORDER BY a.id',[companyId,origin.id]);
     let remaining=quantity,attached=0n;
     for(const order of orders){
      attached+=purchaseNumber(order.quantity);
      const orderRow=await source('order',order.order_line_id);
      const [[used]]=await db.execute("SELECT COALESCE(SUM(a.quantity),0) AS quantity FROM purchase_invoice_links a JOIN purchase_invoice_lines l ON l.company_id=a.company_id AND l.id=a.invoice_line_id JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=? AND a.order_line_id=? AND d.status='confirmed'",[companyId,orderRow.id]);
      const [[pair]]=await db.execute("SELECT COALESCE(SUM(a.quantity),0) AS quantity FROM purchase_invoice_links a JOIN purchase_invoice_lines l ON l.company_id=a.company_id AND l.id=a.invoice_line_id JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=? AND a.order_line_id=? AND a.receipt_line_id=? AND d.status='confirmed'",[companyId,orderRow.id,origin.id]);
      const orderAvailable=purchaseNumber(orderRow.quantity)-purchaseNumber(used.quantity)-(reserved.get('invoicing:order:'+orderRow.id)||0n);
      const pairKey='pair:'+origin.id+':'+orderRow.id,pairAvailable=purchaseNumber(order.quantity)-purchaseNumber(pair.quantity)-(reserved.get(pairKey)||0n);
      const take=[remaining,orderAvailable,pairAvailable].reduce((a,b)=>a<b?a:b);
      if(take>0n){await consume('order',orderRow,take,'invoicing');reserved.set(pairKey,(reserved.get(pairKey)||0n)+take);await db.execute('INSERT INTO purchase_invoice_links(company_id,invoice_line_id,receipt_line_id,order_line_id,quantity) VALUES (?,?,?,?,?)',[companyId,line.id,origin.id,orderRow.id,purchaseDecimal(take)]);remaining-=take;}
     }
     if(remaining>0n){const free=purchaseNumber(origin.quantity)-attached,freeKey='free:'+origin.id;
      const [[usedFree]]=await db.execute("SELECT COALESCE(SUM(a.quantity),0) AS quantity FROM purchase_invoice_links a JOIN purchase_invoice_lines l ON l.company_id=a.company_id AND l.id=a.invoice_line_id JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=? AND a.receipt_line_id=? AND a.order_line_id IS NULL AND d.status='confirmed'",[companyId,origin.id]);
      if(remaining>free-purchaseNumber(usedFree.quantity)-(reserved.get(freeKey)||0n))conflict('PURCHASE_QUANTITY_EXCEEDED');reserved.set(freeKey,(reserved.get(freeKey)||0n)+remaining);await db.execute('INSERT INTO purchase_invoice_links(company_id,invoice_line_id,receipt_line_id,quantity) VALUES (?,?,?,?)',[companyId,line.id,origin.id,purchaseDecimal(remaining)]);
     }
    }
   }
  }
 }
 async function clearLinks(db,kind,doc){for(const line of doc.lines){if(kind==='receipts')await db.execute('DELETE FROM purchase_order_receipts WHERE company_id=? AND receipt_line_id=?',[companyId,line.id]);if(kind==='invoices')await db.execute('DELETE FROM purchase_invoice_links WHERE company_id=? AND invoice_line_id=?',[companyId,line.id]);}}
 const service={
  createSupplier:body=>{
   let party;try{party=normalizePartyProfile(body?.party);}catch(error){fail(error.message);}party.tax_id=partyTaxId(party.tax_id);if(!party.name||!party.tax_id)fail('PURCHASE_SUPPLIER_DATA_REQUIRED');
   return operation('supplier.prepare',body.request_id,{party},async db=>{
    const settings=await lockCompany(db,companyId),account=await partyAccount(db,companyId,settings,{direction:'received',party,party_parent:'4000'});
    const [[saved]]=await db.execute('SELECT id,code,description,party_profile FROM accounts WHERE company_id=? AND id=?',[companyId,account.id]);const result={...saved,party_profile:parse(saved.party_profile)};await audit(db,'prepare','supplier_account',saved.id,null,result);return result;
   });
  },
  async catalog(){
   const [units]=await pool.execute('SELECT * FROM purchase_units WHERE company_id=? ORDER BY code',[companyId]);
   const [items]=await pool.execute('SELECT i.*,u.code AS unit_code FROM purchase_items i JOIN purchase_units u ON u.company_id=i.company_id AND u.id=i.unit_id WHERE i.company_id=? ORDER BY i.code',[companyId]);
   const [suppliers]=await pool.execute("SELECT id,code,description,party_profile FROM accounts WHERE company_id=? AND kind='subaccount' AND (code LIKE '400%' OR code LIKE '410%') ORDER BY description",[companyId]);
   const sources=[];
   for(const [kind,[table,lines]]of Object.entries(types).filter(([kind])=>kind!=='invoices')){
    const [rows]=await pool.execute(`SELECT l.*,d.reference,d.document_date,d.supplier_account_id,i.code AS item_code,i.description AS item_name,u.code AS unit_code FROM ${lines} l JOIN ${table} d ON d.company_id=l.company_id AND d.id=l.document_id LEFT JOIN purchase_items i ON i.company_id=l.company_id AND i.id=l.item_id LEFT JOIN purchase_units u ON u.company_id=i.company_id AND u.id=i.unit_id WHERE l.company_id=? AND d.status='confirmed' ORDER BY d.document_date DESC,l.id DESC`,[companyId]);sources.push(...rows.map(row=>({...row,kind:kind==='orders'?'order':'receipt'})));
   }
   return {units,items,suppliers,sources};
  },
  createUnit:body=>operation('unit.create',body.request_id,body,async db=>{
   const code=text(body.code,20,true),name=text(body.name,100,true);if(!['mass','volume','unit','time','other'].includes(body.dimension))fail('PURCHASE_INVALID_UNIT');
   const baseId=optionalId(body.base_unit_id);let factor=1000000000n;
   if(baseId){const [[base]]=await db.execute('SELECT dimension,base_unit_id FROM purchase_units WHERE company_id=? AND id=?',[companyId,baseId]);if(!base||base.dimension!==body.dimension||base.base_unit_id)fail('PURCHASE_INVALID_UNIT');try{factor=purchaseNumber(body.conversion_factor,9);}catch{fail('PURCHASE_INVALID_UNIT');}if(factor<=0n)fail('PURCHASE_INVALID_UNIT');}
   const [row]=await db.execute('INSERT INTO purchase_units(company_id,code,name,dimension,base_unit_id,conversion_factor) VALUES (?,?,?,?,?,?)',[companyId,code,name,body.dimension,baseId,purchaseDecimal(factor,9)]);const result={id:row.insertId,code,name,dimension:body.dimension,base_unit_id:baseId,conversion_factor:purchaseDecimal(factor,9)};await audit(db,'create','unit',result.id,null,result);return result;
  }),
  createItem:body=>operation('item.create',body.request_id,body,async db=>{
   const [[unit]]=await db.execute('SELECT id FROM purchase_units WHERE company_id=? AND id=?',[companyId,id(body.unit_id)]);if(!unit)fail('PURCHASE_INVALID_UNIT');
   const code=text(body.code,60,true),description=text(body.description,300,true);const [row]=await db.execute('INSERT INTO purchase_items(company_id,code,description,unit_id) VALUES (?,?,?,?)',[companyId,code,description,unit.id]);const result={id:row.insertId,code,description,unit_id:unit.id};
   if(body.supplier_code){await supplier(db,body.supplier_account_id);await db.execute('INSERT INTO purchase_supplier_items(company_id,supplier_account_id,item_id,supplier_code) VALUES (?,?,?,?)',[companyId,id(body.supplier_account_id),result.id,text(body.supplier_code,100,true)]);}await audit(db,'create','item',result.id,null,result);return result;
  }),
  async list(kind){const [table,lines]=type(kind);const [rows]=await pool.execute(`SELECT d.*,a.description AS supplier_name,(SELECT COUNT(*) FROM ${lines} l WHERE l.company_id=d.company_id AND l.document_id=d.id) AS line_count FROM ${table} d LEFT JOIN accounts a ON a.company_id=d.company_id AND a.id=d.supplier_account_id WHERE d.company_id=? ORDER BY d.document_date DESC,d.id DESC LIMIT 500`,[companyId]);
   if(kind==='receipts'&&rows.length){
    const [quantities]=await pool.execute(`SELECT r.document_id,r.quantity,COALESCE((SELECT SUM(a.quantity) FROM purchase_invoice_links a JOIN purchase_invoice_lines l ON l.company_id=a.company_id AND l.id=a.invoice_line_id JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id WHERE a.company_id=r.company_id AND a.receipt_line_id=r.id AND d.status='confirmed'),0) AS invoiced_quantity FROM purchase_receipt_lines r WHERE r.company_id=? AND r.document_id IN (${rows.map(()=>'?').join(',')})`,[companyId,...rows.map(row=>row.id)]);
    const summaries=new Map(rows.map(row=>[String(row.id),{pending:0,invoiced:0}]));
    for(const line of quantities){const summary=summaries.get(String(line.document_id));if(!summary)continue;const invoiced=purchaseNumber(line.invoiced_quantity);if(invoiced>0n)summary.invoiced++;if(invoiced<purchaseNumber(line.quantity))summary.pending++;}
    for(const row of rows){const summary=summaries.get(String(row.id));row.pending_invoice_lines=summary.pending;row.invoice_progress=row.status!=='confirmed'?row.status:!summary.invoiced?'pending':summary.pending?'partial':'complete';}
   }
   if(kind==='orders')for(const row of rows){const [[progress]]=await pool.execute("SELECT COALESCE(SUM(l.quantity),0) AS ordered,COALESCE(SUM((SELECT COALESCE(SUM(a.quantity),0) FROM purchase_order_receipts a JOIN purchase_receipt_lines rl ON rl.company_id=a.company_id AND rl.id=a.receipt_line_id JOIN purchase_receipts rd ON rd.company_id=rl.company_id AND rd.id=rl.document_id WHERE a.company_id=l.company_id AND a.order_line_id=l.id AND rd.status='confirmed')),0) AS received FROM purchase_order_lines l WHERE l.company_id=? AND l.document_id=?",[companyId,row.id]);row.received_quantity=progress.received;row.ordered_quantity=progress.ordered;row.progress=row.status==='confirmed'?purchaseNumber(progress.received)===0n?'pending':purchaseNumber(progress.received)>=purchaseNumber(progress.ordered)?'complete':'partial':row.status;}return rows;
  },
  get:(kind,target)=>details(pool,kind,target),
  dependencies:async(kind,target)=>cancellationDependencies(pool,kind,await details(pool,kind,target)),
  async save(kind,target,body){
   const data=normalized(kind,body),[table,lines]=type(kind);
   return operation(kind+'.save',body.request_id,{target:target||null,version:body.version??null,data},async db=>{
    let before=null,documentId;
    if(target){before=await details(db,kind,target);if(before.status!=='draft')conflict('PURCHASE_NOT_DRAFT');if(before.version!==body.version)conflict('PURCHASE_CHANGED');documentId=before.id;}
    await validateItems(db,data);
    const values=[data.supplier_account_id,data.reference,data.document_date,data.due_date,data.notes,data.original_document_id];
    if(before){await clearLinks(db,kind,before);await db.execute(`DELETE FROM ${lines} WHERE company_id=? AND document_id=?`,[companyId,documentId]);await db.execute(`UPDATE ${table} SET supplier_account_id=?,reference=?,document_date=?,due_date=?,notes=?,original_document_id=?,version=version+1 WHERE company_id=? AND id=?`,[...values,companyId,documentId]);}
    else{const [row]=await db.execute(`INSERT INTO ${table}(supplier_account_id,reference,document_date,due_date,notes,original_document_id,company_id,created_by,request_id,request_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`,[...values,companyId,actor,body.request_id,hash(data)]);documentId=row.insertId;}
    for(const line of data.lines){const [row]=await db.execute(`INSERT INTO ${lines}(company_id,document_id,position,item_id,description,quantity,unit_price,discount_rate,tax_rate) VALUES (?,?,?,?,?,?,?,?,?)`,[companyId,documentId,line.position,line.item_id,line.description,line.quantity,line.unit_price,line.discount_rate,line.tax_rate]);line.id=row.insertId;}
    await writeLinks(db,kind,{...data,id:documentId});const after=await details(db,kind,documentId);await audit(db,before?'update':'create',kind,documentId,before,after);return after;
   });
  },
  confirm:(kind,target,body)=>operation(kind+'.confirm',body.request_id,{target:id(target),body},async db=>{
   const [table]=type(kind),before=await details(db,kind,target);
   if(before.version!==body.version)conflict('PURCHASE_CHANGED');if(before.status!=='draft')conflict('PURCHASE_NOT_DRAFT');
   if(body.reviewed!==true)fail('PURCHASE_REVIEW_REQUIRED');if(!before.reference||!before.document_date||!before.supplier_account_id||before.lines.some(line=>!line.item_id))fail('PURCHASE_INCOMPLETE');
   if(kind!=='receipts'&&before.totals.unpriced)fail('PURCHASE_INCOMPLETE');
   const reviewDifferences=kind==='invoices'?[...before.differences.filter(difference=>!['amount','amount_review'].includes(difference.kind)),...purchaseAmountDifferences(before.lines,before.extraction,{withholdingRate:body.withholding_rate||'0'})]:before.differences;
   if(reviewDifferences.length&&body.accept_differences!==true)fail('PURCHASE_DIFFERENCES_REVIEW');
   if(before.due_date&&before.due_date<before.document_date)fail('INVALID_DUE_DATE');
   await clearLinks(db,kind,before);await writeLinks(db,kind,before);
   let invoiceId=null;
   if(kind==='invoices'){
    const vendor=await supplier(db,before.supplier_account_id),lines=before.lines.map(line=>({...purchaseLine(line),description:line.description})).filter(line=>purchaseNumber(line.base,2)>0n);
    const [duplicates]=await db.execute("SELECT id,party_tax_id,party_account_id FROM trade_invoices WHERE company_id=? AND direction='received' AND reference=? AND status='posted'",[companyId,before.reference]);
    const identity=value=>String(value||'').toUpperCase().replace(/^ES/,'').replace(/[^A-Z0-9]/g,'');
    if(duplicates.some(row=>row.party_account_id===vendor.id||identity(vendor.party_profile.tax_id)&&identity(row.party_tax_id)===identity(vendor.party_profile.tax_id)))conflict('PURCHASE_DUPLICATE');
    const calculated=calculateInvoice(lines,body.withholding_rate||'0');
    const invoice=await createInvoiceService(pool,companyId).create({exercise_id:id(body.exercise_id),direction:'received',reference:before.reference,invoice_date:before.document_date,posting_date:body.posting_date||before.document_date,party:{name:vendor.party_profile.name||vendor.description,...vendor.party_profile},party_account_id:vendor.id,offset_account_id:optionalId(body.offset_account_id),vat_account_id:optionalId(body.vat_account_id),withholding_account_id:optionalId(body.withholding_account_id),withholding_rate:body.withholding_rate||'0',payment_method:body.payment_method||'transfer',notes:before.notes,lines,receipts:body.receipts||[{due_date:before.due_date||before.document_date,amount:calculated.total_amount}],request_id:body.request_id},{db});
    invoiceId=invoice.id;await db.execute('UPDATE purchase_invoices SET invoice_id=? WHERE company_id=? AND id=?',[invoiceId,companyId,before.id]);
   }
   if(before.reference){const [[duplicate]]=await db.execute(`SELECT id FROM ${table} WHERE company_id=? AND supplier_account_id=? AND reference=? AND status='confirmed' AND id<>?`,[companyId,before.supplier_account_id,before.reference,before.id]);if(duplicate)conflict('PURCHASE_DUPLICATE');}
   await db.execute(`UPDATE ${table} SET status='confirmed',confirmed_by=?,version=version+1 WHERE company_id=? AND id=?`,[actor,companyId,before.id]);const after=await details(db,kind,before.id);await audit(db,'confirm',kind,before.id,before,after);return after;
  }),
  cancel:(kind,target,body)=>operation(kind+'.cancel',body.request_id,{target:id(target),body},async db=>{
   const [table]=type(kind),before=await details(db,kind,target);if(before.version!==body.version)conflict('PURCHASE_CHANGED');if(before.status==='cancelled')return before;
   if(kind==='invoices'&&before.invoice_id)conflict('PURCHASE_INVOICE_POSTED');
   if((await cancellationDependencies(db,kind,before)).length)conflict('PURCHASE_HAS_DEPENDENCIES');
   await db.execute(`UPDATE ${table} SET status='cancelled',version=version+1 WHERE company_id=? AND id=?`,[companyId,before.id]);const after=await details(db,kind,before.id);await audit(db,'cancel',kind,before.id,before,after);return after;
  }),
  async prices(itemId){const [rows]=await pool.execute("SELECT d.id,d.reference,d.document_date,d.supplier_account_id,a.description AS supplier_name,l.quantity,l.unit_price,l.discount_rate,l.tax_rate FROM purchase_invoice_lines l JOIN purchase_invoices d ON d.company_id=l.company_id AND d.id=l.document_id JOIN trade_invoices t ON t.company_id=d.company_id AND t.id=d.invoice_id AND t.status='posted' JOIN accounts a ON a.company_id=d.company_id AND a.id=d.supplier_account_id WHERE l.company_id=? AND l.item_id=? AND d.status='confirmed' ORDER BY d.document_date DESC,d.id DESC",[companyId,id(itemId)]);return rows.map(row=>({...row,net_unit_price:purchaseLine({...row,quantity:'1'}).net_unit_price}));},
  async audit(kind,target){type(kind);const [rows]=await pool.execute('SELECT actor,action,before_data,after_data,created_at FROM management_audit_events WHERE company_id=? AND entity_type=? AND entity_id=? ORDER BY id DESC LIMIT 200',[companyId,kind,id(target)]);return rows;},
 };
 return service;
}
