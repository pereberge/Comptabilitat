# Detección de facturas y formatos recordados

Al añadir un documento, el programa lee el texto del PDF y propone nombre, número de factura, fecha, base imponible, IVA e importe total. Las facturas y posibles facturas se guardan en **Facturas pendientes de gestionar**, con estado **Pendiente de revisar** o **Datos pendientes de completar**. Se puede cambiar el apartado para conservarlo como documento general.

En **Documentación → Documentos**, **Detectar facturas** analiza los PDF de la lista actual, respetando la búsqueda. **Analizar documento** vuelve a leer un solo original, también para aplicar un formato confirmado posteriormente. La versión del documento se comprueba antes de actualizarlo. Un error en un archivo no impide analizar el resto. Los originales no se alteran.

**Revisar para contabilizar** abre el circuito existente de Facturas. Primero se crea un borrador; revisa los datos, corrige la propuesta y confirma la contabilización. La detección y el análisis no crean asientos ni recibos. Se mantienen las comprobaciones de empresa, ejercicio, duplicados y permisos. Un PDF con varias referencias requiere separar las facturas.

Al confirmar una factura se aprende su formato cuando el original permite identificar al proveedor y localizar etiquetas inequívocas para el número y el total. Se guardan la identidad del proveedor y reglas de lectura de etiquetas, sin reutilizar números, fechas ni importes anteriores. Las facturas nuevas se leen de nuevo y siempre requieren revisión. Si cambia el formato o falta una etiqueta, no se aplica la plantilla.

Los formatos se conservan en la extracción de la factura confirmada, dentro de `invoice_documents`. Son propios de cada empresa, persisten tras reiniciar y viajan con las copias de seguridad de las facturas. No se aprende de borradores ni de documentos sin confirmar. No hace falta una migración adicional. La búsqueda considera los últimos 500 documentos confirmados que contienen reglas de formato.

La lectura funciona con PDF que contienen texto, incluidos campos separados en una misma línea. Los PDF escaneados, imágenes y otros formatos se conservan para completar los datos manualmente; no se añade un servicio OCR externo ni se envían los documentos a terceros. Presupuestos, proformas, albaranes y extractos identificados como tales conservan su clasificación de documento.

Validación: `node --test backend/test/invoice-recognition.test.js` comprueba clasificación, importes, disposición del texto, formatos y límites. `TEST_MYSQL=1 node --test backend/test/document-recognition-db.test.js` comprueba el circuito en empresas temporales y retira sus datos al terminar.
