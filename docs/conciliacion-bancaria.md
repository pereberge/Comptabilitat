# Conciliación bancaria

Selecciona empresa y ejercicio y abre **Conciliación bancaria → Subir extracto**. Elige un PDF con texto o un CSV (hasta 5 MB) y pulsa **Detectar banco y movimientos**. Revisa el banco, el IBAN y la subcuenta sugerida. Puedes seleccionar una subcuenta bancaria de la empresa o **Crear una subcuenta nueva para este banco**. Si el archivo no identifica el banco, la subcuenta existente o un nombre introducido manualmente permiten identificarlo.

**Preparar conciliación** muestra las coincidencias, las propuestas y las diferencias pendientes antes de guardar. **Guardar conciliación** conserva el documento y el análisis; si hace falta, crea la subcuenta 5720 de la longitud configurada. No registra asientos, saldos de apertura, facturas ni cobros o pagos. La vinculación entre IBAN y subcuenta se recuerda por empresa para futuras cargas.

Los informes se filtran por empresa y ejercicio. Si un extracto abarca varios años, se valida toda la cadena de saldos, pero el informe utiliza únicamente los movimientos del ejercicio seleccionado. El documento original completo se conserva con su SHA-256. Repetir la misma carga en ese ejercicio abre el informe ya guardado y evita duplicar el banco o el documento. Los informes originales se conservan: si la contabilidad ha cambiado, se indica que hay que revisar las propuestas; abrir de nuevo un documento repetido no sustituye el análisis guardado.

## Formatos

Se han verificado los PDF de movimientos de CaixaBankNow y Cajamar. El adaptador de tablas admite fechas numéricas o meses en catalán/castellano, importes con signo, saldo por movimiento, conceptos multilínea, fechas valor y orden ascendente o descendente. Otros PDF con esas columnas pueden ser compatibles; si no puede leer todas las filas o comprobar los saldos, pide CSV. Los PDF escaneados o protegidos requieren una exportación con texto o CSV. Límite: 100 páginas y 10.000 movimientos. No convierte divisas; rechaza una divisa explícita distinta de EUR.

Los CSV admiten punto y coma, coma o tabulador; texto entre comillas, saltos de línea en conceptos, UTF-8, Windows-1252 y UTF-16LE con BOM. Columnas necesarias: **Fecha/Data**, **Concepto/Concepte/Descripción**, **Importe/Import** y **Saldo**. En lugar de Importe se pueden usar **Debe/Cargo** y **Haber/Abono**. Opcionales: fecha valor, más datos, IBAN y divisa. Los importes pueden utilizar coma decimal y punto de miles o punto decimal. Si no aparece un banco o IBAN, se solicita elegir la subcuenta; no se inventa la identidad de la cuenta.

Ejemplo de CSV:

```csv
CaixaBank;ES9121000418450200051332
Fecha;Fecha valor;Concepto;Importe;Saldo
03/01/2026;03/01/2026;MANTENIMENT;-10,00;90,00
04/01/2026;04/01/2026;Devolución mantenimiento;5,00;95,00
```

## Cálculo y revisión

Los importes se calculan en céntimos con BigInt. No se ordenan libremente movimientos del mismo día para forzar saldos: se comprueba la secuencia original o su inversa. Se buscan coincidencias únicamente en las fechas cubiertas por los movimientos del extracto y dentro del ejercicio seleccionado. Los apuntes anteriores al extracto se utilizan para calcular los saldos acumulados y como precedentes de clasificación; no aparecen como movimientos pendientes de conciliar. Se busca la última fecha del extracto con saldo bancario final igual o con una diferencia máxima de 0,03 € respecto al mayor. La fecha contable puede ser anterior o posterior con **hasta 10 días naturales antes o después**, incluido el décimo día. Se prioriza el saldo exacto, después la menor diferencia y la fecha más cercana y, en empate, la fecha contable más reciente. El extracto y el mayor continúan después de sus respectivas fechas de saldo coincidente: los días del corte quedan excluidos. El informe y el CSV identifican ambas fechas. Una coincidencia entre movimientos del mismo día no sirve de corte si el saldo al final de ese día no coincide. Si el último día ya cuadra, no quedan movimientos posteriores que revisar. Un importe exacto con fecha hasta diez días antes o después permite proponer el enlace al asiento; cuando hay varias, se exige que el concepto permita distinguir una. Las opciones ambiguas y los apuntes contables sin correspondencia del tramo analizado quedan visibles. El enlace al mayor abre ese mismo tramo; cuando el saldo ya coincide al final, permite consultar el último día. Al abrir informes antiguos se aplica también este límite de fechas a la lista de apuntes sin correspondencia, conservando el análisis guardado.

Para proponer una contrapartida se priorizan los precedentes de la misma empresa, banco, concepto y sentido, con una sola contrapartida coherente. Los servicios bancarios y sus devoluciones pueden proponerse en una subcuenta 626 existente si es única, señalando que requieren justificante. Referencia: [PGC del BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884).

No se supone que una transferencia sea un ingreso ni que una cuota de préstamo sea íntegramente gasto. Los préstamos necesitan cuenta y desglose de capital e intereses. Si no hay saldo inicial coincidente, se muestra la diferencia anterior sin crear un ajuste artificial. Las propuestas pueden explicar solo parte de la diferencia: se muestra el saldo previsto y la diferencia que sigue pendiente.

Para localizar un saldo contabilizado más tarde, se consulta el mayor hasta diez días después del final del extracto, sin salir del ejercicio seleccionado. El saldo contable comparado se calcula a la última fecha del extracto o a la del saldo contable coincidente, si esta es posterior; ambas fechas se muestran. Los demás apuntes posteriores al tramo no se presentan como pendientes.

El margen de 0,03 € solo permite elegir el punto de partida: se conserva la diferencia real entre el saldo bancario y el contable, sin alterar los importes. La revisión continúa después de cada fecha de corte, incluida la del mayor cuando es anterior al comienzo del extracto. Los movimientos posteriores se relacionan por importe exacto hasta diez días antes o después; las opciones ambiguas siguen pendientes. Si un movimiento se enlaza con un asiento posterior al final del extracto, el saldo contable y la lista del mayor amplían su fecha hasta ese asiento.

Las facturas PDF de **Documentación → Facturas pendientes de gestionar** se leen para buscar importe total, fecha, vencimiento, referencia y proveedor. El informe propone coincidencias de importe exacto con una fecha próxima o una referencia/nombre en el concepto, separando los casos con varias facturas posibles. No se genera una contrapartida de gasto cuando hay una posible factura pendiente que revisar. **Pasar a Facturas**, disponible también en Documentación, crea y abre su propuesta con el original; elige el ejercicio de la fecha extraída cuando existe y evita duplicar el mismo PDF. El documento pasa a gestionadas en la misma transacción. Las imágenes y PDF cuyos datos no puedan leerse se conservan para revisión; el paso directo admite PDF legibles, incluidos los escaneados que se puedan abrir aunque requieran completar los datos manualmente.

**Actualizar conciliación** recalcula el informe guardado con los criterios actuales y los apuntes vigentes, conservando el archivo original. Las relaciones con facturas pendientes se consultan de nuevo al abrir el informe. Ninguna de estas acciones contabiliza los movimientos bancarios. La migración `028_document_invoice_extraction.sql` añade la lectura conservada de las facturas; las copias anteriores siguen siendo compatibles.

Al consultar o actualizar un informe se compara la huella de todos los apuntes del ejercicio hasta el final de esa ventana de búsqueda, incluidos su estado y las cuentas de IVA. Si han cambiado, se muestra un aviso con el saldo contable actual y su diferencia con el banco. Las propuestas originales requieren revisión, aunque la diferencia actual sea cero. Los movimientos posteriores a la ventana de búsqueda no afectan a esta comprobación. Los informes antiguos conservan su alcance original.

## API y almacenamiento

Las migraciones `010_bank_reconciliations.sql` y `011_bank_statement_import.sql` crean el almacenamiento de informes y la vinculación por IBAN. PDF/CSV y consultas se filtran por empresa con `X-Company-Id`. No se publican directorios locales. El documento se sirve con su tipo y como descarga cuando es CSV.

- `POST /api/bank-import/preview?exercise_id=...`: PDF/CSV binario y nombre codificado en `X-File-Name`.
- `POST /api/bank-import/analyze`: token y `account_id`, o `create_account: true` (nombre necesario si no se detectó el banco).
- `POST /api/bank-import/commit`: token del análisis revisado.
- `POST /api/bank-import/discard`: descarta una revisión sin guardar.
- `GET /api/bank-reconciliations?exercise_id=...`, `GET /api/bank-reconciliations/:id`, `GET /api/bank-reconciliations/:id/source`: lista, informe y documento original.
- `POST /api/bank-reconciliations/:id/reanalyze`: recalcula el informe guardado, con permiso de escritura.
- `POST /api/documentation/:id/to-invoices` con `{version,exercise_id}`: conserva el original en una propuesta de Facturas y mueve el documento a gestionadas de forma atómica.

La revisión caduca a los 15 minutos. Los PDF se leen en un worker con tiempo y memoria limitados. Antes de guardar se bloquea la empresa, se comprueba que la contabilidad no haya cambiado y se recalcula el informe; cuenta, vinculación y documento se guardan en una misma transacción. Los reintentos no duplican registros. No existe endpoint para contabilizar las propuestas.

Pruebas: `bank-statement.test.js`, `bank-analysis.test.js`, `bank-import-db.test.js`, `bank-reconciliations-db.test.js` y `company-scope.test.js` en `backend/test`. Las pruebas MySQL usan empresas temporales y comprueban aislamiento, saldos, duplicados, reversión por errores y cambios durante la revisión. También se verifica la carga real al navegador, el reconocimiento posterior del IBAN y el diseño móvil.
