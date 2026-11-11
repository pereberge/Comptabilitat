# Tablas generales — fase 1

En Inicio, debajo de **Copias de seguridad**, se abre **Tablas generales → Maestro de bancos**. Es un catálogo común a todas las empresas, almacenado únicamente en la base central. Permite buscar por nombre o BIC; el perfil Máster puede añadir y editar bancos. La edición comprueba la versión para evitar sobrescribir cambios simultáneos.

La migración controlada `050_general_banks.sql` crea la tabla y carga los 28 nombres y SWIFT/BIC proporcionados por el usuario. No modifica asientos, bancos de empresas ni remesas existentes. No contiene un ID del presentador: ese identificador pertenece a una combinación empresa/banco.

`node scripts/activate-general-banks.mjs` aplica exclusivamente esta migración central, con bloqueo y registro en `schema_migrations`. Se excluye de las migraciones de bases de empresa y del aprovisionamiento de nuevas empresas. Las pruebas MySQL del maestro revierten todos sus cambios mediante una transacción.

API: `GET /api/general-tables/banks`, `POST /api/general-tables/banks` y `PUT /api/general-tables/banks/:id` (al actualizar, incluir `version`). Las escrituras requieren Máster. Se valida nombre y estructura BIC de 8 u 11 caracteres; no se verifica la vigencia del catálogo proporcionado con entidades externas.

## Bancos por empresa y generación de ficheros

En **Inicio → Bancos de esta empresa** (`/empresas/bancos`), se añade o edita una configuración por empresa y banco: banco del maestro, IBAN, ID del presentador y acreedor SEPA opcional. Si el acreedor está vacío, se utiliza el de la ficha de empresa. `ES63000B22299945` aparece como ejemplo en el campo de acreedor SEPA, nunca como valor global aplicado automáticamente. Debe introducirse y guardarse para la combinación que corresponda.

En remesas de clientes y proveedores se selecciona el banco de la empresa. El servidor obtiene el BIC vigente del maestro y los datos guardados de esa empresa/banco; no acepta sustituciones de esos campos enviadas por el navegador. Cambios posteriores invalidan la previsualización. En cobros pain.008 se utiliza el identificador de acreedor SEPA tanto en `InitgPty` como en `CdtrSchmeId`. En pagos pain.001 se utiliza el identificador del presentador en `InitgPty`. El presentador de pagos no se incluye ni se valida en la remesa de cobros. Las remesas existentes y el modo manual conservan su funcionamiento.

La migración aditiva `051_company_banks.sql`, aplicada de forma controlada mediante `node scripts/activate-company-banks.mjs`, crea la configuración en cada base de empresa y en la central. No rellena datos automáticamente ni genera ficheros. La tabla se incluye en las copias de empresa; los archivos de copia anteriores siguen siendo compatibles. API: `GET/POST /api/company-banks`, `PUT /api/company-banks/:id`, con permisos y aislamiento de empresa existentes.
