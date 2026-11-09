CREATE TABLE management_audit_events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,
 actor VARCHAR(60) NOT NULL,action VARCHAR(60) NOT NULL,entity_type VARCHAR(40) NOT NULL,entity_id INT UNSIGNED NULL,
 before_data JSON NULL,after_data JSON NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_management_audit_scope(company_id,id),INDEX idx_management_audit(company_id,entity_type,entity_id,created_at),
 FOREIGN KEY(company_id) REFERENCES companies(id)
) ENGINE=InnoDB
-- statement
CREATE TABLE management_requests (
 company_id INT UNSIGNED NOT NULL,request_id CHAR(36) CHARACTER SET ascii NOT NULL,request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 response JSON NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(company_id,request_id),FOREIGN KEY(company_id) REFERENCES companies(id)
) ENGINE=InnoDB
