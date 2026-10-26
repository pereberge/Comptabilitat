CREATE TABLE IF NOT EXISTS company_logos (
  company_id INT UNSIGNED PRIMARY KEY,
  mime_type ENUM('image/png', 'image/jpeg', 'image/webp') NOT NULL,
  content MEDIUMBLOB NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_logo_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB
