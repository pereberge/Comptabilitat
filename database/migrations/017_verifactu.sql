CREATE TABLE IF NOT EXISTS verifactu_settings (
 company_id INT UNSIGNED PRIMARY KEY,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 environment ENUM('test') NOT NULL DEFAULT 'test',
 producer_name VARCHAR(120) NOT NULL DEFAULT '',
 producer_nif VARCHAR(9) NOT NULL DEFAULT '',
 software_name VARCHAR(30) NOT NULL DEFAULT 'Contabilidad',
 software_id VARCHAR(2) NOT NULL DEFAULT 'CT',
 version VARCHAR(50) NOT NULL DEFAULT '0.1.0',
 installation_id VARCHAR(100) NOT NULL,
 issuer_nif VARCHAR(9) NOT NULL DEFAULT '',
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB
-- statement
CREATE TABLE IF NOT EXISTS verifactu_records (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 invoice_id INT UNSIGNED NOT NULL,
 sequence_no INT UNSIGNED NOT NULL,
 kind ENUM('alta','anulacion') NOT NULL,
 environment ENUM('test') NOT NULL DEFAULT 'test',
 previous_hash CHAR(64) CHARACTER SET ascii NOT NULL DEFAULT '',
 hash CHAR(64) CHARACTER SET ascii NOT NULL,
 generated_at VARCHAR(40) CHARACTER SET ascii NOT NULL,
 payload JSON NOT NULL,
 xml LONGTEXT NOT NULL,
 qr_url VARCHAR(1000) NOT NULL DEFAULT '',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_vf_company_id(company_id,id),
 UNIQUE KEY uq_vf_sequence(company_id,sequence_no),
 UNIQUE KEY uq_vf_invoice(company_id,invoice_id,kind),
 UNIQUE KEY uq_vf_hash(company_id,hash),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,invoice_id) REFERENCES trade_invoices(company_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB
-- statement
CREATE TABLE IF NOT EXISTS verifactu_deliveries (
 record_id INT UNSIGNED PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 status ENUM('pending','accepted','accepted_with_errors','rejected','error') NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 csv VARCHAR(200) NOT NULL DEFAULT '',
 error_code VARCHAR(40) NOT NULL DEFAULT '',
 message VARCHAR(1500) NOT NULL DEFAULT '',
 response_xml LONGTEXT NULL,
 next_attempt_at DATETIME NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(company_id,record_id) REFERENCES verifactu_records(company_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB
-- statement
CREATE TABLE IF NOT EXISTS verifactu_attempts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 record_id INT UNSIGNED NOT NULL,
 status VARCHAR(30) NOT NULL,
 error_code VARCHAR(40) NOT NULL DEFAULT '',
 response_xml LONGTEXT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(company_id,record_id) REFERENCES verifactu_records(company_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB