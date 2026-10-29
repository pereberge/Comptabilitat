# Conciliación bancaria

En **Conciliació bancària**, pulsa **Pujar extracte** y elige el PDF o CSV. Se lee, calcula y abre directamente el listado. Si el banco no se puede identificar de forma única, se pide seleccionarlo; cuando no existe ninguna subcuenta y el banco está identificado, se crea su subcuenta al abrir el listado.

Para cada empresa y ejercicio se conserva únicamente el extracto de trabajo actual. Una carga nueva sustituye los informes anteriores de ese ejercicio en una transacción. Los conceptos recordados y los asientos ya contabilizados se conservan. Repetir la carga del mismo archivo recalcula el listado y mantiene sus filas guardadas.

Se busca el último saldo bancario diario que coincida con el mayor, admitiendo hasta **0,03 €** de diferencia y **10 días naturales antes o después**, ambos límites incluidos. Se prioriza el importe exacto, después la menor diferencia y la fecha más cercana. Se conservan los saldos reales y se revisan los movimientos posteriores al punto de partida. La fecha de partida original del listado permanece visible aunque se vayan guardando sus asientos.

El listado contiene **Data, Concepte, Import, Compte / assentament, Recordar concepte y Acció**. Se puede escribir la subcuenta o buscarla con la lupa en la misma fila. Si hay un criterio conocido, el campo ya está propuesto. **Guardar assentament** contabiliza el asiento en el diario y marca la fila como guardada; requiere un ejercicio abierto. **Desglossar** permite indicar varias contrapartidas, fecha y concepto, y comprobar el debe y el haber antes de guardar.

**Recordar** está desmarcado por defecto, también al desglosar el asiento. Solo se guarda o actualiza un criterio si el usuario marca la casilla. El texto recurrente se aplica a esta empresa, banco y sentido. Se ignoran mayúsculas, acentos y puntuación y se buscan palabras completas. Gana el criterio más específico; las coincidencias ambiguas requieren indicar la cuenta. Una contrapartida adapta todo el importe; varias líneas proponen el reparto proporcional del ejemplo, con redondeo exacto en céntimos. En **Conceptes que es recorden** se puede dejar de recordar un criterio.

El listado consulta el diario anterior de la misma empresa y banco y muestra **Idea del teu diari** cuando encuentra un precedente. Reconoce pares de banco/contrapartida dentro de asientos que agrupan varios movimientos, utiliza conceptos en catalán y castellano y contrasta importe, sentido y nombre de la cuenta. Los importes anteriores cercanos sirven solo como evidencia para sugerir una cuenta; el importe del movimiento actual se conserva. **Veure precedent** muestra fecha, número de asiento y motivo. Si hay varias cuentas igualmente justificadas o solo coincide el importe, se deja la elección al usuario. Estas ideas no se guardan como criterios ni contabilizan asientos por sí mismas.

Las posibles facturas pendientes de Documentación aparecen en la misma fila. **Passar a Factures** abre su propuesta con el PDF original y evita duplicados. El asiento contable y el documento deben revisarse antes de decidir cómo registrarlos.

Los importes se calculan con BigInt en céntimos. Guardar un asiento valida subcuentas de la empresa y un asiento cuadrado, bloquea el ejercicio y guarda asiento, criterio y estado del listado en una transacción. Un error revierte todo. Los reintentos con el mismo identificador no crean asientos duplicados, y un movimiento ya conciliado no puede volver a contabilizarse desde la misma fila.

Se admiten PDF con texto y CSV hasta 5 MB. Se valida la cadena de saldos; los PDF escaneados o protegidos requieren un CSV. Los CSV admiten fecha, concepto, importe y saldo, o columnas separadas debe/haber. Las fechas y los importes se validan y la conciliación se limita al ejercicio seleccionado. No se convierten divisas.

## API

Todas las rutas se filtran por empresa mediante `X-Company-Id` y aplican los permisos de importación o escritura.

- `POST /api/bank-import/preview?exercise_id=...`: PDF/CSV binario.
- `POST /api/bank-import/analyze`: `{token,account_id,replace_current:true}` o creación de una subcuenta identificada. Prepara el listado directo.
- `POST /api/bank-import/commit`: `{token}`. Conserva únicamente el extracto actual del ejercicio, sin contabilizar movimientos.
- `POST /api/bank-import/discard`: descarta una carga no terminada.
- `GET /api/bank-reconciliations?exercise_id=...` y `GET /api/bank-reconciliations/:id`: listado actual y estado. La interfaz utiliza solo el flujo `direct`.
- `GET /api/bank-reconciliations/:id/source`: archivo actual original.
- `POST /api/bank-reconciliations/:id/entries`: `{version,movement_id,date,concept,remember,rule_concept,counter_lines:[{account_id,debit,credit}],request_id}`. Guarda el asiento real de forma atómica.
- `POST /api/bank-reconciliations/:id/reanalyze`: actualiza el listado conservando el punto de trabajo y los registros guardados.
- `DELETE /api/bank-reconciliations/:id/rules/:ruleId`: deja de recordar un criterio con comprobación de versión.

El archivo actual, el estado de sus movimientos y los criterios se incluyen en las copias de seguridad, con remapeo de referencias al restaurar. Las copias anteriores continúan siendo compatibles.

Pruebas: `reconciliation-direct-db.test.js`, `reconciliation-proposals-db.test.js`, `bank-analysis.test.js`, `bank-import-db.test.js` y `bank-reconciliations-db.test.js`. Las pruebas MySQL crean y retiran sus propias empresas temporales.
