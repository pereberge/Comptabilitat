# Búsqueda y cuenta de la última factura

Al crear facturas emitidas o recibidas, el buscador existente permite escribir nombre, razón social, CIF o código. Se muestran hasta diez resultados seleccionables y se mantiene la lista completa de subcuentas filtradas. Elegir un resultado rellena los datos del cliente o proveedor.

Se propone la cuenta de ingreso, gasto o activo de la última factura guardada no anulada del mismo tercero y dirección, dentro de la empresa seleccionada. La memoria se obtiene de las facturas existentes y permanece disponible entre sesiones y ejercicios; no necesita migraciones ni almacenamiento local adicional. Una factura nueva guardada pasa a ser la referencia para la siguiente.

La propuesta muestra código, descripción y referencia de la factura anterior. Puede modificarse en **Cuentas contables**. Se respeta la cuenta que ya tuviera la propuesta o que el usuario haya seleccionado manualmente. Al cambiar de tercero se actualiza la sugerencia automática; si no tiene historial se retira esa sugerencia. La memoria de cuentas de la integración Gestiò conserva su comportamiento propio.

Solo se proponen subcuentas disponibles de la empresa: grupo 7 para emitidas y grupos 6/2 para recibidas. Sin historial se mantienen los valores automáticos existentes. No se crean facturas ni se alteran asientos anteriores al buscar o seleccionar un tercero.
