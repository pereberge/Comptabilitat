-- El ejecutor separa sentencias mediante los marcadores "-- statement".
CREATE TABLE IF NOT EXISTS companies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  subaccount_length TINYINT UNSIGNED NOT NULL DEFAULT 8,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_company_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_subaccount_length CHECK (subaccount_length BETWEEN 6 AND 20)
) ENGINE=InnoDB
-- statement
CREATE TABLE IF NOT EXISTS accounting_exercises (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(60) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  default_company_id INT UNSIGNED GENERATED ALWAYS AS (IF(is_default = 1, company_id, NULL)) STORED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exercise_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  CONSTRAINT uq_exercise_name UNIQUE (company_id, name),
  CONSTRAINT uq_exercise_company_id UNIQUE (company_id, id),
  CONSTRAINT uq_default_exercise UNIQUE (default_company_id),
  CONSTRAINT chk_exercise_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
  CONSTRAINT chk_exercise_dates CHECK (start_date <= end_date),
  CONSTRAINT chk_default_boolean CHECK (is_default IN (0, 1)),
  CONSTRAINT chk_default_open CHECK (is_default = 0 OR status = 'open'),
  INDEX idx_exercise_period (company_id, start_date, end_date)
) ENGINE=InnoDB
-- statement
CREATE TRIGGER IF NOT EXISTS exercise_before_insert BEFORE INSERT ON accounting_exercises FOR EACH ROW
BEGIN
  DECLARE locked_company INT UNSIGNED;
  DECLARE overlapping_id INT UNSIGNED DEFAULT NULL;
  SELECT id INTO locked_company FROM companies WHERE id = NEW.company_id FOR UPDATE;
  SELECT id INTO overlapping_id FROM accounting_exercises
    WHERE company_id = NEW.company_id AND start_date <= NEW.end_date AND end_date >= NEW.start_date
    LIMIT 1 LOCK IN SHARE MODE;
  IF overlapping_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EXERCISE_PERIOD_OVERLAP';
  END IF;
END
-- statement
CREATE TRIGGER IF NOT EXISTS exercise_before_update BEFORE UPDATE ON accounting_exercises FOR EACH ROW
BEGIN
  DECLARE locked_company INT UNSIGNED;
  DECLARE overlapping_id INT UNSIGNED DEFAULT NULL;
  IF NEW.company_id <> OLD.company_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EXERCISE_COMPANY_IMMUTABLE';
  END IF;
  SELECT id INTO locked_company FROM companies WHERE id = NEW.company_id FOR UPDATE;
  SELECT id INTO overlapping_id FROM accounting_exercises
    WHERE company_id = NEW.company_id AND id <> OLD.id
      AND start_date <= NEW.end_date AND end_date >= NEW.start_date
    LIMIT 1 LOCK IN SHARE MODE;
  IF overlapping_id IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EXERCISE_PERIOD_OVERLAP';
  END IF;
END
