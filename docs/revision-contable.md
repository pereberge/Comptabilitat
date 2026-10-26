# Revisión contable

El botón **Revisar contabilidad** aparece junto a **Actualizar datos** en Inicio y junto a **Actualizar conciliación** en Conciliación bancaria. Consulta la empresa y el ejercicio seleccionados y abre un informe con tres prioridades: **Errores**, **A revisar** y **Mejoras de cuentas y datos**. Las tarjetas y el selector de área permiten filtrar; **Ver todas** restablece los filtros. El informe se puede repetir y exportar en CSV. Los enlaces al mayor y a los asientos permiten contrastar cada observación.

La revisión es de consulta. No corrige apuntes, cambia nombres de cuentas ni crea ajustes. Cada observación explica el motivo y propone un siguiente paso. Un posible duplicado, un saldo de cliente acreedor, un descubierto o una diferencia de apertura requieren justificante: no se presentan como errores confirmados. Los importes de IVA del tramo tampoco se presentan como una deuda fiscal confirmada ni se supone una periodicidad de presentación.

## Comprobaciones

- **Asientos:** al menos dos líneas, cuadramiento individual y global, fechas del ejercicio, concepto y subcuentas válidas. Los asientos anulados se excluyen. Los importes negativos o cero permitidos en diarios importados se respetan. Los asientos normales idénticos en fecha, concepto, cuentas e importes se señalan como posibles duplicados.
- **Cuentas:** jerarquía, longitud configurada, descripción, nombres genéricos y nombres repetidos en el mismo grupo. Se señalan denominaciones de IVA en 4752, el uso de una cuenta nombrada como modelo 202 con ingresos financieros y bancos cuyo nombre difiere del IBAN vinculado. Se revisa el plan común de la empresa, incluidos los nombres de cuentas sin movimientos en ese año.
- **Saldos:** caja/bancos/clientes acreedores, proveedores/acreedores deudores y amortización acumulada deudora antes del cierre se muestran para contrastar su naturaleza; no se reclasifican automáticamente.
- **Operaciones anuales:** varios asientos activos de apertura/cierre, fechas, ausencia de cierre o saldos residuales en ejercicios cerrados y comparación de una apertura explícita con los saldos del año anterior cerrado. Se admite una apertura registrada como movimientos patrimoniales manuales el primer día.
- **IVA:** se revisan trimestres completos transcurridos dentro del ejercicio. Se avisa si queda saldo en 477 tras un asiento compatible con liquidación o si hay actividad de IVA sin liquidación identificada. Hay que contrastar el régimen, la periodicidad, las facturas y los modelos presentados.
- **Bancos:** se utiliza el informe más reciente de cada cuenta en el ejercicio y se compara con el mayor hasta la fecha final del extracto. Se advierte si el diario cambió desde el análisis, aunque el saldo actual ya coincida.
- **Facturas y cartera:** recibos que no suman el total de una factura vigente, facturas vigentes con asiento no vigente, liquidaciones activas superiores al recibo y vencimientos pendientes. Los documentos anulados se excluyen de estas comprobaciones.
- **Datos de empresa:** se propone completar CIF/NIF y dirección fiscal cuando hay actividad. Las facturas emitidas conservan sus propias copias históricas de datos fiscales.

Las observaciones de clasificación toman como referencia el [Plan General de Contabilidad del BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884). El informe enlaza esa referencia en las observaciones pertinentes. Las reglas orientan la revisión de los registros existentes; no sustituyen los justificantes ni garantizan detectar todos los errores de criterio.

## API y consistencia

`GET /api/accounting/review?exercise_id=...`, con `X-Company-Id`, devuelve el contexto, fecha de consulta, totales exactos, prioridades y observaciones con referencias a cuentas/asientos. Valida el ejercicio dentro de la empresa. Usa una transacción MySQL de lectura con instantánea consistente para que diario, cartera e informes correspondan a la misma consulta. No requiere migraciones nuevas.

Los cálculos utilizan céntimos con BigInt. El CSV exporta el informe completo de la consulta, independientemente de los filtros de pantalla, con protección de celdas de texto. Al cambiar empresa o ejercicio se cierra la revisión y se ignoran las respuestas pendientes del contexto anterior.

Pruebas: `accounting-review.test.js` cubre precisión, duplicados, anulaciones, signos importados, estructura, clasificación, IVA, apertura/cierre, conciliaciones y cartera. `accounting-review-db.test.js` verifica la API con facturas reales de prueba, defectos introducidos en empresas temporales, aislamiento y ausencia de escrituras. La interfaz se valida en escritorio y móvil, incluidos filtros, CSV y detalles de asiento.
