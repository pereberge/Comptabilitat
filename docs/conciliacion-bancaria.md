# Conciliación bancaria

En **Conciliació bancària**, pulsa **Pujar extracte** y elige el PDF o CSV. Se lee, calcula y abre directamente el listado. Si el banco no se puede identificar de forma única, se pide seleccionarlo; cuando no existe ninguna subcuenta y el banco está identificado, se crea su subcuenta al abrir el listado.

Para cada empresa y ejercicio hay un único extracto de trabajo actual. Una carga nueva archiva los anteriores y activa el nuevo en una transacción, conservando sus originales, sus listados y los asientos ya contabilizados. Repetir la carga del mismo archivo reutiliza su registro, recalcula el listado y mantiene sus filas guardadas.

## Archivo de extractos

El PDF **Histórico de movimientos de BBVA** identifica el titular, el IBAN y la fecha de emisión de la cabecera. Lee las columnas F. CONTABLE, F. VALOR, CÓDIGO, CONCEPTO|BENEF./ORDENANTE, IMPORTE y SALDO, incluidas varias páginas, conceptos en varias líneas e importes con EUR y uno o dos decimales. El código bancario queda separado del concepto. Se comprueba la cadena de saldos antes de preparar la conciliación. El titular y el IBAN enmascarado aparecen en el listado y se conservan al recalcularlo. Selecciona la empresa del titular antes de subir el extracto.

**Extractes arxivats**, en la misma pantalla y con un acceso directo en su cabecera, conserva cada PDF o CSV con el banco, la fecha del extracto, el período de movimientos y el nombre original. El nombre de consulta y descarga sigue el formato `Extracte-CaixaBank-2026-10-31.pdf`. Se utiliza la fecha de emisión o de extracto identificada en la cabecera; si no aparece, se usa la fecha final del período indicado o del último movimiento, nunca la fecha de subida.

**Consultar** abre el PDF original o el texto del CSV; **Descarregar** guarda sus bytes originales con el nombre de banco y fecha. Se puede buscar por banco, fecha, subcuenta o archivo y consultar los extractos anteriores aunque ya se haya cargado otro. El archivo se limita a la empresa y al ejercicio seleccionados.

**Esborrar** pide confirmar el archivo concreto y retira su original y su listado de conciliación. Conserva los asientos registrados y los conceptos recordados para ese banco. Requiere permiso de escritura contable y comprueba la versión del registro para no borrar un listado que haya cambiado mientras se revisaba. Si se borra el extracto actual, la pantalla queda disponible para cargar otro; los demás originales permanecen en el archivo. El mismo documento puede volver a subirse después de borrarlo.

Los extractos anteriores que todavía estén guardados aparecen con su banco y fecha sin necesidad de una migración. Los informes que se eliminaron antes de disponer del archivo solo pueden recuperarse desde sus copias de seguridad.

Se busca el último saldo bancario diario que coincida con el mayor, admitiendo hasta **0,03 €** de diferencia y **10 días naturales antes o después**, ambos límites incluidos. Se prioriza el importe exacto, después la menor diferencia y la fecha más cercana. Se conservan los saldos reales y se revisan los movimientos posteriores al punto de partida. La fecha de partida original del listado permanece visible aunque se vayan guardando sus asientos.

El listado contiene **Data, Concepte, Import, Compte / assentament, Recordar concepte y Acció**. Se puede escribir la subcuenta o buscarla con la lupa en la misma fila. Si hay un criterio conocido, el campo ya está propuesto. **Guardar assentament** contabiliza el asiento en el diario y marca la fila como guardada; requiere un ejercicio abierto. **Desglossar** permite indicar varias contrapartidas, fecha y concepto, y comprobar el debe y el haber antes de guardar.

La lupa muestra el saldo de cada subcuenta y, al elegirla, también aparece bajo su código antes de guardar el asiento. Es el saldo contabilizado de todo el ejercicio seleccionado, con apertura y sin el asiento de cierre: positivo deudor y negativo acreedor. Se vuelve a consultar al guardar un asiento o actualizar el listado.

El semáforo del extracto es verde cuando no queda ningún movimiento pendiente y el saldo actual del mayor coincide con el banco dentro del margen de 0,03 €. En rojo muestra cuántos movimientos faltan por conciliar y la diferencia de saldos. Si no quedan movimientos pero persiste una diferencia, pide revisar el saldo; si el diario ha cambiado desde el análisis, pide actualizar el listado antes de mostrar el verde. Se actualiza al guardar o liquidar un movimiento y al actualizar la conciliación.

**Recordar** está desmarcado por defecto, también al desglosar el asiento. Solo se guarda o actualiza un criterio si el usuario marca la casilla. El texto recurrente se aplica a esta empresa, banco y sentido. Se ignoran mayúsculas, acentos y puntuación y se buscan palabras completas. Gana el criterio más específico; las coincidencias ambiguas requieren indicar la cuenta. Una contrapartida adapta todo el importe; varias líneas proponen el reparto proporcional del ejemplo, con redondeo exacto en céntimos. En **Conceptes que es recorden** se puede dejar de recordar un criterio.

El listado consulta el diario anterior de la misma empresa y banco y muestra **Idea del teu diari** cuando encuentra un precedente. Reconoce pares de banco/contrapartida dentro de asientos que agrupan varios movimientos, utiliza conceptos en catalán y castellano y contrasta importe, sentido y nombre de la cuenta. Los importes anteriores cercanos sirven solo como evidencia para sugerir una cuenta; el importe del movimiento actual se conserva. **Veure precedent** muestra fecha, número de asiento y motivo. Si hay varias cuentas igualmente justificadas o solo coincide el importe, se deja la elección al usuario. Estas ideas no se guardan como criterios ni contabilizan asientos por sí mismas.

Las posibles facturas pendientes de Documentación aparecen en la misma fila. **Comptabilitzar factura i rebut** abre su propuesta dentro de la conciliación y conserva el PDF original. Primero se revisa y contabiliza la factura y después se confirma su cobro o pago, manteniendo seleccionado el movimiento bancario. El formulario permite **Editar propuesta y recibos**, con sus campos pendientes en rojo, y utiliza el ejercicio de la factura aunque el movimiento del banco pertenezca a otro ejercicio.

Cada línea tiene también **Buscar rebut o factura**. Al pulsarlo se consultan los datos actuales de la misma empresa y se muestran dos grupos:

- **Rebuts pendents de Cartera**: recibos pendientes o parciales cuyo importe pendiente coincide exactamente, en céntimos, con el movimiento. Los cargos buscan pagos y los abonos, cobros. Se incluyen recibos de otros ejercicios, con su referencia, tercero, vencimiento, ejercicio e importes original y ya pagado cuando corresponda. **Veure a Cartera** abre ese recibo concreto.
- **Factures de Documentació i Factures**: documentos pendientes con un total legible del mismo importe y sentido compatible, propuestas ya trasladadas a Facturas y facturas contabilizadas con varios recibos cuyo pendiente conjunto coincide con el movimiento. Se excluyen otras monedas. **Comptabilitzar factura i rebut** abre la revisión en la propia conciliación; una factura ya registrada pasa directamente a la preparación de su cobro o pago. Las fechas alejadas no impiden la búsqueda por importe.

La coincidencia de importe requiere comprobar el tercero, la referencia y las fechas. Si hay varios resultados se muestran para elegir. Si no se encuentra ninguno se indica por separado en Cartera y Documentación; no se crean registros al buscar. Los PDF cuyo total no se ha podido leer no pueden aparecer como coincidencia por importe.

Los recibos encontrados muestran la fecha de factura y la fecha real de su asiento, además del vencimiento. El pago se bloquea si la fecha de factura es posterior al movimiento bancario; cambiar solo la fecha contable no modifica esa comprobación. En facturas recibidas, **Corregir dates** permite revisar ambas fechas con el PDF y guardarlas desde la conciliación. Sincroniza la fecha contable de la factura con su asiento y vuelve a consultar las coincidencias. Conserva el asiento, sus líneas, los importes y los recibos. Requiere permiso contable, ejercicio abierto y recibos fuera de remesa; rechaza cambios desactualizados y fechas posteriores a vencimientos o pagos ya registrados. No modifica facturas emitidas ni registros fiscales.

**Cobrar i conciliar** o **Pagar i conciliar** abre el formulario del recibo con el banco, fecha e importe del movimiento, que se conservan al guardar. La liquidación, su asiento y la vinculación a la línea de conciliación se guardan en una sola transacción: un error revierte todo y repetir la misma solicitud no duplica el cobro o pago. Se vuelve a comprobar el importe pendiente, sentido, versión del listado, ejercicio abierto y permisos de escritura. Las líneas ya conciliadas permiten consultar coincidencias; para liquidar requieren estar pendientes. Las pantallas de Cartera y Facturas ofrecen **Tornar a la conciliació**, conservando el ejercicio de origen.

En el flujo de factura, **Pagar factura i conciliar** o **Cobrar factura i conciliar** liquida todos sus recibos pendientes cuando su suma coincide exactamente con el movimiento. Se muestra cada vencimiento y se guarda un asiento por recibo, todos con el banco, fecha y ejercicio del movimiento y vinculados a la misma línea. La factura conserva su propio asiento y ejercicio. Si falla cualquier recibo, se revierten todos los pagos y sus asientos; la factura ya contabilizada permanece pendiente para poder reintentar. Al salir antes de terminar, la siguiente búsqueda recupera la propuesta guardada o la factura pendiente de liquidación. Los asientos de cada recibo quedan accesibles desde la fila y su vínculo se conserva en las copias de seguridad.

Los importes se calculan con BigInt en céntimos. Guardar un asiento valida subcuentas de la empresa y un asiento cuadrado, bloquea el ejercicio y guarda asiento, criterio y estado del listado en una transacción. Un error revierte todo. Los reintentos con el mismo identificador no crean asientos duplicados, y un movimiento ya conciliado no puede volver a contabilizarse desde la misma fila.

Se admiten PDF con texto y CSV hasta 5 MB. Se valida la cadena de saldos; los PDF escaneados o protegidos requieren un CSV. Los CSV admiten fecha, concepto, importe y saldo, o columnas separadas debe/haber. Las fechas y los importes se validan y la conciliación se limita al ejercicio seleccionado. No se convierten divisas.

## API

Todas las rutas se filtran por empresa mediante `X-Company-Id` y aplican los permisos de importación o escritura.

- `POST /api/bank-import/preview?exercise_id=...`: PDF/CSV binario.
- `POST /api/bank-import/analyze`: `{token,account_id,replace_current:true}` o creación de una subcuenta identificada. Prepara el listado directo.
- `POST /api/bank-import/commit`: `{token}`. Activa el extracto del ejercicio y archiva los anteriores, sin contabilizar movimientos.
- `POST /api/bank-import/discard`: descarta una carga no terminada.
- `GET /api/bank-reconciliations?exercise_id=...` y `GET /api/bank-reconciliations/:id`: extractos actuales y archivados, banco, fecha, nombre de descarga y estado. El listado de trabajo utiliza el flujo `direct`; los anteriores llevan `archived`.
- `GET /api/bank-reconciliations/:id/source`: archivo original con nombre de banco y fecha.
- `GET /api/bank-reconciliations/:id/movements/:movementId/matches`: consulta recibos pendientes y facturas de Documentación del mismo importe, dentro de la empresa del extracto.
- `POST /api/bank-reconciliations/:id/settlements`: `{version,movement_id,receipt_id,request_id,payment_method,reference,notes}` o `receipt_ids:[...]` para varios recibos de una misma factura. Liquida los recibos y concilia el movimiento de forma atómica; el banco, fecha, ejercicio e importe se obtienen del extracto.
- `DELETE /api/bank-reconciliations/:id`: `{version}`. Borra únicamente ese extracto y su análisis.
- `POST /api/bank-reconciliations/:id/entries`: `{version,movement_id,date,concept,remember,rule_concept,counter_lines:[{account_id,debit,credit}],request_id}`. Guarda el asiento real de forma atómica.
- `POST /api/bank-reconciliations/:id/reanalyze`: actualiza el listado conservando el punto de trabajo y los registros guardados.
- `DELETE /api/bank-reconciliations/:id/rules/:ruleId`: deja de recordar un criterio con comprobación de versión.

Todos los extractos archivados, el actual, el estado de sus movimientos y los criterios se incluyen en las copias de seguridad, con remapeo de referencias al restaurar. Las copias anteriores continúan siendo compatibles.

Pruebas: `bank-statement-archive.test.js`, `bank-statement-archive-db.test.js`, `reconciliation-direct-db.test.js`, `reconciliation-matches-db.test.js`, `reconciliation-invoice-flow-db.test.js`, `reconciliation-proposals-db.test.js`, `bank-analysis.test.js`, `bank-import-db.test.js` y `bank-reconciliations-db.test.js`. Las pruebas MySQL crean y retiran sus propias empresas temporales.
