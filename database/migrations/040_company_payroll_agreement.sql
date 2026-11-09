ALTER TABLE company_details ADD COLUMN payroll_agreement VARCHAR(14) NOT NULL DEFAULT '';
-- statement
UPDATE company_details d SET payroll_agreement='99000275011981'
 WHERE EXISTS(SELECT 1 FROM payroll_employees e WHERE e.company_id=d.company_id);
