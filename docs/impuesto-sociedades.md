# Impuesto sobre Sociedades · Modelo 200

Hacienda → Sociedades prepara un borrador anual para la empresa y el ejercicio seleccionados, incluidos ejercicios cerrados. Toma las líneas contabilizadas de ingresos y gastos, usa las cuentas PGC reales, excluye apertura, regularización, cierre y asientos anulados, y añade automáticamente la corrección del IS contabilizado (630, 633 y 638).

Los criterios, ajustes permanentes y temporarios, reservas revisadas, BIN, deducciones y pagos a cuenta se guardan por empresa y ejercicio. La cifra de negocios anterior se confirma expresamente: la propuesta de ventas de la empresa no determina por sí sola el INCN fiscal del grupo. Los ajustes vinculados mantienen una huella del movimiento; si cambia la evidencia, quedan pendientes de revisión y se excluyen del cálculo. Guardar usa versiones para detectar cambios desde otra sesión.

El origen 473 suma movimientos del ejercicio y excluye las liquidaciones de IS detectadas. Si mezcla otros impuestos o hace falta el desglose de retenciones y pagos 202, se utiliza la entrada manual, que sustituye al total contable. La propuesta de liquidación usa 6300, 473, 4752 o 4709 y muestra su cuadre; se registra por separado en Asientos. Una liquidación detectada impide proponer otro asiento automático.

## Cálculo y fuentes oficiales

- Tipos para períodos iniciados en 2024, 2025 y 2026; microempresa con dos tramos en 2025/2026 y prorrateo del umbral de 50.000 € en períodos inferiores al año: [AEAT · Tipos de gravamen](https://sede.agenciatributaria.gob.es/Sede/impuesto-sobre-sociedades/que-base-imponible-se-determina-sociedades/tipo-impositivo.html).
- BIN: disponibilidad y límites del 70/50/25 %, mínimo de un millón proporcional a la duración y excepción de nueva creación confirmada por el usuario: [AEAT · Límites](https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-sociedades-2025/capitulo-05-liquidacion-is-determinacion-imponible/bi-despues-reserva-capitalizac-compensac-00552/compensacion-bi-negativas-periodos-anteriores/limites-compensacion-bi-negativas.html).
- Capitalización y nivelación: se introducen reducciones ya revisadas; se comprueban los límites sobre la base. No se infiere el derecho a la reserva ni sus requisitos de mantenimiento, empleo o fondos propios: [Ley 27/2014, artículos 25, 26, 29, 39 y 105](https://www.boe.es/buscar/act.php?id=BOE-A-2014-12328).
- Referencia de casillas: [AEAT · Modelo 200 de 2025](https://sede.agenciatributaria.gob.es/static_files/Sede/Biblioteca/Manual/Practicos/Sociedades/Sociedades_2025/Imagenes-S25/AnexoI_Mod200-2025_ca_es.pdf).

## Alcance

El resultado es provisional mientras falte revisar el INCN, la contabilidad o los criterios, el período siga abierto temporalmente, el año no esté verificado o se trate de consolidación / INCN desde 20 millones. Los regímenes especiales, normativa foral, tributación mínima, rectificativas y deducciones fuera del límite conjunto requieren preparación específica. No se calculan activos o pasivos por impuesto diferido.

CSV y PDF son documentos de trabajo. La presentación requiere completar los datos censales, balance y desgloses en [Sociedades WEB](https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GE04.shtml). No se genera un fichero oficial .200 ni se envía ninguna declaración a la AEAT.

La migración 037 añade `corporate_tax_drafts`. Las copias completas y por ejercicio incluyen los borradores; las copias antiguas sin esta tabla siguen siendo compatibles. Vaciar o sustituir un ejercicio archiva y elimina su borrador junto con los datos de ese ejercicio.

Validación: pruebas unitarias del cálculo decimal, pruebas MySQL de aislamiento, cierres, borradores, huellas, copias/restauración, permisos y archivo al vaciar; prueba de navegador de ajustes, guardado, CSV, propuesta, PDF, consulta de asientos, recarga, móvil y navegación IVA/IS.
