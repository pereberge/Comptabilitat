# Actualizar un diario importado

En **Ejercicios**, pulsa **Importar / actualizar diario PDF** y selecciona la nueva copia. **Revisar diario** muestra cuántos asientos son nuevos, cuántos se sustituirán y cuántos no cambian. **Actualizar contabilidad** confirma la actualización; no hace falta borrar el diario anterior.

**Detalle de los cambios** identifica cada asiento nuevo o modificado y compara los datos **Antes / Después**: fecha, concepto, tipo de asiento, referencia original cuando existe, Debe, Haber y número de apuntes. **Ver apuntes y contrapartidas** permite revisar las cuentas, conceptos e importes de ambos documentos; marca los apuntes añadidos y retirados, incluidas las copias repetidas que desaparecen. Los cambios de orden se identifican por separado. Se puede buscar por número de asiento, cuenta, concepto o importe y filtrar los nuevos o modificados. El detalle muestra todos los cambios, en páginas de 20 asientos.

Se identifica cada asiento por empresa, ejercicio y número. En el formato DIARI se utiliza el código de diario y la referencia original, conservando el número contable asignado aunque el PDF cambie de orden. Los asientos modificados se sustituyen completos, incluidos sus apuntes y contrapartidas. Los nuevos se añaden; los que no aparecen en el PDF se conservan. Los asientos sin cambios mantienen sus identificadores y los de sus líneas.

Antes de actualizar se guarda una copia completa de la empresa, disponible en **Copias de seguridad**, entre las copias diarias. Si no se puede guardar, no se modifica el diario. Se conservan todas las versiones de los PDF: cada asiento sigue vinculado al documento del que procede. La ficha del ejercicio muestra la última versión.

Un PDF con el mismo contenido que la última importación devuelve la comprobación existente y conserva las correcciones manuales posteriores. Un PDF distinto compara sus asientos con los datos actuales: al confirmar se sustituyen los que difieran, incluidas las correcciones manuales de esos mismos asientos.

La empresa, el ejercicio, el formato y la longitud de cuentas deben coincidir. Los números que coincidan con asientos creados fuera de la importación y los cambios sobre asientos anulados, operaciones anuales o documentos vinculados bloquean la actualización. Un ejercicio cerrado debe reabrirse antes de cambiar sus movimientos. Si los datos cambian después de revisar el PDF, hay que volver a revisarlo.

Las escrituras se confirman juntas en una transacción; un fallo revierte los asientos, las subcuentas nuevas y la nueva versión del PDF. Los reintentos no duplican movimientos. Los totales y el número de apuntes guardados se contrastan con el documento.

Aplicar la migración **041_journal_import_versions.sql** con `npm run db:migrate` (o `npm run db:migrate-companies` en modo de bases separadas). Permite conservar varias versiones del diario de cada ejercicio sin eliminar los datos existentes. Las copias de seguridad incluyen las versiones y sus vínculos.

Pruebas: `journal-import-plan.test.js` y `journal-update-db.test.js`, además de las pruebas existentes de importación, DIARI, copias y borrado de ejercicios.
