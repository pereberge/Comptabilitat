# Facturas Ardiaca

El lector reconoce el diseño digital de AGROPECUARIA ARDIACA MORLO, SL (CIF B25457086), con número y fecha bajo cabeceras independientes y columnas Unidades, Descripción, PVP, descuento, IVA y total. Se reutiliza en Facturas y en Compras. Los formatos existentes se mantienen.

Se verifican cantidad y precio con los cálculos exactos comerciales existentes, y base, cuota de IVA y total con el cálculo de facturas. Si falta la información necesaria, cambian las columnas, aparecen descuentos no soportados por este adaptador o no cuadran las cifras, el documento pasa al lector general y queda pendiente de revisión; no se confirma el formato específico con importes inventados.

`S26 125.pdf` es un PDF legible y renderizable de una página. Se ha comprobado la factura S26/125, del 06/11/2026, a RECICLAJES DEL BAJO CINCA, SL: 38 horas de tractor a 125 €, base 4.750 €, IVA 10 % (475 €), total 5.225 €. El vencimiento impreso es el mismo 06/11/2026. La previsualización de Facturas en Reciclajes 2026 es correcta, sin guardar ni contabilizar el documento.

El fallo de reconocimiento original confundía la base con el total y no identificaba las partes ni el número de factura. La apertura local y renderizado del PDF se han comprobado; no se ha reproducido un fallo del visor de la aplicación ni modificado dicho visor. No se han encontrado copias guardadas con S26 en el nombre durante el diagnóstico. Debe volver a seleccionarse el archivo desde la empresa y ejercicio correspondientes.

Prueba: definir `TEST_ARDIACA_PDF` con la ruta del archivo y ejecutar `node --test backend/test/invoice-ardiaca.test.js backend/test/invoice-recognition.test.js backend/test/purchase-sant-isidre.test.js`.
