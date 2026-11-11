import {HttpError} from '../middleware/errors.js';
export function remapPurchaseProposals(value,invoiceIds){
 if(!Array.isArray(value?.proposals))return value;
 return {...value,proposals:value.proposals.map(proposal=>{const target=invoiceIds.get(Number(proposal.id));if(!target)throw new HttpError(400,'BACKUP_BROKEN_LINKS');return {...proposal,id:target};})};
}
export const purchaseBackupTables={
 purchase_units:{key:['code'],refs:{base_unit_id:'purchase_units'}},
 purchase_items:{key:['code'],refs:{unit_id:'purchase_units'}},
 purchase_supplier_items:{key:['supplier_account_id','supplier_code'],refs:{supplier_account_id:'accounts',item_id:'purchase_items'}},
 purchase_orders:{key:['request_id'],refs:{supplier_account_id:'accounts',original_document_id:'company_documents'}},
 purchase_order_lines:{key:['document_id','position'],refs:{document_id:'purchase_orders',item_id:'purchase_items'}},
 purchase_receipts:{key:['request_id'],refs:{supplier_account_id:'accounts',original_document_id:'company_documents'}},
 purchase_receipt_lines:{key:['document_id','position'],refs:{document_id:'purchase_receipts',item_id:'purchase_items'}},
 purchase_order_receipts:{key:['order_line_id','receipt_line_id'],refs:{order_line_id:'purchase_order_lines',receipt_line_id:'purchase_receipt_lines'}},
 purchase_invoices:{key:['request_id'],refs:{supplier_account_id:'accounts',original_document_id:'company_documents',invoice_id:'trade_invoices'}},
 purchase_invoice_lines:{key:['document_id','position'],refs:{document_id:'purchase_invoices',item_id:'purchase_items'}},
 purchase_invoice_links:{key:['invoice_line_id','receipt_line_id','order_line_id'],refs:{invoice_line_id:'purchase_invoice_lines',receipt_line_id:'purchase_receipt_lines',order_line_id:'purchase_order_lines'}},
 document_extraction_jobs:{key:['request_id'],refs:{original_document_id:'company_documents',purchase_invoice_id:'purchase_invoices'}},
 management_audit_events:{key:['id'],refs:{}},
};
