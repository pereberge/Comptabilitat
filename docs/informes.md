# Libro Mayor y Balance de Sumas y Saldos

## Modelo y cálculos

Se reutilizan `companies`, `accounting_exercises`, `accounts`, `journal_entries` y `journal_lines`. No se almacenan saldos. `position` y el identificador de línea permiten ordenar el Mayor por fecha, número, posición e ID.

La migración `004_entry_status.sql` añade `posted`, `draft` y `cancelled`. Los asientos existentes y los nuevos registrados por la aplicación son `posted`. Los informes excluyen los otros estados. No se implementa una interfaz para borradores o anulaciones.

Cada consulta valida la empresa, el ejercicio, las fechas dentro de sus límites y, en el Mayor, el subcuenta de la misma empresa. Los ejercicios pueden tener fechas distintas del año natural y estar cerrados: los informes son de lectura.

Las consultas usan una transacción de solo lectura con una instantánea coherente de MySQL, de modo que un asiento concurrente no aparezca en las líneas sin aparecer en los totales. Se aprovechan el índice de empresa/ejercicio/fecha, los índices de claves foráneas y el índice único de posición de línea existentes.

- Mayor: `SUM(debit-credit)` antes de la fecha inicial, dentro del ejercicio. Cada movimiento incrementa ese saldo con `debit-credit`.
- Acumulado: desde el primer día del ejercicio hasta la fecha final; saldo inicial cero.
- Período: saldo anterior al período más Debe y Haber del intervalo.
- Apertura: sus movimientos se tratan como cualquier asiento contabilizado; no se importan saldos del ejercicio anterior.
- Agrupación: se recorre `parent_id`, incluyendo desarrollos de cuatro o más dígitos. Se toma el ancestro real del nivel solicitado (o el más próximo de menor longitud); si falta, se conserva la subcuenta para no perder importes. Se suman saldos signados y después se separan deudores y acreedores.
- Comprobación: diferencias inicial, Debe-Haber y saldos finales deudores-acreedores, calculadas en el backend y devueltas con signo.

MySQL suma `DECIMAL`; el backend convierte esas cadenas a céntimos `BigInt`, sin límites artificiales derivados del importe máximo de una sola línea. JSON devuelve cadenas con dos decimales. El frontend solo formatea y exporta.

Referencia del catálogo de cuentas: [PGC, Real Decreto 1514/2007](https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884). Estos informes no son el Balance de Situación ni generan operaciones de cierre.

## API

Cabecera `X-Company-Id`, siguiendo el contexto de la aplicación. Sin cabecera se utiliza `COMPANY_ID`.

- `GET /api/accounting/ledger?exercise_id=ID&account_id=ID&from=AAAA-MM-DD&to=AAAA-MM-DD`
- `GET /api/accounting/trial-balance?exercise_id=ID&from=AAAA-MM-DD&to=AAAA-MM-DD&mode=accumulated&level=subaccount&show_empty=false`

`mode`: `accumulated` (predeterminado) o `period`. `level`: `subaccount`, `3`, `2`, `1`. `show_empty`: `true` o `false`. Las fechas omitidas toman los límites del ejercicio. En acumulado la fecha inicial efectiva siempre es el inicio del ejercicio.

Las respuestas incluyen empresa, ejercicio, fechas efectivas, EUR, filas y totales. El balance incorpora `checks` con diferencias exactas y los hijos de cada agrupación para desplegarlos sin otra consulta.

## Extracto multiejercicio

El Libro Mayor abre **Varios ejercicios** activado por defecto, con el rango del primer al último ejercicio de la empresa. Permite desactivarlo, elegir el ejercicio inicial y final y acotar las fechas. La URL conserva también la desactivación al consultar o recargar. Los enlaces desde otros informes mantienen su ejercicio y período. Incluye todos los ejercicios existentes de esa empresa dentro del rango, ordenados por fecha, también los cerrados, los no naturales y los separados por años sin ejercicio.

La API del Mayor admite `multi_exercise=true&exercise_from_id=ID&exercise_to_id=ID`, además de `exercise_id` (contexto de navegación), `account_id`, `from`, `to` y `exclude_closing`. Las fechas omitidas toman los límites del rango. Los dos extremos y la cuenta se validan dentro de la empresa de la petición; los rangos invertidos, las fechas fuera de límites y los períodos que no abarcan ningún ejercicio se rechazan.

La respuesta multiejercicio contiene `exercises` y `sections`. Cada sección identifica el ejercicio y sus fechas efectivas, filas y totales. El saldo anterior y el saldo acumulado se calculan dentro de cada ejercicio, exactamente como en la consulta individual. Las aperturas se contabilizan una vez en su ejercicio y la exclusión de cierres se aplica a todas las secciones. No se arrastran ni se suman saldos anuales: de este modo, excluir cierres no duplica el saldo al llegar a la apertura del siguiente año. Se muestran también los ejercicios sin movimientos de esa cuenta. Toda la consulta comparte una instantánea de solo lectura.

El CSV único incluye todos los ejercicios consultados, sus fechas, saldo anterior, movimientos y totales por ejercicio. El número de asiento abre el detalle del ejercicio correspondiente, aunque se repita la numeración en otro año. La URL conserva el rango para recargarlo o compartirlo. Cambiar un filtro deshabilita la exportación hasta consultar de nuevo. El modo individual y el Balance de Sumas y Saldos mantienen su funcionamiento.

## Pantallas y navegación

Acceso directo desde el menú a `/mayor` y `/sumas-saldos`. Se reutiliza la entrada de cuenta/subcuenta con búsqueda en popup. El Balance enlaza al Mayor conservando fechas y ejercicio; el enlace de retorno conserva modalidad y agrupación. Los filtros consultados quedan en la URL. El número de asiento abre `EntryDetail`, compartido con el diario, sin abandonar el informe.

El CSV incluye el resultado completo recibido, empresa, ejercicio, período, moneda y totales. Usa BOM UTF-8, separador punto y coma, decimales con coma, escape de comillas y saltos de línea y neutralización de fórmulas en campos textuales. Los totales no se recalculan en el navegador. En agrupaciones exporta las filas agrupadas sin duplicarlas con el desglose de hijos.

## Asientos en la página de inicio

La tarjeta de empresa reúne el ejercicio, sus fechas y el estado abierto o cerrado. Al entrar en Inicio se selecciona el ejercicio abierto más reciente; si no hay ninguno, se muestra el más reciente para consulta. El selector superior permite consultar otro ejercicio manualmente.

Los asientos aparecen directamente debajo de la tarjeta, con fecha, número, cuenta, subcuenta, nombre, concepto, Debe y Haber. Se muestran del más antiguo al más reciente por fecha y número de asiento, manteniendo el orden de las líneas dentro de cada asiento. El cuadro tiene desplazamiento propio y sitúa la vista al final, en el último asiento, al cargar, actualizar o guardar. **Ver todos los asientos** abre la pantalla del diario. Un ejercicio sin movimientos muestra el estado vacío sin recuperar datos de otra empresa o año.

La consulta usa `GET /api/entries?exercise_id=ID&view=lines`. Clicar cualquier punto de una línea abre directamente la edición del asiento si está permitida. Los asientos protegidos y los ejercicios cerrados se abren para consulta, respetando los permisos del usuario. Al guardar se actualiza el listado. El número de asiento permite también abrirlo con el teclado.

## Edición desde el Mayor

El número de asiento abre el detalle; desde ahí se puede elegir **Editar asiento**. El listado de Inicio abre la edición directamente al clicar cualquier línea. Se requiere el permiso `accounting_write`, un ejercicio abierto y un asiento normal contabilizado. Los asientos anuales, borradores, anulados o vinculados a facturas, cartera o documentos se consultan y se gestionan desde su origen.

`GET /api/entries/ID` devuelve `revision`, `editable`, `edit_blocked_reason` y los límites del ejercicio. `PATCH /api/entries/ID` recibe `exercise_id`, `revision`, `entry_date`, `description` y `lines`. Las líneas pueden conservar su `id` original; las nuevas lo omiten. Cada línea conserva su concepto, debe usar una subcuenta de la empresa y tener un importe positivo en un único lado. Debe y Haber deben cuadrar exactamente.

La actualización conserva el número, el ejercicio, la empresa, el estado y la identificación de la solicitud original. Bloquea el ejercicio y el asiento, comprueba la revisión y actualiza cabecera y líneas dentro de una sola transacción. Un fallo revierte todo; una edición simultánea se rechaza con `ENTRY_CHANGED`. Repetir una modificación ya guardada devuelve el estado vigente sin duplicar apuntes. El Mayor vuelve a consultar los movimientos y saldos después de guardar.

## Verificación

Aplicar `npm run db:migrate`. Para pruebas MySQL en PowerShell:

```powershell
$env:TEST_MYSQL='1'
npm test
npm run build
```

`backend/test/reports-db.test.js` crea una empresa y ejercicios temporales, verifica saldos, signos, apertura, agrupación, estados, aislamiento, filtros, estados vacíos, discrepancias y endpoints, y elimina exclusivamente sus propios datos. `reports-multi-exercise-db.test.js` comprueba rangos, aperturas y cierres, ejercicios cerrados y no consecutivos, precisión, filtros, aislamiento y lectura sin cambios contables. `report-format.test.js` verifica importes grandes y CSV seguro. `entry-edit-db.test.js` cubre edición, precisión, rollback, revisiones simultáneas, permisos, protección de documentos y selección del último apunte. La comprobación de navegador cubre los asientos de Inicio, su orden, edición por fila, permisos y varios ejercicios por defecto en el Mayor, además de filtros, despliegue, detalle, retorno, búsqueda y descarga de ambos CSV.

## Límites de esta entrega

Sin PDF ni paginación: se devuelve el resultado completo. Para volúmenes elevados se podrá añadir paginación y exportación por streaming sin cambiar las reglas de cálculo. El Balance de Situación se documenta en `balance-situacion.md`; los procesos de cierre, apertura y anulación, en `ejercicios.md`. Los estados de los asientos anuales se gestionan desde Ejercicios. Pérdidas y Ganancias se documenta en `perdidas-ganancias.md`. No se valida aquí documentación económica de asientos históricos: se respetan los estados y se señalan diferencias contables.
