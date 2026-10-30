# Facturas PDF y propuestas contables

En **Facturas**, selecciona la empresa y el ejercicio y pulsa **Subir factura PDF**. Se admite una factura por archivo, hasta 5 MB y 20 páginas. La vista previa muestra los datos extraídos, el asiento propuesto, los vencimientos y las posibles coincidencias en el diario.

**Guardar PDF y propuesta** conserva el original en MySQL y crea un documento pendiente. Este paso no crea asientos, facturas ni recibos. Los documentos se recuperan en **Documentos y propuestas**, con búsqueda por proveedor o cliente, referencia, CIF, importe o nombre del archivo. **Ver PDF original** permite consultar o descargar exactamente el archivo guardado. El documento mantiene su empresa y ejercicio.

## Revisar y confirmar

**Editar propuesta y recibos** permite corregir el número, las fechas, el tercero, sus datos fiscales, las bases, el IVA, las retenciones, las cuentas y uno o varios vencimientos. Los importes de los recibos deben sumar el total de la factura. La propuesta requiere seleccionar la cuenta de gasto o ingreso; no asigna automáticamente cualquier gasto desconocido a compras.

El proveedor o cliente se identifica primero por **CIF / NIF**, normalizando mayúsculas, espacios, puntos y guiones. Una diferencia en el nombre comercial no impide reutilizar la misma subcuenta. Se consultan las fichas de proveedores y las facturas de todos los ejercicios de la empresa; el nombre se usa como alternativa cuando no hay identificación fiscal registrada que lo contradiga. Si varias subcuentas comparten CIF, se requiere selección explícita. Al seleccionar una subcuenta sin historial se conserva el CIF recibido de Gestió o de la propuesta PDF.

Cuando el proveedor no tiene CIF guardado, se busca también por **nombre similar** en las subcuentas: se ignoran acentos, puntuación y formas jurídicas como SL/SLU, y se toleran cambios de orden y pequeñas erratas. Solo se propone automáticamente una coincidencia clara y única; si hay varios candidatos, hay que seleccionar la subcuenta. Esta propuesta por nombre puede corregirse antes de contabilizar.

Después de revisar el original y marcar la casilla de confirmación:

- **Contabilizar y crear recibos** crea un asiento equilibrado, una ficha de factura y todos sus recibos pendientes en una transacción. Un fallo revierte la operación completa.
- Si hay coincidencia en tercero, base, IVA y total con un asiento del mismo ejercicio y fecha cercana, se ofrece **Vincular al asiento y crear recibos**. Antes de vincular, el servidor exige que las cuentas, los importes, la fecha y el ejercicio coincidan exactamente. Se conserva el asiento existente. Una referencia coincidente tiene prioridad; las coincidencias solo por importe requieren comprobar la referencia.
- Si la ficha de factura ya existe, **Vincular con factura existente** asocia el PDF a esa factura, tras comprobar sus fechas e importes. Conserva sus recibos actuales.

Los documentos de ejercicios cerrados se pueden archivar y consultar; contabilizar o vincular requiere un ejercicio abierto. Una fecha de domiciliación no acredita el pago: los recibos permanecen pendientes hasta registrar el cobro o pago en Cartera. Antes de vincular un asiento antiguo, revisa si ya existe un pago en el diario.

## Alcance de la lectura

Hay un lector específico para la factura de electricidad de Energía XXI con texto y etiquetas en catalán. El lector general identifica campos explícitamente etiquetados y un desglose sencillo de IVA. Los campos ausentes quedan pendientes de completar. Los escaneos sin texto se conservan y permiten introducir la propuesta manualmente; no hay OCR.

Varios tipos de IVA, referencias de varias facturas en un archivo, retenciones, divisas distintas del euro o importes que no cuadran producen avisos. Se bloquea la contabilización de un archivo detectado con varias facturas o una divisa distinta de EUR. Las facturas rectificativas con importes negativos requieren tratamiento específico y no se contabilizan mediante este formulario.

Se priorizan las cuentas usadas en los apuntes de la empresa. Las mejoras de clasificación se muestran aparte, con enlace al PGC, y no modifican cuentas ni asientos existentes.

## Persistencia y API

Aplicar `012_invoice_documents.sql` mediante `npm run db:migrate`. La tabla `invoice_documents` guarda PDF, SHA-256, extracción, formulario, propuesta, versión y vínculos al asiento y factura. El mismo archivo no se duplica en la misma empresa y ejercicio. Dos documentos distintos de la misma factura pueden vincularse a una sola ficha. La edición comprueba la versión y la confirmación comprueba de nuevo el diario bajo bloqueo.

Todas las rutas usan `X-Company-Id`:

- `POST /api/invoice-documents/preview?exercise_id=…`: cuerpo PDF, nombre en `X-File-Name` codificado con `encodeURIComponent`.
- `POST /api/invoice-documents/archive` o `/discard`: `{token}`; la vista previa caduca a los 15 minutos.
- `GET /api/invoice-documents?exercise_id=…&search=…&direction=all`.
- `GET /api/invoice-documents/:id` y `GET /api/invoice-documents/:id/source`.
- `PATCH /api/invoice-documents/:id`: `{version,form}`.
- `POST /api/invoice-documents/:id/post`: `{version,confirm:true,action:'create'|'link'|'attach',entry_id?}`.

La respuesta de detalle de una factura incluye sus documentos asociados. Los PDF originales no se escriben en el directorio público del frontend.

## Validación

`invoice-proposal.test.js` cubre fechas, lectura del desglose, importes exactos, texto ausente, advertencias, coincidencias y propuestas incompletas. `invoice-documents-db.test.js` comprueba con MySQL el archivo original, búsquedas, aislamiento, duplicados, edición por versión, alta transaccional, vinculación sin nuevo asiento, varios PDF por factura, rollback y API. Ejecutar las pruebas de base de datos en serie con `TEST_MYSQL=1` y `node --test --test-concurrency=1`.
