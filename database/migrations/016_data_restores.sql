CREATE TABLE IF NOT EXISTS data_restores (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 preview_token CHAR(36) CHARACTER SET ascii NOT NULL,
 archive_checksum CHAR(64) CHARACTER SET ascii NOT NULL,
 target_scope VARCHAR(20) CHARACTER SET ascii NOT NULL,
 result JSON NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_data_restore_request(company_id,request_id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB
