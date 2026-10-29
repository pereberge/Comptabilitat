ALTER TABLE portfolio_receipts ADD COLUMN split_history JSON NULL
-- statement
ALTER TABLE accounts ADD COLUMN sepa_mandate JSON NULL
-- statement
ALTER TABLE company_details ADD COLUMN sepa_creditor_id VARCHAR(35) NOT NULL DEFAULT '', ADD COLUMN bank_initiator_id VARCHAR(35) NOT NULL DEFAULT ''
-- statement
CREATE TABLE bank_remittances (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 direction ENUM('issued','received') NOT NULL,
 message_id VARCHAR(35) CHARACTER SET ascii NOT NULL,
 requested_date DATE NOT NULL,
 status ENUM('prepared','cancelled','archived') NOT NULL DEFAULT 'prepared',
 receipt_ids JSON NOT NULL,
 snapshot JSON NOT NULL,
 filename VARCHAR(160) NOT NULL,
 xml_content MEDIUMBLOB NOT NULL,
 xml_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 cancelled_at TIMESTAMP NULL,
 UNIQUE KEY uq_remittance_request(company_id,request_id),
 UNIQUE KEY uq_remittance_message(company_id,message_id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT,
 INDEX idx_remittance_history(company_id,created_at)
) ENGINE=InnoDB
