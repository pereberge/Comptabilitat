# Documentación y borrado de facturas

En **Facturas**, cada propuesta pendiente tiene **Borrar sin contabilizar**. La confirmación elimina el PDF y la propuesta; el servidor exige que siga pendiente y que su versión no haya cambiado. No necesita código 96.

Las facturas registradas tienen **Borrar factura y recibos · 96**, también disponible desde su detalle. El resumen identifica empresa, factura, ejercicios y número de asientos, recibos y cobros/pagos afectados. Solo se ejecuta al escribir exactamente **96**. El servidor vuelve a verificar el código y el resumen en una transacción. Si alguien cambia los movimientos, hay que actualizar el resumen y confirmar de nuevo.

El borrado elimina la factura, sus líneas, recibos, cobros/pagos, anulaciones y respectivos asientos. Los ejercicios afectados deben estar abiertos y no puede existir una apertura posterior que dependa de ellos ni vínculos con otras facturas. El resto de asientos y las subcuentas se conservan. Los PDF vinculados vuelven a **Documentos y propuestas**, pendientes de contabilizar; desde allí también se pueden borrar con el botón sencillo.

El borrado se realiza sin generar una copia de seguridad. Un fallo revierte toda la operación. Solo se guarda el resultado mínimo de la solicitud para que los reintentos con el mismo identificador devuelvan el resultado anterior sin repetir el borrado. Las copias creadas antes de este cambio siguen disponibles en **Copias anteriores de facturas borradas**.

En el menú **Documentación**, **Añadir documento** permite guardar archivos de hasta **10 MB**, con título y descripción de hasta 4.000 caracteres. El buscador consulta título, descripción y nombre del archivo sin distinguir mayúsculas ni acentos. **Editar** cambia los textos; **Abrir / descargar** recupera el archivo original y **Borrar** lo elimina tras confirmar. Se admiten PDF, imágenes, documentos de oficina y otros archivos; siempre se entregan como descarga y no se ejecuta ni interpreta su contenido.

El archivo es común a todos los ejercicios de cada empresa y no se borra al vaciar un período contable. Los documentos de otra empresa no aparecen ni pueden abrirse utilizando sus identificadores. Las ediciones y borrados comprueban versiones para evitar sobrescribir cambios recientes.

En **Documentación → Facturas pendientes de gestionar**, disponible para todos los formatos de empresa, **Añadir factura pendiente** guarda el archivo original, título y descripción para retomarlo más adelante. No exige seleccionar un ejercicio ni leer o completar los datos contables. Admite los mismos archivos de hasta 10 MB del archivo general. **Marcar gestionada** lo mueve a **Facturas gestionadas**, donde **Volver a pendientes** permite reabrirlo. Este estado refleja la organización manual del archivo; no genera asientos ni modifica facturas contables. **Editar → Apartado** también permite trasladar documentos guardados anteriormente. Los cambios exigen permiso de escritura y la versión vigente.

La migración `027_pending_invoice_documents.sql` añade el apartado a los documentos existentes, que permanecen en **Documentos**. Las copias nuevas conservan el apartado y las anteriores siguen siendo restaurables como documentación general.

Al seleccionar un archivo en **Añadir factura pendiente**, se comprueba su empresa antes de guardarlo. Se compara el NIF leído en el PDF y, si falta un identificador comparable, el nombre fiscal o comercial. Un nombre igual no anula un NIF diferente. También se reconocen NIF con prefijo ES, espacios o guiones en los campos fiscales de formatos menos habituales.

Si corresponde a otra empresa del programa a la que tienes acceso, aparece un aviso con la empresa actual, el destinatario leído y la **Empresa de destino** ya seleccionada. El botón **Guardar en …** conserva el original directamente en sus facturas pendientes. Después puedes usar **Abrir documentación de …** para ir a la empresa correcta. No crea asientos, facturas contables ni recibos.

Las facturas pendientes guardadas anteriormente se revisan en el listado. **Revisar empresa** abre la misma comprobación y **Trasladar a …** cambia su empresa conservando el archivo, el identificador, el título y la descripción. No se trasladan documentos que ya se hayan pasado a Facturas mientras mantengan esa propuesta o vínculo. Un original ya existente en el destino produce un aviso y conserva el documento de origen.

Si hay varias coincidencias, hay que elegir el destino. Si no se encuentra una empresa accesible, se avisa y conservarla en la empresa actual exige marcar que se ha revisado el original. Los archivos sin datos legibles, imágenes o PDF con varias facturas muestran un aviso de empresa sin verificar; no se les inventa una destinataria. Esta lectura no realiza OCR. Las empresas que el usuario no tiene asignadas no se ofrecen como destino.

La comprobación y los traslados usan permiso de escritura. Se vuelven a verificar los datos fiscales, el acceso y la versión al guardar; los reintentos de una misma carga o traslado no repiten la operación. Los originales quedan incluidos en las copias de seguridad de su empresa de destino, sin cambios de formato ni nuevas migraciones.

**Pasar a Facturas** abre con un clic la propuesta del PDF pendiente en Facturas. Conserva el original, sus datos extraídos y el ejercicio correspondiente a la fecha de factura cuando existe; el resto se completa al revisar la propuesta. Mueve el documento a gestionadas y evita duplicados en los reintentos. No registra asientos ni recibos hasta confirmar la propuesta. La lectura de PDF queda guardada desde `028_document_invoice_extraction.sql` y sirve también para proponer relaciones con movimientos bancarios. Los demás formatos permanecen en el archivo para consultarlos y gestionarlos manualmente.

Migraciones: `014_invoice_deletions.sql` y `015_documentation.sql` (`npm run db:migrate`). Compilar con `npm run build` para actualizar la interfaz servida en el puerto 3000.

API, siempre con `X-Company-Id`:

- `DELETE /api/invoice-documents/:id` con `{version}`, solo propuestas pendientes.
- `GET /api/invoices/:id/delete-preview` y `POST /api/invoices/:id/delete` con `{confirmation:"96",preview_hash,request_id}`.
- `GET /api/invoice-deletions` y `GET /api/invoice-deletions/:id/backup`, solo para las copias anteriores que ya existen. Los nuevos borrados no aparecen en este listado ni tienen un archivo descargable.
- `GET /api/documentation?search=…`, `GET /api/documentation/:id`, `GET /api/documentation/:id/source`.
- `POST /api/documentation` con JSON `{title,description,source_name,source_mime,content_base64,request_id}`. Límite JSON 15 MB; original hasta 10 MB.
- `POST /api/documentation/preview` con `{content_base64}` comprueba la empresa sin guardar el archivo; devuelve `status`, empresas coincidentes accesibles, destino sugerido, `preview_hash` y un `token` temporal de lectura.
- `POST /api/documentation/:id/company-check` con `{version}` revisa un documento existente. Para guardar o trasladar a la empresa revisada, la carga o edición añade `{target_company_id,company_preview_hash,company_preview_token}`. Conservar una discrepancia en la empresa actual requiere también `{confirm_company_mismatch:true}`.
- `PATCH /api/documentation/:id` con `{title,description,version}` y `DELETE /api/documentation/:id` con `{version}`.
- El listado admite `folder=general|pending_invoices|managed_invoices`; la carga y la edición admiten `folder`. Sin filtro, la API conserva el listado completo.
- `POST /api/documentation/:id/manage` con `{version,managed:true|false}` mueve facturas entre pendientes y gestionadas, conservando el original.

Pruebas: `TEST_MYSQL=1 node --test --test-concurrency=1 backend/test/invoice-deletion-db.test.js`. Las pruebas crean y retiran sus propias empresas temporales; comprueban códigos, aislamiento, cambios concurrentes, reintentos, ausencia de nuevas copias y reversión ante fallos de registro y borrado, documentos vinculados, cobros parciales, anulaciones, ejercicios dependientes, originales idénticos y archivos de 10 MB.

Comprobación de empresa: `node --test backend/test/document-company.test.js` y `TEST_MYSQL=1 node --test backend/test/document-company-db.test.js`, con originales idénticos, asignación revisada, traslados atómicos, duplicados, perfiles modificados durante la revisión, permisos revocados, restricciones HTTP y recuperación desde copia.
