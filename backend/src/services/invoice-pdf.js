import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { calculateInvoice } from '../../../shared/invoice-money.js';
export const invoiceIdentity=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const monetary='(-?(?:\\d{1,3}(?:\\.\\d{3})*|\\d+),\\d{2})';
function money(text){return typeof text==='string'&&/^-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(text)?text.replaceAll('.','').replace(',','.'):null;}
export function invoiceDate(value){
 const text=String(value).trim();let result;
 const numeric=text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
 if(numeric)result=numeric[3]+'-'+numeric[2].padStart(2,'0')+'-'+numeric[1].padStart(2,'0');
 else if(/^\d{4}-\d{2}-\d{2}$/.test(text))result=text;
 else{
  const match=text.match(/^(\d{1,2})\s+(?:d[e']?\s*)?([A-Za-zÀ-ÿ]+)\s+(?:de\s+)?(\d{4})$/i);
  const months={GENER:1,ENERO:1,FEBRER:2,FEBRERO:2,MARC:3,MARZO:3,ABRIL:4,MAIG:5,MAYO:5,JUNY:6,JUNIO:6,JULIOL:7,JULIO:7,AGOST:8,AGOSTO:8,SETEMBRE:9,SEPTIEMBRE:9,OCTUBRE:10,NOVEMBRE:11,NOVIEMBRE:11,DESEMBRE:12,DICIEMBRE:12};
  if(!match||!months[invoiceIdentity(match[2])])return null;
  result=match[3]+'-'+String(months[invoiceIdentity(match[2])]).padStart(2,'0')+'-'+match[1].padStart(2,'0');
 }
 const date=new Date(result+'T00:00:00Z');return result>='1000-01-01'&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===result?result:null;
}
export function parseInvoicePages(pages){
 const text=pages.map(page=>page.items.map(item=>item.text??item.str??'').join('\n')).join('\n');
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const empty={parser:'manual',supplier:{name:'',tax_id:'',address:''},customer:{name:'',tax_id:'',address:''},reference:'',invoice_date:null,due_date:null,payment_method:'transfer',lines:[],total_amount:null,tax_total:null,base_total:null,withholding_rate:'0',pages:pages.length,currency:'EUR',warnings:[]};
 if(!text.trim())return {...empty,warnings:['El PDF es una imagen. Conserva el original y completa los datos manualmente; no se han inventado importes.']};
 const result={...empty,parser:'generic',warnings:[]};
 // Keep explicit fiscal identifiers even when an unfamiliar layout has no party labels.
 result.company_tax_ids=[...new Set([...normalized.matchAll(/\b(?:N\.?I\.?F\.?|C\.?I\.?F\.?|VAT)(?:\s*(?:cliente|client|destinatario|proveedor|proveidor|emisor))?\s*[:.-]?\s*((?:ES[\s.-]*)?(?:[A-Z][\s.-]*\d{7}[\s.-]*[A-Z0-9]|\d{8}[\s.-]*[A-Z]))\b/gi)].map(match=>match[1].replace(/[\s.-]/g,'').toUpperCase()))];
 const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
 const field=label=>clean(normalized.match(new RegExp('(?:^|\\n)'+label+'\\s*[:：]\\s*([^\\n]+)','i'))?.[1]);
 const dateField=label=>{const value=normalized.match(new RegExp(label+'\\s*[:：]\\s*([^\\n]+)','i'))?.[1];return value?invoiceDate(value.trim()):null;};
 const labeledMoney=label=>money(normalized.match(new RegExp(label+'\\s*[:：]?\\s*'+monetary+'\\s*(?:€|EUR)?','i'))?.[1]);
 const special=/ENERGIA\s*XXI/i.test(normalized)&&/DADES DE LA FACTURA D.ELECTRICITAT/i.test(normalized);
 if(special){
  result.parser='energia-xxi';result.supplier={name:'Energía XXI Comercializadora de Referencia, SLU',tax_id:clean(normalized.match(/Cif:\s*([A-Z]\d{8})/i)?.[1]),address:'C/ Ribera del Loira 60, 28042 Madrid'};
  const customer=normalized.match(/Titular del contracte:\s*([^\n]+?)\s+NIF:\s*([A-Z0-9-]+)/i);
  result.customer={name:clean(customer?.[1]),tax_id:clean(customer?.[2]),address:''};
  const reference=normalized.match(/Num\.\s*factura:\s*(\S+)\s+emesa el\s+([^\n]+)/i);
  result.reference=clean(reference?.[1]);result.invoice_date=invoiceDate(clean(reference?.[2]));
  result.due_date=dateField('Data de carrec');result.payment_method=/Domiciliat/i.test(normalized)?'direct_debit':'transfer';
  const vat=normalized.match(new RegExp('IVA normal:\\s*(\\d+(?:[,.]\\d+)?)\\s*%\\s*s/\\s*'+monetary+'[.\\s]*'+monetary+'\\s*€','i'));
  if(vat){result.base_total=money(vat[2]);result.tax_total=money(vat[3]);result.lines=[{description:'Suministro eléctrico · '+(clean(normalized.match(/Periode de consum:\s*([^\n]+)/i)?.[1])||'factura de electricidad'),base:result.base_total,tax_rate:vat[1].replace(',','.') }];}
  result.total_amount=labeledMoney('IMPORT FACTURA');
  result.warnings.push('La domiciliación y la fecha de cargo no acreditan que la factura esté pagada. El pago se registra cuando conste en el banco.');
 }else{
  result.reference=clean(normalized.match(/(?:Num(?:ero|\.)?\s*(?:de\s*)?factura|Factura\s*(?:n[ºo.]|numero))\s*[:#-]?\s*([A-Z0-9][A-Z0-9/._-]{1,59})/i)?.[1]);
  result.invoice_date=dateField('Fecha (?:de )?(?:factura|emision)')||dateField('Data (?:de )?(?:factura|emissio)');
  result.due_date=dateField('Fecha (?:de )?vencimiento')||dateField('Data (?:de )?venciment');
  result.supplier={name:field('(?:Proveedor|Emisor|Proveidor)'),tax_id:field('(?:NIF|CIF) (?:proveedor|emisor|proveidor)').replace(/[ -]/g,''),address:field('Direccion (?:proveedor|emisor)')};
  result.customer={name:field('(?:Cliente|Destinatario|Client)'),tax_id:field('(?:NIF|CIF) (?:cliente|destinatario|client)').replace(/[ -]/g,''),address:''};
  result.base_total=labeledMoney('Base imponible');result.tax_total=labeledMoney('(?:Cuota IVA|Importe IVA)');result.total_amount=labeledMoney('(?:Total (?:importe )?factura|Importe total|Total a pagar)');
  const rates=[...normalized.matchAll(/\bIVA\s*(\d+(?:[,.]\d+)?)\s*%/gi)].map(match=>match[1].replace(',','.'));
  if(new Set(rates).size===1&&result.base_total)result.lines=[{description:field('Concepto')||'Concepto pendiente de revisar según el PDF',base:result.base_total,tax_rate:rates[0]}];
  if(new Set(rates).size>1)result.warnings.push('Hay varios tipos de IVA. Revisa el desglose y completa las bases por tipo.');
  result.warnings.push('Comprueba los campos extraídos con el PDF antes de contabilizar. Los datos que no se han identificado quedan pendientes de completar.');
 }
 const references=[...normalized.matchAll(/(?:Num(?:ero|\.)?\s*(?:de\s*)?factura|Factura\s*(?:n[ºo.]|numero))\s*[:#-]?\s*([A-Z0-9][A-Z0-9/._-]{1,59})/gi)].map(match=>invoiceIdentity(match[1]));
 if(new Set(references).size>1){result.multiple_invoices=true;result.warnings.push('Se han detectado varias referencias de factura. Sube cada factura en un PDF separado antes de contabilizar.');}
 if(/(?:MONEDA|DIVISA|CURRENCY)\s*[:：]\s*(?!EUR\b)[A-Z]{3}\b/i.test(normalized)){result.currency='unknown';result.warnings.push('La divisa indicada no se ha identificado como EUR; este documento requiere revisión manual.');}
 if(/\b(?:IRPF|RETENCION)\b/i.test(normalized)){result.warnings.push('El documento menciona retenciones. Debes revisar el porcentaje y los importes antes de contabilizar.');result.withholding_review=true;}
 try{
  const calculated=calculateInvoice(result.lines,'0');
  result.totals_verified=calculated.total_amount===result.total_amount&&calculated.tax_total===result.tax_total&&calculated.base_total===result.base_total;
 }catch{result.totals_verified=false;}
 if(!result.totals_verified)result.warnings.push('No se ha podido comprobar base + IVA = total. Puedes guardar el PDF y completar o corregir la propuesta.');
 if(!result.due_date)result.warnings.push('El vencimiento no se ha identificado. La fecha propuesta necesita confirmación.');
 return result;
}
export async function extractInvoicePdf(buffer){
 const task=getDocument({data:Uint8Array.from(buffer),useSystemFonts:true,isEvalSupported:false,verbosity:0});
 try{const pdf=await task.promise;if(pdf.numPages>20)throw new Error('INVOICE_PDF_TOO_MANY_PAGES');const pages=[];
  for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number),content=await page.getTextContent();pages.push({page:number,items:content.items.filter(item=>item.str?.trim()).map(item=>({text:item.str,x:item.transform[4],y:item.transform[5]}))});}
  return parseInvoicePages(pages);
 }catch(error){if(error.message?.startsWith('INVOICE_PDF_'))throw error;throw new Error('INVOICE_PDF_INVALID');}finally{await task.destroy();}
}
