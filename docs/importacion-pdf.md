# Importación de cuentas desde PDF

En **Mantenimiento de subcuentas → Importar cuentas desde PDF**:

1. Selecciona un PDF con texto del formato `LISTADO DE SUBCUENTAS`, como el `Informe.pdf` facilitado.
2. Revisa los dígitos de la cuenta. Por defecto, 4: `43000006` se interpreta como `4300.0006`. La longitud total debe coincidir con la configuración de la empresa.
3. Pulsa **Previsualizar**. Comprueba la empresa del documento, la empresa de destino, los registros y los padres que se crearán.
4. Confirma la revisión y pulsa **Importar nuevas subcuentas**.

Solo se importan códigos y descripciones. No se importan NIF, direcciones, teléfonos ni saldos. El destino es siempre la empresa seleccionada en la aplicación; el nombre del PDF no crea ni selecciona otra empresa.

La lectura se realiza localmente en el backend con PDF.js; no se envía el documento a servicios externos. No se almacena el archivo cargado. Las filas de la previsualización se mantienen en memoria durante 15 minutos; un reinicio del backend obliga a previsualizar de nuevo.

La confirmación envía un token vinculado a la empresa, no filas editables por el navegador. Antes de insertar se comprueban de nuevo la configuración y los códigos existentes, con el mismo bloqueo de empresa que usa el alta manual. Todas las filas y sus padres se guardan dentro de una transacción MySQL. Una repetición de la confirmación devuelve el resultado anterior mientras el token siga vigente.

Los códigos existentes se omiten, aunque tengan otra descripción o un padre diferente. No se renombran ni se cambian de padre. Los códigos nuevos crean únicamente la jerarquía necesaria. Los duplicados idénticos en el PDF se omiten; los duplicados con nombres distintos y los registros inválidos bloquean la importación.

## Formato y límites

- Adaptador específico del listado suministrado: cabeceras Subcuenta, Concepto y NIF / CIF, con la misma disposición de columnas. Se usan posiciones de texto para separar el nombre de los datos fiscales.
- Máximo 5 MB, 100 páginas y 5.000 registros por documento.
- No se admite OCR de imágenes escaneadas, PDFs protegidos con contraseña ni formatos de columnas distintos. Si cambia la plantilla, se debe adaptar el lector.
- El PDF suministrado contiene 202 subcuentas en 5 páginas. Se ha comprobado su lectura completa y la importación en una empresa temporal, sin importar sus datos a la empresa de trabajo.
- PDF.js requiere Node.js 22.13 o posterior. No se necesitan herramientas PDF externas.

## API y archivos

- `POST /api/account-import/preview?prefix_length=4`, cuerpo binario `application/pdf` y cabecera `X-Company-Id`.
- `POST /api/account-import/commit`, JSON `{ "token": "..." }`, misma empresa.
- Backend: `services/pdf-accounts.js`, `pdf-worker.js`, `account-import.js`, controlador y rutas.
- Frontend: `AccountImportDialog.vue`, servicio y textos centralizados en `locales/account-import.js`.
- No requiere migraciones de base de datos.

## Pruebas

`backend/test/account-import.test.js` comprueba extracción, separación de columnas, ceros iniciales, códigos inválidos, duplicados, preservación de datos existentes, empresa, concurrencia, idempotencia, reversión completa y endpoints. La prueba del PDF real se omite si `Informe.pdf` no está disponible; el resto usa un PDF mínimo generado durante la prueba.

```powershell
$env:TEST_MYSQL='1'
node --test backend/test/account-import.test.js
```
