INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'1','Financiación básica','account',NULL
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='1')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'10','Capital','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='1')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='10')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'100','Capital social','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='10')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='100')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'4','Acreedores y deudores por operaciones comerciales','account',NULL
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='4')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'40','Proveedores','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='4')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='40')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'400','Proveedores','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='40')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='400')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'43','Clientes','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='4')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='43')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'430','Clientes','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='43')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='430')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'47','Administraciones públicas','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='4')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='47')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'472','Hacienda Pública, IVA soportado','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='47')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='472')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'477','Hacienda Pública, IVA repercutido','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='47')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='477')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'5','Cuentas financieras','account',NULL
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='5')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'57','Tesorería','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='5')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='57')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'570','Caja, euros','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='57')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='570')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'572','Bancos e instituciones de crédito c/c vista, euros','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='57')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='572')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'6','Compras y gastos','account',NULL
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='6')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'60','Compras','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='6')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='60')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'600','Compras de mercaderías','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='60')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='600')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'7','Ventas e ingresos','account',NULL
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='7')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'70','Ventas de mercaderías, de producción propia, de servicios, etc.','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='7')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='70')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'700','Ventas de mercaderías','account',(SELECT id FROM accounts p WHERE p.company_id=1 AND p.code='70')
WHERE EXISTS(SELECT 1 FROM companies WHERE id=1) AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='700')
