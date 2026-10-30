CREATE TABLE installment_tax_drafts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 tax_year SMALLINT UNSIGNED NOT NULL,
 period TINYINT UNSIGNED NOT NULL,
 payload JSON NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_installment_tax_draft(company_id,exercise_id,tax_year,period),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 CHECK(tax_year BETWEEN 2000 AND 2099),
 CHECK(period BETWEEN 1 AND 3)
) ENGINE=InnoDB
