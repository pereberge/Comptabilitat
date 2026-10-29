ALTER TABLE app_users DROP CHECK chk_app_master_enabled;
-- statement
UPDATE app_users SET username='administrador',version=version+1 WHERE user_key='master';
-- statement
ALTER TABLE app_users ADD CONSTRAINT chk_app_master_enabled
 CHECK(user_key<>'master' OR (active=1 AND username='administrador'));
