CREATE TABLE farm_expense_groups (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 farm_id INT UNSIGNED NOT NULL,
 name VARCHAR(160) NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 UNIQUE KEY uq_farm_expense_group(company_id,farm_id,name),
 FOREIGN KEY(company_id) REFERENCES companies(id),
 FOREIGN KEY(farm_id) REFERENCES pig_farms(id)
) ENGINE=InnoDB;
-- statement
CREATE TABLE farm_expense_assignments (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 farm_id INT UNSIGNED NOT NULL,
 group_id INT UNSIGNED NULL,
 document_id INT UNSIGNED NULL,
 integration_id INT UNSIGNED NULL,
 invoice_id INT UNSIGNED NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_by VARCHAR(64) NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_farm_assignment_document(company_id,document_id),
 UNIQUE KEY uq_farm_assignment_reception(company_id,integration_id),
 UNIQUE KEY uq_farm_assignment_invoice(company_id,invoice_id),
 CHECK((document_id IS NOT NULL)+(integration_id IS NOT NULL)+(invoice_id IS NOT NULL)=1),
 FOREIGN KEY(company_id) REFERENCES companies(id),
 FOREIGN KEY(farm_id) REFERENCES pig_farms(id),
 FOREIGN KEY(group_id) REFERENCES farm_expense_groups(id),
 FOREIGN KEY(document_id) REFERENCES invoice_documents(id),
 FOREIGN KEY(integration_id) REFERENCES integration_received_invoices(id),
 FOREIGN KEY(invoice_id) REFERENCES trade_invoices(id)
) ENGINE=InnoDB;
