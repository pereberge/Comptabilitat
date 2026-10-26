# Imprimir facturas y prepararlas para correo

En Facturas están disponibles las acciones Imprimir, PDF y Correo para cada factura. En el detalle se llaman Imprimir, Descargar PDF y Preparar correo.

- **Imprimir** abre el diálogo del navegador con una copia de la factura en A4. Puedes elegir una impresora o Guardar como PDF. La copia incluye emisor, destinatario, conceptos, IVA, retención, importe a cobrar y vencimientos. Los códigos contables y asientos internos no aparecen.
- **Descargar PDF** guarda el documento directamente. Las facturas recibidas con un PDF original archivado descargan ese original. Si no tienen original, se genera un resumen identificado como copia de los datos contables. La impresión de una factura recibida siempre presenta este resumen.
- **Preparar correo** permite revisar destinatario, asunto y mensaje. El botón Descargar correo con PDF (.eml) guarda un borrador con el PDF adjunto. Ábrelo en un programa compatible con archivos .eml, revisa los datos y envíalo desde tu cuenta. La aplicación no realiza envíos automáticos.

Si la factura tiene originales archivados, el selector PDF adjunto permite elegir uno de ellos o el PDF preparado. El original de una factura recibida se selecciona por defecto.

La alternativa Abrir correo y descargar PDF descarga el archivo y abre el programa de correo predeterminado mediante mailto. En esta alternativa debes adjuntar manualmente el PDF descargado. El enlace mailto no puede incorporar adjuntos.

La preparación de estos documentos no modifica la factura, los recibos ni el diario.

## Generación de PDF en el servidor

El servidor usa playwright-core con Microsoft Edge instalado en Windows; en otros sistemas usa Chrome por defecto. No descarga navegadores al instalar dependencias. Las variables opcionales INVOICE_PDF_BROWSER_CHANNEL e INVOICE_PDF_BROWSER_PATH permiten seleccionar un canal o ejecutable disponible en el servidor. Se admiten dos generaciones simultáneas; los adjuntos originales se recuperan sin usar el navegador.

El generador bloquea conexiones de red y ejecuta la plantilla sin JavaScript. Los logotipos y QR se incorporan dentro del documento. Si no se encuentra el navegador, la pantalla indica que se puede usar Imprimir y Guardar como PDF.

Los perfiles temporales se crean en backend/.runtime/invoice-pdf y se intenta eliminarlos al terminar cada generación. Si Windows mantiene algún archivo bloqueado, puede quedar un perfil temporal residual en esa carpeta. INVOICE_PDF_TEMP_DIR permite cambiar esa ubicación. Se usa una carpeta aislada por documento para evitar bloqueos de permisos de Edge en la carpeta temporal de Windows.
