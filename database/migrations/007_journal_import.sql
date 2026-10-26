CREATE TABLE IF NOT EXISTS journal_imports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  exercise_id INT UNSIGNED NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  source_company VARCHAR(160) NOT NULL,
  source_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  content_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  source_pdf MEDIUMBLOB NOT NULL,
  pages SMALLINT UNSIGNED NOT NULL,
  entry_count INT UNSIGNED NOT NULL,
  line_count INT UNSIGNED NOT NULL,
  account_count INT UNSIGNED NOT NULL,
  debit_total DECIMAL(24,2) NOT NULL,
  credit_total DECIMAL(24,2) NOT NULL,
  imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_journal_import_exercise (company_id, exercise_id),
  UNIQUE KEY uq_journal_import_scope (company_id, exercise_id, id),
  FOREIGN KEY (company_id, exercise_id) REFERENCES accounting_exercises(company_id, id) ON DELETE RESTRICT
) ENGINE=InnoDB
-- statement
ALTER TABLE journal_entries
  ADD COLUMN import_id INT UNSIGNED NULL,
  ADD COLUMN entry_type ENUM('normal','opening','regularization','closing') NOT NULL DEFAULT 'normal',
  ADD CONSTRAINT fk_entry_import FOREIGN KEY (company_id, exercise_id, import_id) REFERENCES journal_imports(company_id, exercise_id, id) ON DELETE RESTRICT,
  DROP CHECK journal_entries_chk_1,
  ADD CONSTRAINT chk_entry_original_number CHECK (number > 0 OR import_id IS NOT NULL)
-- statement
ALTER TABLE journal_lines
  ADD COLUMN source_page SMALLINT UNSIGNED NULL,
  ADD COLUMN source_account_name VARCHAR(200) NULL,
  DROP CHECK journal_lines_chk_1,
  ADD CONSTRAINT chk_journal_line_amounts CHECK (
    (debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)
    OR (source_page IS NOT NULL AND source_page > 0 AND source_account_name IS NOT NULL AND (debit = 0 OR credit = 0))
  )
