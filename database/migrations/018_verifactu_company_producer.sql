ALTER TABLE verifactu_settings
 ADD COLUMN producer_source ENUM('company','custom') NOT NULL DEFAULT 'custom' AFTER environment