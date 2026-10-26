ALTER TABLE company_documents
 ADD COLUMN folder ENUM('general','pending_invoices','managed_invoices') NOT NULL DEFAULT 'general' AFTER description,
 ADD INDEX idx_company_document_folder(company_id,folder,updated_at,id);
