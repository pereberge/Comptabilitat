# Formato de empresa: Producción porcina

En **Empresas → Nueva empresa** o **Actualizar datos**, el apartado **Datos
fiscales** incluye **Formato de empresa**: **General** o **Producción porcina**.
La elección se guarda en la ficha y aparece en el listado. Las empresas ya
existentes conservan el formato General.

El formato Producción porcina habilita la importación del **DIARI** con columnas
Data, Apunt/Descripció, Subcompte, Descripció subcompte, Deure y Haver, además del
LIBRO DIARIO anterior. En **Otros datos**, **Nombre de empresa en el diario PDF**
permite indicar el nombre que figura en la cabecera cuando difiere del fiscal.
Por ejemplo, el documento facilitado usa `P. ARB -2026-`: el alias es `P. ARB`.
Ese alias debe configurarse expresamente; no se acepta automáticamente un PDF de
otra empresa.

## Importar el DIARI

1. Crear la empresa con su nombre fiscal, formato Producción porcina y el
   ejercicio correspondiente al año de la cabecera.
2. Configurar el nombre de origen del diario si difiere del nombre fiscal.
3. En **Ejercicios**, abrir **Importar libro diario PDF** y seleccionar el archivo.
4. Revisar el formato detectado, las fechas realmente incluidas, los recuentos,
   los totales y las referencias originales antes de importar.

Este informe identifica cada asiento al pie mediante **Diari** y **Referència**.
**Apunt** es el número original de su línea, que puede contener saltos. Como la
referencia puede repetirse en distintos diarios, la aplicación asigna números
internos consecutivos y conserva por separado código de diario, referencia y
apunte. Estos datos se muestran en Asientos, Inicio y detalle/edición.

Se comprueban todos los subtotales de asiento, los acumulados **Ròssec** de cada
página y la igualdad final entre Debe y Haber. Un asiento puede continuar en
la siguiente página. Se conservan signos, líneas a cero, conceptos vacíos,
nombres y procedencia. Los conceptos que la impresión haya truncado se guardan
tal como aparecen: no se reconstruye texto ausente.

El ejercicio se deduce del año de la cabecera; la vista previa diferencia ese
ejercicio de las fechas reales de los movimientos. Un informe de 2026 que termina
en octubre se importa en el ejercicio 2026 abierto si no contiene un cierre.

El PDF original y su SHA-256 se archivan con los movimientos. La confirmación es
atómica y reintentable sin duplicar; requiere un ejercicio vacío. Cambiar el
formato o el alias después de revisar el archivo exige que el contexto siga
siendo válido al confirmar. El LIBRO DIARIO anterior mantiene su numeración.

## Verificación del archivo facilitado

`SIARI 2026.pdf`: 132 páginas, 1.091 asientos, 4.748 líneas y 206 subcuentas;
21.898.935,47 EUR en Debe y Haber. Movimientos del 01/01/2026 al 22/10/2026.
Se han comprobado todos los asientos y los acumulados de sus páginas y se ha
probado su importación en una empresa temporal.

## Instalación, copias y ampliaciones

Aplicar `npm run db:migrate`, incluida `021_company_formats_diari.sql`. No se
modifican los movimientos existentes. El límite es 5 MB, 300 páginas, 5.000
asientos, 20.000 líneas y 1.000 líneas por asiento importado.

Las copias conservan formato, alias y referencias originales. Las copias v1
anteriores a esta migración siguen admitiéndose con los valores predeterminados
de los campos añadidos; se conserva el checksum del archivo original.

`shared/company-formats.js` centraliza los formatos y capacidades. Los nuevos
módulos exclusivos de producción porcina deben consultar `companyHasCapability`
con la ficha de la empresa. Esta entrega añade la clasificación y su lector
de diario; las futuras utilidades de producción podrán utilizar esta base.

Pruebas: `pdf-journal-diari.test.js` y `diari-import-db.test.js`. El PDF empresarial
no se incorpora al repositorio; `TEST_DIARI_PDF` permite validarlo localmente.
