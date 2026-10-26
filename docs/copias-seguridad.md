# Copias de seguridad por empresa y ejercicio

Abre **Copias de seguridad** en el menú lateral o desde Inicio. Selecciona la empresa en la barra superior y marca las casillas de los ejercicios que quieras incluir. Puedes elegir uno, varios (aunque no sean consecutivos) o usar **Seleccionar todos**. Los ejercicios marcados se guardan juntos en un único archivo y también se pueden importar en una sola operación.

**Hacer copia de seguridad** descarga un archivo comprimido .json.gz. No modifica ni vacía la contabilidad. Cada archivo incluye los datos fiscales y el logotipo, el plan de cuentas completo y los movimientos del alcance elegido: asientos y apuntes, facturas, recibos, cobros/pagos, operaciones anuales, propuestas y PDF de facturas, libros diarios originales y conciliaciones con sus extractos. La documentación común, las conexiones bancarias y las antiguas fichas de proveedores también se incluyen porque pertenecen a la empresa y se comparten entre ejercicios. Los historiales de borrados y los archivos de copias anteriores no se duplican dentro de la copia.

**Importar datos** permite seleccionar ese archivo (también se admite su JSON descomprimido), comprueba su integridad y muestra empresa, períodos, estado y cantidades. Hay que revisar el resumen y marcar la confirmación antes de importar. El archivo admite hasta 100 MB comprimidos y 256 MB descomprimidos.

La empresa de destino debe tener el mismo CIF/NIF, o el mismo nombre cuando falta el CIF/NIF en uno de los extremos. Puede ser una empresa recién creada con ese nombre; los identificadores internos pueden ser diferentes. Para importar una selección, marca los mismos períodos que contiene el archivo; sus fechas deben coincidir exactamente. Con todos los ejercicios marcados también se pueden recuperar períodos que todavía no existen en destino. Las copias anteriores de un único ejercicio o de toda la empresa siguen siendo compatibles.

Por defecto se importan los movimientos en ejercicios vacíos. Cuando el destino contiene datos, marca **Sustituir los datos existentes**, revisa el resumen, marca la confirmación y escribe **96**. El botón **Aceptar e importar** permanece visible al desplazarse por el resumen. Se sustituyen únicamente los ejercicios incluidos en el archivo, sin mezclar movimientos. Antes de borrar se archivan los datos originales, incluidos PDF, en las copias por ejercicio del historial de vaciados; pueden descargarse al terminar o desde Ejercicios. Estas copias del historial usan el formato de archivo de vaciado, para consulta y recuperación técnica; no se importan desde este diálogo. La copia previa, el borrado y la importación forman una sola transacción: cualquier fallo revierte todo. Los vínculos con ejercicios externos que se verían afectados bloquean la sustitución e indican qué períodos hay que incluir. Los datos de otros períodos se conservan. Se reutilizan las cuentas por código cuando mantienen su tipo y jerarquía, sin cambiar sus descripciones. Se recuperan los datos fiscales que estén vacíos y el logotipo si falta; la ficha actual se conserva en los campos que ya tienen valor. Los documentos comunes y las conexiones existentes se reutilizan cuando son compatibles.

Las copias anuales guardan referencias a los registros de otros ejercicios necesarios para reconstruir sus vínculos. Si un pago, anulación o apertura depende de datos que todavía no están en destino, el resumen lo indica y bloquea la importación. Restaura primero el ejercicio necesario o utiliza una **copia completa de la empresa**, que conserva conjuntamente los vínculos entre años.

La restauración remapea las claves a la empresa de destino y conserva los números de asiento, fechas, estados, importes decimales y originales binarios. Los importes con signo y las líneas a cero de los diarios importados se conservan. Se valida la partida doble, los totales y el ámbito empresarial. Un fallo revierte toda la operación; los reintentos de la misma solicitud devuelven el resultado anterior y no duplican datos. Los informes de conciliación que seguían vigentes actualizan su referencia al diario remapeado; los que ya estaban desactualizados conservan esa condición.

La suma SHA-256 detecta cambios o archivos incompletos. No es una firma ni un cifrado; el archivo contiene los datos y documentos exportados.

Migración: 016_data_restores.sql. Guarda únicamente el resultado de las restauraciones para reconocer reintentos; las copias manuales se descargan al equipo del usuario.

API con X-Company-Id:

- GET /api/data-backups/export?exercise_id=ID, ID1,ID2 o all.
- POST /api/data-backups/preview?exercise_id=ID, ID1,ID2 o all, cuerpo binario application/octet-stream; añade &replace_existing=1 para revisar una sustitución.
- POST /api/data-backups/restore con JSON {token,request_id,confirm:true}; añade confirmation:"96" para sustituir datos.
- POST /api/data-backups/discard con JSON {token}.

Las revisiones caducan a los 15 minutos y están limitadas en cantidad y memoria. El archivo solo puede restaurarse en una versión con el mismo esquema de datos.

Validación: npm test, npm run build y TEST_MYSQL=1 node --test --test-concurrency=1 backend/test/data-backup-db.test.js. Las pruebas de MySQL utilizan empresas sintéticas temporales y las retiran al terminar; comprueban copias completas/anuales, relaciones entre años, precisión, documentos originales, aislamiento, reintentos, cambios después de revisar y reversión ante fallos.

Si existe configuración VERI*FACTU se incluye también su archivo fiscal completo. Su restauración requiere una copia completa y un destino sin cadena fiscal; se conserva el XML y se deja la preparación pausada. Las facturas con registros no se pueden eliminar mediante sustitución de ejercicios. Consulta [VERI*FACTU](verifactu.md).

## Copias automáticas guardadas en el servidor

En la misma pantalla, **Copias automáticas** permite activar una o varias frecuencias para la empresa seleccionada: **Diaria**, **Semanal** (día de la semana) y **Mensual** (día del mes). Cada frecuencia tiene su hora, con horario de Madrid. Los días 29, 30 o 31 se ajustan al último día de los meses que no los tengan. Pulsa **Guardar programación** para aplicar los cambios; al instalar la función todas las frecuencias están desactivadas.

El servidor comprueba las tareas pendientes al arrancar y cada minuto. Debe permanecer en marcha para ejecutarlas. Si estuvo apagado, al volver hace una copia actual por cada frecuencia pendiente, sin generar copias históricas ficticias. Los cambios de hora se tienen en cuenta: en primavera una hora inexistente se desplaza por el salto horario; en otoño la hora repetida se ejecuta una sola vez. Un fallo queda visible en la programación y se reintenta a los cinco minutos.

Las copias automáticas incluyen **toda la empresa y todos sus ejercicios**, con el mismo formato `.json.gz` de las copias manuales. **Crear copia ahora** guarda una copia completa inmediata con el tipo seleccionado, aunque su programación esté desactivada. Una pulsación reintentada conserva su identificador para evitar duplicados. Las tareas utilizan un bloqueo de MySQL y una clave única por empresa, frecuencia y fecha programada para coordinar varios procesos del servidor.

Los archivos se escriben en `.local-backups/automatic/<empresa>/` de la carpeta del proyecto, fuera de MySQL y fuera de los archivos públicos. La carpeta aparece desplegando **Carpeta de copias en el equipo del servidor**. Se puede configurar otra ubicación con `BACKUP_DIRECTORY` en `backend/.env` y reiniciar el servidor. Usa una ruta absoluta; si cambias de ubicación, mueve también los archivos existentes antes de reiniciar. El índice de archivos y la programación se guardan en MySQL. Los archivos conservan el formato y la identificación de la empresa para poder importarlos aunque haya que reconstruir la base de datos. La programación y el índice de copias no se duplican dentro de cada archivo.

**Copias guardadas** permite filtrar por fechas inclusivas y por uno o varios tipos, consultar páginas de 25 y **Descargar** cada archivo. Antes de enviarlo se comprueba el tamaño y la huella SHA-256. Para recuperar su contenido utiliza **Importar datos** de la misma pantalla.

**Borrar copias antiguas** permite elegir una fecha de corte y uno o varios tipos. «Anteriores al 01/10/2026» incluye las fechas anteriores al 1 de octubre y conserva las del propio día 1. Puedes, por ejemplo, borrar solo las diarias antiguas y conservar semanales y mensuales. El borrado también puede hacerse desde una copia individual. Primero se muestran el número, las fechas, los tipos y el tamaño; hay que marcar la confirmación y pulsar **Borrar**. La revisión caduca en 15 minutos y se invalida si cambia la selección de archivos. No se eliminan copias por antigüedad sin esa confirmación. Si no se puede retirar un archivo, queda como **Borrado pendiente** y el servidor vuelve a intentarlo; el nombre físico siempre se deriva del identificador registrado y se rechazan enlaces a otras carpetas.

La consulta y la descarga están disponibles en lectura. Guardar la programación, crear copias y borrarlas requiere el permiso **Registrar y modificar datos contables** (`accounting_write`). Importar mantiene sus permisos existentes.

Aplicar la migración `020_automatic_backups.sql` con `npm run db:migrate --workspace backend`. API con `X-Company-Id`:

- `GET /api/data-backups/automatic/settings` y `PUT` con `{schedules:[{frequency,enabled,run_time,weekday,month_day},…]}`; siempre se envían las tres frecuencias, `weekday` de 1 (lunes) a 7 y `month_day` de 1 a 31.
- `GET /api/data-backups/automatic/copies?types=daily,monthly&from=2026-01-01&to=2026-10-01&page=1`.
- `POST /api/data-backups/automatic/run` con `{frequency,request_id}` (UUID).
- `GET /api/data-backups/automatic/copies/:id/download`.
- `POST /api/data-backups/automatic/delete-preview` con `{before_date,types:["daily","monthly"]}` o `{ids:[UUID,…]}`.
- `POST /api/data-backups/automatic/delete` con `{token,confirm:true}`.

Validación específica: `node --test backend/test/backup-schedule.test.js` y `TEST_MYSQL=1 node --test --test-concurrency=1 backend/test/automatic-backups-db.test.js`. Se prueban cambios de hora, fin de mes, recuperación al reiniciar, reintentos, integridad, filtros, confirmaciones caducadas o desactualizadas, aislamiento por empresa, permisos y recuperación de borrados pendientes. La comprobación de navegador `.verification/verify-automatic-backups.mjs` utiliza una empresa ficticia y cubre la programación, descarga, filtros, cancelación/confirmación y pantalla móvil.
