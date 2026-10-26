export const documentFolders=Object.freeze({
 general:'Documentos',
 pending_invoices:'Facturas pendientes de gestionar',
 managed_invoices:'Facturas gestionadas',
});
export const isDocumentFolder=value=>typeof value==='string'&&Object.hasOwn(documentFolders,value);
