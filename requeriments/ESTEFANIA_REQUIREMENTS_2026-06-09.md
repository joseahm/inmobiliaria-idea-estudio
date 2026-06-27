# Requerimientos Estefania - 2026-06-09

Documento creado el 2026-06-09 a partir de los mensajes enviados por Estefania en capturas del 2026-06-08.

## Objetivo

Mejorar claridad operativa en `Deudas`, `Historiales`, `Facturas`, `Pagos`, `Caja`, comprobantes PDF y liquidaciones para que el equipo pueda identificar siempre:

- Numero de inquilino o propietario.
- Numero/codigo de finca.
- Direccion de finca.
- Concepto cargado.
- Periodo o rango de fechas.
- Acciones disponibles: ver, editar, borrar/anular, avisar por correo o WhatsApp.

## Lista De Requerimientos

| # | Pedido | Estado objetivo |
| --- | --- | --- |
| 1 | En historial de deudas debe verse direccion de la finca. | Mostrar referencia/codigo y direccion en historiales. |
| 2 | En nueva deuda de inquilino debe verse finca y numero de inquilino. | Mejorar selector de contrato con codigo de inquilino, finca y direccion. |
| 3 | En deuda de inquilino no deben aparecer Contribucion, Primaria ni Fondo de reserva; esos corresponden a propietario. | Separar conceptos de inquilino y propietario; dejar `Otros` con descripcion libre. |
| 4 | En nuevo debito propietario debe aparecer numero de propietario; en finca debe aparecer numero/codigo de finca y direccion. | Mejorar selectores de propietario y finca. |
| 5 | Explicar check `Genera salida de caja` en debito propietario. | Cambiar texto y ayuda: solo se marca si la inmobiliaria pago el gasto y sale dinero real de caja. |
| 6 | En debitos, donde dice periodo debe poder figurar desde y hasta fecha determinada. | Agregar fecha desde/hasta manteniendo periodo de liquidacion. |
| 7 | Alerta por duplicado si se ingresa mismo concepto para mismo propietario/finca o inquilino/finca. | Mostrar confirmacion antes de guardar si hay posible duplicado. |
| 8 | Desde Deudas debe haber acciones para borrar, editar, visualizar, mandar correo y WhatsApp. | Mostrar acciones mas claras en filas de deuda; propietario debe poder anularse. |
| 9 | En historial debe aparecer direccion de finca y numero de propietario o inquilino. | Agregar codigo/persona y direccion en historiales. |
| 10 | Explicar `alquileres pendientes en rango` en historial cronologico. | Mejorar texto de ayuda en pantalla. |
| 11 | En facturas debe aparecer direccion de finca; en OSE u otros conceptos debe verse numero y direccion. | Mostrar finca/codigo/direccion en listado de facturas. |
| 12 | En registrar pago agrupado debe haber check para seleccionar que paga y que no paga. | Agregar checkbox por deuda en pago agrupado. |
| 13 | En registrar pago agrupado debe aparecer numero de inquilino, numero de finca y direccion. | Mostrar codigo inquilino/finca/direccion en cada deuda del pago agrupado. |
| 14 | En historiales, el boton de ayuda molesta para seleccionar pagina siguiente. | Alejar ayuda flotante del paginador o compactarla. |
| 15 | En comprobante generado debe figurar direccion de la finca. | Incluir finca/codigo/direccion en recibo PDF. |
| 16 | En movimientos de caja debe figurar numero de inquilino/propietario, numero de finca y direccion. | Ampliar datos de movimientos de caja. |
| 17 | Liquidacion descargada debe ser visualmente similar al modelo Tower. | Ajuste visual pendiente de modelo exacto; mejorar encabezado/datos como primera fase. |
| 18 | Falta boton para ingresos de ANDA/Contaduria. | Agregar accion rapida o flujo especifico para registrar ingresos por origen ANDA/Contaduria. |

## Priorizacion

### Prioridad Alta

1. Direccion/codigos visibles en deudas, historiales, facturas, pagos y caja.
2. Separacion de conceptos de inquilino vs propietario.
3. Check por deuda en pago agrupado.
4. Alertas de posible duplicado.
5. Comprobantes con direccion de finca.

### Prioridad Media

1. Fecha desde/hasta en debitos.
2. Mejor explicacion de salida de caja.
3. Reubicacion de ayuda flotante.
4. Boton de ingreso ANDA/Contaduria.

### Prioridad A Confirmar

1. Modelo visual exacto de liquidacion Tower.
2. Reglas contables exactas para ingresos ANDA/Contaduria.

## Criterios De Prueba

1. Crear deuda de inquilino y verificar que el selector muestre codigo de inquilino, finca y direccion.
2. Confirmar que Contribucion, Primaria y Fondo de reserva no aparecen como conceptos directos de deuda de inquilino.
3. Crear debito propietario y verificar codigo de propietario, finca y direccion.
4. Cargar dos veces mismo concepto/finca/persona y confirmar que aparece alerta.
5. Registrar pago agrupado marcando algunas deudas si y otras no.
6. Ver Caja y confirmar que cada movimiento muestra persona, codigo y direccion de finca.
7. Descargar recibo PDF y confirmar direccion de finca.
8. Ver Facturas y confirmar finca/direccion visible.

## Avance Implementado

### Resuelto En Esta Iteracion

1. Historiales de inquilinos/propietarios muestran codigo, finca y direccion.
2. Nueva deuda de inquilino muestra numero de inquilino, finca y direccion en el selector.
3. Conceptos de deuda de inquilino quedan separados de conceptos de propietario.
4. Nuevo debito propietario muestra numero de propietario, finca y direccion.
5. El check de caja se renombro y explica que solo genera salida si la inmobiliaria pago el gasto.
6. Debito propietario permite cargar `Periodo desde` y `Periodo hasta`.
7. Se agregan alertas de posible duplicado para deuda de inquilino y debito propietario.
8. En `Deudas`, la deuda de inquilino permite pagar, WhatsApp/recordatorio, correo, link, editar y borrar; el historial propietario permite anular debitos.
9. Historial cronologico explica que son los alquileres pendientes en rango.
10. Facturas muestran finca y direccion.
11. Pago agrupado permite tildar que deuda se paga y cual no.
12. Pago agrupado muestra numero de inquilino, finca y direccion.
13. Ayuda flotante se movio para no tapar el paginador.
14. Recibos/retiros PDF incluyen finca y direccion.
15. Movimientos de caja muestran numero de persona, finca y direccion.
16. Se agregaron botones de ingreso ANDA y Contaduria en `Pagos`.

### Pendiente / A Confirmar

1. Formato visual exacto de liquidacion tipo Tower.
2. Si los debitos de propietario tambien deben tener edicion directa ademas de anulacion y recarga.
3. Regla exacta contable para ingresos institucionales si ANDA/Contaduria requieren conciliacion especial aparte del metodo de pago.
