CREATE TABLE document_extraction_jobs (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,original_document_id INT UNSIGNED NOT NULL,
 purchase_invoice_id INT UNSIGNED NULL,status ENUM('queued','running','done','error') NOT NULL DEFAULT 'queued',
 engine VARCHAR(60) NULL,languages VARCHAR(60) NOT NULL DEFAULT 'cat+spa+eng',confidence DECIMAL(5,2) NULL,
 recognized_text MEDIUMTEXT NULL,result JSON NULL,error_code VARCHAR(80) NULL,created_by VARCHAR(60) NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,source_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,finished_at TIMESTAMP NULL,
 UNIQUE KEY uq_document_extraction_scope(company_id,id),UNIQUE KEY uq_document_extraction_request(company_id,request_id),INDEX idx_document_extraction_source(company_id,source_sha256),
 FOREIGN KEY(company_id,original_document_id) REFERENCES company_documents(company_id,id),FOREIGN KEY(company_id,purchase_invoice_id) REFERENCES purchase_invoices(company_id,id)
) ENGINE=InnoDB
