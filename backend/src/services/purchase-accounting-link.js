export async function purchaseAccountingLink(db,companyId,invoiceId){
 try{const [[row]]=await db.execute('SELECT p.id,p.original_document_id,s.source_name,s.source_mime FROM purchase_invoices p LEFT JOIN company_documents s ON s.company_id=p.company_id AND s.id=p.original_document_id WHERE p.company_id=? AND p.invoice_id=?',[companyId,invoiceId]);return row||null;}
 catch(error){if(error.code==='ER_NO_SUCH_TABLE')return null;throw error;}
}
