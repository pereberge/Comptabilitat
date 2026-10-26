# Balance de Situación

Disponible en **Contabilidad → Balance de Situación**, ruta `/balance-situacion`.
No requiere migraciones, semillas ni cambios en los asientos existentes.

API: `GET /api/accounting/balance-sheet?exercise_id=1&date=2026-10-16&model=abbreviated`.
La empresa procede de `X-Company-Id`, como en el resto de la API. Se admiten también
`exerciseId` y `companyId`; si se especifica empresa debe coincidir con ese ámbito.
Los modelos válidos son `normal` y `abbreviated`. La respuesta contiene secciones
jerárquicas, cuentas/subcuentas, importes decimales como cadenas, resultado,
totales, diferencia, controles y diagnóstico.

## Consulta y navegación

Al abrir el informe sin filtros se selecciona el ejercicio más reciente de la
empresa por sus fechas, aunque haya otro ejercicio recordado o marcado como
predeterminado. Se abre al cierre de diciembre y con la comparación del ejercicio
anterior activada, también a diciembre. Los ejercicios que no incluyen diciembre
usan su último día. La selección manual de otro ejercicio sigue disponible.
Los enlaces con empresa, ejercicio y fechas conservan sus filtros al abrirlos y
al volver del Mayor, incluida la comparación desactivada explícitamente.
Selecciona fecha y modelo Normal o Abreviado y pulsa Consultar.
**Dígitos de las cuentas** permite elegir Partidas o de 3 dígitos hasta la
longitud completa de las subcuentas de la empresa (por ejemplo, 8 dígitos).
Al consultar un nivel se abren sus epígrafes automáticamente. Las agrupaciones
se hacen dentro de cada partida PGC, con céntimos exactos, sin alterar los
totales ni mezclar cuentas clasificadas en lados distintos. La selección se
conserva en la URL, al recargar y al volver del Mayor. El CSV respeta el nivel
seleccionado; Partidas mantiene el desglose completo en la exportación. Tanto el
formulario como la API rechazan fechas fuera del ejercicio.

Las columnas Activo y Patrimonio Neto y Pasivo se apilan en pantallas pequeñas.
Los epígrafes se despliegan hasta la cuenta padre real y sus subcuentas. Cada
subcuenta enlaza con el Mayor desde el inicio del ejercicio hasta la fecha del
balance, conservando empresa, ejercicio y un enlace de vuelta al informe.

El CSV incluye metadatos, jerarquía, subtotales, cuentas, contribuciones, saldos
firmados, totales, diferencia, resultado y diagnóstico. Usa BOM UTF-8, separador
punto y coma, coma decimal y protección de texto frente a fórmulas de Excel.
Los totales de cada nivel son subtotales: no se deben sumar todas las filas del CSV.
La exportación se deshabilita si se cambian filtros sin consultar.

### Comparar con el año anterior

El botón **Comparar con año anterior** activa una tabla con el ejercicio actual,
el anterior y la variación en euros (**actual menos anterior**) para cada partida,
cuenta, subcuenta, total y resultado. **Ocultar comparación** vuelve al balance
individual. Al final de los epígrafes del activo aparece **TOTAL ACTIVO**, y
al final del patrimonio neto y pasivo, **TOTAL PATRIMONIO NETO Y PASIVO**. Ambos
muestran el importe de cada ejercicio y su variación. La fila **DIFERENCIA**
compara activo menos patrimonio neto y pasivo en los dos años y en la variación.
Estos totales también se colocan después de cada lado en el CSV.
La fila **Resultado generado en el ejercicio** muestra los ingresos menos los
gastos contabilizados hasta la fecha de cada columna, con su variación. Excluye
apertura, regularización y cierre. Sigue mostrando el beneficio o la pérdida
del año aunque ya se haya traspasado desde la cuenta 129 a otras cuentas.
**Resultado incluido en el balance** mantiene el saldo presentado en las
partidas patrimoniales. Las dos cifras se exportan también al CSV; el resultado
generado se muestra igualmente en la consulta individual. No se modifica el diario
ni se vuelve a sumar ese resultado a los totales del balance.
La comparación se conserva en la URL con `compare_previous=true`,
en la exportación CSV y al volver desde el Mayor de cualquiera de los años.

El ejercicio anterior debe pertenecer a la misma empresa y terminar el día
anterior al inicio del seleccionado. Si no existe, se muestra un aviso y no se
sustituye por otro año ni se inventan saldos. Si existe pero no tiene movimientos
contabilizados hasta la fecha comparada, se indica expresamente.

En una consulta intermedia se usa el mismo mes y día del año anterior; el 29 de
febrero pasa al 28 si es necesario. Al consultar el último día del ejercicio se
compara con el último día del anterior. Si la fecha equivalente queda fuera de
ese período, se indica que no hay un corte comparable. Se admiten ejercicios
que no coincidan con el año natural. Ambos balances excluyen el asiento de cierre
y se calculan dentro del mismo snapshot de solo lectura.

El desglose incluye las cuentas con saldo solo en uno de los años. Los importes
de las subcuentas enlazan al Mayor de su ejercicio y fecha de corte. Los avisos y
cuentas pendientes de clasificación de cada año se conservan en el diagnóstico
y en el CSV. Los importes y diferencias se calculan con céntimos BigInt.

## Cálculo y controles

`createReportService.balanceSheet` utiliza exactamente la consulta de Sumas y
Saldos acumulada a nivel de subcuenta. Consulta, evidencias de apertura y
clasificación se ejecutan dentro de una misma transacción de solo lectura con
snapshot consistente. Solo se incluyen asientos `posted` de la empresa y ejercicio,
entre su fecha inicial y la fecha consultada, ambas incluidas.

Los importes SQL DECIMAL se convierten en céntimos BigInt. No se usan Number,
redondeos ni valores absolutos para calcular saldos. El saldo es Debe menos Haber.
El activo presenta ese signo; patrimonio neto y pasivo presentan su inverso.
Así, amortizaciones y deterioros acreedores reducen el activo, y capital no
exigido, acciones propias y pérdidas reducen el patrimonio neto.

La clasificación utiliza el código de la cuenta padre real. Nunca interpreta
el sufijo de una subcuenta como un desarrollo oficial de cuatro dígitos. Para
las cuentas 240, 241, 242, 530, etc. que necesitan distinguir grupo/asociadas y
terceros, el padre debe identificar el desarrollo correspondiente. Un padre
demasiado genérico genera un diagnóstico en vez de una asignación supuesta.
El desarrollo importado 2400 se presenta por separado en el activo no corriente,
como participaciones en partes vinculadas sin desglose: no se presupone si la
contraparte es del grupo, asociada u otra parte vinculada. Su importe entra una
sola vez y conserva el enlace al Mayor; el aviso PGC_DETAIL_REQUIRED mantiene
pendiente la revisión de la partida detallada. Los desarrollos oficiales
2403/2404 y 2405 conservan sus destinos distintos.
La amortización genérica importada 2810 reduce el inmovilizado material en ambos
modelos. En el normal se presenta directamente en ese epígrafe, con el mismo
aviso por falta del detalle por clase de activo, sin asignarla por el nombre de
la subcuenta. Los códigos desconocidos siguen fuera de los totales y diagnosticados.

El resultado presentado es:

```
− saldo firmado del 129 − suma de saldos firmados residuales de grupos 6 y 7
```

Antes de regularizar, el resultado procede de ingresos y gastos. Después procede
del 129. Durante una regularización parcial combina ambos saldos, sin reconstruir
ni volver a sumar ingresos y gastos ya regularizados. Los movimientos excepcionales
y las pérdidas conservan sus signos. Cada contribución sigue enlazada con su Mayor.

La respuesta añade `generated_result`, calculado directamente con los movimientos
de los grupos 6 y 7 de la empresa y ejercicio consultados, excluyendo asientos
anuales, borradores y anulados. La comparación incluye `comparison.generated_result`
con importe actual, anterior y variación. El cálculo comparte la instantánea de
lectura del balance y respeta el corte de fecha de cada ejercicio.

Los controles separan igualdad aritmética, clasificación completa, ausencia de
duplicados, conciliación del resultado y conciliación con Sumas y Saldos. Un saldo
no clasificable **no entra en ninguna partida** y aparece con su saldo firmado y
enlace al Mayor. La identidad de conciliación es:

```
diferencia del balance + saldo firmado no clasificado = diferencia de Sumas y Saldos
```

Un balance puede cuadrar y contener cuentas pendientes o saldos anómalos: en ese
caso se muestran las observaciones y se abre el diagnóstico. Nunca se añade una
partida para forzar el cuadre.

## Fuente y mantenimiento del mapa

Fuente: [PGC, RD 1514/2007, texto consolidado del BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884),
tercera parte, modelos normal y abreviado y norma de elaboración del balance.
La configuración versionada está en
`backend/src/services/pgc-balance-map.json`. Contiene por separado las jerarquías,
prefijos y marcas de cuentas correctoras de cada modelo. El motor aplica las
correspondencias más específicas y rechaza asignaciones múltiples.

Las cuentas 551 y 5523/5524/5525 figuran en ambos lados del modelo: se presentan
según el saldo de **cada subcuenta**, sin compensarlas entre sí. Se conservan los
signos contrarios al habitual en las demás partidas y se advierte para revisión.
El modelo normal incorpora la partida de investigación prevista en la norma de
elaboración y la cuenta 257 en otros activos financieros a largo plazo.

Los saldos pendientes de la cuenta 473 (retenciones y pagos a cuenta) se incluyen
en el activo corriente: «5. Activos por impuesto corriente» del modelo normal y
«3. Otros deudores» del abreviado. Es una correspondencia adicional para informes
intermedios, ya que la tabla anual del BOE no enumera esta cuenta y su movimiento
prevé liquidarla contra 6300/8300 o 4709. El saldo conserva su signo y su enlace al
Mayor. Esta clasificación del informe no crea asientos de liquidación ni modifica
la contabilidad. El generador mantiene expresamente esta correspondencia.

Para regenerar desde una copia HTML del texto consolidado:

```powershell
node scripts/build-balance-map.mjs ruta/al/BOE-A-2007-19884.html
```

Revisar siempre las diferencias, actualizar la versión si cambia el criterio y
ejecutar las pruebas. La aplicación no descarga ni modifica el mapa en ejecución.

## Límites explícitos de esta versión

- Los saldos residuales de grupos 8 y 9 quedan pendientes de asignación en el
  diagnóstico. No se suman al 129: falta identificar su destino patrimonial y el
  efecto impositivo para presentar con fiabilidad su imputación directa a patrimonio.
- No hay metadatos de tipo de asiento para identificar una apertura. Si existe
  actividad anterior se advierte: los movimientos patrimoniales del primer día
  son solo evidencia, no prueba de una apertura completa. Nunca se arrastran saldos
  del ejercicio anterior ni se duplica una apertura registrada.
- El plan de cuentas no contiene vencimientos, ciclo de explotación, relación con
  contrapartes ni políticas de compensación. La clasificación presupone códigos
  PGC correctamente utilizados; reclasificaciones por vencimiento o naturaleza que
  no consten en esos códigos requieren revisión contable. No se trasladan saldos
  por deducciones basadas únicamente en el signo.
- El modelo se elige manualmente; no se determina automáticamente si la empresa
  cumple los límites legales para formular cuentas abreviadas. No incluye
  notas de memoria: es un informe de consulta,
  no un paquete de cuentas anuales para depósito.
- No implementa regularización, cierre, apertura automática ni exportación PDF.

## Archivos

Nuevos: motor `balance-sheet.js`, mapa `pgc-balance-map.json`, utilidad compartida
`report-amount.js`, vista `BalanceSheetView.vue`, componente `BalanceSheetNode.vue`,
textos `locales/balance-sheet.js`, exportador `balance-sheet-csv.js`, pruebas
`balance-sheet.test.js` y `balance-sheet-db.test.js`, regenerador del mapa y
`verify-balance-browser.mjs`.

Modificados: servicio y controlador de informes, rutas API, router Vue, menú y
textos generales, y enlace de retorno del Mayor. Se reutiliza `report-format.js`.

## Validación

```powershell
npm test
$env:TEST_MYSQL='1'
npm test
Remove-Item Env:TEST_MYSQL
npm run build
```

Las pruebas cubren 100.000 € de activo y financiación, amortizaciones y deterioros,
beneficios, pérdidas, resultado sin regularizar, regularizado y parcialmente
regularizado, signos contrarios, cuentas desconocidas, grupos 8/9, clasificación
condicional, dos ejercicios, fechas intermedias, apertura, exclusión de borradores
y anulados, precisión, CSV, conciliación individual con Mayor y Sumas y Saldos,
modelos y validaciones HTTP. Las integraciones crean y eliminan únicamente sus
propias empresas y registros temporales; no modifican los asientos de la empresa.

La comprobación de navegador usa una sesión aislada Chromium/Edge con depuración
en el puerto 9333 y la aplicación en 5180. Requiere al menos una subcuenta con
saldo en el ejercicio visible para comprobar la navegación real al Mayor:

```powershell
node scripts/verify-balance-browser.mjs
```

Comprueba navegación al Mayor y retorno, empresa/ejercicio/fecha conservados,
cambio de modelo, bloqueo de exportación obsoleta y ausencia de desbordamiento a
390 px y de excepciones JavaScript. Guarda capturas en el directorio temporal.

Validación final del 16/10/2026: **61 pruebas con MySQL real, todas correctas**, sin
pruebas omitidas; compilación Vite correcta; navegación y visualización revisadas
en Edge a 1440 px y 390 px, sin excepciones JavaScript ni desbordamiento horizontal.

## Selección de meses en comparativas

Mes actual lleva la fecha del balance al último día del mes seleccionado, limitada al final del ejercicio. Se conserva la fecha exacta para cortes intermedios. Al activar la comparación aparece Mes comparado para elegir de forma independiente el corte del ejercicio anterior. El parámetro previous_date admite esa fecha; se valida dentro del ejercicio anterior de la misma empresa. El balance sigue siendo acumulado desde la apertura hasta cada corte. Un fin de mes se compara por defecto con el fin del mismo mes anterior, incluido el 29 de febrero cuando corresponda.

Véase también [Pérdidas y Ganancias por meses](perdidas-ganancias.md).
