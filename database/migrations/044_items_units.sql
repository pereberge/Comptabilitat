CREATE TABLE purchase_units (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,code VARCHAR(20) NOT NULL,name VARCHAR(100) NOT NULL,
 dimension ENUM('mass','volume','unit','time','other') NOT NULL DEFAULT 'unit',base_unit_id INT UNSIGNED NULL,conversion_factor DECIMAL(24,9) NOT NULL DEFAULT 1,
 UNIQUE KEY uq_purchase_unit_scope(company_id,id),UNIQUE KEY uq_purchase_unit_code(company_id,code),FOREIGN KEY(company_id) REFERENCES companies(id),
 FOREIGN KEY(company_id,base_unit_id) REFERENCES purchase_units(company_id,id),CHECK(conversion_factor>0)
) ENGINE=InnoDB
-- statement
CREATE TABLE purchase_items (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,code VARCHAR(60) NOT NULL,description VARCHAR(300) NOT NULL,
 unit_id INT UNSIGNED NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,
 UNIQUE KEY uq_purchase_item_scope(company_id,id),UNIQUE KEY uq_purchase_item_code(company_id,code),
 FOREIGN KEY(company_id,unit_id) REFERENCES purchase_units(company_id,id)
) ENGINE=InnoDB
-- statement
CREATE TABLE purchase_supplier_items (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,supplier_account_id INT UNSIGNED NOT NULL,
 item_id INT UNSIGNED NOT NULL,supplier_code VARCHAR(100) NOT NULL,
 UNIQUE KEY uq_supplier_item_code(company_id,supplier_account_id,supplier_code),UNIQUE KEY uq_supplier_item_scope(company_id,id),
 FOREIGN KEY(company_id,supplier_account_id) REFERENCES accounts(company_id,id),FOREIGN KEY(company_id,item_id) REFERENCES purchase_items(company_id,id)
) ENGINE=InnoDB
