# Contabilidad — Mantenimiento de subcuentas y asientos

Aplicación local con Vue 3 (Composition API), Vite, JavaScript, Vue Router, Express y MySQL. Interfaz en español, textos centralizados y datos persistentes reales. No incluye cierres, regularización, apertura automática ni automatización de IVA.

## Mantenimiento de subcuentas

Pantalla única para consultar, crear y editar cuentas y subcuentas. El alta utiliza un solo formulario: código y descripción. La notación cuenta.subcuenta (4300.0001) identifica el padre sin seleccionarlo. El servidor crea los niveles que falten y deduce el tipo; no hay selector de tipo ni de padre.

Se ha retirado el módulo independiente de proveedores. Sus tablas y posibles datos se conservan, pero su interfaz y API ya no están disponibles. Las fichas ampliadas de proveedores, clientes y otras entidades según el número de cuenta se implementarán más adelante.

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
- El código, tipo y padre son inmutables; solo se edita la descripción. Esto evita ciclos y cambios en la clasificación de movimientos existentes.
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

Los triggers de ejercicios impiden solapamientos incluso con concurrencia; el predeterminado es único por empresa y debe estar abierto. No hay interfaz para crear, cerrar o reabrir ejercicios.

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

No se han implementado diario exportable, Balance de Situación, Pérdidas y Ganancias, libros fiscales, cálculo de IVA, cierre/reapertura, regularización, asientos automáticos, autenticación ni alta de empresas.

## Notación cuenta.subcuenta

Introduce `4300.0001` y una descripción para crear la subcuenta operativa y, si falta, su cuenta 4300 en una única transacción. La parte 0001 es relativa al padre, no un código global. Introduce solo `4300` para crear únicamente una cuenta. No se sustituye un registro existente: `4300.0001` y `43000001` son el mismo código completo, por lo que se rechazan duplicados. Las subcuentas previas conservan su padre y pueden mostrarse, por ejemplo, como `430.00001`.

Para mantener compatibilidad, los códigos completos sin punto siguen admitidos; se busca su prefijo de cuenta existente más largo. Se recomienda el punto para indicar el padre sin ambigüedad.

Catálogo de referencia: `database/reference/pgc.json`. No se carga automáticamente.

## Selección de empresa

El menú lateral contiene Inicio, Mantenimiento de subcuentas y Asientos contables directamente. La barra superior permite seleccionar empresa y ejercicio reales. La selección se recuerda por pestaña; al cambiar de empresa se recargan las pantallas y se recupera su ejercicio seleccionado o predeterminado. Si solo existe una empresa, el selector muestra esa empresa. El alta de empresas no forma parte de este cambio.

## Informes contables

Disponibles Libro Mayor y Balance de Sumas y Saldos, con consultas por empresa y ejercicio, saldos exactos, agrupaciones, navegación y CSV. Aplicar `npm run db:migrate` para incorporar el estado de los asientos. Detalles de cálculo, endpoints, pruebas y límites en [docs/informes.md](docs/informes.md).

También disponible **Balance de Situación** en modelos Normal y Abreviado, con desglose hasta el Mayor, resultado provisional, diagnóstico y CSV. No requiere nuevas migraciones. Cálculo, mapa PGC, archivos, validación y límites: [docs/balance-situacion.md](docs/balance-situacion.md).

## Importar cuentas desde PDF

Desde Mantenimiento de subcuentas, usa **Importar cuentas desde PDF**. Incluye previsualización, separación configurable de cuenta/subcuenta, control de duplicados e importación transaccional. Compatible con el listado con texto de `Informe.pdf`. No requiere migraciones. Instrucciones y límites: [docs/importacion-pdf.md](docs/importacion-pdf.md).
