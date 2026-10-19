INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'60000000','Compras de mercaderías','subaccount',p.id FROM accounts p JOIN companies c ON c.id=p.company_id
WHERE p.company_id=1 AND p.code='600' AND p.kind='account' AND c.subaccount_length=8
AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='60000000')
AND NOT EXISTS(SELECT 1 FROM accounts WHERE parent_id=p.id AND kind='account')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'47200000','IVA soportado','subaccount',p.id FROM accounts p JOIN companies c ON c.id=p.company_id
WHERE p.company_id=1 AND p.code='472' AND p.kind='account' AND c.subaccount_length=8
AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='47200000')
AND NOT EXISTS(SELECT 1 FROM accounts WHERE parent_id=p.id AND kind='account')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'40000001','Proveedor ejemplo','subaccount',p.id FROM accounts p JOIN companies c ON c.id=p.company_id
WHERE p.company_id=1 AND p.code='400' AND p.kind='account' AND c.subaccount_length=8
AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='40000001')
AND NOT EXISTS(SELECT 1 FROM accounts WHERE parent_id=p.id AND kind='account')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'43000001','Cliente ejemplo','subaccount',p.id FROM accounts p JOIN companies c ON c.id=p.company_id
WHERE p.company_id=1 AND p.code='430' AND p.kind='account' AND c.subaccount_length=8
AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='43000001')
AND NOT EXISTS(SELECT 1 FROM accounts WHERE parent_id=p.id AND kind='account')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT 1,'57200001','Banco principal','subaccount',p.id FROM accounts p JOIN companies c ON c.id=p.company_id
WHERE p.company_id=1 AND p.code='572' AND p.kind='account' AND c.subaccount_length=8
AND NOT EXISTS(SELECT 1 FROM accounts WHERE company_id=1 AND code='57200001')
AND NOT EXISTS(SELECT 1 FROM accounts WHERE parent_id=p.id AND kind='account')
