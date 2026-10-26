CREATE TABLE IF NOT EXISTS invoice_deletions (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 invoice_id INT UNSIGNED NOT NULL,
 reference VARCHAR(60) NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 result JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_invoice_deletion_request(company_id,request_id),
 UNIQUE KEY uq_invoice_deletion_scope(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB
-- statement
CREATE TABLE IF NOT EXISTS invoice_deletion_rows (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 deletion_id INT UNSIGNED NOT NULL,
 table_name VARCHAR(64) CHARACTER SET ascii NOT NULL,
 row_id INT UNSIGNED NOT NULL,
 record_action ENUM('delete','update') NOT NULL,
 row_data JSON NOT NULL,
 UNIQUE KEY uq_invoice_deletion_row(deletion_id,table_name,row_id),
 FOREIGN KEY(company_id,deletion_id) REFERENCES invoice_deletions(company_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB
