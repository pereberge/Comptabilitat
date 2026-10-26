CREATE TABLE IF NOT EXISTS exercise_clears (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 preview_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 company_name VARCHAR(160) NOT NULL,
 exercise_name VARCHAR(60) NOT NULL,
 start_date DATE NOT NULL,
 end_date DATE NOT NULL,
 counts JSON NOT NULL,
 result JSON NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_exercise_clear_request(company_id,request_id),
 UNIQUE KEY uq_exercise_clear_scope(company_id,id),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 INDEX idx_exercise_clear_period(company_id,exercise_id,id)
) ENGINE=InnoDB
-- statement
CREATE TABLE IF NOT EXISTS exercise_clear_rows (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 clear_id INT UNSIGNED NOT NULL,
 table_name VARCHAR(64) CHARACTER SET ascii NOT NULL,
 row_id INT UNSIGNED NOT NULL,
 record_action ENUM('delete','update') NOT NULL,
 row_data JSON NOT NULL,
 UNIQUE KEY uq_exercise_clear_row(clear_id,table_name,row_id),
 FOREIGN KEY(company_id,clear_id) REFERENCES exercise_clears(company_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB
