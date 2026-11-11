# Patrimonio y beneficio

El perfil **Máster** dispone de **Patrimonio y beneficio** en la barra superior,
junto al selector de usuario. El resumen reúne todas las empresas configuradas,
incluidas las que se añadan posteriormente. La pantalla muestra únicamente la empresa
seleccionada en el selector habitual y cambia automáticamente al elegir otra empresa.
El enlace se oculta al cambiar a Usuario;
la pantalla y su API también rechazan el acceso sin el perfil máster.

Cada empresa tiene una gráfica y una tabla con todos sus ejercicios, del más
antiguo al más reciente. El selector **Gráfica** permite consultar patrimonio neto
o beneficio/pérdida. Los puntos admiten ratón y teclado y muestran su importe.
Un ejercicio sin movimientos contabilizados se muestra con guiones y
**Sin movimientos**, y deja una discontinuidad en la gráfica.

El patrimonio neto corresponde al epígrafe A del patrimonio del Balance de
Situación abreviado, sin sumar los pasivos. Incluye la apertura y excluye el
asiento de cierre. El beneficio es el resultado generado por los grupos 6 y 7,
excluyendo apertura, regularización y cierre; se conserva aunque el resultado
se haya traspasado desde la cuenta 129. Se utilizan céntimos exactos.

En importaciones antiguas, el traspaso anual puede estar marcado como asiento normal.
Para calcular el beneficio se excluye también si su concepto es «Regularización del
ejercicio» o «Liquidar pèrdues i guanys», tiene fecha de fin del ejercicio, cuadra
y contiene exclusivamente cuentas de los grupos 6/7 y 129, con presencia de ambos.
No se excluyen por este criterio ajustes de existencias, IVA ni repartos de resultado.
El informe funciona con ejercicios abiertos y cerrados, sin crear ni modificar asientos.

Los ejercicios terminados se consultan a su fecha de cierre. El ejercicio en
curso se limita a la fecha actual en Europe/Madrid, que se muestra en el informe.
No se trasladan saldos entre años: cada uno utiliza sus asientos y su apertura.
**Revisar balance** señala diferencias, clasificación pendiente u observaciones
del Balance de Situación. **Actualizar datos** vuelve a consultar el resumen.

`GET /api/master/company-evolution` devuelve `as_of` y todas las empresas con sus
ejercicios, corte, patrimonio neto, beneficio y estado. Acepta `as_of=AAAA-MM-DD`
para consultar un corte histórico. No se aceptan identificadores de empresa desde
la petición. Con base compartida se consulta el catálogo completo en una instantánea
MySQL de solo lectura; con bases separadas se recorre el registro de empresas y se
consulta cada base con su propio identificador e instantánea de solo lectura.

La comprobación incluye pruebas de permisos HTTP, precisión, patrimonio frente
a pasivos, resultados ya distribuidos, fechas, ejercicios vacíos y MySQL con
empresas temporales. No requiere migraciones.

# Búsqueda y edición de asientos

En **Asientos contables**, el campo **Importe** admite coma o punto decimal,
sin separadores de miles. Busca una coincidencia exacta en Debe o Haber y
muestra el asiento completo, incluidas sus contrapartidas. Se combina con fecha
y número. Un importe cero busca únicamente líneas con Debe y Haber a cero.

Clicar cualquier punto de una fila abre directamente la edición si está
permitida. El número permite abrirla también con el teclado. Al guardar se
actualiza el listado y se mantienen los filtros. Los ejercicios cerrados y los
asientos protegidos se abren para consulta, respetando las reglas existentes.

**Copias de seguridad** se ha retirado del menú lateral. Sigue disponible desde
el botón de Inicio y en `/copias-seguridad`.
