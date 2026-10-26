ALTER TABLE companies ADD COLUMN business_format VARCHAR(32) NOT NULL DEFAULT 'general';
-- statement
ALTER TABLE company_details ADD COLUMN journal_source_name VARCHAR(160) NOT NULL DEFAULT '';
-- statement
ALTER TABLE journal_imports ADD COLUMN source_format VARCHAR(40) NOT NULL DEFAULT 'libro_diario';
-- statement
ALTER TABLE journal_entries
 ADD COLUMN source_journal_code VARCHAR(20) NULL,
 ADD COLUMN source_entry_reference VARCHAR(60) NULL;
-- statement
ALTER TABLE journal_lines ADD COLUMN source_line_number INT UNSIGNED NULL;
