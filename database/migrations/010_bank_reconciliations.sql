CREATE TABLE IF NOT EXISTS bank_reconciliations (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 account_id INT UNSIGNED NOT NULL,
 source_name VARCHAR(255) NOT NULL,
 source_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
 source_pdf MEDIUMBLOB NOT NULL,
 snapshot JSON NOT NULL,
 ledger_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_bank_reconciliation_source(company_id,exercise_id,account_id,source_sha256),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,account_id) REFERENCES accounts(company_id,id) ON DELETE RESTRICT,
 INDEX idx_bank_reconciliation_scope(company_id,exercise_id,id)
) ENGINE=InnoDB
