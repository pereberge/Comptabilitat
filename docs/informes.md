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

## Pantallas y navegación

Acceso directo desde el menú a `/mayor` y `/sumas-saldos`. Se reutiliza la entrada de cuenta/subcuenta con búsqueda en popup. El Balance enlaza al Mayor conservando fechas y ejercicio; el enlace de retorno conserva modalidad y agrupación. Los filtros consultados quedan en la URL. El número de asiento abre `EntryDetail`, compartido con el diario, sin abandonar el informe.

El CSV incluye el resultado completo recibido, empresa, ejercicio, período, moneda y totales. Usa BOM UTF-8, separador punto y coma, decimales con coma, escape de comillas y saltos de línea y neutralización de fórmulas en campos textuales. Los totales no se recalculan en el navegador. En agrupaciones exporta las filas agrupadas sin duplicarlas con el desglose de hijos.

## Verificación

Aplicar `npm run db:migrate`. Para pruebas MySQL en PowerShell:

```powershell
$env:TEST_MYSQL='1'
npm test
npm run build
```

`backend/test/reports-db.test.js` crea una empresa y ejercicios temporales, verifica saldos, signos, apertura, agrupación, estados, aislamiento, filtros, estados vacíos, discrepancias y endpoints, y elimina exclusivamente sus propios datos. `report-format.test.js` verifica importes grandes y CSV seguro. La comprobación de navegador cubre filtros, despliegue, Mayor, detalle, retorno, búsqueda y descarga de ambos CSV.

## Límites de esta entrega

Sin PDF ni paginación: se devuelve el resultado completo. Para volúmenes elevados se podrá añadir paginación y exportación por streaming sin cambiar las reglas de cálculo. No hay interfaz de estados, Balance de Situación, Pérdidas y Ganancias, ni procesos de cierre. No se valida aquí documentación económica de asientos históricos: se respetan los estados y se señalan diferencias contables.
