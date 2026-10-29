# Datos fiscales de clientes y proveedores

En **Mantenimiento de subcuentas**, las subcuentas de clientes y deudores (430 y 440) y de proveedores y acreedores (400 y 410) tienen una ficha de **Datos fiscales**. Aparece al crear la subcuenta, desde su detalle y mediante el botón de la lista.

La ficha guarda nombre o razón social, CIF/NIF, domicilio fiscal, código postal, población, provincia, país, persona de contacto, teléfono y correo electrónico. La descripción contable y el nombre fiscal pueden ser distintos. Se puede buscar una subcuenta por nombre fiscal o NIF.

El apartado **Cobro y pago** guarda la forma de cobro o pago, los días hasta el primer vencimiento, el número de recibos, los meses entre ellos, un día fijo de pago opcional y el IBAN del tercero. Al seleccionar el cliente o proveedor, las nuevas facturas cargan estas condiciones y generan los recibos automáticamente al cambiar la fecha o el importe. El reparto conserva todos los céntimos y adapta los días 29, 30 o 31 al último día del mes cuando corresponda. Sin condiciones guardadas se utiliza un recibo a 30 días y la forma de pago de la empresa.

Se pueden ajustar los recibos de una factura desmarcando **Crear recibos automáticamente con la ficha del cliente / proveedor**. Las propuestas de PDF conservan inicialmente sus vencimientos originales; al seleccionar de nuevo un tercero se cargan sus condiciones automáticas. Al registrar una factura se conservan sus condiciones e IBAN junto a sus recibos; cambiar la ficha después no modifica recibos ya registrados. Si la ficha cambia mientras se prepara una factura automática, hay que reabrirla para revisar los nuevos vencimientos. Requiere la migración **035_party_payment_profiles.sql**; las copias de seguridad anteriores siguen siendo compatibles.

Al seleccionar la subcuenta en una factura emitida o recibida, se cargan sus datos fiscales. Se pueden ajustar para esa factura sin modificar la ficha. La factura registrada conserva una copia de esos datos: cambiar la ficha después no cambia facturas anteriores. La dirección completa aparece en el detalle, la impresión y el PDF generado. Los PDF originales importados se conservan tal como se recibieron.

Cuando una factura antigua tiene campos fiscales vacíos, su visualización y su PDF generado completan esos huecos desde las fichas de la empresa y de la subcuenta. Los valores guardados y sus copias originales se conservan. No se mezclan datos si el NIF guardado es distinto al de la ficha actual. Las propuestas de PDF importados también recuperan el domicilio completo de la subcuenta seleccionada, incluso si se identifica automáticamente por el NIF.

La apertura del PDF reutiliza el documento generado mientras su contenido no cambie. Cualquier cambio visible, incluidos los datos fiscales, el anagrama o los vencimientos, genera una nueva copia. La memoria es limitada y caduca a los diez minutos; el navegador de generación se reutiliza con un contexto independiente por documento y se cierra tras un minuto sin trabajo. Los originales importados se siguen descargando sin modificarlos.

El botón **PDF** del listado y **Ver PDF** del detalle abren el documento directamente en el visor del programa. No es necesario guardarlo para consultarlo. El visor ofrece **Descargar PDF** si se quiere conservar una copia.

Los clientes disponen también de **Mandato de domiciliación SEPA CORE**, con referencia, fecha de firma y secuencia para los ficheros de cobro. Desde **Cartera** se pueden cambiar fechas y dividir importes pendientes; dentro de **Cartera**, los apartados **Remesas de clientes** y **Remesas de proveedores** preparan los XML de cobros y pagos, con historiales separados. [Funcionamiento de cartera y remesas](cartera-remesas.md).

Una subcuenta creada desde una factura recibe también su ficha fiscal. Si se introduce un NIF ya guardado, se reutiliza la subcuenta correspondiente; si hay varias del mismo tipo con ese NIF, se pide seleccionar una.

La migración **034_account_party_profiles.sql** añade los campos sin alterar los asientos ni las facturas existentes. Recupera las fichas de los proveedores antiguos y, si no existe una ficha, de la última factura registrada para la subcuenta. Las copias de seguridad incluyen estos datos y admiten archivos anteriores a esta ampliación.
