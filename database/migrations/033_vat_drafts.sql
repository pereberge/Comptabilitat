CREATE TABLE IF NOT EXISTS vat_drafts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 tax_year SMALLINT UNSIGNED NOT NULL,
 frequency ENUM('quarterly','monthly') NOT NULL,
 period TINYINT UNSIGNED NOT NULL,
 payload JSON NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_vat_draft_period(company_id,tax_year,frequency,period),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT,
 CHECK(tax_year BETWEEN 2000 AND 2099),
 CHECK(period BETWEEN 1 AND 12 AND (frequency='monthly' OR period<=4))
) ENGINE=InnoDB
