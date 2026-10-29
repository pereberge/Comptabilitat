ALTER TABLE app_users
 ADD COLUMN username VARCHAR(80) CHARACTER SET ascii COLLATE ascii_general_ci NULL AFTER user_key,
 ADD COLUMN active TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER permissions,
 ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER active,
 ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER version;
-- statement
UPDATE app_users SET username=user_key;
-- statement
ALTER TABLE app_users
 MODIFY COLUMN username VARCHAR(80) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
 ADD UNIQUE KEY uq_app_username(username),
 ADD CONSTRAINT chk_app_user_active CHECK(active IN(0,1)),
 ADD CONSTRAINT chk_app_single_master CHECK((user_key='master')=(role='master')),
 ADD CONSTRAINT chk_app_master_enabled CHECK(user_key<>'master' OR (active=1 AND username='master'));
-- statement
CREATE TABLE app_user_companies (
 user_key VARCHAR(16) NOT NULL,
 company_id INT UNSIGNED NOT NULL,
 PRIMARY KEY(user_key,company_id),
 FOREIGN KEY(user_key) REFERENCES app_users(user_key) ON DELETE CASCADE,
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
 INDEX idx_app_company_users(company_id,user_key)
) ENGINE=InnoDB;
