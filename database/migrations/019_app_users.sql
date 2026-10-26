CREATE TABLE app_users (
 user_key VARCHAR(16) PRIMARY KEY,
 name VARCHAR(60) NOT NULL,
 role ENUM('master','user') NOT NULL,
 password_hash VARCHAR(255) NULL,
 permissions JSON NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB
-- statement
INSERT INTO app_users(user_key,name,role,permissions) VALUES
 ('master','Máster','master',JSON_OBJECT()),
 ('user','Usuario','user','{"accounting_write":true,"exercise_create":true,"exercise_operations":true,"data_import":true}')
-- statement
CREATE TABLE app_sessions (
 token_hash CHAR(64) PRIMARY KEY,
 user_key VARCHAR(16) NOT NULL,
 expires_at DATETIME NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_key) REFERENCES app_users(user_key),
 INDEX app_sessions_expiry(expires_at)
) ENGINE=InnoDB
