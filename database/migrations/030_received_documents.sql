ALTER TABLE company_gmail_settings
 ADD COLUMN import_start_date DATE NULL,
 ADD COLUMN connection_state ENUM('disconnected','connected','error') NOT NULL DEFAULT 'connected';
-- statement
-- Existing connections require an explicit start date before the next automatic import.
UPDATE company_gmail_settings SET enabled=FALSE WHERE import_start_date IS NULL;
-- statement
CREATE TABLE gmail_oauth_states (
 state_hash CHAR(64) CHARACTER SET ascii PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 session_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 browser_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 verifier TEXT NOT NULL,
 expires_at DATETIME NOT NULL,
 FOREIGN KEY(company_id) REFERENCES companies(id),
 INDEX idx_gmail_oauth_expiry(expires_at)
) ENGINE=InnoDB;
-- statement
CREATE TABLE document_company_access (
 company_id INT UNSIGNED NOT NULL,
 user_key VARCHAR(16) NOT NULL,
 PRIMARY KEY(company_id,user_key),
 FOREIGN KEY(company_id) REFERENCES companies(id),
 FOREIGN KEY(user_key) REFERENCES app_users(user_key)
) ENGINE=InnoDB;
-- statement
CREATE TABLE received_mail_messages (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 mailbox VARCHAR(254) CHARACTER SET ascii NOT NULL,
 gmail_message_id VARCHAR(100) CHARACTER SET ascii NOT NULL,
 gmail_thread_id VARCHAR(100) CHARACTER SET ascii NOT NULL,
 sender VARCHAR(1000) NOT NULL DEFAULT '',
 subject VARCHAR(1000) NOT NULL DEFAULT '',
 received_at DATETIME NOT NULL,
 processed_at DATETIME NULL,
 status ENUM('pending','imported','partial','error') NOT NULL DEFAULT 'pending',
 error_code VARCHAR(100) NULL,
 UNIQUE KEY uq_received_message(company_id,mailbox,gmail_message_id),
 UNIQUE KEY uq_received_message_company(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id)
) ENGINE=InnoDB;
-- statement
CREATE TABLE received_documents (
 id CHAR(36) CHARACTER SET ascii PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 mail_message_id INT UNSIGNED NULL,
 gmail_part_id VARCHAR(100) CHARACTER SET ascii NULL,
 gmail_attachment_id TEXT NULL,
 original_name VARCHAR(255) NOT NULL,
 storage_key VARCHAR(200) CHARACTER SET ascii NOT NULL,
 storage_provider VARCHAR(20) CHARACTER SET ascii NOT NULL DEFAULT 'local',
 mime_type VARCHAR(100) CHARACTER SET ascii NOT NULL DEFAULT 'application/pdf',
 size_bytes INT UNSIGNED NOT NULL,
 source_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
 origin ENUM('gmail','manual') NOT NULL,
 received_at DATETIME NOT NULL,
 imported_at DATETIME NULL,
 review_status ENUM('pending','reviewed','discarded','import_error') NOT NULL DEFAULT 'import_error',
 possible_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
 error_code VARCHAR(100) NULL,
 attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
 next_retry_at DATETIME NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 extraction_id CHAR(36) CHARACTER SET ascii NULL,
 validated_invoice_id INT UNSIGNED NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_received_attachment(company_id,mail_message_id,gmail_part_id),
 UNIQUE KEY uq_received_storage(storage_key),
 UNIQUE KEY uq_received_company(company_id,id),
 INDEX idx_received_hash(company_id,source_sha256),
 INDEX idx_received_list(company_id,received_at,id),
 FOREIGN KEY(company_id) REFERENCES companies(id),
 FOREIGN KEY(company_id,mail_message_id) REFERENCES received_mail_messages(company_id,id),
 FOREIGN KEY(company_id,validated_invoice_id) REFERENCES trade_invoices(company_id,id)
) ENGINE=InnoDB;
-- statement
CREATE TABLE document_audit (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 document_id CHAR(36) CHARACTER SET ascii NULL,
 actor VARCHAR(60) NOT NULL,
 action VARCHAR(60) NOT NULL,
 detail JSON NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(company_id) REFERENCES companies(id),
 FOREIGN KEY(company_id,document_id) REFERENCES received_documents(company_id,id),
 INDEX idx_document_audit_company(company_id,created_at)
) ENGINE=InnoDB;
-- statement
CREATE TABLE gmail_sync_runs (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 mailbox VARCHAR(254) CHARACTER SET ascii NOT NULL,
 started_at DATETIME NOT NULL,
 finished_at DATETIME NULL,
 status ENUM('running','success','partial','error','interrupted') NOT NULL DEFAULT 'running',
 imported_count INT UNSIGNED NOT NULL DEFAULT 0,
 skipped_count INT UNSIGNED NOT NULL DEFAULT 0,
 failed_count INT UNSIGNED NOT NULL DEFAULT 0,
 error_code VARCHAR(100) NULL,
 FOREIGN KEY(company_id) REFERENCES companies(id),
 INDEX idx_gmail_runs(company_id,started_at)
) ENGINE=InnoDB;
