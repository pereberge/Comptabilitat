# Gestión de granjas

Disponible en el menú para empresas cuyo **Formato de empresa** sea **Producción porcina**. La API también comprueba este formato y el ámbito de empresa en las consultas, los documentos y los cambios.

La pantalla comienza con la evolución mensual y los tipos de gasto. La lista de granjas muestra únicamente el código y el nombre; al abrir una granja aparecen sus lotes y el detalle de gastos por factura, albarán y página. El ejercicio del selector superior y los filtros de tipo y fechas delimitan los resultados. La búsqueda de texto e importe actúa sobre el detalle y la exportación CSV. El PDF respeta los filtros de granja, lote, tipo y fechas e identifica el lote de cada gasto.

## Lotes y ciclos de animales

Al abrir una granja se selecciona su lote abierto o, si todos están cerrados, el último. Los totales corresponden a ese ciclo completo; otros lotes se eligen en **Lote seleccionado** y los gastos pendientes quedan separados en **Gastos sin lote**. **Registrar bajas** y **Registrar cuido** están visibles en la barra superior y permiten elegir lote desde la pantalla general.

**Nuevo lote** propone una referencia formada por el código de granja y un consecutivo: `12-1`, `12-2`, `12-3`. El servidor reserva el siguiente número al guardar para evitar duplicados simultáneos; se puede escribir una referencia personalizada. Los códigos antiguos que eran solo un número se adaptan a este formato y las referencias personalizadas se conservan.

El número de animales es opcional mientras no se indiquen kilos o precio de entrada. Un lote sin fecha de salida está **Abierto**. **Cerrar lote** registra la salida de los animales, con su fecha y, opcionalmente, su número. La siguiente entrada crea otro lote. Los lotes cerrados conservan su historial y se pueden consultar o corregir desde **Editar lote**. También se puede registrar un lote histórico indicando entrada y salida al crearlo.

Cada granja tiene como máximo un lote abierto; no se admiten períodos superpuestos. Se permite cerrar un lote y abrir otro el mismo día. Para los gastos de ese día que coincidan con ambos, el lote queda pendiente de elegir manualmente.

El lote se propone por **fecha de factura**, dentro del período de entrada y salida de esa granja. No se supone una fecha de entrada a partir del PDF: las fechas reales deben registrarse en la ficha del lote. Al abrir el gasto se puede mantener la propuesta, elegir otro lote explícitamente o dejarlo sin lote. Cambiar de granja reinicia la propuesta para evitar conservar un lote de otra granja.

Al seleccionar un lote se muestran los costes de su **ciclo completo, incluidos todos los ejercicios**; al volver a todos los lotes o a «Sin lote», vuelve a aplicarse el ejercicio seleccionado arriba. El PDF y el CSV incluyen la referencia del lote. Cerrar y abrir ciclos no altera los importes originales ni genera asientos.

## Detalle de gastos y cuido

Pulsar el nombre o el importe de **Tipos de gasto** abre un detalle con fecha, documento, granja, lote, concepto, base e IVA del ámbito consultado. Desde la pantalla general muestra las granjas del ejercicio; con un lote seleccionado muestra únicamente ese lote. Cada fila permite abrir el gasto.

**Cuido** tiene categoría propia. **Registrar cuido** guarda fecha, importe sin IVA y concepto/cuidador en el lote elegido. Se puede corregir o eliminar desde su fila. Se incluye en el detalle, los tipos de gasto, la evolución, el resultado del lote y el PDF. Los gastos importados también se pueden clasificar como cuido. No genera un asiento ni una factura adicional.

## Ventas manuales

Abrir una granja, seleccionar el lote y pulsar **Nueva venta**. Se introducen cuatro datos: fecha, número de cerdos, kilos por cerdo y precio por kilo sin IVA. Se admiten varias ventas parciales de un mismo lote.

**Kilos totales = cerdos × kilos por cerdo. Importe = kilos totales × precio por kilo.** El formulario calcula ambos valores mientras se escribe y el servidor los vuelve a calcular al guardar. Los kilos admiten tres decimales y el precio cinco; el importe se redondea a céntimos al final del cálculo, sin redondear antes la venta de cada animal. Se acepta coma o punto decimal.

La venta se vincula expresamente al lote seleccionado y al ejercicio que contiene su fecha. Se puede registrar en un lote cerrado. Pulsar la fila permite corregirla o eliminarla, y se actualizan los ingresos y el resultado. Las ventas eliminadas se conservan en la copia de seguridad, pero no cuentan en los resúmenes.

El resultado registrado es la suma de ventas manuales menos los gastos registrados sin IVA del ámbito consultado. Incluye todos los tipos de gasto aunque se filtre el detalle por una categoría. Respeta el ejercicio, granja, lote y fechas de la vista; al abrir un lote se incluyen todos sus ejercicios. Si aún no hay ventas se indica «Sin ventas registradas». Este resultado depende de los gastos y ventas introducidos en este apartado.

Las ventas tienen una exportación CSV propia y se incluyen en el informe PDF junto al resultado. Este registro no genera facturas ni asientos, ni cierra automáticamente el lote o cambia sus animales de salida.

## Informe por granja y lote, bajas y pienso

**Informe de granja y lote** abre un selector explícito de granja y lote. **Ver informe** muestra la vista previa y **Descargar PDF** genera el mismo contenido. Siempre abarca el ciclo completo, todos los ejercicios y todos los tipos de gasto, independientemente de los filtros de la pantalla.

Incluye entrada de animales, kilos por animal y peso total, precio por unidad y coste de compra, gastos detallados, salidas vendidas con pesos y precios, bajas registradas y mortalidad, traspasos recibidos/enviados, balance de pienso e índice de conversión económico. El precio de entrada se introduce por animal. Si esa compra ya aparece en una factura importada, marcar la casilla correspondiente evita sumarla dos veces al resultado.

Las bajas se registran dentro del lote con fecha, número de animales y motivo. El saldo es animales de entrada menos vendidos y bajas registradas: un saldo pendiente no se transforma automáticamente en bajas.

**Traspasar pienso** registra fecha, lote de origen y de destino, kilos y coste por kilo. Puede unir dos granjas o dos ciclos distintos de la misma granja. Resta kilos y valor al origen y los añade al destino, manteniendo el coste total de la empresa. Se sugiere un coste medio orientativo editable. El control impide retirar más pienso que las entradas registradas y revierte íntegramente una edición o eliminación que deje sin saldo un traspaso posterior. Usa la fecha del albarán cuando está disponible para comprobar la disponibilidad; el año se deduce como la fecha más reciente anterior o igual a la factura.

Los kilos automáticos proceden de la familia 65 de pienso a granel del proveedor. En otros productos, indicar expresamente **Kilos de pienso** al abrir el gasto. Una cantidad de unidades de medicamento o suministro no se convierte automáticamente en kilos. Los movimientos de pienso no generan asientos ni facturas nuevas.

El informe define **IC económico = pienso neto consumido / (kg vendidos − kg totales de entrada)**. Pienso neto consumido = facturado + traspasos recibidos − enviados + stock inicial − stock final. Expresa kg de pienso por kg de ganancia de peso y recoge el efecto económico de las bajas; la relación general entre pienso y ganancia de peso se documenta en [AHDB](https://ahdb.org.uk/knowledge-library/pork-kpis-yield).

El índice se marca provisional con el lote abierto, saldo de animales pendiente, salidas declaradas que no coinciden con ventas, kilos no identificados o stocks inicial/final sin completar. No se calcula si faltan pesos, no hay consumo registrado o la ganancia de peso no es positiva. Mientras un stock esté vacío se utiliza cero para el cálculo orientativo, manteniendo la marca provisional. Las existencias finales deben corresponder al saldo después de los traspasos; indicar cero si el silo terminó vacío.

## Importación de facturas

El primer adaptador admite las facturas de **Camp i secció de crèdit Sant Isidre** con columnas CODI, DESCRIPCIÓ, QUANTITAT, PREU, IMPORT y TOTAL ALB., y la indicación GRANJA. Admite hasta 15 MiB y 300 páginas de PDF con texto.

1. Seleccionar la empresa porcina y el ejercicio de las fechas de factura.
2. Pulsar **Importar gastos del PDF** y revisar las facturas nuevas, los costes y las granjas.
3. Pulsar **Importar costes**. Se guardan las facturas, las líneas y el PDF original.

Se exige que el CIF del destinatario coincida con la ficha de empresa. Las fechas de factura deben pertenecer al ejercicio seleccionado. El código GRANJA identifica cada granja o nave; dos códigos se mantienen separados aunque sus nombres se parezcan. Se conserva la granja entre páginas de la misma factura y se reinicia al empezar otra factura. Los gastos sin indicación de granja quedan **Pendientes de asignar**. Pulsar cualquier punto de la fila abre el detalle para asignar una granja o cambiar el tipo de gasto. La clasificación por producto es una propuesta editable.

El coste se muestra **sin IVA**. La cuota de IVA y el total facturado se muestran por separado. Los cálculos usan enteros y conservan los importes originales de tres decimales. Los céntimos de redondeo se distribuyen entre las líneas manteniendo exactamente los totales de cada factura y tipo de IVA. Se aceptan los redondeos acotados de línea y de IVA del documento. TOTAL ALB. y los arrastres son comprobaciones, nunca gastos adicionales. Las líneas informativas sin precio ni importe conservan coste cero.

La identidad de una factura es el NIF del proveedor y su referencia. Una repetición idéntica se omite; una referencia repetida con contenido diferente bloquea la importación. La comparación usa los datos de origen y no depende de la clasificación propuesta. Las importaciones son atómicas y los cambios de asignación y ficha comprueban la versión para impedir que se sobrescriban cambios simultáneos.

Este es un registro de costes analíticos de las facturas importadas. **No genera asientos ni facturas contables**. Permite analizar documentos cuyas facturas ya figuran en el diario sin duplicar su contabilización. Su total no equivale necesariamente al conjunto de gastos contables de la empresa.

## Datos y copias

La migración `022_pig_farms.sql` crea `pig_farms`, `farm_documents`, `farm_invoices` y `farm_cost_lines`. `023_farm_lots.sql` añade `farm_lots` y la asignación de lote de los gastos. Las copias de seguridad incluyen estas tablas, las asignaciones manuales y el PDF original. Las copias anteriores siguen siendo legibles, comprobando primero su checksum original; las anteriores a los lotes conservan sus gastos sin inventar ciclos. Las granjas, lotes y documentos son comunes a la empresa; las facturas y las líneas corresponden al ejercicio. Al vaciar o sustituir un ejercicio se archivan sus costes y facturas de granjas antes de borrarlos, conservando las fichas, los lotes y los documentos comunes.

`024_farm_sales.sql` añade las ventas manuales, con referencias a lote y ejercicio. Las copias incluyen las ventas y las eliminaciones; las copias anteriores sin esta tabla siguen siendo compatibles. Al vaciar o sustituir un ejercicio también se archivan sus ventas antes de retirarlas, conservando los lotes y las ventas de otros ejercicios.

`025_farm_production.sql` añade datos de entrada y stock al lote, kilos explícitos a gastos de pienso y registros de bajas y traspasos. Se incluyen en las copias y en el archivo anterior al vaciado de un ejercicio. Las copias anteriores restauran los datos nuevos como pendientes, sin inventar pesos, precios, bajas ni movimientos. Las referencias de los dos extremos de un traspaso se remapean al restaurar en otra empresa.

`026_farm_care_lot_codes.sql` añade los gastos de cuido y adapta los códigos numéricos de lotes. El cuido se incluye en las copias y se archiva antes de vaciar el ejercicio. En las copias anteriores a esta migración, los códigos numéricos se adaptan después de comprobar el checksum original para poder recuperar los mismos lotes.

La importación requiere permiso de importar datos. La edición de fichas, asignaciones y ventas requiere permiso de editar contabilidad. La consulta y la descarga de informes siguen los permisos de lectura de la aplicación.

## Verificación del documento inicial

`FACT4320.0972-V3.pdf` contiene 193 páginas, 136 facturas y 2.092 líneas. Identifica 22 códigos de granja. Sus totales son 1.655.961,60 € de base, 169.646,83 € de IVA y 1.825.608,43 € facturados. Hay 67 líneas sin granja, con 76.142,08 € de base, que requieren asignación manual. Estos valores se comprueban en la prueba del PDF original mediante `TEST_FARM_PDF`.

Pruebas: `node --test backend/test/farms.test.js backend/test/farm-lots.test.js backend/test/farm-sales.test.js backend/test/farm-production.test.js`; para integración con MySQL, establecer `TEST_MYSQL=1` y ejecutar también `backend/test/farms-db.test.js backend/test/farm-lots-db.test.js backend/test/farm-sales-db.test.js backend/test/farm-production-db.test.js`.
