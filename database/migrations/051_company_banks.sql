CREATE TABLE IF NOT EXISTS company_banks (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 bank_id INT UNSIGNED NOT NULL,
 iban VARCHAR(34) NOT NULL,
 initiator_id VARCHAR(35) NOT NULL,
 creditor_id VARCHAR(35) NOT NULL DEFAULT '',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 UNIQUE KEY company_bank (company_id,bank_id),
 CONSTRAINT company_banks_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
