# Hacienda · Modelo 303

En **Hacienda** (`/hacienda`) se prepara un borrador del modelo 303 de la empresa seleccionada. Permite liquidación **trimestral** (1T–4T) o **mensual** (01–12), seleccionar el año natural, ver las casillas, abrir sus operaciones de origen y guardar un borrador independiente por empresa, año, periodicidad y período.

Requiere `npm run db:migrate` para aplicar `033_vat_drafts.sql`. Los borradores se incluyen en las copias de seguridad. Guardarlos no modifica facturas, apuntes ni saldos, y no presenta una declaración ante la AEAT.

## Uso

1. Seleccionar empresa, año, liquidación y período; pulsar **Ver modelo**.
2. Confirmar los criterios del régimen general y revisar las propuestas de los diarios importados. Las compras de inmovilizado, operaciones con dos cuotas y bases ambiguas requieren clasificación expresa. **Confirmar clasificaciones propuestas** confirma únicamente las operaciones con una propuesta calculable; las pendientes siguen excluidas.
3. Pulsar cualquier base, cuota o total para abrir las líneas que lo componen. Cada referencia abre la factura registrada con sus conceptos y PDF, o el asiento con su documento original, cuando existe. **Ver las líneas fiscales** incluye también las operaciones pendientes, separadas en **477 · IVA repercutido** y **472 · IVA soportado**, con subtotales por subcuenta y por grupo. Se distinguen base, IVA registrado e IVA incluido en el modelo. Las operaciones sin cuota se muestran en un bloque adicional. Los subtotales siguen el detalle y el buscador activos. El CSV conserva esta separación y las sumas parciales.
4. En **Revisar / Clasificar**, indicar tratamiento, base, tipo y porcentaje de cuota deducible. La cuota contabilizada se conserva. Los cambios se aplican al borrador; **Guardar borrador** los conserva en el servidor. La base no se prorratea: solo la cuota deducible.
5. Introducir, cuando corresponda, el saldo pendiente de la última declaración presentada. **Aplicar la compensación máxima posible** limita la casilla 78 al menor entre ese saldo y el resultado positivo; la casilla 87 conserva el remanente anterior, sin añadir el saldo generado en este período.
6. Guardar, descargar CSV o imprimir / guardar PDF. La presentación se realiza en la Sede de la AEAT.
7. **Archivo de presentación .303** prepara el fichero de la empresa y del período que ya están abiertos. Se habilita tras revisar el modelo y disponer de NIF válido. Permite ingreso, domiciliación con IBAN español, compensación, devolución con IBAN español cuando corresponda y resultado cero. Revisar los datos censales indicados, generar y descargar. En el formulario de la AEAT, utilizar **Importar**, validar y completar el pago, la firma y el envío.

## Propuesta del asiento de liquidación

**Proponer asiento de IVA** prepara la liquidación de la misma empresa y período, fechada en el último día del período. Muestra las subcuentas reales, el Debe y Haber, las compensaciones anteriores y los totales. Es una propuesta de consulta y CSV: no registra el asiento ni crea cuentas.

La propuesta carga las 477 y abona las 472 por los movimientos netos del período. La diferencia se propone en la 4750 cuando resulta a ingresar o en la 4700 cuando genera un crédito a compensar o devolver. La compensación anterior aplicada abona la 4700 y reduce el importe de la 4750. El pago o cobro se registra aparte con el movimiento bancario.

Antes de preparar las líneas se comparan las cuotas contables con el modelo. Si no coinciden —por ejemplo, por IVA no deducible pendiente de ajustar o diferencias entre devengo y registro— se muestra el desglose de la diferencia y se exige revisarla. No se inventa una contrapartida de gasto para cuadrar ni se cancela IVA de períodos anteriores. Las autoliquidaciones con inversión del sujeto pasivo aparecen en ambos grupos del detalle; las contribuciones de las casillas y del resultado se distribuyen sin duplicar importes.

Se utiliza la subcuenta de IVA identificada en el plan, priorizando una descripción inequívoca de IVA. Cuando hay varias candidatas se puede elegir en la propuesta. Las descripciones de retenciones o modelo 111 bajo el prefijo 4750 se excluyen de la elección automática y de la selección de IVA. Una cuenta inexistente queda pendiente de crear o revisar en el plan. Para aplicar compensaciones se contrasta el saldo deudor disponible de la 4700 en el ejercicio de la liquidación, incluyendo su apertura una sola vez.

Los asientos de liquidación ya existentes se muestran con enlace y se excluyen de los movimientos utilizados para la propuesta. Se avisa de su existencia para evitar otra liquidación. Los ejercicios cerrados y los modelos pendientes de confirmar quedan identificados. Una propuesta sin cuotas netas no crea líneas a cero.

Base contable: [Plan General de Contabilidad, cuentas 4700, 472, 4750 y 477](https://www.boe.es/buscar/act.php?id=BOE-A-2007-19884).

## Archivo de presentación

Se utilizan los diseños oficiales independientes de **2025 (v1.02)** y **2026 (v1.01)**, con registros de identificación/liquidación, resultado y datos bancarios. El archivo utiliza ISO-8859-1, campos de longitud fija, céntimos implícitos y `N` al inicio de los importes negativos. El nombre incluye NIF, año y período. El mapa de posiciones se conserva en `backend/src/services/vat-filing-layouts.json`, con URL y SHA-256 del libro oficial de origen. No es un CSV ni el PDF del borrador.

El servidor vuelve a leer la contabilidad al generar y contrasta una huella del modelo visualizado: si cambia la empresa, el período, los importes, la identificación o las operaciones de origen, exige actualizar el modelo. No cambia el borrador guardado, no presenta declaraciones ni genera justificantes de presentación o pago.

El fichero corresponde a una autoliquidación original del régimen general, tributación al Estado al 100 %, sin criterio de caja, concurso, prorrata especial ni recargo de equivalencia. Las opciones de REDEME, SII voluntario y resultado se confirman en la preparación. En el último período, los exonerados del 390 necesitan información anual adicional que debe completarse en la AEAT; la exportación del último período se limita a sujetos que presentan el 390. La devolución antes del último período requiere REDEME y liquidación mensual. Los plazos y los datos censales definitivos se validan en la AEAT.

El NIF de la entidad desarrolladora en AUX puede configurarse mediante `TAX_SOFTWARE_NIF`; se valida si se proporciona y no se inventa ni se sustituye por el del declarante. Se verifica el formato localmente; la validación censal y tributaria de la declaración se realiza en Pre303, antes de firmar y enviar.

## Origen y fechas

- Facturas emitidas: fecha de factura. Se presupone que coincide con el devengo; los anticipos, operaciones de tracto sucesivo y demás casos con devengo distinto se deben revisar fuera de esta automatización.
- Facturas recibidas: fecha de registro contable. La deducción exige además factura o justificante y el cumplimiento de los requisitos fiscales.
- Asientos sin factura registrada: fecha del asiento. Se consideran apuntes de IVA 472/477 de asientos normales y contabilizados. También se muestran para revisión los ingresos o compras con cliente/proveedor sin cuota de IVA, para distinguir operaciones exentas y a tipo cero. Se excluyen apertura, regularización y cierre, y se muestran aparte las liquidaciones entre 472/477 y 4700/4750.
- El período es natural y abarca todos los ejercicios contables de la empresa que intersecten esas fechas. No se recorta al ejercicio del selector superior.
- Una factura registrada sustituye a su asiento como origen fiscal: no se suman ambos. Una anulación contabilizada en otro período genera una modificación negativa en el período de la anulación, pendiente de comprobar el documento rectificativo.
- Los apuntes importados solo proponen base y tipo cuando existe un desglose inequívoco compatible con un tipo habitual. No se considera confirmada su deducibilidad. Los desgloses ambiguos permanecen pendientes y no se incorporan silenciosamente al modelo.
- Las claves de origen utilizan los identificadores estables de solicitud y la posición, no los IDs de base de datos. Una huella del contenido invalida revisiones antiguas si cambian las operaciones y permite conservarlas al restaurar una copia.

## Alcance

Diseño contrastado con las instrucciones de la AEAT de **2025 y 2026**, régimen general y tributación al Estado al 100 %. El diseño se marca pendiente de contraste en otros ejercicios. Incluye tipos interiores 0, 4, 10 y 21 %, compras corrientes / inversión, importaciones, adquisiciones intracomunitarias, inversión del sujeto pasivo, rectificaciones y compensaciones agrícolas. Estas clasificaciones especiales requieren revisión y documentación. Las operaciones a tipo cero recibidas no incrementan las bases deducibles. El tipo cero emitido no se presume: debe distinguirse de exención, exportación o no sujeción.

No automatiza régimen simplificado, criterio de caja, recargo de equivalencia, sectores diferenciados, regularizaciones anuales de prorrata o inversión, tributación foral, IVA diferido de importación, pagos de hidrocarburos ni autoliquidaciones rectificativas de declaraciones presentadas. Los importes calculados son un borrador; «revisado» significa que se han confirmado los criterios y fuentes disponibles, no que exista una validación o presentación por la AEAT. Las periodicidades mensual y trimestral no se encadenan ni arrastran automáticamente saldos.

Los cálculos monetarios usan enteros en céntimos y redondeo por línea. Cada casilla calculada mantiene sus contribuciones de origen. La compensación anterior se identifica como ajuste manual en el resultado.

API: `GET /api/tax/vat`, `POST /api/tax/vat/preview` y `PUT /api/tax/vat/draft`, con `year`, `frequency=quarterly|monthly` y `period=1..4|1..12`. El ámbito es `X-Company-Id`; las escrituras requieren `accounting_write`. Guardar exige la versión actual del borrador para evitar sobrescribir cambios de otro usuario.

`POST /api/tax/vat/filing` recibe `input`, `model_hash` y las opciones `filing`, con los mismos filtros de período. Exige `accounting_write` y devuelve el `.303` como archivo adjunto. Los modelos pendientes de revisión, con NIF inválido o fuente cambiada no se exportan como presentación.

`GET /api/tax/vat` y la vista previa incluyen `settlement_proposal`. `POST /api/tax/vat/settlement-preview` admite `input`, `model_hash` y la selección opcional `accounts.payable_account_id` / `accounts.receivable_account_id`; es una consulta sin escrituras, permitida también a usuarios de consulta. Los IDs se validan contra las cuentas de IVA de la empresa y se contrasta que el modelo siga vigente.

## Verificación

`node --test backend/test/vat-model.test.js` cubre períodos, precisión, deducción parcial, rectificaciones, compensaciones, bases a tipo cero, trazabilidad y revisiones obsoletas. Con `TEST_MYSQL=1`, `backend/test/vat-db.test.js` comprueba integración, aislamiento, fechas, permisos, versiones y copias dentro de una transacción que se revierte al terminar.

`backend/test/vat-filing.test.js` contrasta longitudes y posiciones oficiales de ambos ejercicios, codificación, signos, períodos mensuales, IBAN, tipos de declaración y condiciones de exportación. La integración MySQL/HTTP comprueba que se descarga el modelo revisado y que los cambios de período o de huella no pueden producir un archivo distinto del mostrado.

`backend/test/vat-details.test.js` verifica los bloques 477/472, las sumas parciales, los abonos, la deducción parcial, el CSV y la inversión del sujeto pasivo sin doble cómputo. `backend/test/vat-settlement.test.js` cubre resultados a ingresar, a compensar y cero, uso de la 4700, cuotas negativas, cuentas de retención, diferencias fiscales y ejercicios cerrados. Las pruebas MySQL comprueban las subcuentas reales, la ausencia de escrituras al consultar, los permisos, el rechazo de cuentas de otra empresa y las liquidaciones existentes.

Diseños y proceso de importación: [AEAT, modelos 300–399](https://sede.agenciatributaria.gob.es/Sede/ayuda/disenos-registro/modelos-300-399.html), [diseño 2025](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos_25/DR303e25.xlsx), [diseño 2026](https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos_26/DR303e26v101.xlsx), [presentación mediante formulario web](https://sede.agenciatributaria.gob.es/Sede/ayuda/consultas-informaticas/presentacion-declaraciones-ayuda-tecnica/modelo-303.html).

Fuentes: [instrucciones 2025](https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/iva/modelo-303-iva-autoliquidacion_/instrucciones-2025.html), [instrucciones 2026, enero / 1T](https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/iva/modelo-303-iva-autoliquidacion_/instrucciones-2026.html), [instrucciones 2026, febrero–diciembre / 2T–4T](https://sede.agenciatributaria.gob.es/Sede/todas-gestiones/impuestos-tasas/iva/modelo-303-iva-autoliquidacion_/instrucciones-2026/instrucciones-02-12-2t-4t-2026.html).
