ALTER TABLE journal_lines
  DROP CHECK chk_journal_line_amounts,
  ADD CONSTRAINT chk_journal_line_amounts CHECK (
    (debit <> 0 AND credit = 0) OR (credit <> 0 AND debit = 0)
    OR (source_page IS NOT NULL AND source_page > 0 AND source_account_name IS NOT NULL AND debit = 0 AND credit = 0)
  )
