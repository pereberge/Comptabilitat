# Pérdidas y Ganancias por meses

La opción **Pérdidas y Ganancias** del menú permite seleccionar el mes inicial y final del ejercicio mediante cuadros compactos, con el mes abreviado arriba y el año debajo. Un mes aislado se obtiene eligiendo el mismo mes en ambos campos; enero–septiembre devuelve el resultado acumulado de esos meses. Los límites se ajustan al inicio y final reales de los ejercicios no naturales o cortos.

**Por defecto se comparan dos ejercicios**: el seleccionado y el inmediatamente anterior. La casilla **Mostrar tercer ejercicio**, desmarcada inicialmente, añade el segundo ejercicio anterior y sus selectores de meses. Al abrir el informe se elige el ejercicio más reciente por fechas, desde su inicio hasta diciembre, con la comparación activada. Los meses inicial y final de cada columna se pueden cambiar de forma independiente. Cada columna identifica sus fechas efectivas. Al comparar febrero completo se incluye el 29 cuando el año correspondiente es bisiesto. Un ejercicio inexistente aparece como no disponible, sin sustituirlo por un año más antiguo ni mostrar un saldo cero ficticio; un ejercicio existente sin movimientos sí muestra cero.

Se utilizan únicamente movimientos contabilizados de los grupos 6 y 7 entre las fechas seleccionadas, excluyendo apertura, regularización y cierre. Así se conserva el resultado en ejercicios cerrados. No se suma la cuenta 129 ni se trasladan saldos de otros ejercicios. Los gastos llevan signo negativo y los ingresos positivo; se conservan devoluciones y ajustes con su signo real. Los cálculos utilizan céntimos BigInt y sumas DECIMAL.

Las partidas siguen el [modelo abreviado del PGC](https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884#cuentaabreviada), con Otros resultados (678/778). Se usa el padre contable real, sin interpretar los dígitos del sufijo de una subcuenta. Las cuentas ambiguas o personalizadas, como un padre 693 sin desarrollo, aparecen en un diagnóstico y no se asignan silenciosamente a una partida.

Las partidas despliegan cuentas y subcuentas. Los importes de cada columna enlazan al Mayor del período correspondiente con las mismas exclusiones; el botón de retorno restaura los filtros y el ejercicio original. El CSV incluye los ejercicios que se muestran, su detalle y las fechas de cada período. La consulta y la exportación quedan disponibles para usuarios de lectura.

## API

GET /api/accounting/profit-loss?exercise_id=ID&from=2026-01-01&to=2026-12-31&compare_previous=true&comparison_count=3

Cabecera X-Company-Id. from y to son opcionales y toman los límites del ejercicio. comparison_count=3 solicita tres ejercicios; si se omite mantiene la comparación histórica de dos ejercicios para clientes existentes. previous_from y previous_to permiten modificar las fechas del segundo ejercicio; older_from y older_to, las del tercero. comparison.multiple contiene periods, el detalle combinado con amounts por columna y totals por ejercicio. Los períodos ausentes llevan available=false y valores null. Los períodos invertidos, las fechas fuera de ejercicio y los indicadores inválidos se rechazan. La respuesta contiene sections, totals (operating, financial, before_tax, net), checks, diagnostic y comparison cuando se solicita. La consulta completa se ejecuta en una instantánea de solo lectura.

El Mayor y Sumas y Saldos aceptan exclude_annual=true para excluir apertura, regularización y cierre. En el Mayor también se aplica al saldo inicial anterior al período.

## Verificación

backend/test/profit-loss.test.js cubre signos, partidas, precisión, CSV y límites de meses. backend/test/profit-loss-db.test.js usa empresas ficticias para comprobar períodos, estados de asientos, cierres, años bisiestos, ejercicios no naturales, comparación, Mayor y aislamiento de empresa por API. La prueba del navegador comprueba selección de los tres períodos, filtros pendientes de consultar, CSV, retorno del Mayor y presentación móvil.

Al abrir sin filtros se usa el ejercicio más reciente por fechas, desde su inicio
hasta el cierre de diciembre, comparado por defecto con el mismo período del
ejercicio anterior. El tercer ejercicio se añade mediante su casilla opcional. Si el ejercicio no contiene diciembre se usa su último día.
Los enlaces del informe y el retorno desde el Mayor
conservan las fechas, la comparación y la elección del tercer ejercicio; un cambio
manual de ejercicio se respeta. Las URL anteriores a esta vista abren los nuevos
valores por defecto.
