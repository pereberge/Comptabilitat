CREATE TABLE treasury_receipt_accounts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,receipt_id INT UNSIGNED NOT NULL,
 bank_account_id INT UNSIGNED NULL,version INT UNSIGNED NOT NULL DEFAULT 1,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_treasury_assignment_scope(company_id,id),UNIQUE KEY uq_treasury_assignment_receipt(company_id,receipt_id),
 FOREIGN KEY(company_id,receipt_id) REFERENCES portfolio_receipts(company_id,id) ON DELETE CASCADE,
 FOREIGN KEY(company_id,bank_account_id) REFERENCES accounts(company_id,id)
) ENGINE=InnoDB
-- statement
CREATE TABLE treasury_plans (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,direction ENUM('issued','received') NOT NULL,
 description VARCHAR(200) NOT NULL,expected_date DATE NOT NULL,amount DECIMAL(15,2) NOT NULL,bank_account_id INT UNSIGNED NULL,
 status ENUM('pending','linked','cancelled') NOT NULL DEFAULT 'pending',linked_receipt_id INT UNSIGNED NULL,version INT UNSIGNED NOT NULL DEFAULT 1,
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_treasury_plan_scope(company_id,id),UNIQUE KEY uq_treasury_plan_request(company_id,request_id),UNIQUE KEY uq_treasury_plan_receipt(company_id,linked_receipt_id),
 INDEX idx_treasury_plan_date(company_id,status,expected_date),
 FOREIGN KEY(company_id) REFERENCES companies(id),FOREIGN KEY(company_id,bank_account_id) REFERENCES accounts(company_id,id),
 FOREIGN KEY(company_id,linked_receipt_id) REFERENCES portfolio_receipts(company_id,id),
 CHECK(amount>0),CHECK((status='linked' AND linked_receipt_id IS NOT NULL) OR (status<>'linked' AND linked_receipt_id IS NULL))
) ENGINE=InnoDB
