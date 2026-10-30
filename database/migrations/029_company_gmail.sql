CREATE TABLE company_gmail_settings (
 company_id INT UNSIGNED PRIMARY KEY,
 email VARCHAR(254) NOT NULL,
 label_name VARCHAR(100) NOT NULL DEFAULT 'Factures',
 refresh_token TEXT NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 last_sync_at TIMESTAMP NULL,
 last_error_code VARCHAR(100) NULL,
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
-- statement
CREATE TABLE gmail_imports (
 company_id INT UNSIGNED NOT NULL,
 mailbox VARCHAR(254) CHARACTER SET ascii NOT NULL,
 message_id VARCHAR(100) CHARACTER SET ascii NOT NULL,
 part_id VARCHAR(100) CHARACTER SET ascii NOT NULL,
 source_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(company_id,mailbox,message_id,part_id),
 INDEX idx_gmail_import_hash(company_id,source_sha256),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
