ALTER TABLE invoice_documents
 ADD COLUMN supplier_draft JSON NULL,
 ADD COLUMN review_kind ENUM('invoice','not_invoice') NOT NULL DEFAULT 'invoice',
 ADD COLUMN reception_id INT UNSIGNED NULL,
 ADD COLUMN validated_by VARCHAR(64) NULL,
 ADD COLUMN validated_at DATETIME NULL,
 ADD INDEX idx_supplier_reception(company_id,reception_id);
-- statement
CREATE TABLE supplier_invoice_revisions (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 document_id INT UNSIGNED NOT NULL,
 actor VARCHAR(64) NOT NULL,
 action VARCHAR(40) NOT NULL,
 data JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_supplier_revision(company_id,document_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id)
) ENGINE=InnoDB;
-- statement
CREATE TABLE supplier_invoice_templates (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 tax_id VARCHAR(32) NOT NULL,
 definition JSON NOT NULL,
 updated_by VARCHAR(64) NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_supplier_template(company_id,tax_id),
 FOREIGN KEY(company_id) REFERENCES companies(id)
) ENGINE=InnoDB;
-- statement
CREATE TABLE supplier_gmail_mailboxes (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 email VARCHAR(254) NOT NULL,
 start_date DATE NOT NULL,
 encrypted_token TEXT NULL,
 last_sync_at DATETIME NULL,
 last_error VARCHAR(100) NULL,
 next_sync_at DATETIME NULL,
 lease_id CHAR(36) NULL,
 lease_until DATETIME NULL,
 UNIQUE KEY uq_supplier_mailbox(company_id,email),
 FOREIGN KEY(company_id) REFERENCES companies(id)
) ENGINE=InnoDB;
-- statement
CREATE TABLE supplier_invoice_import_errors (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 mailbox_id INT UNSIGNED NULL,
 source_id VARCHAR(255) NOT NULL,
 error_code VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_supplier_import_error(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id)
) ENGINE=InnoDB;
