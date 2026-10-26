# Apertura, cierre y anulación de ejercicios

En **Ejercicios** (`/ejercicios`), cada ficha muestra los asientos vigentes de apertura, regularización y cierre, también cuando proceden de un PDF importado. Sus números abren el asiento original.

La importación del **DIARI** con códigos de diario y referencias requiere **Producción porcina** en la ficha de empresa. Conserva también el nombre de origen y los apuntes originales. Configuración, límites y comprobaciones: [produccion-porcina.md](produccion-porcina.md).

- **Generar cierre** prepara una vista previa, regulariza los saldos restantes de los grupos 6 y 7 contra una subcuenta 129 y cierra las cuentas de los grupos 1 a 5 en la fecha final del ejercicio. La confirmación guarda los asientos y deja el ejercicio cerrado.
- **Generar apertura** incorpora los saldos patrimoniales del ejercicio anterior al primer día del ejercicio abierto. El anterior debe terminar el día previo, estar cerrado y tener un único cierre vigente con todas sus cuentas saldadas.
- **Nuevo ejercicio** permite marcar **Crear también el asiento de apertura**. Se revisan sus saldos antes de guardar; el ejercicio y la apertura se crean en una sola transacción. Sin marcarla, el ejercicio empieza vacío.
- **Anular apertura** conserva el asiento como anulado y permite volver a generarlo. El ejercicio debe estar abierto.
- **Anular cierre** anula el cierre y la regularización de fin de ejercicio y vuelve a abrirlo. También anula la apertura del ejercicio inmediatamente siguiente cuando existe. Si este siguiente ejercicio está cerrado, hay que anular primero su cierre.
- **Historial de operaciones** conserva fecha, motivo, números de asiento y operaciones relacionadas. La anulación exige un motivo.

La anulación modifica el estado de los asientos anuales, sin borrar sus líneas ni reutilizar su numeración. Las facturas, los recibos, los cobros, los pagos y los movimientos ordinarios se conservan. Los asientos anulados se identifican en el diario y el detalle; los informes usan únicamente asientos contabilizados (`posted`). Los PDF originales y sus registros de importación se conservan.

Al volver a cerrar y abrir se calculan los saldos actuales. No se permite duplicar una apertura o un cierre vigentes. Si el ejercicio anterior tiene actividad, debe cerrarse primero y su apertura debe estar incorporada antes de cerrar el siguiente.

## Cálculos y revisión

Los importes se calculan con enteros de céntimos (`BigInt`). Se admite beneficio, pérdida, resultado cero y regularizaciones parciales: únicamente se transfiere el saldo pendiente, sumándolo al resultado 129 existente. La apertura respeta el signo de cada saldo patrimonial, incluso cuentas compensatorias.

Si existen varias subcuentas 129 sin una coincidencia estándar, hay que elegir la cuenta de resultado. Si hace falta una 129 nueva, se crea al confirmar junto con su jerarquía. Los saldos pendientes de los grupos 8 o 9 requieren registrar previamente su imputación al patrimonio neto. No se crean líneas a cero ni asientos vacíos.

Las operaciones admiten hasta 10.000 líneas por asiento, con el límite de importe de MySQL por línea. El límite de 100 líneas de la entrada manual se mantiene. La revisión incluye un hash del estado contable; si hay cambios antes de confirmar, se exige actualizarla. Cada solicitud tiene un UUID para poder repetirla sin duplicar operaciones tras un problema de conexión.

## API y base de datos

Aplicar `npm run db:migrate` para instalar `009_exercise_operations.sql`. Todas las rutas usan `X-Company-Id`:

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/exercises` | Ejercicios y asientos anuales vigentes/anulados |
| GET | `/api/exercises/:id/carry-forward` | Saldos de un ejercicio cerrado para crear uno nuevo |
| GET | `/api/exercises/:id/operations/:kind/preview` | Revisar una operación |
| POST | `/api/exercises/:id/operations/:kind` | Confirmar una operación revisada |
| GET | `/api/exercises/:id/operations` | Historial del ejercicio y anulaciones relacionadas |

`kind`: `closing`, `opening`, `cancel_closing` o `cancel_opening`. La confirmación requiere `request_id`, `preview_hash` y, para anulaciones, `reason`. Apertura admite `source_exercise_id`; cierre admite `result_account_id`, ambos también usados en su revisión.

`POST /api/exercises` mantiene el alta simple. Para alta con apertura recibe además `opening_from_exercise_id`, `opening_preview_hash` (obtenido de `carry-forward`) y `request_id`.

El bloqueo de empresa serializa estas operaciones y la creación de subcuentas. El bloqueo de cada ejercicio impide que se contabilicen movimientos simultáneamente a su cierre. La escritura de asientos, estados, anulaciones e historial se confirma en una transacción. Los vínculos de base de datos comprueban empresa y ejercicio.

## Comprobaciones

`backend/test/year-end-calculation.test.js` prueba beneficios, pérdidas, saldos de resultado existentes, signos importados, importes superiores a la precisión de Number, validación del cierre de origen y límites. `backend/test/exercise-operations-db.test.js` prueba el ciclo completo en empresas temporales: concurrencia, reintentos, revisiones obsoletas, rollback, alta con apertura, reconocimiento de asientos importados, conservación del PDF, informes tras anulación, dependencia entre ejercicios, aislamiento de empresas, rutas HTTP y cierres con más de 100 líneas.

En PowerShell: `$env:TEST_MYSQL='1'; npm.cmd test`. Para incluir la comprobación del PDF de Nou Fons, definir también `TEST_JOURNAL_PDF`. Las pruebas no modifican empresas existentes.

## Borrar la contabilidad de un período

En **Ejercicios**, cada ficha incluye **Borrar contabilidad del período**, junto a **Importar libro diario PDF**. El diálogo identifica empresa, ejercicio y fechas, y muestra cuántos asientos, líneas, facturas, recibos, cobros/pagos, documentos, conciliaciones, importaciones y operaciones anuales se retirarán. Para confirmar hay que escribir exactamente **96**; el servidor comprueba también ese valor.

La operación vacía el ejercicio y lo deja abierto para volver a importar. Incluye asientos contabilizados y anulados, apertura, regularización y cierre. Conserva el ejercicio, las empresas, sus datos y el plan de cuentas compartido entre años. Los PDF y registros retirados quedan en una copia automática antes de confirmar el borrado. **Descargar copia de seguridad**, en la ficha del ejercicio, descarga la última copia en JSON, con los documentos binarios codificados en base64. Las copias anteriores se conservan en MySQL; no hay restauración automática desde la interfaz.

La copia y el borrado forman una única transacción: si falla una copia o cualquier escritura, se revierte toda la operación. La confirmación lleva un hash del resumen y un UUID. Si los datos cambian después de revisarlos, se exige actualizar el resumen y volver a escribir el código. Un reintento del mismo borrado devuelve su resultado y no borra movimientos añadidos después.

Las relaciones entre ejercicios se comprueban antes de borrar:

- Una apertura vigente de un ejercicio dependiente exige anular primero esa apertura.
- Si facturas, cobros o pagos del período tienen movimientos o anulaciones en otro año, se identifica el ejercicio que debe resolverse primero. El borrado no elimina sus asientos.
- Al borrar un pago del período correspondiente a una factura anterior, el recibo anterior recupera su pendiente. Al borrar una anulación registrada aquí de una factura o pago anterior, se restablece el documento original. Estos ajustes se indican en el resumen y sus valores anteriores también se copian.
- Los asientos de apertura ya anulados de otros ejercicios conservan sus líneas y estado; cuando su vínculo de anulación apunta a una operación retirada, se archiva ese vínculo antes de desvincularlo.

Aplicar `013_exercise_clears.sql` con `npm run db:migrate`. Las tablas `exercise_clears` y `exercise_clear_rows` conservan el resultado, el estado anterior y las filas afectadas. Todas las rutas requieren el contexto `X-Company-Id`:

| Método | Ruta | Uso |
|---|---|---|
| GET | `/api/exercises/:id/clear/preview` | Resumen y relaciones del período, sin escrituras |
| POST | `/api/exercises/:id/clear` | `{confirmation:"96",preview_hash,request_id}` |
| GET | `/api/exercise-clears/:id/backup` | Descargar la copia del borrado |

`GET /api/exercises` incluye `last_clear` para recuperar la última copia. La descarga verifica la empresa y envía las filas progresivamente para evitar cargar todos los documentos en memoria a la vez.

`backend/test/exercise-clear-db.test.js` usa empresas temporales para verificar código incorrecto, ámbito de empresa, resúmenes obsoletos, fallos durante copia y borrado, confirmación concurrente, PDFs íntegros, conservación de otros períodos, reintentos tras añadir nuevos movimientos, facturas y pagos entre años, aperturas dependientes y reimportación del diario con líneas negativas y a cero.
