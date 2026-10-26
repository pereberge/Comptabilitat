import {createInvoiceService} from './invoices.js';
import {HttpError} from '../middleware/errors.js';
import {invoiceFilename,invoiceHtml,validateEmailDraft,validateDeliveryOptions,emailDraftMessage} from './invoice-delivery-format.js';
import {renderInvoicePdf} from './invoice-pdf-renderer.js';
export function createInvoiceDeliveryService(pool,companyId,{render=renderInvoicePdf}={}){
 async function load(invoiceId){return createInvoiceService(pool,companyId).get(invoiceId);}
 async function html(invoice){
  let logo='';if(invoice.direction==='issued'){const [[row]]=await pool.execute('SELECT mime_type,content FROM company_logos WHERE company_id=?',[companyId]);if(row)logo='data:'+row.mime_type+';base64,'+row.content.toString('base64');}
  return invoiceHtml(invoice,logo);
 }
 async function pdf(invoice,options){
  const selected=validateDeliveryOptions(options),documentId=selected.document_id||(selected.source!=='generated'&&(selected.source==='original'||invoice.direction==='received')?invoice.documents[0]?.id:null);
  if(documentId){
   const [[original]]=await pool.execute('SELECT source_pdf,source_name FROM invoice_documents WHERE company_id=? AND invoice_id=? AND id=?',[companyId,invoice.id,documentId]);
   if(!original)throw new HttpError(404,'INVOICE_PDF_SOURCE_NOT_FOUND');return {invoice,file:original.source_pdf,filename:invoiceFilename(invoice),original:true};
  }
  if(selected.source==='original')throw new HttpError(404,'INVOICE_PDF_SOURCE_NOT_FOUND');
  return {invoice,file:await render(await html(invoice)),filename:invoiceFilename(invoice),original:false};
 }
 return {
  print:async invoiceId=>html(await load(invoiceId)),
  pdf:async(invoiceId,options={})=>pdf(await load(invoiceId),options),
  async draft(invoiceId,body){const data=validateEmailDraft(body),attachment=await pdf(await load(invoiceId),{source:data.source,document_id:data.document_id});return {file:emailDraftMessage(data,attachment.file,attachment.filename),filename:invoiceFilename(attachment.invoice,'eml')};},
 };
}