CREATE TABLE IF NOT EXISTS accounts (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 code VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 description VARCHAR(200) NOT NULL,
 kind ENUM('account','subaccount') NOT NULL,
 parent_id INT UNSIGNED NULL,
 UNIQUE KEY uq_account_code(company_id,code),
 UNIQUE KEY uq_account_company(company_id,id),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,parent_id) REFERENCES accounts(company_id,id) ON DELETE RESTRICT,
 CHECK(code REGEXP '^[1-9][0-9]*$'),
 CHECK(CHAR_LENGTH(TRIM(description)) > 0)
) ENGINE=InnoDB
-- statement
CREATE TABLE IF NOT EXISTS journal_entries (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 number INT UNSIGNED NOT NULL,
 entry_date DATE NOT NULL,
 description VARCHAR(200) NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_entry_number(company_id,exercise_id,number),
 UNIQUE KEY uq_entry_request(company_id,request_id),
 UNIQUE KEY uq_entry_company(company_id,id),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 CHECK(number > 0),
 CHECK(CHAR_LENGTH(TRIM(description)) > 0),
 INDEX idx_entries_date(company_id,exercise_id,entry_date)
) ENGINE=InnoDB
-- statement
CREATE TABLE IF NOT EXISTS journal_lines (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 entry_id INT UNSIGNED NOT NULL,
 account_id INT UNSIGNED NOT NULL,
 position SMALLINT UNSIGNED NOT NULL,
 description VARCHAR(200) NOT NULL,
 debit DECIMAL(15,2) NOT NULL DEFAULT 0,
 credit DECIMAL(15,2) NOT NULL DEFAULT 0,
 UNIQUE KEY uq_line_position(entry_id,position),
 FOREIGN KEY(company_id,entry_id) REFERENCES journal_entries(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,account_id) REFERENCES accounts(company_id,id) ON DELETE RESTRICT,
 CHECK((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
) ENGINE=InnoDB
