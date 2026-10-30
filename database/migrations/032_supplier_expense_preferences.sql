CREATE TABLE supplier_expense_preferences (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 supplier_tax_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
 supplier_name VARCHAR(200) NOT NULL,
 expense_account_id INT UNSIGNED NOT NULL,
 updated_by VARCHAR(64) NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_supplier_expense_preference(company_id,supplier_tax_id),
 FOREIGN KEY(company_id) REFERENCES companies(id),
 FOREIGN KEY(company_id,expense_account_id) REFERENCES accounts(company_id,id)
) ENGINE=InnoDB;
-- statement
ALTER TABLE integration_events ADD COLUMN detail JSON NULL;
