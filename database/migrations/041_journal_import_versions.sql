ALTER TABLE journal_imports
  DROP INDEX uq_journal_import_exercise,
  ADD INDEX idx_journal_import_latest (company_id, exercise_id, id)
