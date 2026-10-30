# Contabilidad — Mantenimiento de subcuentas y asientos

**Bases per empresa:** mode opcional amb usuaris centrals i dades comptables en bases separades. Inclou trasllat verificat, encaminament de Gestió i còpies per empresa. [Activació, migració i recuperació](docs/bases-per-empresa.md).

**Clientes y proveedores:** las subcuentas 430/440 y 400/410 incluyen una ficha de datos fiscales que se carga en las facturas y se conserva en su impresión y PDF. Requiere la migración 034. [Uso y conservación de los datos](docs/clientes-proveedores.md).

**Cartera y remesas:** permite cambiar vencimientos, dividir el pendiente de un recibo y generar ficheros XML de cobros 19 SEPA CORE y pagos 34 SEPA desde **Cartera → Remesas de clientes / Remesas de proveedores**. Los IBAN y mandatos se guardan en las fichas de clientes/proveedores. Requiere la migración 036. [Uso y validaciones](docs/cartera-remesas.md).

**Recibos automáticos:** en la ficha del cliente o proveedor, **Cobro y pago** guarda la forma de pago, plazo, número de recibos, periodicidad, día fijo e IBAN. La factura carga estas condiciones y calcula sus vencimientos e importes automáticamente. Requiere la migración 035. [Condiciones de cobro y pago](docs/clientes-proveedores.md).

**Facturas pendientes y empresa:** al añadir una factura en Documentación, se avisa si sus datos corresponden a otra empresa y se ofrece guardarla en la empresa correcta del programa. **Revisar empresa** permite trasladar las que ya estaban mal archivadas, conservando el original y respetando los accesos de cada usuario. [Comprobación y traslado](docs/documentacion-y-borrado.md).

Al refrescar o cerrar y volver a abrir el programa se recuperan la última pantalla, empresa y ejercicio de cada usuario, así como la factura que estuviera abierta. La selección se conserva también después de cerrar sesión y volver a entrar con el mismo usuario. Si no hay una selección guardada, se abre el ejercicio más reciente. Cambiar de empresa abre su último ejercicio. Al elegir otro ejercicio se muestran sus últimos movimientos. Inicio sitúa el diario al final y Asientos contables muestra primero los más recientes.
**Integración con Gestió**: API segura `POST /api/v1/integrations/invoices/received` para recibir facturas de proveedor con referencia documental externa y estado pendiente de contabilizar. Consulta y revisión en **Facturas → Recibidas de Gestió**. Requiere la migración 031. [Contrato, credenciales, autorización por empresa y ejemplos](docs/integracio-gestio.md).

La ficha de empresa incluye **Formato de empresa: General / Producción porcina**. Producción porcina admite también el PDF **DIARI** con diarios y referencias originales. Aplicar la migración 021. Uso, validaciones y archivo facilitado: [docs/produccion-porcina.md](docs/produccion-porcina.md).

**Gestión de granjas**, exclusiva de Producción porcina: lotes con numeración `granja-1`, totales del ciclo seleccionado, detalle al pulsar un tipo de gasto, cuido manual y bajas visibles. Incluye entrada por animal, ventas, traspasos de pienso e informe con selector de granja/lote e índice de conversión. Importa las facturas de Sant Isidre y conserva las asignaciones de gastos. Requiere las migraciones 022 a 026. [Uso y validaciones](docs/gestion-granjas.md).

**Patrimonio y beneficio**, junto al usuario en la barra superior, muestra al máster la evolución anual de las tres empresas. En **Asientos contables** se puede buscar por importe y abrir la edición clicando cualquier punto de una fila. **Copias de seguridad** se encuentra en Inicio. Uso y criterios: [docs/evolucion-empresas.md](docs/evolucion-empresas.md).

En **Copias de seguridad** (`/copias-seguridad`), selecciona la empresa y marca uno, varios o todos sus ejercicios. **Hacer copia de seguridad** descarga sus datos y originales; **Importar datos** revisa el archivo y recupera los movimientos en ejercicios vacíos. Incluye facturas, cartera, PDF, conciliaciones y documentos comunes. También permite programar copias completas diarias, semanales y mensuales en el servidor, descargarlas y borrar las antiguas por fecha y tipo con revisión previa. Aplicar la migración 020. Uso, límites y pruebas: [docs/copias-seguridad.md](docs/copias-seguridad.md).

Aplicación local con Vue 3 (Composition API), Vite, JavaScript, Vue Router, Express y MySQL. Interfaz en español, textos centralizados y datos persistentes reales. El apartado de Hacienda prepara borradores del modelo 303 para el régimen general; la presentación se realiza en la Sede de la AEAT.

## Mantenimiento de subcuentas

Pantalla única para consultar, crear y editar cuentas y subcuentas. El alta utiliza un solo formulario: código y descripción. La notación cuenta.subcuenta (4300.0001) identifica el padre sin seleccionarlo. El servidor crea los niveles que falten y deduce el tipo; no hay selector de tipo ni de padre.

Las fichas de clientes, deudores, proveedores y acreedores se gestionan desde su subcuenta, sin un módulo independiente de proveedores. Los datos del antiguo módulo de proveedores se recuperan en la ficha fiscal mediante la migración 034.

## Instalación y ejecución

Requisitos: Node.js 22.13+ (recomendado Node 24), npm y MySQL 8.4.

```powershell
npm install
# Solo si aún no existe:
Copy-Item backend/.env.example backend/.env
```

Configura `backend/.env` sin compartir ni versionar la contraseña:

| Variable | Valor inicial |
| --- | --- |
| HOST | 127.0.0.1 |
| PORT | 3000 |
| DB_HOST | 127.0.0.1 |
| DB_PORT | 3306 |
| DB_NAME | contabilidad |
| DB_USER | contabilidad_app |
| DB_PASSWORD | Tu contraseña local |
| COMPANY_ID | 1 |

Ejecuta `database/init.sql` en MySQL Workbench o en el cliente MySQL para crear la base. Con un administrador, crea el usuario dedicado si no existe:

```sql
CREATE USER 'contabilidad_app'@'127.0.0.1' IDENTIFIED BY 'TU_CONTRASENA_LOCAL';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER
ON contabilidad.* TO 'contabilidad_app'@'127.0.0.1';
```

Ajusta el host de la cuenta a la configuración de tu servidor. No utilices root en la aplicación.

```powershell
npm run db:migrate
npm run db:seed
npm run dev
```

**Interfaz: http://127.0.0.1:5180**. API: http://127.0.0.1:3000/api/health. Utiliza esa dirección exacta: otras aplicaciones pueden ocupar localhost o 5173.

`npm run dev` inicia frontend y backend; Ctrl+C los detiene. Si ya están ejecutándose, no inicies una segunda copia. Puedes iniciarlos por separado con `npm run dev:frontend` y `npm run dev:backend`.

Vite usa un proxy al puerto 3000. Si cambias `PORT`, actualiza `frontend/vite.config.js`. No se requiere CORS.

Para ejecutar la compilación local:

```powershell
npm run build
npm start
```

Abre http://127.0.0.1:3000. Sin autenticación en esta fase: el servidor escucha en loopback y está previsto para uso local.

### Actualizar desde la fase 1

Conserva tu `.env` y datos. Ejecuta `npm run db:migrate` y `npm run db:seed`, y reinicia el backend. La migración 002 añade las tablas nuevas. No vuelvas a crear la base ni borres tablas.

Si aparece `ER_ACCESS_DENIED_ERROR`, MySQL está rechazando el usuario/contraseña: corrige la cuenta y permisos en MySQL y sus valores en `.env`. Si la base no existe, ejecuta primero `init.sql`.

## Datos iniciales

La semilla inicial crea solamente Empresa Demo SL (ID 1) y el ejercicio 2026 abierto y predeterminado. No carga cuentas, subcuentas ni asientos: el plan empieza vacío y se introduce manualmente desde Mantenimiento de subcuentas.

El catálogo PGC de referencia se utiliza para nombrar los padres necesarios al dar de alta un código; no se importa a la base de datos. Las antiguas semillas de cuentas se conservan en database/legacy-seeds como historial y no se ejecutan con npm run db:seed.

## Plan de cuentas

En “Mantenimiento de subcuentas” puedes buscar por código o descripción, filtrar cuentas/subcuentas, consultar detalles, crear registros y editar descripciones. La tabla se ordena por código y representa los niveles con sangría y cuenta padre explícita.

- Códigos VARCHAR; raíces del 1 al 9.
- Las cuentas amplían un dígito de su padre; la jerarquía que falte se crea automáticamente. Para códigos oficiales se usa el nombre del catálogo; los niveles personalizados se crean con “Cuenta [código]”, editable después.
- Las subcuentas pertenecen al prefijo indicado antes del punto, de al menos tres dígitos. El código completo sin punto tiene la longitud configurada en `companies.subaccount_length` (8 inicialmente). Ejemplo: 4300.0001 se almacena como 43000001, con padre 4300 y sufijo 0001.
- Las cuentas generales y subcuentas existentes pueden coexistir: cargar desarrollos oficiales no mueve ni renumera las subcuentas históricas. Los movimientos siguen vinculados a los mismos IDs.
- El código, tipo y padre son inmutables; se pueden editar la descripción y la ficha fiscal del cliente o proveedor. Esto evita ciclos y cambios en la clasificación de movimientos existentes.
- “Proponer código de subcuenta” parte de una cuenta escrita en el campo Código (por ejemplo 4300) y devuelve el siguiente al mayor código completo de su prefijo; es una propuesta. Si otro usuario lo ocupa antes del guardado, la restricción única lo rechaza y puedes pedir otra propuesta.
- No hay borrado de cuentas por API. Las claves foráneas impiden eliminar cuentas con movimientos.

El plan de cuentas pertenece a la empresa, no al ejercicio. Las subcuentas se reutilizan en todos sus ejercicios. Para esta base pequeña, cuentas y subcuentas comparten una tabla; no se añade un catálogo global independiente todavía.

## Asientos contables

Selecciona el ejercicio en la barra superior y abre “Asientos contables”. Puedes filtrar por intervalo de fechas y número, registrar un asiento y consultar sus líneas.

1. Pulsa “Nuevo asiento”.
2. Indica fecha y concepto.
3. Selecciona las subcuentas e introduce descripción, Debe o Haber en cada línea.
4. Añade o elimina líneas; los totales y la diferencia permanecen visibles.
5. Pulsa “Registrar asiento” cuando esté cuadrado.

Los importes admiten punto o coma decimal, hasta dos decimales y **sin separadores de miles**. Ejemplo: `1000`, `1000,00` o `1000.00`.

Reglas verificadas en el backend:
- Entre 2 y 100 líneas; descripción obligatoria.
- Cada línea usa una subcuenta de la misma empresa.
- Un único lado positivo por línea, sin negativos ni líneas a cero.
- Debe igual a Haber.
- Fecha válida dentro de un ejercicio abierto de la empresa.
- Precisión mediante BigInt en céntimos y almacenamiento DECIMAL(15,2), sin cálculo monetario en coma flotante.
- Importe total máximo por asiento: 9.999.999.999.999,99.
- Número consecutivo e independiente por ejercicio. La transacción bloquea la fila de ejercicio antes de calcular el siguiente número.
- Cabecera y líneas se confirman juntas; un fallo revierte todo y no consume un número.
- Identificador de solicitud único y huella del contenido para reintentar sin duplicar el asiento. Un reintento con contenido diferente se rechaza.

El backend no permite elegir el número. Los asientos son definitivos: esta fase ofrece alta y consulta, no edición ni eliminación de asientos registrados. Los ejercicios cerrados son de solo consulta. Cambiar de ejercicio recarga el listado; el formulario modal impide cambiar de contexto mientras se edita.

Ejemplo con las subcuentas iniciales: Debe 60000000 por 1000; Debe 47200000 por 210; Haber 40000001 por 1210.

## Arquitectura

```text
frontend/src/
  components/      Diálogo accesible, iconos y estado
  composables/     Contexto de empresa y ejercicio
  locales/         Textos españoles centralizados
  router/          Inicio, cuentas y asientos
  services/        Clientes REST
  views/           Pantallas y formularios
  assets/          CSS adaptable
backend/src/
  controllers/     Adaptación HTTP
  routes/          API REST
  services/        Dominio, validación y transacciones
  db/              Pool MySQL
  middleware/      Gestión centralizada de errores
backend/scripts/   Migraciones y semillas
backend/test/      Pruebas unitarias, HTTP e integración MySQL
shared/money.js    Conversión exacta reutilizada por frontend/backend
database/          Inicialización, migraciones y semillas SQL
scripts/dev.mjs    Inicio conjunto sin dependencias adicionales
```

Modelo:
- `companies`, `accounting_exercises`.
- `accounts`: padre del mismo ámbito empresarial, tipo y código único por empresa.
- `journal_entries`: ejercicio obligatorio, número único por empresa/ejercicio, solicitud única.
- `journal_lines`: referencias compuestas a asiento y cuenta de la misma empresa, posición única y restricciones DECIMAL.

El selector superior obtiene las empresas de GET /api/companies. Cada petición utiliza X-Company-Id, validado por el backend; si falta, se utiliza COMPANY_ID. El contexto y los servicios contables se limitan a esa empresa por petición, sin estado global compartido. Esta selección no sustituye una futura autenticación. Las consultas son parametrizadas y los errores no exponen SQL, credenciales o trazas. El driver mantiene los DECIMAL como cadenas.

Las reglas de dominio se aplican desde el servicio; no escribas asientos mediante SQL directo, ya que las restricciones SQL por sí solas no comprueban la suma de todas las líneas.

## API

| Método | Ruta | Función |
| --- | --- | --- |
| GET | /api/health | Disponibilidad MySQL |
| GET | /api/context | Empresa y ejercicios |
| GET | /api/companies | Listado de empresas con URL del logotipo |
| GET | /api/companies/:id | Ficha fiscal, de contacto y de cobros |
| POST | /api/companies | Crear empresa y primer ejercicio |
| PATCH | /api/companies/:id | Editar ficha de empresa y logotipo |
| GET | /api/companies/:id/logo | Imagen del logotipo |
| GET | /api/accounts?search=&kind= | Listado de cuentas |
| POST | /api/accounts | Crear cuenta/subcuenta |
| GET | /api/accounts/:id | Detalle |
| PATCH | /api/accounts/:id | Cambiar descripción |
| GET | /api/accounts/:id/next-code | Proponer subcuenta |
| GET | /api/entries?exercise_id=&from=&to=&number= | Consultar asientos |
| POST | /api/entries | Registrar cabecera y líneas |
| GET | /api/entries/:id | Detalle y líneas |

Los errores usan `{ "error": { "code": "..." } }`. La interfaz presenta mensajes españoles.

## Migraciones

Se ejecutan en orden de nombre y se registran en `schema_migrations`; un bloqueo MySQL evita ejecutores simultáneos. Añade archivos nuevos para futuros cambios: no modifiques migraciones aplicadas.

El separador `-- statement` permite ejecutar triggers sin `DELIMITER`. MySQL confirma DDL implícitamente: una migración fallida puede quedar parcialmente aplicada. Revisa el fallo y reintenta; las primeras migraciones usan `IF NOT EXISTS`. Las semillas sí se aplican en transacción.

Los triggers de ejercicios impiden solapamientos incluso con concurrencia; el predeterminado es único por empresa y debe estar abierto. El alta de empresas crea su primer ejercicio. La pestaña **Ejercicios** permite añadir otros años. La restauración de un diario con asiento de cierre deja ese ejercicio cerrado; el cierre y la reapertura manuales no están implementados.

## Pruebas

```powershell
npm test
npm run build
```

Para incluir MySQL real, después de migrar:

```powershell
$env:TEST_MYSQL = '1'
npm test
Remove-Item Env:TEST_MYSQL
```

Las pruebas de integración crean empresas temporales y limpian sus propios registros. Consumen valores AUTO_INCREMENT; ejecútalas preferentemente en una base dedicada de pruebas. No alteran las empresas existentes.

Comprobado el 15/10/2026:
- Compilación de producción.
- 12 pruebas con MySQL 8.4.9: jerarquía multinivel, duplicados, precisión, partida doble, fechas, aislamiento empresarial, concurrencia, idempotencia, reversión parcial e integridad.
- Migraciones y semillas reejecutables sin duplicar registros.
- Edge: creación de tres subcuentas, propuesta automática, asiento de compra 1000 + 210 = 1210, consulta del detalle y pantalla móvil de 390 px sin desbordamiento ni errores JavaScript.

Las migraciones locales están aplicadas. Ejecuta las semillas si todavía no has preparado la empresa y los ejercicios iniciales.

## Fuera de alcance

No se han implementado diario exportable, Pérdidas y Ganancias, libros fiscales, liquidaciones fiscales de IVA, cierre/reapertura manual, regularización automática ni autenticación.

## Notación cuenta.subcuenta

Introduce `4300.0001` y una descripción para crear la subcuenta operativa y, si falta, su cuenta 4300 en una única transacción. La parte 0001 es relativa al padre, no un código global. Introduce solo `4300` para crear únicamente una cuenta. No se sustituye un registro existente: `4300.0001` y `43000001` son el mismo código completo, por lo que se rechazan duplicados. Las subcuentas previas conservan su padre y pueden mostrarse, por ejemplo, como `430.00001`.

Para mantener compatibilidad, los códigos completos sin punto siguen admitidos; se busca su prefijo de cuenta existente más largo. Se recomienda el punto para indicar el padre sin ambigüedad.

Catálogo de referencia: `database/reference/pgc.json`. No se carga automáticamente.

## Empresas y logotipos

En **Empresas** (`/empresas`), pulsa **Nueva empresa**, introduce el nombre y las fechas del primer ejercicio y, si lo deseas, selecciona un logotipo. El ejercicio se crea abierto y predeterminado; las subcuentas usan inicialmente 8 dígitos. La nueva empresa queda seleccionada y empieza con su propio plan de cuentas vacío.

Cada empresa permite editar el nombre y añadir, sustituir o quitar su logotipo. Se admiten PNG, JPG y WebP de hasta 2 MB, con vista previa y validación del contenido. El logotipo se guarda en MySQL y se muestra en el selector superior, la ficha de Inicio y el listado de empresas.

El formulario de alta y edición tiene cuatro apartados: **Datos fiscales** (razón social, formato de empresa, nombre comercial, CIF/NIF y domicilio completo), **Contacto** (persona, teléfono, correo, correo de facturación y web), **Cobros** (banco, titular, IBAN, BIC/SWIFT, forma y condiciones de cobro) y **Otros datos** (nombre de empresa en el diario PDF, información registral, texto al pie de las facturas, logotipo y ejercicio inicial). Los datos adicionales se pueden completar progresivamente.

La migración `006_company_details.sql` guarda esta ficha por empresa. En la API, los campos adicionales se envían junto a `name`; los omitidos en una edición se conservan y una cadena vacía borra el campo. El listado incluye CIF/NIF y población, mientras que los datos bancarios se consultan en el detalle o contexto de su empresa. El IBAN se normaliza y se comprueba su estructura y control MOD97-10 según el [registro de Swift](https://www.swift.com/resource/iban-registry-pdf); el BIC se comprueba por su [formato ISO 9362](https://www.swift.com/standards/data-standards/bic-business-identifier-code). Estas comprobaciones validan el formato, no la existencia ni titularidad de la cuenta. Las facturas conservan una copia de esta ficha al registrarse y generan sus recibos en Cartera. El envío de órdenes al banco no está implementado.

Ejecuta `npm run db:migrate` para aplicar `005_company_logos.sql`. La creación de empresa, ejercicio y logotipo se confirma en una única transacción. La API recibe `{ name, exercise: { name, start_date, end_date }, logo? }`; `logo` es una URL de datos base64. En la edición, omitir `logo` lo conserva y enviar `null` lo elimina. Las rutas de empresas usan el ID explícito de su URL; las operaciones contables siguen usando `X-Company-Id`.

Cada empresa tiene un color principal propio y estable, calculado a partir de su identificador. Al cambiar de empresa se actualizan la cabecera, la navegación, los botones y los formularios; las tarjetas y los accesos rápidos muestran también el color de cada empresa.

La barra superior permite seleccionar empresa y ejercicio. La selección se recuerda por pestaña; al cambiar de empresa se recargan las pantallas y se recupera su ejercicio seleccionado o predeterminado. Los ejercicios, cuentas, asientos e informes pertenecen a la empresa seleccionada.

Los botones pequeños junto al título de Inicio permiten cambiar de empresa pulsando su anagrama. Cuando hay logotipos configurados, estos accesos muestran las empresas con logotipo; el selector superior y la pantalla Empresas mantienen el acceso a todas. Las imágenes se muestran completas, sin recortarlas, y el botón de la empresa seleccionada queda marcado.

## Facturas y cartera de cobros y pagos

En **Facturas** (`/facturas`), registra facturas emitidas o recibidas con sus conceptos, IVA, retención y uno o varios recibos con fechas e importes editables. Guardar crea la factura, su asiento y todos los vencimientos en una sola transacción. La migración `008_invoices_portfolio.sql` incorpora los registros y relaciones necesarios.

En **Cartera** (`/cartera`), consulta pendientes y vencidos de todos los ejercicios de la empresa, registra cobros/pagos totales o parciales, modifica vencimientos y revisa el historial. Las liquidaciones crean su asiento de banco/caja y actualizan el pendiente de forma conjunta. Facturas y recibos son imprimibles; la cartera incluye CSV. Las anulaciones se realizan mediante contrasientos, conservando el historial. Uso, API, cálculos, pruebas y alcance: [docs/cartera.md](docs/cartera.md).

## Informes contables

En **Hacienda** (`/hacienda`), prepara el **modelo 303 de IVA mensual o trimestral** del régimen general. Cada base, cuota y total permite consultar sus facturas o asientos de origen. Las líneas fiscales separan 477/472 y sus subcuentas, con sumas parciales y CSV. **Proponer asiento de IVA** muestra la liquidación con cuentas reales, compensaciones y comprobación contra el modelo. Incluye revisión de diarios importados, deducibilidad, borradores guardados, impresión y **archivo de presentación .303** de la empresa y período abiertos para importar en Pre303. Aplicar la migración `033_vat_drafts.sql`. [Uso, alcance fiscal y validación](docs/hacienda-iva.md).

El botón **Revisar contabilidad**, junto a **Actualizar datos** en Inicio y a **Actualizar conciliación** en Conciliación bancaria, revisa los apuntes y el plan de cuentas de la empresa y el ejercicio seleccionados. Muestra errores comprobables, observaciones a contrastar y propuestas de mejora, con filtros, enlaces al mayor/asientos y CSV. No modifica datos. Incluye revisión de IVA, saldos, apertura/cierre, bancos y cartera. Uso, criterios y pruebas: [docs/revision-contable.md](docs/revision-contable.md).

En **Conciliación bancaria** (`/conciliacion-bancaria`), **Subir extracto** permite cargar PDF con texto o CSV de diferentes bancos, detectar banco e IBAN, vincular su subcuenta y preparar la conciliación desde el último saldo coincidente. Los informes incluyen el documento original, los movimientos pendientes, las coincidencias con el diario y las propuestas de asientos exportables en CSV. Los préstamos sin desglose, las transferencias sin justificar y los saldos anteriores desconocidos quedan pendientes de revisión. No contabiliza las propuestas. Avisa si cambian los apuntes utilizados en el análisis y evita duplicar el mismo extracto. Aplicar las migraciones `010_bank_reconciliations.sql` y `011_bank_statement_import.sql`. Uso, formatos y alcance: [docs/conciliacion-bancaria.md](docs/conciliacion-bancaria.md).

Disponibles Libro Mayor y Balance de Sumas y Saldos, con consultas por empresa y ejercicio, saldos exactos, agrupaciones, navegación y CSV. Aplicar `npm run db:migrate` para incorporar el estado de los asientos. Detalles de cálculo, endpoints, pruebas y límites en [docs/informes.md](docs/informes.md).

También disponible **Balance de Situación** en modelos Normal y Abreviado, con desglose hasta el Mayor, resultado provisional, diagnóstico y CSV. No requiere nuevas migraciones. Cálculo, mapa PGC, archivos, validación y límites: [docs/balance-situacion.md](docs/balance-situacion.md).

En el Balance de Situación, **Comparar con año anterior** muestra los dos ejercicios y su diferencia en euros, con el mismo corte de fecha, desglose y CSV comparativo. Si falta el ejercicio anterior, se indica en pantalla.

## Importar cuentas desde PDF

Desde Mantenimiento de subcuentas, usa **Importar cuentas desde PDF**. Incluye previsualización, separación configurable de cuenta/subcuenta, control de duplicados e importación transaccional. Compatible con el listado con texto de `Informe.pdf`. No requiere migraciones. Instrucciones y límites: [docs/importacion-pdf.md](docs/importacion-pdf.md).

## Ejercicios e importación de un libro diario

Las pestañas **Empresas** y **Ejercicios** permiten crear empresas y añadir años a la empresa seleccionada. En **Ejercicios** (`/ejercicios`), pulsa **Nuevo ejercicio**, revisa nombre y fechas y guarda. Los períodos de una misma empresa no pueden solaparse. Al crear el ejercicio puedes marcar **Crear también el asiento de apertura** desde el ejercicio anterior cerrado, revisando sus saldos antes de guardar. La ficha permite **Generar cierre**, **Generar apertura**, **Anular cierre**, **Anular apertura** y consultar su historial. Aplicar la migración `009_exercise_operations.sql`. Uso, condiciones, API y pruebas: [docs/ejercicios.md](docs/ejercicios.md).

En un ejercicio vacío, **Importar libro diario PDF** permite revisar un informe compatible `LIBRO DIARIO` y restaurar sus movimientos. Se comprueban las sumas por asiento, los arrastres entre páginas y el total de cada página antes de guardar. Se conservan la numeración original, incluido el número 0, los nombres y conceptos de cada línea, sus signos y las líneas a cero. El informe debe coincidir con el nombre de empresa, las fechas completas del ejercicio y la longitud de sus subcuentas.

También admite `LISTADO DEL DIARIO`, con cabecera de asiento y columnas CUENTA/NOMBRE/CONCEPTO/DEBE/HABER. Verifica los totales de cada asiento, el total general y la secuencia de páginas; conserva los asientos que continúan en otra página. Solo omite filas sin cuenta ni concepto con ambos importes a cero, indicando su cantidad en la revisión. La API de alta admite `subaccount_length` entre 6 y 20 (8 por defecto), para crear la empresa con la longitud del diario antes de importarlo.

La migración `007_journal_import.sql` incorpora el registro de importación y conserva el PDF original y su SHA-256 en MySQL. La creación de subcuentas, asientos, líneas y registro de origen se realiza en una única transacción con comprobación final de cantidades y totales. Repetir la misma importación no duplica movimientos; un diario diferente no sustituye un ejercicio con movimientos. Un PDF con cierre al final del período deja el ejercicio cerrado para consulta.

El Mayor y Sumas y Saldos incluyen el cierre por defecto para poder conciliar con el documento. La casilla **Excluir asiento de cierre** permite ver los saldos previos al cierre. El Balance de Situación siempre usa esos saldos y sus enlaces al Mayor mantienen el mismo criterio. La entrada manual conserva las validaciones originales de importes positivos y partida doble.

API: `GET/POST /api/exercises`, `POST /api/journal-import/preview?exercise_id=…` (cuerpo PDF de hasta 5 MB), y `POST /api/journal-import/commit` con `{token}`. Todas usan el contexto `X-Company-Id`. La revisión caduca a los 15 minutos. Los lectores admiten PDF con texto de hasta 300 páginas, 5.000 asientos, 20.000 líneas y 1.000 líneas por asiento. El formato Producción porcina admite también DIARI; otros formatos o documentos escaneados requieren otro adaptador.

Para comprobar también el informe de Nou Fons sin incluir datos empresariales en las pruebas del repositorio, configura `TEST_JOURNAL_PDF` con su ruta antes de ejecutar `npm test`. La prueba espera 21 páginas, 197 asientos, 639 líneas, 87 subcuentas y 1.644.224,11 EUR en cada lado.

En **Facturas**, **Subir factura PDF** prepara el asiento y los vencimientos a partir del documento y de las cuentas utilizadas en la empresa. **Guardar PDF y propuesta** archiva el original sin crear movimientos. En **Documentos y propuestas** se puede buscar por proveedor, referencia, CIF, importe o archivo, abrir el PDF y editar la propuesta. La confirmación crea factura y recibos o los vincula al asiento existente para evitar duplicarlo. Aplicar `012_invoice_documents.sql`. Formatos, límites, API y validación: [docs/facturas-pdf.md](docs/facturas-pdf.md).

En **Ejercicios**, **Borrar contabilidad del período** aparece junto a la importación del libro. Muestra empresa, fechas y recuentos y exige escribir **96**, también comprobado por el servidor. Guarda una copia descargable y vacía únicamente el período revisado, que queda abierto para reimportar. Conserva el plan de cuentas y comprueba los vínculos con otros años. Aplicar `013_exercise_clears.sql`. Alcance y uso en [docs/ejercicios.md](docs/ejercicios.md#borrar-la-contabilidad-de-un-período).


Las nuevas **facturas emitidas** proponen el consecutivo de la última numeración de la empresa y ejercicio, conservando el formato. Puedes editarlo o pulsar **Usar siguiente número**. El servidor asigna el número definitivo al guardar para evitar duplicados simultáneos. En el tercero, **Buscar cliente / proveedor por nombre o código** filtra sus cuentas por nombre, código o CIF conocido. No requiere migraciones. Detalles en [docs/cartera.md](docs/cartera.md#consecutivo-de-facturas-emitidas-y-búsqueda-de-terceros).

En **Facturas**, **Borrar sin contabilizar** elimina propuestas pendientes. **Borrar factura y recibos · 96** exige el código 96, muestra los movimientos afectados y borra sin generar copia de seguridad; los PDF vuelven a propuestas pendientes. El menú **Documentación** permite archivar originales de hasta 10 MB con título, descripción y buscador, separados por empresa y comunes a sus ejercicios. Aplicar las migraciones 014 y 015. Uso y API: [docs/documentacion-y-borrado.md](docs/documentacion-y-borrado.md).

VERI*FACTU: preparación por empresa en el portal de pruebas, con registros, XML, QR y conservación. Consulta [el alcance, el certificado y las tareas previas a producción](docs/verifactu.md).

Las facturas incluyen **Imprimir**, **Descargar PDF** y **Preparar correo** con un borrador .eml y su PDF adjunto. El usuario revisa y envía el borrador desde su programa de correo. Uso y requisitos del generador en [docs/facturas-correo.md](docs/facturas-correo.md).

Dos perfiles intercambiables desde la barra superior: **Máster**, protegido con contraseña, y **Usuario**, con permisos configurables. Solo el máster puede borrar la contabilidad de ejercicios y sustituir datos al restaurar. Aplicar la migración 019. Uso y pruebas: [docs/usuarios-permisos.md](docs/usuarios-permisos.md).
