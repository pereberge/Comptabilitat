CREATE TABLE IF NOT EXISTS company_databases (
 company_id INT UNSIGNED PRIMARY KEY,
 database_name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 verified_at DATETIME NOT NULL,
 UNIQUE KEY uq_company_database(database_name),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT
) ENGINE=InnoDB;
