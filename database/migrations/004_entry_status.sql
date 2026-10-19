-- Existing entries were posted atomically after validation. Preserve that meaning.
SET @status_exists = (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='journal_entries' AND column_name='status')
-- statement
SET @status_sql = IF(@status_exists=0, "ALTER TABLE journal_entries ADD COLUMN status ENUM('posted','draft','cancelled') NOT NULL DEFAULT 'posted'", 'SELECT 1')
-- statement
PREPARE status_statement FROM @status_sql
-- statement
EXECUTE status_statement
-- statement
DEALLOCATE PREPARE status_statement
