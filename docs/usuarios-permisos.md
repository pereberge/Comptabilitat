# Usuarios y permisos

La barra superior permite cambiar entre dos perfiles globales, compartidos por todas las empresas:

- **Máster**: todos los permisos, incluidas todas las acciones con código 96 (borrar facturas y recibos, vaciar ejercicios y sustituir datos al restaurar una copia), además de gestionar usuarios.
- **Usuario**: permisos configurables. Inicialmente puede trabajar con los datos, crear ejercicios, generar aperturas y cierres e importar datos. Todas las acciones con código 96 están reservadas al máster, incluido el borrado de facturas contabilizadas y sus recibos, aunque el usuario tenga permiso de edición contable.

Al seleccionar **Máster** por primera vez se solicita definir y repetir su contraseña (entre 8 y 128 caracteres). En los accesos siguientes se solicita la contraseña existente. Cancelar o introducir una contraseña incorrecta conserva el usuario anterior.

Solo el máster ve **Patrimonio y beneficio** junto al selector de usuario. Muestra la evolución anual de patrimonio neto y beneficio de las tres empresas y está protegido también en el servidor. Uso y criterios: [evolucion-empresas.md](evolucion-empresas.md).

En **Usuarios y permisos** el máster puede cambiar los nombres de ambos perfiles, configurar los cuatro permisos del usuario y cambiar su propia contraseña. Los permisos disponibles son edición contable, creación de ejercicios, aperturas/cierres e importación de datos. Desactivar los cuatro deja el usuario para consulta y exportación. El máster conserva todos los permisos.

El perfil Usuario no solicita contraseña. Al cambiar a él se invalida la sesión anterior de máster en ese navegador. El cambio se refleja en las demás pestañas. Las sesiones duran 12 horas; cambiar la contraseña invalida las demás sesiones de máster. Los cambios de perfil cierran los formularios de la pantalla actual. Los permisos se comprueban de nuevo en el servidor en cada petición.

**Borrar contabilidad del período** sigue requiriendo revisar el resumen y escribir **96**. Se guarda una copia previa; el período queda vacío y abierto, conservando el plan de cuentas y los demás ejercicios. Sustituir datos al restaurar una copia también exige el perfil máster, incluida la confirmación de una previsualización anterior.

## Instalación y comprobación

Aplicar las migraciones con `npm run db:migrate`, incluida `019_app_users.sql`, y compilar con `npm run build`. No se establece ninguna contraseña predeterminada. Los usuarios, permisos y sesiones se guardan en MySQL y no forman parte de las copias contables de empresa o ejercicios.

Las contraseñas se almacenan con sal y scrypt; las sesiones utilizan una galeta HttpOnly y SameSite=Strict, con identificador aleatorio del que solo se guarda su huella. Se limitan los intentos de contraseña incorrecta a cinco por 15 minutos.

Pruebas de autenticación y autorización: `node --test backend/test/access.test.js`. La prueba de almacenamiento MySQL utiliza tablas aisladas y se activa con `TEST_MYSQL=1` y `TEST_MYSQL_ADMIN_FILE` apuntando a un archivo local de configuración de pruebas (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD), cuyo usuario pueda crear y eliminar esas tablas. No utiliza ni modifica los perfiles reales.
