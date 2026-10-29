# Cartera y remesas bancarias

En **Cartera**, cada recibo pendiente o parcial permite **Editar vencimiento** y **Dividir recibo**. Puedes cambiar las fechas e importes del reparto. La suma debe coincidir exactamente con el pendiente y cada parte debe ser positiva. Una factura admite hasta 60 recibos. La división conserva los cobros, pagos y contrasientos anteriores y no genera nuevos asientos.

Dentro de **Cartera** hay dos apartados separados, con sus propios recibos e historial: **Remesas de clientes** y **Remesas de proveedores**. Puedes preparar:

- **Remesas de clientes · cobros domiciliados:** recibos de facturas emitidas con forma de cobro domiciliación. Formato SEPA CORE `pain.008.001.08`, apartado de cobros 19 SEPA.
- **Remesas de proveedores · pagos por transferencia:** recibos de facturas recibidas con forma de pago transferencia. Formato SEPA `pain.001.001.09`, apartado de pagos 34 SEPA.

Los ficheros son XML, no los antiguos cuadernos de texto. El banco puede exigir su identificador de presentador y una configuración concreta del contrato de remesas.

Guarda el IBAN y BIC de la empresa en **Empresas → Cobros**. Para domiciliaciones, completa también el **Identificador de acreedor SEPA**, facilitado por el banco. El identificador de presentador es opcional y se utiliza si el banco lo exige. La cuenta y estos identificadores se pueden ajustar al preparar una remesa.

En la ficha de cada cliente o proveedor, guarda su IBAN en **Cobro y pago**. Para clientes domiciliados, completa además la referencia, fecha de firma y secuencia del mandato firmado en **Mandato de domiciliación SEPA CORE**. No se inventan referencias ni fechas de autorización. Las remesas consultan la ficha actual; si no existe una ficha de pago se recupera el IBAN guardado en la factura. Un NIF distinto entre factura y ficha bloquea la preparación hasta revisar el tercero.

Selecciona recibos, filtra por vencimiento o tercero y pulsa **Revisar remesa**. La revisión muestra el titular, los IBAN, los mandatos, las fechas bancarias y el total exacto. Los vencimientos futuros se respetan: los recibos se agrupan por fecha y, en domiciliaciones, por secuencia. Los vencidos se presentan a partir de la fecha indicada en **Cobrar a partir de** o **Pagar a partir de**. El banco aplica sus horarios y plazos de presentación.

**Generar y descargar XML** guarda una remesa y descarga el fichero para cargarlo en la banca electrónica. El importe de cada orden corresponde al pendiente del recibo, incluidos los pagos parciales. La operación no registra cobros, pagos ni asientos. Registra el movimiento cuando el banco lo confirme.

El historial conserva el fichero original: volver a descargarlo recupera los mismos bytes e identificadores aunque cambie después la ficha. Un recibo incluido en una remesa preparada no puede volver a remesarse, cambiar de fecha o dividirse, y también se protege su factura y ejercicio frente al borrado. **Cancelar en el programa** libera esos recibos y conserva la copia histórica. Si el fichero ya se entregó al banco, esta cancelación local no retira la orden bancaria.

Las copias de seguridad incluyen los mandatos, el historial de divisiones y los ficheros bancarios. Al restaurar se remapean las reservas a los nuevos recibos. Si una copia anual no contiene todos los recibos de una remesa de varios ejercicios, se recupera como histórica sin reservar identificadores ajenos al archivo. Las copias anteriores siguen siendo compatibles.

Aplicar la migración `036_portfolio_remittances.sql`.

Referencias técnicas: [EPC SCT Customer-to-PSP 2025](https://www.europeanpaymentscouncil.eu/document-library/implementation-guidelines/sepa-credit-transfer-customer-psp-implementation-1), [EPC SDD CORE Customer-to-PSP 2025](https://www.europeanpaymentscouncil.eu/document-library/implementation-guidelines/sepa-direct-debit-core-customer-psp-implementation-1) y [EPC Creditor Identifier Overview](https://www.europeanpaymentscouncil.eu/document-library/guidance-documents/creditor-identifier-overview). Los XML se verifican con esquemas publicados por un banco; la aceptación final depende del banco receptor y del contrato del presentador.

Validación automatizada: `node --test backend/test/sepa.test.js` y, con MySQL disponible, `TEST_MYSQL=1 node --test backend/test/portfolio-remittances-db.test.js`. La validación XSD incluida utiliza PowerShell/.NET en Windows.
