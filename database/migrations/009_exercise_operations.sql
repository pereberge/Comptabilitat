CREATE TABLE IF NOT EXISTS exercise_operations (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 source_exercise_id INT UNSIGNED NULL,
 kind ENUM('closing','opening','cancel_closing','cancel_opening','create_exercise') NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 preview_hash CHAR(64) CHARACTER SET ascii NULL,
 reason VARCHAR(200) NOT NULL DEFAULT '',
 snapshot JSON NOT NULL,
 result JSON NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_exercise_operation_request(company_id,request_id),
 UNIQUE KEY uq_exercise_operation_scope(company_id,id),
 UNIQUE KEY uq_exercise_operation_entry(company_id,exercise_id,id),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,source_exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 INDEX idx_exercise_operation(company_id,exercise_id,kind)
) ENGINE=InnoDB
-- statement
ALTER TABLE journal_entries
 ADD COLUMN exercise_operation_id INT UNSIGNED NULL,
 ADD COLUMN cancelled_by_operation_id INT UNSIGNED NULL,
 ADD CONSTRAINT fk_entry_exercise_operation FOREIGN KEY(company_id,exercise_id,exercise_operation_id) REFERENCES exercise_operations(company_id,exercise_id,id) ON DELETE RESTRICT,
 ADD CONSTRAINT fk_entry_cancel_operation FOREIGN KEY(company_id,cancelled_by_operation_id) REFERENCES exercise_operations(company_id,id) ON DELETE RESTRICT
