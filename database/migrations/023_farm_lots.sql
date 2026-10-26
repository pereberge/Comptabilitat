CREATE TABLE IF NOT EXISTS farm_lots (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 company_id INT UNSIGNED NOT NULL,
 farm_id INT UNSIGNED NOT NULL,
 code VARCHAR(40) NOT NULL,
 entry_date DATE NOT NULL,
 exit_date DATE NULL,
 animals_in INT UNSIGNED NULL,
 animals_out INT UNSIGNED NULL,
 notes VARCHAR(2000) NOT NULL DEFAULT '',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_farm_lot(company_id,farm_id,code),
 UNIQUE KEY uq_farm_lot_scope(company_id,id),
 INDEX idx_farm_lot_dates(company_id,farm_id,entry_date,exit_date),
 FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE RESTRICT,
 FOREIGN KEY(farm_id) REFERENCES pig_farms(id) ON DELETE RESTRICT,
 CHECK(exit_date IS NULL OR exit_date>=entry_date),
 CHECK(animals_in IS NULL OR animals_in<=10000000),
 CHECK(animals_out IS NULL OR animals_out<=10000000)
) ENGINE=InnoDB;
-- statement
ALTER TABLE farm_cost_lines
 ADD COLUMN lot_id INT UNSIGNED NULL,
 ADD COLUMN lot_assignment ENUM('auto','manual','unassigned') NOT NULL DEFAULT 'auto',
 ADD CONSTRAINT fk_farm_cost_lot FOREIGN KEY(company_id,lot_id) REFERENCES farm_lots(company_id,id) ON DELETE RESTRICT;
