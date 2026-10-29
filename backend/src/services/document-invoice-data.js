import {extractInvoiceDocument} from './invoice-documents.js';
import {invoiceCompanyMatches} from './document-company.js';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export async function readDocumentInvoice(buffer){
 if(!Buffer.isBuffer(buffer)||buffer.subarray(0,5).toString()!=='%PDF-')return null;
 try{return await extractInvoiceDocument(buffer);}
 catch(error){return {parser:'unavailable',error:error.code||'INVOICE_PDF_INVALID',total_amount:null,invoice_date:null,warnings:['No se han podido leer los datos de la factura. Se conserva el original.']};}
}
export async function readPendingDocumentInvoices(db,companyId){
 const [[company]]=await db.execute('SELECT c.name,d.tax_id FROM companies c LEFT JOIN company_details d ON d.company_id=c.id WHERE c.id=?',[companyId]);
 const [rows]=await db.execute("SELECT id,version,title,description,source_name,invoice_extraction,CASE WHEN invoice_extraction IS NULL THEN content ELSE NULL END AS original FROM company_documents WHERE company_id=? AND folder='pending_invoices' ORDER BY id",[companyId]);
 const results=[];
 const owner=party=>!!invoiceCompanyMatches(party,company);
 for(const row of rows){
  const extraction=parse(row.invoice_extraction)||await readDocumentInvoice(row.original);
  if(!extraction||extraction.error)continue;
  results.push({id:row.id,version:row.version,title:row.title,description:row.description,source_name:row.source_name,extraction,direction:owner(extraction.supplier)?'issued':owner(extraction.customer)?'received':'unknown'});
 }
 return results;
}
