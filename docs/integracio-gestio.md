# API v1 de integración: Gestió → Comptabilitat

Para entregar el contrato al desarrollador de Gestió, utiliza el [paquete de documentación de la API](api-gestio/README.md), con [OpenAPI 3.1](api-gestio/openapi.json), [colección de Postman](api-gestio/postman_collection.json) y ejemplos JSON. Esta guía conserva los detalles de administración y arquitectura de Comptabilitat.

Comptabilitat recibe facturas de proveedor ya validadas por un sistema externo. La recepción guarda datos estructurados y una referencia documental, con estado **pendiente de contabilizar** o **con incidencias**. No crea asientos, vencimientos ni subcuentas durante la recepción.

Gmail, almacenamiento de originales y lectura con IA pertenecen a Gestió. No hay tareas de Gmail ni conexiones a su base de datos en el backend de Comptabilitat. Los campos Gmail que pudieran quedar en un `.env` anterior no se utilizan. Las migraciones 029 y 030 ya aplicadas se conservan como historia sin borrar sus posibles datos; la integración actual usa la **031**.

## Arquitectura y reutilización

- `backend/src/integrations/`: autenticación entre servicios, contrato v1, recepción transaccional, consultas de recepciones, puente a la contabilización y contrato documental futuro.
- Se reutilizan `companies`, `accounting_exercises`, `suppliers`, `accounts`, `trade_invoices` y el servicio `invoices.js`. Se reutilizan `withTransaction`, el bloqueo de empresa y los cálculos exactos en céntimos con BigInt.
- El alta existente de `trade_invoices` crea también un asiento. Por eso la recepción pendiente utiliza `integration_received_invoices`; cuando el usuario confirma la contabilización se llama al servicio existente, dentro de la misma transacción que vincula la recepción al resultado.
- El frontend reutiliza el contexto de empresa, `FormDialog`, `InvoiceForm`, las tablas y estilos existentes. Las sesiones y permisos del frontend se mantienen separados de las credenciales de integración.

## Preparación

```powershell
npm run db:migrate
```

La migración `031_integration_invoices.sql` crea:

| Tabla | Uso |
| --- | --- |
| `integration_company_links` | Autorización de cliente/origen/empresa externa hacia una empresa interna, con activación independiente. |
| `integration_received_invoices` | Datos recibidos, huella canónica, identidad externa, incidencias, estado y vínculos contables posteriores. |
| `integration_events` | Trazabilidad de accesos, errores, recepciones, repeticiones y acciones contables; sin tokens ni cuerpos completos. |

No se crea ni se renombra automáticamente Piensos Arb. Usa su ID real en la base de datos de destino.

## Autenticación entre servicios

El proyecto dispone de sesiones locales, pero no de un servidor de autorización OAuth para Client Credentials. Para esta primera integración se usan **tokens Bearer aleatorios por cliente**, con ámbitos y autorización de empresas. No se presenta este mecanismo como una implementación de OAuth 2.0.

Gestió conserva el token secreto en su entorno o gestor de secretos. Comptabilitat conserva únicamente su SHA-256 en la configuración del servidor y lo compara en tiempo constante. Los tokens no se aceptan en URL, cookies ni cuerpos de petición. Las credenciales no dan acceso a endpoints del frontend. El formato del encabezado sigue el uso de [Bearer en Authorization](https://www.rfc-editor.org/rfc/rfc6750#section-2.1).

Genera un token de 32 bytes aleatorios en el entorno de administración y calcula su SHA-256. Guarda el token de forma segura en Gestió; copia solo la huella a Comptabilitat. No publiques el resultado ni lo guardes en archivos versionados. Este comando muestra ambos valores para que el administrador pueda distribuirlos a sus respectivos gestores de secretos:

```powershell
node -e "const c=require('node:crypto');const t=c.randomBytes(32).toString('base64url');console.log('TOKEN='+t);console.log('SHA256='+c.createHash('sha256').update(t).digest('hex'))"
```

Ejemplo de `backend/.env`, sustituyendo la huella:

```dotenv
INTEGRATION_CLIENTS_JSON=[{"clientId":"gestio","sourceSystem":"gestio","tokenSha256":"HUELLA_SHA256_DE_64_CARACTERES_HEXADECIMALES","scopes":["invoices:received:write"]}]
```

La configuración admite varios clientes y `enabled:false` para desactivar uno. Los IDs de cliente y sus huellas deben ser únicos; las configuraciones inválidas impiden el arranque. Con `[]`, la API permanece desactivada y devuelve 503. Reinicia el backend después de modificar credenciales.

Ámbito actual: `invoices:received:write`. Cada cliente está ligado a un `sourceSystem` exacto. Darle ese ámbito no autoriza ninguna empresa por sí solo.

### Autorizar empresas

Configura la correspondencia desde el servidor, con el cliente ya presente en el entorno:

```powershell
npm run integration:company -- --client gestio --source gestio --external piensos-arb --company 85
```

`85` es un ejemplo: sustitúyelo por el ID real de Piensos Arb. El comando comprueba que cliente, origen y empresa existan. No hay correspondencias automáticas por nombre ni por un `companyId` aportado en la factura. Para otra empresa, crea otra correspondencia explícita. Para desactivar una:

```powershell
npm run integration:company -- --client gestio --source gestio --external piensos-arb --company 85 --enabled false
```

La relación se comprueba antes de la importación y de nuevo dentro de la transacción. `X-Company-Id` y las cookies del frontend se ignoran en esta API. Cambiar la correspondencia exige acceso administrativo al servidor; revísala como cualquier cambio de autorización.

### HTTPS, proxies y rotación

En producción configura `NODE_ENV=production`. Las peticiones no consideradas HTTPS se rechazan con 426. Termina TLS con el servidor/proxy de producción y limita el acceso al puerto interno. Si hay proxy, configura solo sus direcciones reales en `INTEGRATION_TRUSTED_PROXIES`, por ejemplo `127.0.0.1,::1` si está en la misma máquina. El backend no confía por defecto en un `X-Forwarded-Proto` enviado por el cliente. No configures una red de confianza más amplia de lo necesario.

En desarrollo local puede usarse HTTP con un token exclusivamente de pruebas. Nunca reutilices un token de desarrollo en producción. Para rotar una credencial, genera un token nuevo, actualiza su huella en Comptabilitat y el secreto en Gestió y reinicia de forma coordinada. Revocar una credencial consiste en desactivarla o eliminarla y reiniciar. Un futuro proveedor OAuth Client Credentials podrá sustituir `authenticateIntegration` sin modificar el contrato de facturas ni la autorización de empresas.

## Endpoint de recepción

```http
POST /api/v1/integrations/invoices/received
Authorization: Bearer <TOKEN_DE_GESTIO>
Content-Type: application/json
```

Límite del cuerpo: **128 KiB**. No se aceptan archivos, Base64 ni campos desconocidos. La API limita a 120 peticiones por minuto y dirección IP en cada proceso; devuelve `Retry-After` al superar el límite. En despliegues con varias instancias puede complementarse con un límite compartido en el proxy.

### Contrato

Los importes admiten números JSON o cadenas decimales con punto, hasta dos decimales y trece dígitos enteros. Se recomienda enviar cadenas. Se normalizan a cadenas con dos decimales; no se aceptan separadores de miles, coma decimal ni notación exponencial en cadenas.

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| `sourceSystem` | Sí | Origen exacto autorizado, hasta 64 caracteres. |
| `externalId` | Sí | Identificador estable de la operación en Gestió, hasta 128 caracteres. |
| `companyExternalId` | Sí | Alias de empresa autorizado en el servidor, hasta 128 caracteres. |
| `supplier.name` | Sí | Razón social, hasta 200 caracteres. |
| `supplier.taxId` | Sí | Identificador fiscal, hasta 32 caracteres; se normalizan espacios, puntos, guiones y mayúsculas. Se valida el formato alfanumérico, no su existencia legal. |
| `supplier.address`, `supplier.email` | No | Dirección y correo del proveedor. |
| `invoiceNumber` | Sí | Referencia de factura, hasta 60 caracteres. |
| `invoiceDate`, `dueDate` | Sí | Fechas reales `AAAA-MM-DD`; vencimiento igual o posterior a la factura. |
| `currency` | Sí | Código de tres letras; la contabilización actual admite EUR. Otras monedas quedan para revisión. |
| `invoiceType` | No | `standard` por defecto, `credit_note` o `rectifying`. |
| `rectification` | En rectificativas | Objeto con `reason` y `originalInvoiceNumber`. No anula por sí mismo la factura anterior. |
| `description` | Sí | Concepto, hasta 1.000 caracteres. |
| `taxBreakdown` | Sí | Entre 1 y 40 grupos fiscales, descritos abajo. |
| `withholdings` | No | Hasta 10 retenciones con `rate`, `base` y `amount`. |
| `total` | Sí | Total firmado, igual a bases + cuotas − retenciones. |
| `documentExternalId` | Sí | Referencia opaca del PDF en Gestió, hasta 200 caracteres. No es una URL pública. |
| `lines` | No | Hasta 200 líneas con `description` y los mismos campos fiscales que un grupo. Deben reconciliar por tratamiento y tipo con el desglose. |

`sourceSystem`, `externalId` y `companyExternalId` admiten letras y dígitos ASCII, punto, guion, subrayado y dos puntos; deben empezar por una letra o dígito. No distinguen empresas por nombre comercial. Los identificadores externos son sensibles a mayúsculas y minúsculas.

Cada grupo de `taxBreakdown` contiene:

```json
{"taxType":"vat","taxRate":"21.00","taxableBase":"1000.00","taxAmount":"210.00"}
```

`taxType` admite `vat` por defecto, `exempt`, `not_subject` y `reverse_charge`. En los tres últimos, tipo y cuota deben ser cero. `exempt` exige `exemptionReason`, que se conserva junto a los datos originales. Los tipos se expresan como porcentaje, no como fracción. Para una nota de abono, bases, cuotas, retenciones y total llevan el signo correspondiente; `credit_note` exige total negativo y las rectificativas exigen la referencia y motivo originales.

### Ejemplo completo

```json
{
  "sourceSystem": "gestio",
  "externalId": "FAC-987",
  "companyExternalId": "piensos-arb",
  "supplier": {"name": "Proveïdor Exemple SL", "taxId": "B12345678"},
  "invoiceNumber": "2026-125",
  "invoiceDate": "2026-10-26",
  "dueDate": "2026-11-26",
  "currency": "EUR",
  "invoiceType": "standard",
  "description": "Compra de mercaderies",
  "taxBreakdown": [
    {"taxType":"vat", "taxRate":"21.00", "taxableBase":"1000.00", "taxAmount":"210.00"}
  ],
  "total": "1210.00",
  "documentExternalId": "DOC-456"
}
```

Guárdalo como un archivo de prueba privado `invoice.json`. En Postman selecciona POST, Body → raw → JSON y Authorization → Bearer Token. Ejemplo con curl, usando una variable de entorno de la sesión para el token:

```powershell
curl.exe --request POST "https://contabilitat.exemple/api/v1/integrations/invoices/received" --header "Authorization: Bearer $env:GESTIO_API_TOKEN" --header "Content-Type: application/json" --data-binary "@invoice.json"
```

No guardes el token en colecciones compartidas, scripts versionados ni registros del proxy. Sustituye el dominio por la dirección real del servidor. En desarrollo local utiliza `http://127.0.0.1:3000` y credenciales de pruebas.

Respuesta inicial, 201:

```json
{
  "data": {
    "id": 123,
    "companyId": 85,
    "sourceSystem": "gestio",
    "externalId": "FAC-987",
    "status": "pending",
    "possibleDuplicate": false,
    "issues": ["SUPPLIER_REVIEW_REQUIRED"],
    "replayed": false
  },
  "requestId": "7cb4a4f5-3e74-4916-8908-16b1900730ea"
}
```

El identificador de seguimiento también aparece en `X-Request-Id`. La recepción se considera confirmada cuando se recibe 201 o 200. Si Gestió pierde la respuesta puede reenviar la misma operación con el mismo identificador externo.

## Validación, proveedores y duplicados

- La cuota de cada grupo de IVA y cada retención puede diferir **como máximo un céntimo** del cálculo porcentual, con redondeo a céntimos. El total debe reconciliar **exactamente** con las cantidades declaradas; no hay una tolerancia adicional acumulable sobre el total.
- El contrato conserva las cantidades declaradas. Si un redondeo aceptado no coincide con el motor actual de contabilización, queda una incidencia que bloquea la contabilización automática desde el formulario. No se sustituye silenciosamente la cuota.
- El proveedor se busca por NIF normalizado y empresa en las fichas de proveedores existentes y en el historial de facturas recibidas. Una única subcuenta se propone; varias requieren revisión. Si no existe, **no se crea una ficha provisional al recibir**: se guarda la identidad fiscal en la recepción y se exige revisar o crear su subcuenta durante la contabilización normal. Dos contabilizaciones se serializan por empresa y reutilizan el NIF que ya conste en el historial.
- La restricción única es **empresa interna + origen + identificador externo**. El JSON se valida y normaliza antes de calcular su huella. Una repetición equivalente devuelve 200 y el mismo ID; un cambio de datos con la misma identidad devuelve 409 sin sobrescribir.
- El alias de empresa no forma parte de la huella, porque dos alias autorizados pueden apuntar a la misma empresa interna. Las listas mantienen su orden: el emisor debe reenviar el mismo desglose y orden de líneas al reintentar.
- Se comprueba también NIF + número fiscal normalizado contra recepciones activas y facturas contabilizadas de la misma empresa. Un ID externo distinto no evita la alerta: se conserva la nueva recepción con `possibleDuplicate:true`, estado `issues` y bloqueo para contabilizarla. No se considera automáticamente el mismo documento ni se descarta.
- Las transacciones y el bloqueo de empresa protegen los reintentos concurrentes, la detección fiscal y el paso a contabilidad. Un fallo revierte toda la operación. Si el registro de la recepción no se confirma, un reintento es seguro.
- La fecha determina el ejercicio de referencia si existe. La ausencia de ejercicio o un ejercicio cerrado queda registrada para revisión; no se inventan ejercicios ni fechas.

## Estados y proceso en el frontend

En **Facturas → Recibidas de Gestió** aparecen origen, ID externo, empresa, proveedor, factura, fecha, moneda, total, estado e incidencias. **Consultar** muestra desglose, retenciones, líneas originales, referencia documental y fecha de importación.

Estados: `pending` (pendiente de contabilizar), `posted` (contabilizada), `issues` (con incidencias), `cancelled` (recepción anulada o factura contabilizada anulada) y `rectified` (reservado para el tratamiento posterior de rectificaciones).

**Revisar y contabilizar** abre `InvoiceForm` con las cantidades validadas y las subcuentas propuestas. El usuario conserva los controles de fecha contable, cuentas y vencimientos existentes. La confirmación llama al servicio contable habitual. El backend comprueba que número, NIF, fecha de factura, bases, tipos, cuotas y retenciones sigan coincidiendo con el origen. La recepción, la factura y el asiento se vinculan en una sola transacción. Abrir el formulario no crea ningún movimiento.

Si no hay una cuenta recordada, el programa **pide seleccionar la cuenta de gasto o inmovilizado** dentro del formulario. La opción **Recordar esta cuenta para las próximas facturas de este proveedor**, marcada por defecto, guarda la selección al confirmar la contabilización. En facturas posteriores se propone esa cuenta y se puede cambiar; desmarca la opción para una imputación puntual. La preferencia se guarda por empresa y NIF del proveedor recibido en la factura, aunque la subcuenta se haya reconocido por nombre. Solo se aprende de una decisión confirmada por el usuario, nunca de la antigua asignación automática a 6000. El servidor rechaza la contabilización si falta la cuenta (`INTEGRATION_EXPENSE_ACCOUNT_REQUIRED`). Requiere la migración 032.

Para una factura ya contabilizada, **Consultar → Cuenta de gasto o inmovilizado** muestra la cuenta actual y permite cambiarla y recordarla. Sin preferencia guardada se muestra directamente el selector. Se actualizan de forma atómica la factura y la línea de gasto del asiento original, manteniendo fechas, importes y recibos. Solo se permite en ejercicios abiertos y facturas activas con su asiento original; se registra la cuenta anterior y la nueva en la auditoría. Una corrección fallida revierte todas las modificaciones. Las preferencias forman parte de las copias contables existentes.

El motor actual no representa todas las variantes de las facturas externas. Se reciben y muestran también monedas distintas de EUR, notas de abono, rectificativas, inversión del sujeto pasivo, retenciones de bases parciales y diferencias de redondeo; quedan con incidencias y sin posibilidad de trasladarlas al formulario si eso alteraría sus datos. Deben resolverse con el tratamiento contable correspondiente antes de ampliar ese puente. Esta fase prepara su recepción segura; no añade un motor nuevo de contabilidad fiscal.

**Anular recepción** conserva datos y trazabilidad y no anula ningún asiento. Solo está disponible antes de contabilizar. Tras contabilizar se usan las operaciones existentes de la factura. Una recepción anulada sigue ocupando su identidad externa: reenviarla no crea una nueva factura. Los importes y referencias de origen no se editan ni se sobrescriben desde la API; los cambios con la misma identidad se rechazan para revisión.

Las facturas contabilizadas muestran además su origen e ID externo en el listado habitual. Las manuales se identifican como **Manual**. Las autorizaciones de lectura y edición en el frontend siguen el modelo de sesión, empresa seleccionada y permisos de la aplicación; las credenciales de Gestió no sirven para esas acciones.

### Endpoints internos del frontend

Estos endpoints usan el contexto `X-Company-Id` validado por la aplicación y sus permisos existentes; no admiten credenciales Bearer de la integración:

| Método y ruta | Uso |
| --- | --- |
| `GET /api/integration-invoices?page=1&search=...` | Listado paginado, 50 filas por página. |
| `GET /api/integration-invoices/:id` | Detalle y preparación del formulario, siempre en la empresa seleccionada. |
| `POST /api/integration-invoices/:id/post` | `{ "version": 1, "form": { ... } }`, contabilización explícita con permiso `accounting_write`. |
| `POST /api/integration-invoices/:id/cancel` | `{ "version": 1 }`, anulación de la recepción pendiente. |
| `POST /api/integration-invoices/:id/expense-account` | `{ "version": 1, "account_id": 123, "remember": true }`, corrección de la cuenta en una factura contabilizada, con permiso `accounting_write`. |

## Respuestas y errores de la API v1

Los errores devuelven `{ "error": { "code": "...", "field": "..." }, "requestId": "..." }`; `field` aparece solo cuando corresponde. No incluyen SQL, stack, tokens ni el cuerpo completo recibido.

| HTTP | Significado y códigos principales |
| --- | --- |
| 201 | Recepción creada, incluso si requiere revisión posterior. |
| 200 | Repetición equivalente, mismo ID y `replayed:true`. |
| 400 | JSON inválido: `INTEGRATION_INVALID_JSON`. |
| 401 | Token ausente o incorrecto: `INTEGRATION_UNAUTHORIZED`. |
| 403 | Ámbito, origen o empresa no autorizados: `INTEGRATION_SCOPE_REQUIRED`, `INTEGRATION_SOURCE_FORBIDDEN`, `INTEGRATION_COMPANY_FORBIDDEN`. |
| 404 | Ruta de integración no disponible. |
| 409 | Identidad externa repetida con otros datos: `INTEGRATION_IDEMPOTENCY_CONFLICT`. |
| 413 | Cuerpo mayor de 128 KiB. |
| 415 | Se requiere `application/json`. |
| 422 | Campos, fechas, tipos o cantidades inválidos; `INTEGRATION_TAX_MISMATCH`, `INTEGRATION_WITHHOLDING_MISMATCH`, `INTEGRATION_TOTAL_MISMATCH`, `INTEGRATION_LINES_MISMATCH`, entre otros. |
| 426 | HTTPS obligatorio en producción: `INTEGRATION_HTTPS_REQUIRED`. |
| 429 | Límite de peticiones; reintentar después del tiempo indicado. |
| 503 | Integración sin configurar o base de datos no disponible. Reintentar errores transitorios con la misma identidad. |

Gestió no debe reintentar indefinidamente un 409 o 422 sin revisión. Para pérdidas de conexión o 503, puede usar reintentos con espera creciente y la misma identidad y datos.

## Referencias documentales y evolución

`documentExternalId` es opaco: nunca se convierte en un enlace, una ruta ni una petición HTTP arbitraria. La API no admite ni almacena PDF. `integrations/documents.js` define el adaptador futuro `getFile(reference, authorization)`, que exige autenticación y autorización de empresa antes de delegar. Sin proveedor configurado devuelve el error 501 `INTEGRATION_DOCUMENT_API_UNAVAILABLE`. No se publica un endpoint de descarga ni un botón que intente consultar un servicio todavía inexistente.

Cuando Gestió tenga API documental, el adaptador utilizará una dirección de servicio fija y credenciales del backend, enviando empresa y referencia opaca. El servidor de Gestió deberá comprobar también esos permisos. El navegador no recibirá secretos ni rutas privadas. Nuevos casos de uso, como facturas emitidas o pagos, tendrán contratos y ámbitos propios bajo `/api/v1/integrations`; no se conectarán bases de datos entre aplicaciones.

Las copias contables existentes incluyen `integration_received_invoices` y remapean sus relaciones al restaurar. Las copias anteriores sin esa tabla siguen siendo compatibles. Las correspondencias administrativas y el registro de accesos se conservan mediante la copia completa de MySQL; las credenciales permanecen en el gestor de secretos y no se exportan como parte de los datos de la empresa.

## Verificación

```powershell
npm test
npm run build
$env:TEST_MYSQL='1'
node --test backend/test/integration-invoices-db.test.js
node frontend/test/integration-invoices-ui.mjs
```

La prueba de interfaz requiere la aplicación en `http://127.0.0.1:5180` y Edge; puede indicarse `TEST_UI_URL` y `TEST_BROWSER_CHANNEL`. Simula las respuestas API para comprobar listado, estado pendiente, referencia del documento y apertura del formulario, sin publicar ni contabilizar datos reales.

Las pruebas MySQL crean empresas temporales. Comprueban recepción sin asientos, reintentos y concurrencia, conflicto de contenido, posibles duplicados, proveedor por NIF, IVA múltiple, rectificativas, autorización, rollback, independencia de sesiones, trazabilidad sin secretos, contabilización explícita y copia/restauración.
