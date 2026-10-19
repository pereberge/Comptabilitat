-- PGC general: cuarta parte, BOE-A-2007-19884. Fuente y fecha en database/reference/pgc.json.
SELECT id FROM companies ORDER BY id FOR UPDATE
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1','Financiación básica','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2','Activo no corriente','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'3','Existencias','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='3')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4','Acreedores y deudores por operaciones comerciales','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5','Cuentas financieras','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6','Compras y gastos','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7','Ventas e ingresos','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'8','Gastos imputados al patrimonio neto','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='8')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'9','Ingresos imputados al patrimonio neto','account',NULL FROM companies c

WHERE c.subaccount_length > 1 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='9')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'10','CAPITAL','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='10')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'11','RESERVAS Y OTROS INSTRUMENTOS DE PATRIMONIO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='11')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'12','RESULTADOS PENDIENTES DE APLICACIÓN','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='12')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'13','SUBVENCIONES, DONACIONES Y AJUSTES POR CAMBIOS DE VALOR','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='13')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'14','PROVISIONES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='14')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'15','DEUDAS A LARGO PLAZO CON CARACTERÍSTICAS ESPECIALES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='15')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'16','DEUDAS A LARGO PLAZO CON PARTES VINCULADAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='16')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'17','DEUDAS A LARGO PLAZO POR PRÉSTAMOS RECIBIDOS, EMPRÉSTITOS Y OTROS CONCEPTOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='17')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'18','PASIVOS POR FIANZAS, GARANTÍAS Y OTROS CONCEPTOS A LARGO PLAZO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='18')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'19','SITUACIONES TRANSITORIAS DE FINANCIACIÓN','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='1' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='19')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'20','INMOVILIZACIONES INTANGIBLES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='20')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'21','INMOVILIZACIONES MATERIALES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='21')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'22','INVERSIONES INMOBILIARIAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='22')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'23','INMOVILIZACIONES MATERIALES EN CURSO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='23')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'24','INVERSIONES FINANCIERAS A LARGO PLAZO EN PARTES VINCULADAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='24')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'25','OTRAS INVERSIONES FINANCIERAS A LARGO PLAZO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='25')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'26','FIANZAS Y DEPÓSITOS CONSTITUIDOS A LARGO PLAZO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='26')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'28','AMORTIZACIÓN ACUMULADA DEL INMOVILIZADO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='28')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'29','DETERIORO DE VALOR DE ACTIVOS NO CORRIENTES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='2' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='29')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'30','COMERCIALES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='3' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='30')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'31','MATERIAS PRIMAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='3' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='31')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'32','OTROS APROVISIONAMIENTOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='3' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='32')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'33','PRODUCTOS EN CURSO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='3' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='33')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'34','PRODUCTOS SEMITERMINADOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='3' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='34')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'35','PRODUCTOS TERMINADOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='3' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='35')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'36','SUBPRODUCTOS, RESIDUOS Y MATERIALES RECUPERADOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='3' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='36')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'39','DETERIORO DE VALOR DE LAS EXISTENCIAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='3' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='39')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'40','PROVEEDORES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='4' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='40')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'41','ACREEDORES VARIOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='4' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='41')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'43','CLIENTES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='4' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='43')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'44','DEUDORES VARIOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='4' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='44')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'46','PERSONAL','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='4' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='46')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'47','ADMINISTRACIONES PÚBLICAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='4' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='47')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'48','AJUSTES POR PERIODIFICACIÓN','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='4' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='48')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'49','DETERIORO DE VALOR DE CRÉDITOS COMERCIALES Y PROVISIONES A CORTO PLAZO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='4' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='49')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'50','EMPRÉSTITOS, DEUDAS CON CARÁCTERÍSTICAS ESPECIALES Y OTRAS EMISIONES ANÁLOGAS A CORTO PLAZO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='50')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'51','DEUDAS A CORTO PLAZO CON PARTES VINCULADAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='51')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'52','DEUDAS A CORTO PLAZO POR PRÉSTAMOS RECIBIDOS Y OTROS CONCEPTOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='52')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'53','INVERSIONES FINANCIERAS A CORTO PLAZO EN PARTES VINCULADAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='53')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'54','OTRAS INVERSIONES FINANCIERAS A CORTO PLAZO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='54')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'55','OTRAS CUENTAS NO BANCARIAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='55')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'56','FIANZAS Y DEPÓSITOS RECIBIDOS Y CONSTITUIDOS A CORTO PLAZO Y AJUSTES POR PERIODIFICACIÓN','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='56')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'57','TESORERÍA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='57')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'58','ACTIVOS NO CORRIENTES MANTENIDOS PARA LA VENTA Y ACTIVOS Y PASIVOS ASOCIADOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='58')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'59','DETERIORO DEL VALOR DE INVERSIONES FINANCIERAS A CORTO PLAZO Y DE ACTIVOS NO CORRIENTES MANTENIDOS PARA LA VENTA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='5' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='59')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'60','COMPRAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='60')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'61','VARIACIÓN DE EXISTENCIAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='61')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'62','SERVICIOS EXTERIORES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='62')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'63','TRIBUTOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='63')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'64','GASTOS DE PERSONAL','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='64')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'65','OTROS GASTOS DE GESTIÓN','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='65')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'66','GASTOS FINANCIEROS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='66')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'67','PÉRDIDAS PROCEDENTES DE ACTIVOS NO CORRIENTES Y GASTOS EXCEPCIONALES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='67')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'68','DOTACIONES PARA AMORTIZACIONES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='68')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'69','PÉRDIDAS POR DETERIOROY OTRAS DOTACIONES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='6' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='69')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'70','VENTAS DE MERCADERÍAS, DE PRODUCCIÓN PROPIA, DE SERVICIOS, ETC','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='70')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'71','VARIACIÓN DE EXISTENCIAS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='71')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'73','TRABAJOS REALIZADOS PARA LA EMPRESA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='73')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'74','SUBVENCIONES, DONACIONESY LEGADOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='74')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'75','OTROS INGRESOS DE GESTIÓN','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='75')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76','INGRESOS FINANCIEROS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'77','BENEFICIOS PROCEDENTES DE ACTIVOS NO CORRIENTES E INGRESOS EXCEPCIONALES','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='77')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'79','EXCESOS Y APLICACIONES DE PROVISIONES Y DE PÉRDIDAS POR DETERIORO','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='79')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'80','GASTOS FINANCIEROS POR VALORACIÓN DE ACTIVOS Y PASIVOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='8' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='80')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'81','GASTOS EN OPERACIONES DE COBERTURA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='8' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='81')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'82','GASTOS POR DIFERENCIAS DE CONVERSIÓN','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='8' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='82')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'83','IMPUESTO SOBRE BENEFICIOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='8' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='83')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'84','TRANSFERENCIAS DE SUBVENCIONES, DONACIONESY LEGADOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='8' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='84')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'85','GASTOS POR PÉRDIDAS ACTUARIALES Y AJUSTES EN LOS ACTIVOS POR RETRIBUCIONES A LARGO PLAZO DE PRESTACIÓN DEFINIDA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='8' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='85')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'86','GASTOS POR ACTIVOS NO CORRIENTES EN VENTA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='8' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='86')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'89','GASTOS DE PARTICIPACIONES EN EMPRESAS DEL GRUPO O ASOCIADAS CON AJUSTES VALORATIVOS POSITIVOS PREVIOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='8' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='89')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'90','INGRESOS FINANCIEROS POR VALORACIÓN DE ACTIVOSY PASIVOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='9' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='90')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'91','INGRESOS EN OPERACIONES DE COBERTURA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='9' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='91')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'92','INGRESOS POR DIFERENCIAS DE CONVERSIÓN','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='9' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='92')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'94','INGRESOS POR SUBVENCIONES, DONACIONES Y LEGADOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='9' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='94')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'95','INGRESOS POR GANANCIAS ACTUARIALES Y AJUSTES EN LOS ACTIVOS POR RETRIBUCIONES A LARGO PLAZO DE PRESTACIÓN DEFINIDA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='9' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='95')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'96','INGRESOS POR ACTIVOS NO CORRIENTES EN VENTA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='9' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='96')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'99','INGRESOS DE PARTICIPACIONES EN EMPRESAS DEL GRUPO O ASOCIADAS CON AJUSTES VALORATIVOS NEGATIVOS PREVIOS','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='9' AND p.kind='account'
WHERE c.subaccount_length > 2 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='99')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'100','Capital social','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='10' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='100')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'101','Fondo social','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='10' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='101')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'102','Capital','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='10' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='102')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'103','Socios por desembolsos no exigidos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='10' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='103')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'104','Socios por aportaciones no dinerarias pendientes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='10' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='104')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'108','Acciones o participaciones propias en situaciones especiales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='10' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='108')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'109','Acciones o participaciones propias para reducción de capital','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='10' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='109')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'110','Prima de emisión o asunción','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='11' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='110')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'111','Otros instrumentos de patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='11' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='111')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'112','Reserva legal','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='11' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='112')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'113','Reservas voluntarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='11' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='113')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'114','Reservas especiales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='11' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='114')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'115','Reservas por pérdidas y ganancias actuariales y otros ajustes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='11' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='115')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'118','Aportaciones de socios o propietarios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='11' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='118')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'119','Diferencias por ajuste del capital a euros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='11' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='119')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'120','Remanente','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='12' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='120')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'121','Resultados negativos de ejercicios anteriores','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='12' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='121')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'129','Resultado del ejercicio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='12' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='129')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'130','Subvenciones oficiales de capital','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='13' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='130')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'131','Donaciones y legados de capital','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='13' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='131')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'132','Otras subvenciones, donaciones y legados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='13' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='132')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'133','Ajustes por valoración en activos financieros a valor razonable con cambios en el patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='13' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='133')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'134','Operaciones de cobertura','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='13' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='134')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'135','Diferencias de conversión','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='13' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='135')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'136','Ajustes por valoración en activos no corrientes y grupos enajenables de elementos, mantenidos para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='13' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='136')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'137','Ingresos fiscales a distribuir en varios ejercicios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='13' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='137')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'140','Provisión por retribuciones a largo plazo al personal','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='14' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='140')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'141','Provisión para impuestos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='14' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='141')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'142','Provisión para otras responsabilidades','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='14' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='142')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'143','Provisión por desmantelamiento, retiro o rehabilitación del inmovilizado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='14' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='143')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'145','Provisión para actuaciones medioambientales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='14' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='145')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'146','Provisión para reestructuraciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='14' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='146')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'147','Provisión por transacciones con pagos basados en instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='14' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='147')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'150','Acciones o participaciones a largo plazo consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='15' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='150')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'153','Desembolsos no exigidos por acciones o participaciones consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='15' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='153')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'154','Aportaciones no dinerarias pendientes por acciones o participaciones consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='15' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='154')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'160','Deudas a largo plazo con entidades de crédito vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='16' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='160')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'161','Proveedores de inmovilizado a largo plazo, partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='16' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='161')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'162','Acreedores por arrendamiento financiero a largo plazo, partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='16' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='162')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'163','Otras deudas a largo plazo con partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='16' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='163')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'170','Deudas a largo plazo con entidades de crédito','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='170')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'171','Deudas a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='171')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'172','Deudas a largo plazo transformables en subvenciones, donaciones y legados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='172')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'173','Proveedores de inmovilizado a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='173')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'174','Acreedores por arrendamiento financiero a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='174')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'175','Efectos a pagar a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='175')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'176','Pasivos por derivados financieros a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='176')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'177','Obligaciones y bonos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='177')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'178','Obligaciones y bonos convertibles','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='178')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'179','Deudas representadas en otros valores negociables','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='17' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='179')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'180','Fianzas recibidas a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='18' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='180')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'181','Anticipos recibidos por ventas o prestaciones de servicios a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='18' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='181')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'185','Depósitos recibidos a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='18' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='185')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'189','Garantías financieras a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='18' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='189')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'190','Acciones o participaciones emitidas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='19' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='190')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'192','Suscriptores de acciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='19' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='192')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'194','Capital emitido pendiente de inscripción','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='19' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='194')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'195','Acciones o participaciones emitidas consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='19' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='195')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'197','Suscriptores de acciones consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='19' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='197')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'199','Acciones o participaciones emitidas consideradas como pasivos financieros pendientes de inscripción.','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='19' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='199')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'200','Investigación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='20' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='200')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'201','Desarrollo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='20' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='201')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'202','Concesiones administrativas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='20' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='202')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'203','Propiedad industrial','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='20' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='203')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'204','Fondo de comercio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='20' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='204')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'205','Derechos de traspaso','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='20' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='205')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'206','Aplicaciones informáticas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='20' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='206')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'209','Anticipos para inmovilizaciones intangibles','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='20' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='209')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'210','Terrenos y bienes naturales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='210')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'211','Construcciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='211')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'212','Instalaciones técnicas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='212')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'213','Maquinaria','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='213')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'214','Utillaje','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='214')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'215','Otras instalaciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='215')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'216','Mobiliario','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='216')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'217','Equipos para procesos de información','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='217')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'218','Elementos de transporte','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='218')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'219','Otro inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='21' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='219')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'220','Inversiones en terrenos y bienes naturales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='22' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='220')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'221','Inversiones en construcciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='22' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='221')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'230','Adaptación de terrenos y bienes naturales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='23' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='230')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'231','Construcciones en curso','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='23' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='231')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'232','Instalaciones técnicas en montaje','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='23' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='232')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'233','Maquinaria en montaje','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='23' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='233')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'237','Equipos para procesos de información en montaje','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='23' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='237')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'239','Anticipos para inmovilizaciones materiales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='23' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='239')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'240','Participaciones a largo plazo en partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='24' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='240')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'241','Valores representativos de deuda a largo plazo de partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='24' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='241')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'242','Créditos a largo plazo a partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='24' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='242')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'249','Desembolsos pendientes sobre participaciones a largo plazo en partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='24' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='249')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'250','Inversiones financieras a largo plazo en instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='250')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'251','Valores representativos de deuda a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='251')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'252','Créditos a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='252')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'253','Créditos a largo plazo por enajenación de inmovilizado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='253')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'254','Créditos a largo plazo al personal','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='254')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'255','Activos por derivados financieros a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='255')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'257','Derechos de reembolso derivados de contratos de seguro relativos a retribuciones a largo plazo al personal','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='257')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'258','Imposiciones a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='258')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'259','Desembolsos pendientes sobre participaciones en el patrimonio neto a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='25' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='259')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'260','Fianzas constituidas a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='26' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='260')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'265','Depósitos constituidos a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='26' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='265')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'280','Amortización acumulada del inmovilizado intangible','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='28' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='280')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'281','Amortización acumulada del inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='28' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='281')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'282','Amortización acumulada de las inversiones inmobiliarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='28' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='282')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'290','Deterioro de valor del inmovilizado intangible','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='29' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='290')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'291','Deterioro de valor del inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='29' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='291')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'292','Deterioro de valor de las inversiones inmobiliarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='29' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='292')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'293','Deterioro de valor de participaciones a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='29' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='293')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'294','Deterioro de valor de valores representativos de deuda a largo plazo de partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='29' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='294')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'295','Deterioro de valor de créditos a largo plazo a partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='29' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='295')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'297','Deterioro de valor de valores representativos de deuda a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='29' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='297')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'298','Deterioro de valor de créditos a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='29' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='298')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'300','Mercaderías A','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='30' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='300')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'301','Mercaderías B','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='30' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='301')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'310','Materias primas A','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='31' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='310')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'311','Materias primas B','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='31' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='311')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'320','Elementos y conjuntos incorporables','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='32' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='320')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'321','Combustibles','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='32' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='321')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'322','Repuestos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='32' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='322')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'325','Materiales diversos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='32' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='325')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'326','Embalajes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='32' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='326')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'327','Envases','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='32' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='327')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'328','Material de oficina','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='32' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='328')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'330','Productos en curso A','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='33' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='330')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'331','Productos en curso B','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='33' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='331')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'340','Productos semiterminados A','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='34' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='340')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'341','Productos semiterminados B','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='34' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='341')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'350','Productos terminados A','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='35' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='350')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'351','Productos terminados B','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='35' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='351')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'360','Subproductos A','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='36' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='360')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'361','Subproductos B','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='36' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='361')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'365','Residuos A','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='36' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='365')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'366','Residuos B','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='36' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='366')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'368','Materiales recuperados A','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='36' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='368')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'369','Materiales recuperados B','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='36' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='369')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'390','Deterioro de valor de las mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='39' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='390')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'391','Deterioro de valor de las materias primas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='39' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='391')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'392','Deterioro de valor de otros aprovisionamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='39' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='392')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'393','Deterioro de valor de los productos en curso','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='39' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='393')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'394','Deterioro de valor de los productos semiterminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='39' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='394')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'395','Deterioro de valor de los productos terminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='39' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='395')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'396','Deterioro de valor de los subproductos, residuos y materiales recuperados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='39' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='396')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'400','Proveedores','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='40' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='400')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'401','Proveedores, efectos comerciales a pagar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='40' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='401')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'403','Proveedores, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='40' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='403')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'404','Proveedores, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='40' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='404')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'405','Proveedores, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='40' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='405')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'406','Envases y embalajes a devolver a proveedores','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='40' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='406')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'407','Anticipos a proveedores','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='40' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='407')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'410','Acreedores por prestaciones de servicios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='41' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='410')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'411','Acreedores, efectos comerciales a pagar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='41' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='411')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'419','Acreedores por operaciones en común','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='41' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='419')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'430','Clientes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='430')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'431','Clientes, efectos comerciales a cobrar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='431')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'432','Clientes, operaciones de «factoring»','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='432')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'433','Clientes, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='433')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'434','Clientes, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='434')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'435','Clientes, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='435')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'436','Clientes de dudoso cobro','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='436')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'437','Envases y embalajes a devolver por clientes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='437')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'438','Anticipos de clientes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='43' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='438')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'440','Deudores','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='44' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='440')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'441','Deudores, efectos comerciales a cobrar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='44' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='441')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'446','Deudores de dudoso cobro','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='44' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='446')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'449','Deudores por operaciones en común','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='44' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='449')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'460','Anticipos de remuneraciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='46' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='460')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'465','Remuneraciones pendientes de pago','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='46' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='465')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'466','Remuneraciones mediante sistemas de aportación definida pendientes de pago','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='46' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='466')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'470','Hacienda Pública, deudora por diversos conceptos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='470')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'471','Organismos de la Seguridad Social, deudores','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='471')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'472','Hacienda Pública, IVA soportado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='472')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'473','Hacienda Pública, retenciones y pagos a cuenta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='473')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'474','Activos por impuesto diferido','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='474')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'475','Hacienda Pública, acreedora por conceptos fiscales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='475')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'476','Organismos de la Seguridad Social, acreedores','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='476')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'477','Hacienda Pública, IVA repercutido','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='477')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'479','Pasivos por diferencias temporarias imponibles','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='47' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='479')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'480','Gastos anticipados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='48' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='480')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'485','Ingresos anticipados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='48' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='485')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'490','Deterioro de valor de créditos por operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='49' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='490')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'493','Deterioro de valor de créditos por operaciones comerciales con partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='49' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='493')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'499','Provisiones por operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='49' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='499')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'500','Obligaciones y bonos a corto plazo Obligaciones y bonos convertibles a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='50' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='500')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'501','Acciones o participaciones a corto plazo consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='50' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='501')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'505','Deudas representadas en otros valores negociables a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='50' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='505')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'506','Intereses a corto plazo de empréstitos y otras emisiones análogas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='50' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='506')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'507','Dividendos de acciones o participaciones consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='50' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='507')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'509','Valores negociables amortizados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='50' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='509')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'510','Deudas a corto plazo con entidades de crédito vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='51' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='510')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'511','Proveedores de inmovilizado a corto plazo, partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='51' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='511')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'512','Acreedores por arrendamiento financiero a corto plazo, partes vinculadas.','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='51' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='512')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'513','Otras deudas a corto plazo con partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='51' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='513')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'514','Intereses a corto plazo de deudas con partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='51' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='514')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'520','Deudas a corto plazo con entidades de crédito','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='520')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'521','Deudas a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='521')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'522','Deudas a corto plazo transformables en subvenciones, donaciones y legados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='522')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'523','Proveedores de inmovilizado a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='523')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'524','Acreedores por arrendamiento financiero a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='524')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'525','Efectos a pagar a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='525')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'526','Dividendo activo a pagar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='526')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'527','Intereses a corto plazo de deudas con entidades de crédito','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='527')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'528','Intereses a corto plazo de deudas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='528')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'529','Provisiones a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='52' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='529')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'530','Participaciones a corto plazo en partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='53' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='530')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'531','Valores representativos de deuda a corto plazo de partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='53' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='531')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'532','Créditos a corto plazo a partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='53' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='532')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'533','Intereses a corto plazo de valores representativos de deuda de partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='53' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='533')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'534','Intereses a corto plazo de créditos a partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='53' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='534')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'535','Dividendo a cobrar de inversiones financieras en partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='53' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='535')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'539','Desembolsos pendientes sobre participaciones a corto plazo en partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='53' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='539')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'540','Inversiones financieras a corto plazo en instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='540')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'541','Valores representativos de deuda a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='541')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'542','Créditos a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='542')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'543','Créditos a corto plazo por enajenación de inmovilizado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='543')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'544','Créditos a corto plazo al personal','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='544')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'545','Dividendo a cobrar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='545')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'546','Intereses a corto plazo de valores representativos de deudas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='546')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'547','Intereses a corto plazo de créditos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='547')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'548','Imposiciones a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='548')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'549','Desembolsos pendientes sobre participaciones en el patrimonio neto a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='54' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='549')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'550','Titular de la explotación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='550')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'551','Cuenta corriente con socios y administradores','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='551')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'552','Cuenta corriente con otras personas y entidades vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='552')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'553','Cuentas corrientes en fusiones y escisiones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='553')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'554','Cuenta corriente con uniones temporales de empresas y comunidades de bienes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='554')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'555','Partidas pendientes de aplicación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='555')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'556','Desembolsos exigidos sobre participaciones en el patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='556')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'557','Dividendo activo a cuenta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='557')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'558','Socios por desembolsos exigidos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='558')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'559','Derivados financieros a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='55' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='559')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'560','Fianzas recibidas a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='56' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='560')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'561','Depósitos recibidos a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='56' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='561')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'565','Fianzas constituidas a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='56' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='565')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'566','Depósitos constituidos a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='56' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='566')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'567','Intereses pagados por anticipado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='56' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='567')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'568','Intereses cobrados por anticipado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='56' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='568')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'569','Garantías financieras a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='56' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='569')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'570','Caja, euros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='57' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='570')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'571','Caja, moneda extranjera','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='57' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='571')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'572','Bancos e instituciones de crédito c/c vista, euros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='57' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='572')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'573','Bancos e instituciones de crédito c/c vista, moneda extranjera','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='57' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='573')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'574','Bancos e instituciones de crédito, cuentas de ahorro, euros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='57' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='574')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'575','Bancos e instituciones de crédito, cuentas de ahorro, moneda extranjera','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='57' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='575')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'576','Inversiones a corto plazo de gran liquidez','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='57' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='576')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'580','Inmovilizado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='580')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'581','Inversiones con personas y entidades vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='581')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'582','Inversiones financieras','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='582')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'583','Existencias, deudores comerciales y otras cuentas a cobrar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='583')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'584','Otros activos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='584')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'585','Provisiones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='585')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'586','Deudas con características especiales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='586')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'587','Deudas con personas y entidades vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='587')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'588','Acreedores comerciales y otras cuentas a pagar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='588')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'589','Otros pasivos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='58' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='589')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'593','Deterioro de valor de participaciones a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='59' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='593')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'594','Deterioro de valor de valores representativos de deuda a corto plazo de partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='59' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='594')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'595','Deterioro de valor de créditos a corto plazo a partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='59' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='595')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'597','Deterioro de valor de valores representativos de deuda a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='59' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='597')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'598','Deterioro de valor de créditos a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='59' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='598')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'599','Deterioro de valor de activos no corrientes mantenidos para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='59' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='599')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'600','Compras de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='60' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='600')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'601','Compras de materias primas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='60' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='601')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'602','Compras de otros aprovisionamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='60' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='602')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'606','Descuentos sobre compras por pronto pago','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='60' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='606')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'607','Trabajos realizados por otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='60' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='607')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'608','Devoluciones de compras y operaciones similares','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='60' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='608')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'609','«Rappels» por compras','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='60' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='609')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'610','Variación de existencias de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='61' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='610')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'611','Variación de existencias de materias primas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='61' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='611')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'612','Variación de existencias de otros aprovisionamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='61' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='612')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'620','Gastos en investigación y desarrollo del ejercicio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='620')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'621','Arrendamientos y cánones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='621')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'622','Reparaciones y conservación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='622')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'623','Servicios de profesionales independientes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='623')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'624','Transportes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='624')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'625','Primas de seguros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='625')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'626','Servicios bancarios y similares','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='626')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'627','Publicidad, propaganda y relaciones públicas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='627')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'628','Suministros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='628')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'629','Otros servicios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='62' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='629')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'630','Impuesto sobre beneficios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='63' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='630')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'631','Otros tributos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='63' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='631')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'633','Ajustes negativos en la imposición sobre beneficios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='63' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='633')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'634','Ajustes negativos en la imposición indirecta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='63' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='634')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'636','Devolución de impuestos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='63' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='636')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'638','Ajustes positivos en la imposición sobre beneficios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='63' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='638')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'639','Ajustes positivos en la imposición indirecta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='63' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='639')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'640','Sueldos y salarios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='64' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='640')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'641','Indemnizaciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='64' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='641')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'642','Seguridad Social a cargo de la empresa','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='64' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='642')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'643','Retribuciones a largo plazo mediante sistemas de aportación definida','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='64' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='643')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'644','Retribuciones a largo plazo mediante sistemas de prestación definida','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='64' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='644')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'645','Retribuciones al personal mediante instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='64' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='645')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'649','Otros gastos sociales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='64' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='649')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'650','Pérdidas de créditos comerciales incobrables','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='65' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='650')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'651','Resultados de operaciones en común','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='65' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='651')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'659','Otras pérdidas en gestión corriente','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='65' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='659')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'660','Gastos financieros por actualización de provisiones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='660')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'661','Intereses de obligaciones y bonos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='661')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'662','Intereses de deudas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='662')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'663','Pérdidas por valoración de instrumentos financieros por su valor razonable','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='663')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'664','Gastos por dividendos de acciones o participaciones consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='664')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'665','Intereses por descuento de efectos y operaciones de «factoring»','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='665')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'666','Pérdidas en participaciones y valores representativos de deuda','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='666')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'667','Pérdidas de créditos no comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='667')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'668','Diferencias negativas de cambio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='668')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'669','Otros gastos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='66' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='669')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'670','Pérdidas procedentes del inmovilizado intangible','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='67' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='670')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'671','Pérdidas procedentes del inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='67' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='671')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'672','Pérdidas procedentes de las inversiones inmobiliarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='67' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='672')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'673','Pérdidas procedentes de participaciones a largo plazo en partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='67' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='673')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'675','Pérdidas por operaciones con obligaciones propias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='67' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='675')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'678','Gastos excepcionales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='67' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='678')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'680','Amortización del inmovilizado intangible','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='68' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='680')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'681','Amortización del inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='68' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='681')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'682','Amortización de las inversiones inmobiliarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='68' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='682')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'690','Pérdidas por deterioro del inmovilizado intangible','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='690')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'691','Pérdidas por deterioro del inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='691')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'692','Pérdidas por deterioro de las inversiones inmobiliarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='692')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'693','Pérdidas por deterioro de existencias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='693')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'694','Pérdidas por deterioro de créditos por operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='694')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'695','Dotación a la provisión por operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='695')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'696','Pérdidas por deterioro de participaciones y valores representativos de deuda a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='696')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'697','Pérdidas por deterioro de créditos a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='697')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'698','Pérdidas por deterioro de participaciones y valores representativos de deuda a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='698')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'699','Pérdidas por deterioro de créditos a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='69' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='699')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'700','Ventas de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='700')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'701','Ventas de productos terminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='701')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'702','Ventas de productos semiterminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='702')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'703','Ventas de subproductos y residuos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='703')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'704','Ventas de envases y embalajes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='704')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'705','Prestaciones de servicios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='705')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'706','Descuentos sobre ventas por pronto pago','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='706')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'708','Devoluciones de ventas y operaciones similares','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='708')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'709','«Rappels» sobre ventas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='70' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='709')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'710','Variación de existencias de productos en curso','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='71' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='710')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'711','Variación de existencias de productos semiterminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='71' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='711')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'712','Variación de existencias de productos terminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='71' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='712')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'713','Variación de existencias de subproductos, residuos y materiales recuperados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='71' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='713')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'730','Trabajos realizados para el inmovilizado intangible','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='73' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='730')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'731','Trabajos realizados para el inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='73' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='731')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'732','Trabajos realizados en inversiones inmobiliarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='73' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='732')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'733','Trabajos realizados para el inmovilizado material en curso','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='73' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='733')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'740','Subvenciones, donaciones y legados a la explotación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='74' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='740')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'746','Subvenciones, donaciones y legados de capital transferidos al resultado del ejercicio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='74' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='746')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'747','Otras subvenciones, donaciones y legados transferidos al resultado del ejercicio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='74' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='747')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'751','Resultados de operaciones en común','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='75' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='751')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'752','Ingresos por arrendamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='75' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='752')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'753','Ingresos de propiedad industrial cedida en explotación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='75' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='753')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'754','Ingresos por comisiones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='75' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='754')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'755','Ingresos por servicios al personal','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='75' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='755')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'759','Ingresos por servicios diversos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='75' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='759')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'760','Ingresos de participaciones en instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='76' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='760')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'761','Ingresos de valores representativos de deuda','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='76' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='761')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'762','Ingresos de créditos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='76' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='762')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'763','Beneficios por valoración de instrumentos financieros por su valor razonable','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='76' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='763')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'766','Beneficios en participaciones y valores representativos de deuda','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='76' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='766')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'767','Ingresos de activos afectos y de derechos de reembolso relativos a retribuciones a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='76' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='767')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'768','Diferencias positivas de cambio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='76' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='768')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'769','Otros ingresos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='76' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='769')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'770','Beneficios procedentes del inmovilizado intangible','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='77' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='770')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'771','Beneficios procedentes del inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='77' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='771')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'772','Beneficios procedentes de las inversiones inmobiliarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='77' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='772')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'773','Beneficios procedentes de participaciones a largo plazo en partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='77' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='773')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'774','Diferencia negativa en combinaciones de negocios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='77' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='774')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'775','Beneficios por operaciones con obligaciones propias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='77' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='775')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'778','Ingresos excepcionales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='77' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='778')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'790','Reversión del deterioro del inmovilizado intangible','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='790')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'791','Reversión del deterioro del inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='791')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'792','Reversión del deterioro de las inversiones inmobiliarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='792')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'793','Reversión del deterioro de existencias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='793')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'794','Reversión del deterioro de créditos por operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='794')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'795','Exceso de provisiones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='795')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'796','Reversión del deterioro de participaciones y valores representativos de deuda a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='796')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'797','Reversión del deterioro de créditos a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='797')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'798','Reversión del deterioro de participaciones y valores representativos de deuda a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='798')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'799','Reversión del deterioro de créditos a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='79' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='799')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'800','Pérdidas de activos financieros a valor razonable con cambios en el patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='80' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='800')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'802','Transferencia de beneficios en activos financieros a valor razonable con cambios en el patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='80' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='802')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'810','Pérdidas por coberturas de flujos de efectivo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='81' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='810')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'811','Pérdidas por coberturas de inversiones netas en un negocio en el extranjero','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='81' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='811')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'812','Transferencia de beneficios por coberturas de flujos de efectivo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='81' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='812')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'813','Transferencia de beneficios por coberturas de inversiones netas en un negocio en el extranjero','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='81' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='813')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'820','Diferencias de conversión negativas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='82' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='820')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'821','Transferencia de diferencias de conversión positivas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='82' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='821')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'830','Impuesto sobre beneficios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='83' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='830')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'833','Ajustes negativos en la imposición sobre beneficios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='83' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='833')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'834','Ingresos fiscales por diferencias permanentes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='83' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='834')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'835','Ingresos fiscales por deducciones y bonificaciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='83' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='835')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'836','Transferencia de diferencias permanentes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='83' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='836')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'837','Transferencia de deducciones y bonificaciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='83' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='837')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'838','Ajustes positivos en la imposición sobre beneficios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='83' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='838')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'840','Transferencia de subvenciones oficiales de capital','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='84' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='840')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'841','Transferencia de donaciones y legados de capital','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='84' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='841')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'842','Transferencia de otras subvenciones, donaciones y legados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='84' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='842')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'850','Pérdidas actuariales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='85' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='850')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'851','Ajustes negativos en activos por retribuciones a largo plazo de prestación definida','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='85' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='851')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'860','Pérdidas en activos no corrientes y grupos enajenables de elementos mantenidos para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='86' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='860')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'862','Transferencia de beneficios en activos no corrientes y grupos enajenables de elementos mantenidos para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='86' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='862')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'891','Deterioro de participaciones en el patrimonio, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='89' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='891')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'892','Deterioro de participaciones en el patrimonio, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='89' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='892')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'900','Beneficios en activos financieros a valor razonable con cambios en el patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='90' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='900')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'902','Transferencia de pérdidas de activos financieros a valor razonable con cambios en el patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='90' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='902')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'910','Beneficios por coberturas de flujos de efectivo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='91' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='910')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'911','Beneficios por coberturas de una inversión neta en un negocio en el extranjero','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='91' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='911')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'912','Transferencia de pérdidas por coberturas de flujos de efectivo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='91' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='912')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'913','Transferencia de pérdidas por coberturas de una inversión neta en un negocio en el extranjero','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='91' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='913')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'920','Diferencias de conversión positivas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='92' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='920')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'921','Transferencia de diferencias de conversión negativas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='92' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='921')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'940','Ingresos de subvenciones oficiales de capital','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='94' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='940')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'941','Ingresos de donaciones y legados de capital','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='94' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='941')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'942','Ingresos de otras subvenciones, donaciones y legados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='94' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='942')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'950','Ganancias actuariales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='95' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='950')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'951','Ajustes positivos en activos por retribuciones a largo plazo de prestación definida','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='95' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='951')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'960','Beneficios en activos no corrientes y grupos enajenables de elementos mantenidos para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='96' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='960')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'962','Transferencia de pérdidas en activos no corrientes y grupos enajenables de elementos mantenidos para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='96' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='962')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'991','Recuperación de ajustes valorativos negativos previos, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='99' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='991')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'992','Recuperación de ajustes valorativos negativos previos, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='99' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='992')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'993','Transferencia por deterioro de ajustes valorativos negativos previos, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='99' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='993')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'994','Transferencia por deterioro de ajustes valorativos negativos previos, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='99' AND p.kind='account'
WHERE c.subaccount_length > 3 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='994')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1030','Socios por desembolsos no exigidos, capital social','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='103' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1030')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1034','Socios por desembolsos no exigidos, capital pendiente de inscripción','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='103' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1034')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1040','Socios por aportaciones no dinerarias pendientes, capital social','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='104' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1040')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1044','Socios por aportaciones no dinerarias pendientes, capital pendiente de inscripción','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='104' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1044')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1110','Patrimonio neto por emisión de instrumentos financieros compuestos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='111' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1110')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1111','Resto de instrumentos de patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='111' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1111')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1140','Reservas para acciones o participaciones de la sociedad dominante','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='114' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1140')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1142','Reserva por capital amortizado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='114' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1142')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1143','Reserva por fondo de comercio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='114' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1143')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1144','Reservas por acciones propias aceptadas en garantía','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='114' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1144')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1340','Cobertura de flujos de efectivo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='134' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1340')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1341','Cobertura de una inversión neta en un negocio en el extranjero','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='134' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1341')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1370','Ingresos fiscales por diferencias permanentes a distribuir en varios ejercicios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='137' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1370')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1371','Ingresos fiscales por deducciones y bonificaciones a distribuir en varios ejercicios','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='137' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1371')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1533','Desembolsos no exigidos, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='153' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1533')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1534','Desembolsos no exigidos, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='153' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1534')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1535','Desembolsos no exigidos, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='153' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1535')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1536','Otros desembolsos no exigidos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='153' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1536')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1543','Aportaciones no dinerarias pendientes, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='154' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1543')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1544','Aportaciones no dinerarias pendientes, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='154' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1544')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1545','Aportaciones no dinerarias pendientes, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='154' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1545')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1546','Otras aportaciones no dinerarias pendientes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='154' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1546')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1603','Deudas a largo plazo con entidades de crédito, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='160' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1603')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1604','Deudas a largo plazo con entidades de crédito, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='160' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1604')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1605','Deudas a largo plazo con otras entidades de crédito vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='160' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1605')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1613','Proveedores de inmovilizado a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='161' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1613')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1614','Proveedores de inmovilizado a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='161' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1614')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1615','Proveedores de inmovilizado a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='161' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1615')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1623','Acreedores por arrendamiento financiero a largo plazo, empresas de grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='162' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1623')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1624','Acreedores por arrendamiento financiero a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='162' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1624')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1625','Acreedores por arrendamiento financiero a largo plazo, otras partes vinculadas.','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='162' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1625')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1633','Otras deudas a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='163' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1633')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1634','Otras deudas a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='163' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1634')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1635','Otras deudas a largo plazo, con otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='163' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1635')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1765','Pasivos por derivados financieros a largo plazo, cartera de negociación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='176' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1765')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'1768','Pasivos por derivados financieros a largo plazo, instrumentos de cobertura','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='176' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='1768')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2403','Participaciones a largo plazo en empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='240' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2403')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2404','Participaciones a largo plazo en empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='240' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2404')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2405','Participaciones a largo plazo en otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='240' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2405')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2413','Valores representativos de deuda a largo plazo de empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='241' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2413')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2414','Valores representativos de deuda a largo plazo de empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='241' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2414')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2415','Valores representativos de deuda a largo plazo de otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='241' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2415')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2423','Créditos a largo plazo a empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='242' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2423')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2424','Créditos a largo plazo a empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='242' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2424')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2425','Créditos a largo plazo a otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='242' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2425')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2493','Desembolsos pendientes sobre participaciones a largo plazo en empresas del grupo.','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='249' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2493')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2494','Desembolsos pendientes sobre participaciones a largo plazo en empresas asociadas.','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='249' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2494')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2495','Desembolsos pendientes sobre participaciones a largo plazo en otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='249' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2495')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2550','Activos por derivados financieros a largo plazo, cartera de negociación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='255' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2550')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2553','Activos por derivados financieros a largo plazo, instrumentos de cobertura','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='255' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2553')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2800','Amortización acumulada de investigación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='280' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2800')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2801','Amortización acumulada de desarrollo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='280' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2801')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2802','Amortización acumulada de concesiones administrativas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='280' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2802')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2803','Amortización acumulada de propiedad industrial','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='280' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2803')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2804','Amortización acumulada de fondo de comercio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='280' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2804')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2805','Amortización acumulada de derechos de traspaso','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='280' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2805')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2806','Amortización acumulada de aplicaciones informáticas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='280' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2806')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2811','Amortización acumulada de construcciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2811')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2812','Amortización acumulada de instalaciones técnicas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2812')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2813','Amortización acumulada de maquinaria','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2813')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2814','Amortización acumulada de utillaje','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2814')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2815','Amortización acumulada de otras instalaciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2815')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2816','Amortización acumulada de mobiliario','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2816')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2817','Amortización acumulada de equipos para procesos de información','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2817')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2818','Amortización acumulada de elementos de transporte','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2818')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2819','Amortización acumulada de otro inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='281' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2819')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2900','Deterioro de valor de investigación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='290' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2900')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2901','Deterioro del valor de desarrollo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='290' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2901')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2902','Deterioro de valor de concesiones administrativas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='290' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2902')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2903','Deterioro de valor de propiedad industrial','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='290' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2903')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2905','Deterioro de valor de derechos de traspaso','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='290' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2905')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2906','Deterioro de valor de aplicaciones informáticas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='290' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2906')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2910','Deterioro de valor de terrenos y bienes naturales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2910')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2911','Deterioro de valor de construcciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2911')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2912','Deterioro de valor de instalaciones técnicas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2912')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2913','Deterioro de valor de maquinaria','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2913')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2914','Deterioro de valor de utillaje','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2914')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2915','Deterioro de valor de otras instalaciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2915')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2916','Deterioro de valor de mobiliario','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2916')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2917','Deterioro de valor de equipos para procesos de información','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2917')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2918','Deterioro de valor de elementos de transporte','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2918')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2919','Deterioro de valor de otro inmovilizado material','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='291' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2919')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2920','Deterioro de valor de los terrenos y bienes naturales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='292' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2920')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2921','Deterioro de valor de construcciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='292' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2921')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2933','Deterioro de valor de participaciones a largo plazo en empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='293' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2933')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2934','Deterioro de valor de participaciones a largo plazo en empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='293' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2934')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2935','Deterioro de valor de participaciones a largo plazo en otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='293' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2935')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2936','Deterioro de valor de participaciones a largo plazo en otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='293' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2936')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2943','Deterioro de valor de valores representativos de deuda a largo plazo de empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='294' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2943')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2944','Deterioro de valor de valores representativos de deuda a largo plazo de empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='294' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2944')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2945','Deterioro de valor de valores representativos de deuda a largo plazo de otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='294' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2945')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2953','Deterioro de valor de créditos a largo plazo a empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='295' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2953')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2954','Deterioro de valor de créditos a largo plazo a empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='295' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2954')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'2955','Deterioro de valor de créditos a largo plazo a otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='295' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='2955')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4000','Proveedores (euros)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='400' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4000')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4004','Proveedores (moneda extranjera)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='400' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4004')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4009','Proveedores, facturas pendientes de recibir o de formalizar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='400' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4009')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4030','Proveedores, empresas del grupo (euros)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='403' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4030')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4031','Efectos comerciales a pagar, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='403' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4031')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4034','Proveedores, empresas del grupo (moneda extranjera)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='403' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4034')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4036','Envases y embalajes a devolver a proveedores, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='403' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4036')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4039','Proveedores, empresas del grupo, facturas pendientes de recibir o de formalizar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='403' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4039')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4100','Acreedores por prestaciones de servicios (euros)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='410' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4100')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4104','Acreedores por prestaciones de servicios, (moneda extranjera)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='410' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4104')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4109','Acreedores por prestaciones de servicios, facturas pendientes de recibir o de formalizar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='410' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4109')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4300','Clientes (euros)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='430' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4300')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4304','Clientes (moneda extranjera)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='430' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4304')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4309','Clientes, facturas pendientes de formalizar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='430' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4309')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4310','Efectos comerciales en cartera','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='431' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4310')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4311','Efectos comerciales descontados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='431' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4311')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4312','Efectos comerciales en gestión de cobro','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='431' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4312')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4315','Efectos comerciales impagados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='431' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4315')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4330','Clientes empresas del grupo (euros)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='433' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4330')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4331','Efectos comerciales a cobrar, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='433' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4331')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4332','Clientes empresas del grupo, operaciones de «factoring»','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='433' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4332')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4334','Clientes empresas del grupo (moneda extranjera)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='433' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4334')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4336','Clientes empresas del grupo de dudoso cobro','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='433' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4336')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4337','Envases y embalajes a devolver a clientes, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='433' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4337')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4339','Clientes empresas del grupo, facturas pendientes de formalizar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='433' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4339')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4400','Deudores (euros)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='440' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4400')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4404','Deudores (moneda extranjera)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='440' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4404')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4409','Deudores, facturas pendientes de formalizar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='440' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4409')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4410','Deudores, efectos comerciales en cartera','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='441' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4410')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4411','Deudores, efectos comerciales descontados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='441' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4411')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4412','Deudores, efectos comerciales en gestión de cobro','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='441' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4412')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4415','Deudores, efectos comerciales impagados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='441' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4415')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4700','Hacienda Pública, deudora por IVA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='470' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4700')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4708','Hacienda Pública, deudora por subvenciones concedidas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='470' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4708')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4709','Hacienda Pública, deudora por devolución de impuestos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='470' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4709')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4740','Activos por diferencias temporarias deducibles','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='474' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4740')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4742','Derechos por deducciones y bonificaciones pendientes de aplicar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='474' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4742')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4745','Crédito por pérdidas a compensar del ejercicio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='474' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4745')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4750','Hacienda Pública, acreedora por IVA','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='475' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4750')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4751','Hacienda Pública, acreedora por retenciones practicadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='475' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4751')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4752','Hacienda Pública, acreedora por impuesto sobre sociedades','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='475' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4752')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4758','Hacienda Pública, acreedora por subvenciones a reintegrar','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='475' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4758')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4933','Deterioro de valor de créditos por operaciones comerciales con empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='493' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4933')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4934','Deterioro de valor de créditos por operaciones comerciales con empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='493' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4934')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4935','Deterioro de valor de créditos por operaciones comerciales con otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='493' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4935')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4994','Provisión por contratos onerosos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='499' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4994')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'4999','Provisión para otras operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='499' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='4999')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5090','Obligaciones y bonos amortizados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='509' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5090')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5091','Obligaciones y bonos convertibles amortizados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='509' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5091')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5095','Otros valores negociables amortizados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='509' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5095')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5103','Deudas a corto plazo con entidades de crédito, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='510' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5103')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5104','Deudas a corto plazo con entidades de crédito, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='510' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5104')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5105','Deudas a corto plazo con otras entidades de crédito vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='510' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5105')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5113','Proveedores de inmovilizado a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='511' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5113')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5114','Proveedores de inmovilizado a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='511' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5114')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5115','Proveedores de inmovilizado a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='511' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5115')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5123','Acreedores por arrendamiento financiero a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='512' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5123')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5124','Acreedores por arrendamiento financiero a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='512' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5124')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5125','Acreedores por arrendamiento financiero a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='512' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5125')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5133','Otras deudas a corto plazo con empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='513' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5133')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5134','Otras deudas a corto plazo con empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='513' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5134')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5135','Otras deudas a corto plazo con otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='513' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5135')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5143','Intereses a corto plazo de deudas, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='514' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5143')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5144','Intereses a corto plazo de deudas, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='514' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5144')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5145','Intereses a corto plazo de deudas, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='514' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5145')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5200','Préstamos a corto plazo de entidades de crédito','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='520' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5200')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5201','Deudas a corto plazo por crédito dispuesto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='520' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5201')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5208','Deudas por efectos descontados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='520' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5208')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5209','Deudas por operaciones de «factoring»','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='520' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5209')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5290','Provisión a corto plazo por retribuciones al personal','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='529' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5290')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5291','Provisión a corto plazo para impuestos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='529' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5291')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5292','Provisión a corto plazo para otras responsabilidades','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='529' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5292')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5293','Provisión a corto plazo por desmantelamiento, retiro o rehabilitación del inmovilizado','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='529' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5293')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5295','Provisión a corto plazo para actuaciones medioambientales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='529' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5295')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5296','Provisión a corto plazo para reestructuraciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='529' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5296')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5297','Provisión a corto plazo por transacciones con pagos basados en instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='529' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5297')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5303','Participaciones a corto plazo, en empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='530' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5303')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5304','Participaciones a corto plazo, en empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='530' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5304')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5305','Participaciones a corto plazo, en otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='530' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5305')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5313','Valores representativos de deuda a corto plazo de empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='531' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5313')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5314','Valores representativos de deuda a corto plazo de empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='531' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5314')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5315','Valores representativos de deuda a corto plazo de otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='531' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5315')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5323','Créditos a corto plazo a empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='532' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5323')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5324','Créditos a corto plazo a empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='532' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5324')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5325','Créditos a corto plazo a otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='532' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5325')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5333','Intereses a corto plazo de valores representativos de deuda de empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='533' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5333')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5334','Intereses a corto plazo de valores representativos de deuda de empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='533' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5334')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5335','Intereses a corto plazo de valores representativos de deuda de otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='533' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5335')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5343','Intereses a corto plazo de créditos a empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='534' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5343')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5344','Intereses a corto plazo de créditos a empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='534' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5344')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5345','Intereses a corto plazo de créditos a otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='534' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5345')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5353','Dividendo a cobrar de empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='535' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5353')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5354','Dividendo a cobrar de empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='535' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5354')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5355','Dividendo a cobrar de otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='535' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5355')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5393','Desembolsos pendientes sobre participaciones a corto plazo en empresas del grupo.','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='539' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5393')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5394','Desembolsos pendientes sobre participaciones a corto plazo en empresas asociadas.','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='539' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5394')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5395','Desembolsos pendientes sobre participaciones a corto plazo en otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='539' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5395')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5523','Cuenta corriente con empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='552' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5523')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5524','Cuenta corriente con empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='552' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5524')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5525','Cuenta corriente con otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='552' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5525')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5530','Socios de sociedad disuelta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='553' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5530')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5531','Socios, cuenta de fusión','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='553' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5531')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5532','Socios de sociedad escindida','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='553' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5532')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5533','Socios, cuenta de escisión','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='553' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5533')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5563','Desembolsos exigidos sobre participaciones, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='556' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5563')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5564','Desembolsos exigidos sobre participaciones, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='556' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5564')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5565','Desembolsos exigidos sobre participaciones, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='556' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5565')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5566','Desembolsos exigidos sobre participaciones de otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='556' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5566')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5580','Socios por desembolsos exigidos sobre acciones o participaciones ordinarias','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='558' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5580')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5585','Socios por desembolsos exigidos sobre acciones o participaciones consideradas como pasivos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='558' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5585')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5590','Activos por derivados financieros a corto plazo, cartera de negociación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='559' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5590')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5593','Activos por derivados financieros a corto plazo, instrumentos de cobertura','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='559' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5593')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5595','Pasivos por derivados financieros a corto plazo, cartera de negociación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='559' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5595')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5598','Pasivos por derivados financieros a corto plazo, instrumentos de cobertura','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='559' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5598')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5933','Deterioro de valor de participaciones a corto plazo en empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='593' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5933')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5934','Deterioro de valor de participaciones a corto plazo en empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='593' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5934')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5935','Deterioro de valor de participaciones a corto plazo en otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='593' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5935')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5936','Deterioro de valor de participaciones a corto plazo en otras empresas.','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='593' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5936')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5943','Deterioro de valor de valores representativos de deuda a corto plazo de empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='594' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5943')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5944','Deterioro de valor de valores representativos de deuda a corto plazo de empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='594' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5944')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5945','Deterioro de valor de valores representativos de deuda a corto plazo de otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='594' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5945')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5953','Deterioro de valor de créditos a corto plazo a empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='595' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5953')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5954','Deterioro de valor de créditos a corto plazo a empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='595' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5954')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5955','Deterioro de valor de créditos a corto plazo a otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='595' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5955')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5990','Deterioro de valor de inmovilizado no corriente mantenido para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='599' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5990')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5991','Deterioro de valor de inversiones con personas y entidades vinculadas no corrientes mantenidas para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='599' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5991')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5992','Deterioro de valor de inversiones financieras no corrientes mantenidas para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='599' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5992')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5993','Deterioro de valor de existencias, deudores comerciales y otras cuentas a cobrar integrados en un grupo enajenable mantenido para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='599' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5993')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'5994','Deterioro de valor de otros activos mantenidos para la venta','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='599' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='5994')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6060','Descuentos sobre compras por pronto pago de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='606' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6060')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6061','Descuentos sobre compras por pronto pago de materias primas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='606' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6061')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6062','Descuentos sobre compras por pronto pago de otros aprovisionamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='606' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6062')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6080','Devoluciones de compras de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='608' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6080')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6081','Devoluciones de compras de materias primas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='608' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6081')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6082','Devoluciones de compras de otros aprovisionamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='608' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6082')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6090','«Rappels» por compras de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='609' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6090')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6091','«Rappels» por compras de materias primas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='609' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6091')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6092','«Rappels» por compras de otros aprovisionamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='609' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6092')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6300','Impuesto corriente','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='630' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6300')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6301','Impuesto diferido','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='630' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6301')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6341','Ajustes negativos en IVA de activo corriente','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='634' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6341')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6342','Ajustes negativos en IVA de inversiones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='634' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6342')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6391','Ajustes positivos en IVA de activo corriente','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='639' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6391')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6392','Ajustes positivos en IVA de inversiones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='639' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6392')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6440','Contribuciones anuales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='644' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6440')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6442','Otros costes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='644' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6442')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6450','Retribuciones al personal liquidados con instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='645' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6450')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6457','Retribuciones al personal liquidados en efectivo basado en instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='645' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6457')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6510','Beneficio transferido (gestor)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='651' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6510')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6511','Pérdida soportada (partícipe o asociado no gestor)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='651' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6511')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6610','Intereses de obligaciones y bonos a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='661' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6610')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6611','Intereses de obligaciones y bonos a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='661' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6611')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6612','Intereses de obligaciones y bonos a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='661' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6612')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6613','Intereses de obligaciones y bonos a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='661' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6613')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6615','Intereses de obligaciones y bonos a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='661' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6615')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6616','Intereses de obligaciones y bonos a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='661' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6616')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6617','Intereses de obligaciones y bonos a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='661' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6617')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6618','Intereses de obligaciones y bonos a corto plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='661' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6618')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6620','Intereses de deudas, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='662' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6620')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6621','Intereses de deudas, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='662' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6621')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6622','Intereses de deudas, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='662' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6622')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6623','Intereses de deudas con entidades de crédito','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='662' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6623')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6624','Intereses de deudas, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='662' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6624')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6630','Pérdidas de cartera de negociación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='663' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6630')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6631','Pérdidas de designados por la empresa','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='663' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6631')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6632','Pérdidas de activos financieros a valor razonable con cambios en el patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='663' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6632')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6633','Pérdidas de instrumentos de cobertura','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='663' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6633')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6634','Pérdidas de otros instrumentos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='663' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6634')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6640','Dividendos de pasivos, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='664' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6640')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6641','Dividendos de pasivos, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='664' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6641')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6642','Dividendos de pasivos, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='664' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6642')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6643','Dividendos de pasivos, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='664' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6643')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6650','Intereses por descuento de efectos en entidades de crédito del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='665' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6650')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6651','Intereses por descuento de efectos en entidades de crédito asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='665' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6651')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6652','Intereses por descuento de efectos en otras entidades de crédito vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='665' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6652')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6653','Intereses por descuento de efectos en otras entidades de crédito','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='665' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6653')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6654','Intereses por operaciones de «factoring» con entidades de crédito del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='665' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6654')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6657','Intereses por operaciones de «factoring» con otras entidades de crédito','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='665' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6657')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6660','Pérdidas en valores representativos de deuda a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='666' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6660')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6661','Pérdidas en valores representativos de deuda a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='666' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6661')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6662','Pérdidas en valores representativos de deuda a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='666' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6662')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6663','Pérdidas en participaciones y valores representativos de deuda a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='666' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6663')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6665','Pérdidas en participaciones y valores representativos de deuda a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='666' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6665')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6666','Pérdidas en participaciones y valores representativos de deuda a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='666' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6666')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6667','Pérdidas en valores representativos de deuda a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='666' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6667')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6668','Pérdidas en valores representativos de deuda a corto plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='666' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6668')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6670','Pérdidas de créditos a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='667' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6670')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6671','Pérdidas de créditos a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='667' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6671')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6672','Pérdidas de créditos a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='667' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6672')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6673','Pérdidas de créditos a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='667' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6673')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6675','Pérdidas de créditos a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='667' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6675')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6676','Pérdidas de créditos a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='667' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6676')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6677','Pérdidas de créditos a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='667' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6677')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6678','Pérdidas de créditos a corto plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='667' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6678')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6733','Pérdidas procedentes de participaciones a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='673' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6733')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6734','Pérdidas procedentes de participaciones a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='673' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6734')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6735','Pérdidas procedentes de participaciones a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='673' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6735')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6930','Pérdidas por deterioro de productos terminados y en curso de fabricación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='693' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6930')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6931','Pérdidas por deterioro de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='693' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6931')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6932','Pérdidas por deterioro de materias primas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='693' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6932')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6933','Pérdidas por deterioro de otros aprovisionamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='693' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6933')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6954','Dotación a la provisión por contratos onerosos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='695' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6954')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6959','Dotación a la provisión para otras operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='695' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6959')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6960','Pérdidas por deterioro de participaciones en instrumentos de patrimonio neto a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='696' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6960')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6961','Pérdidas por deterioro de participaciones en instrumentos de patrimonio neto a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='696' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6961')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6962','Pérdidas por deterioro de participaciones en instrumentos de patrimonio neto a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='696' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6962')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6963','Pérdidas por deterioro de participaciones en instrumentos de patrimonio neto a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='696' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6963')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6965','Pérdidas por deterioro en valores representativos de deuda a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='696' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6965')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6966','Pérdidas por deterioro en valores representativos de deuda a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='696' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6966')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6967','Pérdidas por deterioro en valores representativos de deuda a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='696' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6967')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6968','Pérdidas por deterioro en valores representativos de deuda a largo plazo, de otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='696' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6968')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6970','Pérdidas por deterioro de créditos a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='697' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6970')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6971','Pérdidas por deterioro de créditos a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='697' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6971')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6972','Pérdidas por deterioro de créditos a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='697' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6972')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6973','Pérdidas por deterioro de créditos a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='697' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6973')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6980','Pérdidas por deterioro de participaciones en instrumentos de patrimonio neto a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='698' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6980')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6981','Pérdidas por deterioro de participaciones en instrumentos de patrimonio neto a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='698' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6981')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6985','Pérdidas por deterioro en valores representativos de deuda a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='698' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6985')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6986','Pérdidas por deterioro en valores representativos de deuda a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='698' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6986')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6987','Pérdidas por deterioro en valores representativos de deuda a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='698' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6987')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6988','Pérdidas por deterioro en valores representativos de deuda a corto plazo, de otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='698' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6988')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6990','Pérdidas por deterioro de créditos a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='699' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6990')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6991','Pérdidas por deterioro de créditos a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='699' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6991')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6992','Pérdidas por deterioro de créditos a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='699' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6992')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'6993','Pérdidas por deterioro de créditos a corto plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='699' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='6993')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7060','Descuentos sobre ventas por pronto pago de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='706' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7060')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7061','Descuentos sobre ventas por pronto pago de productos terminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='706' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7061')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7062','Descuentos sobre ventas por pronto pago de productos semiterminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='706' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7062')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7063','Descuentos sobre ventas por pronto pago de subproductos y residuos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='706' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7063')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7080','Devoluciones de ventas de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='708' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7080')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7081','Devoluciones de ventas de productos terminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='708' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7081')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7082','Devoluciones de ventas de productos semiterminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='708' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7082')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7083','Devoluciones de ventas de subproductos y residuos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='708' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7083')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7084','Devoluciones de ventas de envases y embalajes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='708' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7084')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7090','«Rappels» sobre ventas de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='709' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7090')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7091','«Rappels» sobre ventas de productos terminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='709' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7091')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7092','«Rappels» sobre ventas de productos semiterminados','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='709' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7092')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7093','«Rappels» sobre ventas de subproductos y residuos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='709' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7093')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7094','«Rappels» sobre ventas de envases y embalajes','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='709' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7094')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7510','Pérdida transferida (gestor)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='751' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7510')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7511','Beneficio atribuido (partícipe o asociado no gestor)','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='751' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7511')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7600','Ingresos de participaciones en instrumentos de patrimonio, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='760' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7600')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7601','Ingresos de participaciones en instrumentos de patrimonio, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='760' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7601')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7602','Ingresos de participaciones en instrumentos de patrimonio, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='760' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7602')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7603','Ingresos de participaciones en instrumentos de patrimonio, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='760' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7603')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7610','Ingresos de valores representativos de deuda, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='761' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7610')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7611','Ingresos de valores representativos de deuda, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='761' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7611')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7612','Ingresos de valores representativos de deuda, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='761' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7612')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7613','Ingresos de valores representativos de deuda, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='761' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7613')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7620','Ingresos de créditos a largo plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='762' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7620')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7621','Ingresos de créditos a corto plazo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='762' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7621')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7630','Beneficios de cartera de negociación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='763' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7630')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7631','Beneficios de designados por la empresa','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='763' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7631')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7632','Beneficios de activos financieros a valor razonable con cambios en el patrimonio neto','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='763' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7632')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7633','Beneficios de instrumentos de cobertura','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='763' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7633')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7634','Beneficios de otros instrumentos financieros','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='763' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7634')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7660','Beneficios en valores representativos de deuda a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='766' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7660')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7661','Beneficios en valores representativos de deuda a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='766' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7661')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7662','Beneficios en valores representativos de deuda a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='766' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7662')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7663','Beneficios en participaciones y valores representativos de deuda a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='766' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7663')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7665','Beneficios en participaciones y valores representativos de deuda a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='766' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7665')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7666','Beneficios en participaciones y valores representativos de deuda a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='766' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7666')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7667','Beneficios en valores representativos de deuda a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='766' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7667')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7668','Beneficios en valores representativos de deuda a corto plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='766' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7668')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7733','Beneficios procedentes de participaciones a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='773' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7733')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7734','Beneficios procedentes de participaciones a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='773' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7734')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7735','Beneficios procedentes de participaciones a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='773' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7735')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7930','Reversión del deterioro de productos terminados y en curso de fabricación','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='793' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7930')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7931','Reversión del deterioro de mercaderías','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='793' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7931')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7932','Reversión del deterioro de materias primas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='793' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7932')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7933','Reversión del deterioro de otros aprovisionamientos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='793' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7933')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7950','Exceso de provisión por retribuciones al personal','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='795' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7950')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7951','Exceso de provisión para impuestos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='795' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7951')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7952','Exceso de provisión para otras responsabilidades','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='795' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7952')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7954','Exceso de provisión por operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='795' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7954')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7955','Exceso de provisión para actuaciones medioambientales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='795' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7955')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7956','Exceso de provisión para reestructuraciones','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='795' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7956')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7957','Exceso de provisión por transacciones con pagos basados en instrumentos de patrimonio','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='795' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7957')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7960','Reversión del deterioro de participaciones en instrumentos de patrimonio neto a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='796' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7960')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7961','Reversión del deterioro de participaciones en instrumentos de patrimonio neto a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='796' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7961')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7965','Reversión del deterioro de valores representativos de deuda a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='796' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7965')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7966','Reversión del deterioro de valores representativos de deuda a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='796' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7966')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7967','Reversión del deterioro de valores representativos de deuda a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='796' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7967')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7968','Reversión del deterioro de valores representativos de deuda a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='796' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7968')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7970','Reversión del deterioro de créditos a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='797' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7970')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7971','Reversión del deterioro de créditos a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='797' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7971')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7972','Reversión del deterioro de créditos a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='797' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7972')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7973','Reversión del deterioro de créditos a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='797' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7973')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7980','Reversión del deterioro de participaciones en instrumentos de patrimonio neto a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='798' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7980')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7981','Reversión del deterioro de participaciones en instrumentos de patrimonio neto a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='798' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7981')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7985','Reversión del deterioro en valores representativos de deuda a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='798' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7985')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7986','Reversión del deterioro en valores representativos de deuda a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='798' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7986')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7987','Reversión del deterioro en valores representativos de deuda a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='798' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7987')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7988','Reversión del deterioro en valores representativos de deuda a corto plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='798' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7988')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7990','Reversión del deterioro de créditos a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='799' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7990')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7991','Reversión del deterioro de créditos a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='799' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7991')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7992','Reversión del deterioro de créditos a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='799' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7992')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'7993','Reversión del deterioro de créditos a corto plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='799' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='7993')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'8300','Impuesto corriente','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='830' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='8300')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'8301','Impuesto diferido','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='830' AND p.kind='account'
WHERE c.subaccount_length > 4 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='8301')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76200','Ingresos de créditos a largo plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7620' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76200')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76201','Ingresos de créditos a largo plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7620' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76201')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76202','Ingresos de créditos a largo plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7620' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76202')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76203','Ingresos de créditos a largo plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7620' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76203')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76210','Ingresos de créditos a corto plazo, empresas del grupo','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7621' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76210')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76211','Ingresos de créditos a corto plazo, empresas asociadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7621' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76211')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76212','Ingresos de créditos a corto plazo, otras partes vinculadas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7621' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76212')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'76213','Ingresos de créditos a corto plazo, otras empresas','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7621' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='76213')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'79544','Exceso de provisión por contratos onerosos','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7954' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='79544')
-- statement
INSERT INTO accounts(company_id,code,description,kind,parent_id)
SELECT c.id,'79549','Exceso de provisión para otras operaciones comerciales','account',p.id FROM companies c
JOIN accounts p ON p.company_id=c.id AND p.code='7954' AND p.kind='account'
WHERE c.subaccount_length > 5 AND NOT EXISTS(SELECT 1 FROM accounts a WHERE a.company_id=c.id AND a.code='79549')
