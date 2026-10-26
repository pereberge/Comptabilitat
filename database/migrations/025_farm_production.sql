ALTER TABLE farm_lots
 ADD COLUMN entry_kg_per_pig DECIMAL(10,3) NULL,
 ADD COLUMN entry_price_per_pig DECIMAL(14,2) NULL,
 ADD COLUMN entry_cost_included TINYINT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN feed_opening_kg DECIMAL(18,3) NULL,
 ADD COLUMN feed_closing_kg DECIMAL(18,3) NULL,
 ADD CONSTRAINT chk_lot_entry_kg CHECK(entry_kg_per_pig IS NULL OR entry_kg_per_pig>0),
 ADD CONSTRAINT chk_lot_entry_price CHECK(entry_price_per_pig IS NULL OR entry_price_per_pig>=0),
 ADD CONSTRAINT chk_lot_feed_stock CHECK((feed_opening_kg IS NULL OR feed_opening_kg>=0) AND (feed_closing_kg IS NULL OR feed_closing_kg>=0)),
 ADD CONSTRAINT chk_lot_entry_included CHECK(entry_cost_included IN (0,1));
-- statement
ALTER TABLE farm_cost_lines ADD COLUMN feed_kg DECIMAL(18,3) NULL;
-- statement
CREATE TABLE IF NOT EXISTS farm_deaths (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 lot_id INT UNSIGNED NOT NULL,
 event_date DATE NOT NULL,
 pigs INT UNSIGNED NOT NULL,
 notes VARCHAR(2000) NOT NULL DEFAULT '',
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 voided TINYINT UNSIGNED NOT NULL DEFAULT 0,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_farm_death_request(company_id,request_id),
 INDEX idx_farm_death_scope(company_id,exercise_id,lot_id,event_date),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,lot_id) REFERENCES farm_lots(company_id,id) ON DELETE RESTRICT,
 CHECK(pigs>0 AND pigs<=10000000),
 CHECK(voided IN (0,1))
) ENGINE=InnoDB;
-- statement
CREATE TABLE IF NOT EXISTS farm_feed_transfers (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 exercise_id INT UNSIGNED NOT NULL,
 event_date DATE NOT NULL,
 source_lot_id INT UNSIGNED NOT NULL,
 destination_lot_id INT UNSIGNED NOT NULL,
 kg DECIMAL(18,3) NOT NULL,
 price_per_kg DECIMAL(13,5) NOT NULL,
 total_amount DECIMAL(15,2) NOT NULL,
 notes VARCHAR(2000) NOT NULL DEFAULT '',
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 voided TINYINT UNSIGNED NOT NULL DEFAULT 0,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_farm_transfer_request(company_id,request_id),
 INDEX idx_farm_transfer_scope(company_id,exercise_id,event_date),
 FOREIGN KEY(company_id,exercise_id) REFERENCES accounting_exercises(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,source_lot_id) REFERENCES farm_lots(company_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(company_id,destination_lot_id) REFERENCES farm_lots(company_id,id) ON DELETE RESTRICT,
 CHECK(source_lot_id<>destination_lot_id AND kg>0 AND price_per_kg>=0 AND total_amount>=0),
 CHECK(voided IN (0,1))
) ENGINE=InnoDB;
