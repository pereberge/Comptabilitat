CREATE TABLE bank_reconciliation_rules (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 bank_account_id INT UNSIGNED NOT NULL,
 concept VARCHAR(200) NOT NULL,
 concept_key VARCHAR(200) NOT NULL,
 direction ENUM('in','out') NOT NULL,
 bank_amount DECIMAL(15,2) NOT NULL,
 counter_lines JSON NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_reconciliation_rule(company_id,bank_account_id,concept_key,direction),
 FOREIGN KEY(company_id,bank_account_id) REFERENCES accounts(company_id,id) ON DELETE RESTRICT,
 CHECK(bank_amount<>0),
 CHECK(JSON_TYPE(counter_lines)='ARRAY')
) ENGINE=InnoDB;
-- statement
ALTER TABLE bank_reconciliations ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1;
