CREATE TABLE payroll_settings (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL UNIQUE,
 config_key VARCHAR(20) NOT NULL DEFAULT 'general',
 payload JSON NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
-- statement
CREATE TABLE payroll_employees (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 code VARCHAR(24) NOT NULL,
 name VARCHAR(160) NOT NULL,
 profile JSON NOT NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_payroll_employee_code(company_id,code),
 UNIQUE KEY uq_payroll_employee_owner(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
-- statement
CREATE TABLE payroll_slips (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 employee_id INT UNSIGNED NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 period_from DATE NOT NULL,
 period_to DATE NOT NULL,
 kind ENUM('monthly','extra') NOT NULL,
 status ENUM('draft','posted','voided') NOT NULL DEFAULT 'draft',
 input JSON NOT NULL,
 employee_snapshot JSON NOT NULL,
 employer_snapshot JSON NOT NULL,
 calculation JSON NOT NULL,
 entry_id INT UNSIGNED NULL,
 reversal_entry_id INT UNSIGNED NULL,
 post_request_id CHAR(36) CHARACTER SET ascii NULL,
 post_hash CHAR(64) CHARACTER SET ascii NULL,
 void_request_id CHAR(36) CHARACTER SET ascii NULL,
 void_reason VARCHAR(200) NOT NULL DEFAULT '',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 active_key VARCHAR(100) GENERATED ALWAYS AS (IF(status='voided',NULL,CONCAT(employee_id,':',period_from,':',period_to,':',kind))) STORED,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_payroll_request(company_id,request_id),
 UNIQUE KEY uq_payroll_post_request(company_id,post_request_id),
 UNIQUE KEY uq_payroll_void_request(company_id,void_request_id),
 UNIQUE KEY uq_payroll_period(company_id,active_key),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,employee_id) REFERENCES payroll_employees(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,entry_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,reversal_entry_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT,
 CHECK(period_from<=period_to)
) ENGINE=InnoDB
