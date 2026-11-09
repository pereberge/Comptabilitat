ALTER TABLE company_documents ADD UNIQUE KEY uq_company_document_scope(company_id,id)
-- statement
CREATE TABLE purchase_orders (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,supplier_account_id INT UNSIGNED NULL,
 reference VARCHAR(100) NOT NULL DEFAULT '',document_date DATE NULL,due_date DATE NULL,
 status ENUM('draft','confirmed','cancelled') NOT NULL DEFAULT 'draft',notes VARCHAR(1000) NOT NULL DEFAULT '',
 original_document_id INT UNSIGNED NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,created_by VARCHAR(60) NOT NULL,confirmed_by VARCHAR(60) NULL,
 request_id CHAR(36) CHARACTER SET ascii NOT NULL,request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_purchase_orders_scope(company_id,id),UNIQUE KEY uq_purchase_orders_request(company_id,request_id),
 INDEX idx_purchase_orders_supplier(company_id,supplier_account_id,document_date),
 FOREIGN KEY(company_id,supplier_account_id) REFERENCES accounts(company_id,id),
 FOREIGN KEY(company_id,original_document_id) REFERENCES company_documents(company_id,id)
 
) ENGINE=InnoDB
-- statement
CREATE TABLE purchase_order_lines (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,company_id INT UNSIGNED NOT NULL,document_id INT UNSIGNED NOT NULL,
 position SMALLINT UNSIGNED NOT NULL,item_id INT UNSIGNED NULL,description VARCHAR(300) NOT NULL,
 quantity DECIMAL(20,6) NOT NULL,unit_price DECIMAL(20,6) NULL,discount_rate DECIMAL(8,5) NOT NULL DEFAULT 0,tax_rate DECIMAL(5,2) NOT NULL DEFAULT 21,
 UNIQUE KEY uq_purchase_order_lines_scope(company_id,id),UNIQUE KEY uq_purchase_order_lines_position(company_id,document_id,position),
 FOREIGN KEY(company_id,document_id) REFERENCES purchase_orders(company_id,id),FOREIGN KEY(company_id,item_id) REFERENCES purchase_items(company_id,id),
 CHECK(quantity>0),CHECK(unit_price IS NULL OR unit_price>=0),CHECK(discount_rate>=0 AND discount_rate<=100),CHECK(tax_rate>=0 AND tax_rate<=100)
) ENGINE=InnoDB
