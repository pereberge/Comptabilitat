CREATE TABLE backup_schedules (
 company_id INT UNSIGNED NOT NULL,
 frequency ENUM('daily','weekly','monthly') NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT FALSE,
 run_time CHAR(5) NOT NULL DEFAULT '21:00',
 weekday TINYINT UNSIGNED NOT NULL DEFAULT 1,
 month_day TINYINT UNSIGNED NOT NULL DEFAULT 1,
 next_run_at DATETIME NULL,
 last_success_at DATETIME NULL,
 last_error_code VARCHAR(64) NULL,
 retry_after DATETIME NULL,
 updated_at DATETIME NOT NULL,
 PRIMARY KEY(company_id,frequency),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
 INDEX backup_schedule_due(enabled,next_run_at)
) ENGINE=InnoDB
-- statement
CREATE TABLE backup_copies (
 id CHAR(36) NOT NULL PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 frequency ENUM('daily','weekly','monthly') NOT NULL,
 trigger_kind ENUM('scheduled','manual') NOT NULL,
 scheduled_for DATETIME NULL,
 request_id CHAR(36) NULL,
 file_name VARCHAR(255) NOT NULL,
 size_bytes BIGINT UNSIGNED NOT NULL,
 file_sha256 CHAR(64) NOT NULL,
 backup_checksum CHAR(64) NOT NULL,
 summary JSON NOT NULL,
 created_at DATETIME NOT NULL,
 created_date DATE NOT NULL,
 status ENUM('ready','deleting','deleted') NOT NULL DEFAULT 'ready',
 deleted_at DATETIME NULL,
 deletion_error_code VARCHAR(64) NULL,
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
 UNIQUE KEY backup_once_per_slot(company_id,frequency,scheduled_for),
 UNIQUE KEY backup_request(company_id,request_id),
 INDEX backup_copy_filters(company_id,status,created_date,frequency)
) ENGINE=InnoDB
