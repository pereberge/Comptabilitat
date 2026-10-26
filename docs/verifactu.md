# Preparación de VERI*FACTU

La opción **VERI*FACTU** del menú prepara cada empresa para el portal de pruebas externas de AEAT. Esta versión solo ofrece **pruebas**; no habilita producción ni afirma cumplir todos los requisitos de un SIF en servicio. Ninguna empresa se activa al instalar la migración.

Para programas de desarrollo propio también hay que identificar fiscalmente al productor. Si una empresa desarrolla su propio sistema para uso propio, esa empresa debe emitir la declaración responsable de la versión en operación, según la [FAQ de AEAT sobre desarrollos propios](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html). La propiedad del programa no permite deducir por sí sola un nombre fiscal o NIF; esos campos se completan con los datos de la persona o entidad que asuma ese papel.

Entra en VERI*FACTU con la empresa elegida en la barra superior. Para un programa propio, la opción **Datos de esta empresa · programa propio** utiliza automáticamente el nombre fiscal y el NIF de esa empresa como productor. Completa esos datos en **Empresas** y guarda la configuración. Antes del primer registro, las correcciones de la ficha se sincronizan; después se conserva la identidad usada por la cadena. **Otro productor** mantiene la configuración explícita para otros casos. Para activar la preparación también se necesitan un nombre fiscal y NIF español válidos del emisor. La instalación recibe un identificador al guardar. Una vez generados registros se conserva la identidad del programa y del emisor para no romper su cadena.

Las nuevas facturas emitidas desde el formulario generan, dentro de la misma transacción que su asiento y recibos, un registro de alta, huella SHA-256, XML SOAP y QR del portal de pruebas. Se preparan facturas completas **F1**, destinatario con NIF español, IVA nacional en régimen general al 4 %, 10 % o 21 % y, si procede, retención. El importe fiscal del XML y del QR es base más IVA, antes de la retención; la cartera mantiene el importe neto a cobrar. Los datos no admitidos hacen que se revierta la emisión completa, sin dejar asiento, recibos o registros a medias.

Las facturas recibidas y la contabilización de PDF ya emitidos no generan altas VERI*FACTU. Tampoco se registran retroactivamente facturas anteriores a la activación. Una anulación de una factura de pruebas registrada agrega un registro de anulación y conserva el alta original. La anulación corresponde a una factura emitida por error cuando ese es el procedimiento aplicable; no sustituye una factura rectificativa.

La cadena pertenece a la empresa y la instalación, compartida por todos los ejercicios; el bloqueo transaccional de la empresa serializa las emisiones concurrentes. Los reintentos de creación reutilizan el registro. El detalle de la factura muestra sus estados y el QR; su impresión o PDF incluye un QR de 35 mm y la indicación visible **PRUEBAS · Documento de ensayo, sin validez fiscal**.

## Certificado y envío al portal de pruebas

Los certificados y sus contraseñas permanecen en el servidor y quedan fuera de las copias de datos de la aplicación. No se cargan mediante el navegador ni se incluyen en las respuestas de configuración.

- Configura `VERIFACTU_CERT_DIR` con un directorio privado fuera del repositorio.
- Guarda el certificado de la empresa como `<company_id>.pfx` dentro de ese directorio.
- Configura su contraseña con `VERIFACTU_PFX_PASSWORD_<company_id>` en el entorno del servidor. El número es el identificador interno de la empresa, no su NIF.
- Reinicia el servidor después de configurar el entorno. El certificado debe corresponder al emisor o a una representación autorizada y admitir los algoritmos TLS de Node.

**Enviar a AEAT · pruebas** remite un registro al servicio de pruebas fijado en el código: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`. No se permite introducir otra URL ni seleccionar producción. Se valida TLS y se usa el certificado de la empresa de la petición. No se ha realizado ningún envío a AEAT durante el desarrollo o las pruebas automatizadas.

Se respeta el orden de la cadena y el tiempo de espera de la respuesta. Se distinguen pendiente, aceptado, aceptado con errores, rechazado y recepción sin confirmar. Se guardan el XML de respuesta, CSV, error e historial de intentos. Un error de conexión conserva el mismo XML, fecha, hash y clave de factura en el reintento. Una respuesta de otra factura o con operación distinta no se considera aceptación. Los duplicados tampoco se marcan automáticamente como aceptados: requieren revisión de lo que consta en AEAT.

El envío de esta preparación es manual. Los rechazos y aceptaciones con errores quedan visibles para revisión; esta versión no ofrece subsanaciones ni facturas rectificativas. El soporte de otros tipos de factura, destinatarios extranjeros, exenciones, inversión del sujeto pasivo, regímenes especiales y la remisión automática con gestión de incidencias deben completarse antes de pasar a producción. También están pendientes las pruebas reales con certificado y la declaración responsable del productor para la versión final. No se ha firmado ni simulado esa declaración.

## Conservación y copias

La aplicación no ofrece edición ni eliminación de los registros fiscales. Las facturas que tienen registros se conservan; el borrado de facturas, el vaciado de ejercicios y la importación con sustitución bloquean operaciones que eliminarían su trazabilidad. Los documentos de los demás ejercicios siguen su flujo habitual.

**Hacer copia de seguridad** incluye el archivo fiscal completo de la empresa cuando existe configuración VERI*FACTU: registros, configuración, estados, respuestas e intentos. Se incluye la cadena completa incluso en copias parciales, para conservarla como archivo. Para recuperar esos registros activos es necesaria una **copia completa de la empresa**, con todas sus facturas y sin una cadena fiscal preexistente en el destino. No se mezclan ni sustituyen cadenas.

La restauración completa valida la secuencia, las huellas y el XML, remapea solamente los identificadores internos de empresa, ejercicio, factura y entrega, y conserva literalmente el contenido fiscal. Configuración, facturas y cadena se recuperan en una única transacción. Después de restaurar, la preparación queda pausada; hay que revisar el certificado y reactivar las pruebas expresamente antes de generar nuevos registros. Los registros aceptados conservan su estado y CSV. **Descargar archivo de registros** exporta además un archivo de consulta fiscal independiente; este no se importa desde el diálogo general de copias.

## Fuentes y validación

Documentación oficial consultada el 21 de octubre de 2026:

- [Información técnica de AEAT](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/informacion-tecnica.html).
- [Especificaciones del hash, versión 0.1.2](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_especificaciones_huella_hash_registros.pdf).
- [Servicios web, versión 1.0.3](https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_Descripcion_SWeb.pdf).
- [Especificaciones del QR](https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DetalleEspecificacTecnCodigoQRfactura.pdf).
- [Procedimientos de facturación y anulaciones](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/procedimientos-facturacion.html).

Migraciones: `017_verifactu.sql` y `018_verifactu_company_producer.sql`. Las configuraciones anteriores conservan su productor explícito; las nuevas proponen el de la empresa. Las copias previas a la segunda migración se recuperan manteniendo su identificación original. Dependencias: `qrcode` para el QR y `fast-xml-parser` para analizar respuestas, con rechazo de DTD y entidades externas. Los XSD y WSDL oficiales se conservan en `backend/test-support/verifactu`; la comprobación XSD usa .NET en Windows sin llamadas de red. Los tests verifican los tres vectores oficiales del hash y los XML de primera alta, alta encadenada y anulación, además de importes, retenciones, QR, concurrencia, aislamiento, rollback, reintentos, errores, conservación y copias con bases de datos sintéticas.

Comandos: `npm test`, `npm run build` y `TEST_MYSQL=1 node --test --test-concurrency=1 backend/test/verifactu-db.test.js`. Los envíos externos se sustituyen por respuestas simuladas en las pruebas; no se certifica con ello el funcionamiento del portal real de AEAT.