-- Datos persistentes de demostración; no se sirven datos simulados desde el frontend.
INSERT INTO companies (id, name, subaccount_length)
SELECT 1, 'Empresa Demo SL', 8 WHERE NOT EXISTS (SELECT 1 FROM companies WHERE id = 1)
-- statement
INSERT INTO accounting_exercises (company_id, name, start_date, end_date, status, is_default)
SELECT 1, '2026', '2026-01-01', '2026-12-31', 'open', 1
WHERE NOT EXISTS (SELECT 1 FROM accounting_exercises WHERE company_id = 1)
