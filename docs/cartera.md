# Facturas y cartera de cobros y pagos

Disponibles en **Facturas** (`/facturas`) y **Cartera** (`/cartera`). Aplicar
`npm run db:migrate` para incorporar `008_invoices_portfolio.sql`.

## Registrar una factura

1. Selecciona la empresa y un ejercicio abierto. En Facturas, elige **Nueva factura
   emitida** para un cobro o **Registrar factura recibida** para un pago.
2. Revisa el número propuesto en las emitidas, o introduce el número del proveedor
   en las recibidas. Completa las fechas, el tercero y los conceptos. Cada
   concepto admite base e IVA; la retención, si procede, se aplica a la base total.
3. Selecciona una subcuenta de tercero o crea una automáticamente. Las facturas
   anteriores permiten recuperar los datos del tercero. Un CIF/NIF ya registrado
   para ese tipo de factura reutiliza su subcuenta si no se selecciona otra.
4. Define uno o varios vencimientos. **Distribuir importe** reparte el total en
   hasta 60 recibos mensuales o con otra separación en meses. Las fechas y los
   importes de cada recibo son editables en el alta; deben sumar el total exacto.
5. **Registrar factura y crear recibos** guarda factura, conceptos, asiento y
   todos los recibos en una única transacción.

En emitidas se propone el consecutivo de la última serie identificada de la empresa
y ejercicio. El número se puede editar; al editarlo pasa a numeración manual.
**Usar siguiente número** recupera la propuesta automática. Las emitidas no pueden repetir número dentro
de una empresa; las recibidas permiten el mismo número de proveedores distintos.
Un número anulado continúa reservado. La factura conserva una copia de la ficha
de empresa vigente en el registro, incluido CIF/NIF, domicilio, IBAN y textos.
Cambiar la empresa después no modifica ese documento.

Las cuentas automáticas son 4300/4400 para clientes/deudores, 4000/4100 para
proveedores/acreedores, 7000/6000 para ingreso/gasto, 4770/4720 para IVA y
4730/4751 para retenciones. En **Cuentas contables** se pueden seleccionar otras
subcuentas compatibles, incluidas las del grupo 2 para compras de activos. Los
códigos se completan según la longitud de subcuentas configurada en la empresa.

Los importes se calculan con céntimos BigInt, IVA redondeado por concepto y
retención sobre la base total. El total es base más IVA menos retención. En un
fraccionamiento, los céntimos sobrantes se asignan al último recibo y las fechas
de fin de mes conservan su anclaje: 31/01, 28/02 y 31/03, por ejemplo.

## Gestionar la cartera

La cartera incluye los recibos de **todos los ejercicios de la empresa**, para
mantener visibles los importes pendientes de años anteriores. Permite filtrar
por cobro/pago, estado, ejercicio de origen, vencimientos, tercero o número de
factura. Los totales separados de cobros y pagos corresponden a los filtros.

Un recibo está pendiente, parcial, liquidado o anulado. **Vencido** indica un
pendiente cuyo vencimiento es anterior a la fecha de referencia. Esa fecha sirve
para clasificar vencidos; no reconstruye los saldos históricos de la cartera.

**Registrar cobro/pago** admite importes parciales, fecha, banco/caja, forma,
referencia y observaciones. El ejercicio del movimiento se obtiene de su fecha y
debe estar abierto. Una factura de un año cerrado se puede liquidar en otro año
abierto. Se registra el asiento de banco/caja contra el tercero y se actualiza
el pendiente en la misma transacción. No se permiten sobrepagos ni duplicados al
reintentar la misma solicitud. Las liquidaciones concurrentes se serializan por
empresa y bloquean el recibo antes de comprobar su pendiente.

**Editar vencimiento** cambia fecha, forma y observaciones de un recibo pendiente
o parcial. Conserva la fecha inicial y no modifica su importe ni los movimientos.
El detalle muestra factura de origen, fechas, importes, estado e historial de
cobros y pagos, con enlaces a sus asientos.

## Correcciones e impresión

**Anular movimiento** crea un contrasiento en un ejercicio abierto y restaura el
pendiente; el movimiento original y el motivo permanecen en el historial.
**Anular factura** crea su contrasiento y anula los recibos. Requiere anular
previamente todos sus cobros/pagos activos; la fecha de anulación no puede ser
anterior a los movimientos que revierte. Los documentos contabilizados no se
reescriben ni se eliminan.

Facturas y recibos disponen de vista imprimible mediante el diálogo del navegador
para imprimir o guardar PDF. La cartera también permite exportar el listado y
sus totales a CSV con formato decimal español y protección frente a fórmulas.

## API y alcance

Todas las rutas usan `X-Company-Id` y validan ejercicio, cuentas y documentos
dentro de esa empresa:

- `GET/POST /api/invoices`, `GET /api/invoices/parties`, `GET /api/invoices/:id`.
- `POST /api/invoices/:id/void`.
- `GET /api/portfolio`, `GET/PATCH /api/portfolio/receipts/:id`.
- `POST /api/portfolio/receipts/:id/settle`.
- `POST /api/portfolio/settlements/:id/reverse`.

Altas, liquidaciones y anulaciones usan un UUID de solicitud y su huella de datos.
La repetición devuelve la operación guardada; cambiar datos conservando el UUID
se rechaza. Si falla un paso se revierten factura, cuentas nuevas, recibos y
asientos de esa operación.

Esta funcionalidad registra e imprime facturas con importes positivos y sus
recibos. No incluye remesas SEPA, comunicación bancaria, conciliación automática,
envío por correo, lectura de facturas escaneadas ni transmisión fiscal. Los
diarios PDF y los asientos manuales existentes no generan recibos retrospectivos:
no aportan el desglose y los vencimientos de la factura.

Las pruebas usan empresas temporales y verifican partida doble, impuestos,
vencimientos, parciales, concurrencia, idempotencia, anulaciones, aislamiento y
reversión completa en caso de error. Los archivos de prueba se ejecutan de forma
secuencial para evitar interferencias entre sus transacciones en el MySQL
compartido; las pruebas de concurrencia mantienen conexiones simultáneas dentro
de cada caso.


Las facturas emitidas muestran el anagrama de su empresa en el formulario y en
la cabecera del documento. También se incluye al imprimir o guardar en PDF;
la impresión espera a que la imagen esté cargada. En facturas anteriores sin
un enlace de anagrama guardado, se consulta el de su propia empresa emisora.
El anagrama se adapta al espacio disponible sin deformarse.

## Consecutivo de facturas emitidas y búsqueda de terceros

La numeración conserva prefijo, ceros iniciales y sufijo: `A-240 → A-241`,
`2026/0099 → 2026/0100` o `F-009-A → F-010-A`. Dentro de la serie reciente
se toma el mayor número conocido del ejercicio, incluidos los anulados. Al iniciar
un ejercicio sin numeración conocida se propone `AAAA/0001`. Se comprueban los
números ya usados en la empresa para evitar colisiones. Si hay números manuales sin cifras, se avisa y se propone la última serie
numérica identificable. Si no existe ninguna referencia numérica previa, se pide
introducir el número manualmente.

También se identifican números explícitos en asientos de ventas del diario,
como `N/ FAC. Nº A-240` o `Factura emitida 2026/0010`, con cargo a cliente/deudor
y abono a ingresos. Los asientos sin número identificable no se convierten en
referencias inventadas: cuando hay ventas posteriores sin número, la pantalla
avisa de que hay que comprobar el consecutivo con las facturas originales.

La consulta propone un número sin reservarlo. Si se mantiene el modo automático,
el servidor lo asigna dentro de la transacción de factura, asiento y recibos, bajo
el bloqueo de empresa. Dos altas simultáneas obtienen consecutivos diferentes;
una operación fallida no consume un número. Un reintento con el mismo UUID
devuelve la factura original. La numeración de las recibidas y las referencias
extraídas de un PDF se conservan según el documento.

En **Buscar cliente / proveedor por nombre o código** se filtra la lista de
subcuentas por nombre, razón social, código o CIF conocido de facturas anteriores.
La búsqueda acepta nombres sin acentos, varias palabras y códigos con punto.
Emitidas muestra clientes/deudores (430/440) y recibidas proveedores/acreedores
(400/410) de la empresa activa. Buscar no cambia la selección; seleccionar una
cuenta recupera los datos disponibles del tercero. Se puede seguir creando una
subcuenta nueva automáticamente.

`GET /api/invoices/next-reference?exercise_id=…` devuelve número propuesto,
última referencia identificada y avisos, con el ámbito `X-Company-Id`.
`POST /api/invoices` admite `auto_reference:true` solo para emitidas nuevas;
en ese modo el servidor calcula la referencia final al guardar. Sin ese indicador
se conserva la referencia manual. No requiere una nueva migración.

`invoice-numbering.test.js` cubre formatos, colisiones, precisión, diarios
importados y avisos. `invoice-numbering-db.test.js` comprueba concurrencia,
reintentos, rollback, números anulados, referencias manuales, aislamiento y API.
