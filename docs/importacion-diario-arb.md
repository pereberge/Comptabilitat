# Diario de Piensos ARB

`arb2024.pdf` utiliza el formato DIARI, con origen `P. ARB` (alias configurado en la empresa). Se conservan los códigos originales en minúsculas `za` y `zz`, y el asiento C1/163 de una sola línea a cero. Se reconoce la descripción de apertura `Assentament obertura`. Sus 239 páginas contienen 1.903 asientos y 8.733 líneas; Debe y Haber suman 54.815.485,08 €. La capacidad DIARI de la empresa y su alias se siguen validando.

En **Ejercicios → Importar / actualizar diario PDF**, se admite también el formato **LIBRO DIARIO (EURO)** de Piensos ARB. Se mantienen los adaptadores anteriores LIBRO DIARIO, LISTADO DEL DIARIO y DIARI.

La empresa de destino debe coincidir con el nombre de origen del PDF (o su alias configurado), tener subcuentas de 8 dígitos y un ejercicio del 1 de enero al 31 de diciembre del año de los movimientos. La fecha de impresión no determina el ejercicio. No requiere migraciones ni cambiar el formato de empresa: utiliza la capacidad existente de libro diario.

El lector conserva los números originales, nombres, conceptos, importes negativos y filas a cero, incluidos los asientos originales de una sola línea a cero. Reconoce la apertura aunque no sea el primer asiento y admite asientos repartidos entre páginas. No interpreta un cierre de IVA como cierre del ejercicio.

Por indicación del usuario, `ARB S.A.` y `PIENSOS ARB S.A.` se consideran el mismo nombre de origen al validar la importación, en ambos sentidos. Esta equivalencia no cambia el nombre fiscal ni el alias configurado; las demás empresas siguen exigiendo coincidencia del nombre o de su alias.

Se validan secuencia de páginas, contexto de empresa y año, cuentas, fechas, totales por asiento, sumas anteriores y acumuladas, y total general. Los campos impresos de totales tienen 12 caracteres: por encima de diez millones, este PDF pierde el último decimal. En ese caso se comprueban las cifras visibles contra el total calculado y se muestra un aviso; nunca se inventa el céntimo que falta. Los apuntes se leen completos y su cuadre se verifica en céntimos con BigInt.

El archivo facilitado `2023.pdf` tiene 223 páginas, 2.533 asientos, 7.721 apuntes y 281 subcuentas. Debe y Haber suman exactamente **42.289.206,69 €**. Incluye 248 líneas negativas y 164 líneas a cero. Se reconoce la apertura 1325; el PDF no termina con un cierre contable reconocido.

El archivo `2017.pdf` tiene 233 páginas, 2.247 asientos, 8.427 apuntes y 325 subcuentas; ambos lados suman **78.840.014,56 €**. En la página 184, asiento 1820, hay una fila con fecha y concepto, sin cuenta ni importe. Se omite y se cuenta en `ignored_empty_lines` para mostrarla en la revisión existente. Solo se admite dentro de un asiento con la misma fecha, sin ningún contenido adicional fuera del concepto. Una fila sin cuenta que contenga importes se sigue rechazando. El PDF original se conserva al importar.

Se reutilizan la previsualización y confirmación existentes, con aislamiento por empresa y ejercicio y comprobaciones frente a duplicados. Añadir este lector no importa datos automáticamente ni elimina diarios existentes.

El PDF de 2013 contiene en la página 206 el asiento 2338, compuesto únicamente por fecha, número y subtotal 0,00 / 0,00. Se valida su subtotal y se omite sin crear cuentas ni apuntes ficticios; su número queda reservado durante la lectura para detectar duplicados. La revisión muestra el número de asientos vacíos omitidos. El documento completo tiene 240 páginas, 2.665 asientos con apuntes, 8.372 líneas y 344 subcuentas; ambos lados suman 81.869.885,67 €. Su nombre de origen es `ARB S.A.`, equivalente a `PIENSOS ARB S.A.`.

Pruebas específicas (sin MySQL):

```powershell
$env:TEST_ARB_PDF='F:\code\contabilitat\2023.pdf'
node --test backend/test/pdf-journal-arb.test.js backend/test/pdf-journal.test.js backend/test/pdf-journal-diari.test.js backend/test/pdf-journal-listado.test.js backend/test/journal-import-plan.test.js
```
