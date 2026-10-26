CREATE TABLE IF NOT EXISTS farm_care_costs (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 lot_id INT UNSIGNED NOT NULL,
 event_date DATE NOT NULL,
 amount DECIMAL(15,2) NOT NULL,
 notes VARCHAR(2000) NOT NULL DEFAULT '',
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 voided TINYINT UNSIGNED NOT NULL DEFAULT 0,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_farm_care_request(company_id,request_id),
 INDEX idx_farm_care_scope(company_id,exercise_id,lot_id,event_date),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,lot_id) REFERENCES farm_lots(company_id,id) ON DELETE RESTRICT,
 CHECK(amount>0),CHECK(voided IN (0,1))
) ENGINE=InnoDB;
-- statement
ALTER TABLE farm_cost_lines DROP CHECK farm_cost_lines_chk_2,
 ADD CONSTRAINT farm_cost_lines_chk_2 CHECK(category IN ('feed','transport','medicines','reproduction','supplies','care','other'));
-- statement
UPDATE farm_lots l
 JOIN pig_farms f ON f.company_id=l.company_id AND f.id=l.farm_id
 LEFT JOIN farm_lots existing ON existing.company_id=l.company_id AND existing.farm_id=l.farm_id AND existing.code=CONCAT(f.code,'-',l.code)
 SET l.code=CONCAT(f.code,'-',l.code),l.version=l.version+1
 WHERE l.code REGEXP '^[1-9][0-9]{0,8}$' AND existing.id IS NULL;
