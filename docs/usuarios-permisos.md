# Usuarios y acceso a empresas

La aplicación solicita usuario y contraseña antes de mostrar información contable. **administrador** conserva su contraseña actual. Si todavía no existe una contraseña de máster, la primera pantalla permite definirla. No hay contraseñas predeterminadas ni acceso anónimo.

El usuario y la contraseña no distinguen mayúsculas de minúsculas. Los espacios, acentos y demás caracteres siguen formando parte de la contraseña. Las contraseñas anteriores se adaptan automáticamente al iniciar sesión una vez con su escritura original; después aceptan cualquier combinación de mayúsculas y minúsculas. Las contraseñas nuevas y las que se restablecen ya tienen este comportamiento. La adaptación conserva las sesiones abiertas.

Desde **Usuaris**, en la barra superior o el menú, el máster puede crear, editar, desactivar y eliminar usuarios. Cada usuario puede tener un correo de contacto, editable en su ficha, y tiene un nombre de acceso único y una contraseña de entre 1 y 128 caracteres. Al crearlo se seleccionan explícitamente las empresas a las que puede acceder y sus permisos. Sin empresas asignadas puede iniciar sesión, pero no consultar datos contables. Las empresas nuevas solo son visibles para el máster hasta que este las asigne.

El perfil anterior **user / Usuario** se conserva. Para utilizarlo, el máster debe definirle una contraseña y asignarle empresas. No mantiene el anterior acceso sin contraseña.

Editar un usuario no solicita su contraseña. Los cambios de nombre, correo, permisos o empresas conservan la contraseña existente. Para cambiarla hay que pulsar **Canviar contrasenya** en su ficha; cancelar ese cambio conserva la anterior. También se puede editar una cuenta que todavía no tenga contraseña, aunque no podrá iniciar sesión hasta que se le defina una. La contraseña sigue siendo obligatoria al crear usuarios.

Los cuatro permisos configurables son edición contable, creación de ejercicios, aperturas/cierres e importación de datos. Desactivarlos deja al usuario en modo consulta dentro de sus empresas. Los permisos se comprueban en el servidor en cada petición, también al acceder directamente a una URL, documento o empresa. Los cambios de empresas y permisos se aplican a las sesiones abiertas.

Solo hay un máster. Tiene acceso a todas las empresas y gestiona usuarios. Su cuenta no se puede eliminar ni desactivar, y su nombre de acceso sigue siendo **administrador**. Solo él puede borrar apunts (líneas ya guardadas de un asiento), facturas y recibos, vaciar ejercicios o sustituir datos al restaurar una copia. Los usuarios con edición contable pueden modificar asientos conservando sus líneas guardadas y añadir nuevas líneas. Las acciones con código **96** siguen exigiendo la revisión y confirmación existentes.

Solo el máster ve **Patrimonio y beneficio** en la barra superior. Uso y criterios: [evolucion-empresas.md](evolucion-empresas.md).

Cada usuario puede cambiar su propia contraseña en la barra superior. El máster también puede restablecer la contraseña de un usuario desde su ficha. Cambiar una contraseña, desactivar o eliminar una cuenta cierra sus sesiones anteriores. **Tancar sessió** revoca la sesión del navegador; las sesiones caducan a las 12 horas. La aplicación actualiza la sesión al recuperar el foco y cada minuto mientras está visible.

## Instalación y comprobación

Aplicar `npm run db:migrate`, incluidas `030_user_login_companies.sql`, `031_administrator_username.sql` y `032_user_email.sql`, y compilar con `npm run build`. La migración conserva el máster y su contraseña. Los usuarios, asignaciones, permisos y sesiones se guardan en MySQL y no forman parte de las copias contables de empresas o ejercicios.

Las contraseñas se almacenan con sal y scrypt. Las sesiones usan una cookie HttpOnly y SameSite=Strict, con Secure cuando la conexión es HTTPS, y un identificador aleatorio del que solo se guarda la huella. Se limitan los intentos incorrectos a cinco por usuario y origen cada 15 minutos.

Pruebas: `node --test backend/test/access.test.js backend/test/company-scope.test.js`. Con `TEST_MYSQL=1`, `backend/test/access-db.test.js` comprueba el almacenamiento real, la revocación, las restricciones por empresa y el borrado de líneas. Crea y elimina exclusivamente usuarios normales y empresas ficticias; no cambia las credenciales ni la configuración de las cuentas reales.
