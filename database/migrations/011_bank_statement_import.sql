ALTER TABLE bank_reconciliations ADD COLUMN source_mime VARCHAR(80) NOT NULL DEFAULT 'application/pdf'
-- statement
CREATE TABLE IF NOT EXISTS bank_connections (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 account_id INT UNSIGNED NOT NULL,
 iban VARCHAR(34) CHARACTER SET ascii NOT NULL,
 bank_code VARCHAR(4) CHARACTER SET ascii NOT NULL DEFAULT '',
 bank_name VARCHAR(120) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_bank_connection_iban(company_id,iban),
 FOREIGN KEY(company_id,account_id) REFERENCES accounts(company_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB
