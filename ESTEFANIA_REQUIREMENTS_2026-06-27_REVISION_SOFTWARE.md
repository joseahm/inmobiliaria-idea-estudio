# Requerimientos Estefania - Revision Software - 2026-06-27

## Fuente

- Documento revisado: `revision/SOFTWARE .docx`
- Referencia visual: capturas incluidas dentro del documento, tomadas del sistema Tower y de la version actual del sistema.

## Objetivo

Agregar accesos claros, reportes filtrables y controles operativos para que la inmobiliaria pueda validar cobranzas, deudores, saldos de propietarios, facturacion/comision e IVA, contratos vigentes/vencidos y retiros sin depender de busquedas manuales o planillas externas.

## Requerimientos Extraidos

| Punto | Pedido | Decision aplicada |
| --- | --- | --- |
| 1 | Ver, imprimir y enviar recibos de pagos de inquilinos. | Mantener PDF existente y reforzar accesos desde pagos/ficha; agregar reportes de cobranza para ubicar el pago. |
| 2 | Descargar comprobantes de retiros de propietarios y mostrar saldo final si queda deudor o acreedor. | Mantener PDF de retiro y mostrar saldo final antes/despues en liquidaciones. |
| 3 | En `Inquilinos`, boton `Cobranza realizada` con filtro por fecha o inquilino y comision generada. | Agregar vista/reportes de cobranzas con fecha, inquilino, finca, concepto, importe, comision e IVA. |
| 4 | En `Caja`, boton `Comision e IVA generados` filtrable por fechas. | Agregar vista filtrable en Caja, ademas del PDF ya existente. |
| 5 | En `Inquilinos`, boton `Inquilinos deudores` filtrable por fecha. | Agregar vista de deudores con fecha, inquilino, finca, concepto, importe y saldo. |
| 6 | Consultar inquilinos deudores por propietario antes de transferir. | Agregar vista `Deudores por propietario`. |
| 7 | En `Propietarios`, boton `Saldos de propietarios` hasta la fecha. | Agregar vista de saldos usando liquidaciones y retiros registrados. |
| 8 | En `Caja`, boton `Historial de facturacion` por fecha y propietario. | Agregar vista con fecha, propietario, concepto, comision, IVA y total facturado. |
| 9 | En `Contratos`, ver contratos vigentes discriminados por garantia. | Agregar resumen por garantia y filtro dedicado en contratos. |
| 10 | En `Contratos`, ver contratos vencidos como historico. | Usar estado activo/inactivo y agregar vista separada para vencidos/inactivos. |
| 11 | Al marcar contrato vencido, no debe reajustar, liquidar ni facturar. | Conservar `Activo` como control operativo: inactivo no se incluye en calculos automáticos. Agregar aviso visual. |
| 12 | Asociar deudas a mismo padron matriz y fraccionar por unidades. | Agregar soporte operativo por padron compartido: vista de propiedades por padron y ayuda para cargar/repartir por unidades. |
| 13 | Ordenar vistas de deudas, inquilinos, propietarios y contratos con botones, no datos sueltos. | Agregar sub-vistas/tabs y filtros mas claros, sin eliminar datos utiles. |
| 14 | Redireccionar a sitios de tributos, saneamiento, contribucion, UTE/OSE y cargar facturas. | Mantener cuentas/URLs por servicio y reforzar ayuda/accesos. La descarga automatica completa depende de cada portal/captcha. |
| 15 | En propiedades, mostrar nro de finca y ordenar por numeracion/calle/barrio. | Ya hay referencia/finca y busqueda; agregar orden visual por codigo, referencia y direccion. |
| 16 | Visualizar pagos realizados a propietarios y permitir anularlos. | Usar movimientos de caja origen `owner_settlement`; agregar filtro claro y descarga de comprobante. |
| 17 | Explicar que descarga `DGI IRPF`. | Documentar y mejorar etiqueta/ayuda: exporta CSV de ingresos gravados e IRPF retenido para apoyo a declaracion. |
| 18 | Corregir dato superpuesto en pantalla. | Revisar tablas anchas y usar scroll/contenedores para evitar superposicion. |
| 19 | En propietarios, boton `Alquileres cobrados por cedula`, filtrado por fecha, con porcentaje, importes e IRPF por periodo. | Agregar reporte por cedula/documento de propietario, calculado por pagos, porcentaje de finca e IRPF. |

## Como Se Valida

1. Entrar a `Inquilinos` y revisar los botones `Cobranza realizada`, `Inquilinos deudores` y `Deudores por propietario`.
2. Entrar a `Caja` y revisar `Comision e IVA generados`, `Historial de facturacion` y movimientos de retiros a propietario.
3. Entrar a `Propietarios` y revisar `Saldos de propietarios` y `Alquileres cobrados por cedula`.
4. Entrar a `Contratos` y revisar `Vigentes por garantia` y `Vencidos/historico`.
5. Descargar recibos, liquidaciones, retiros, DGI IRPF, comision/IVA y deudores para validar formato y datos.

## Notas De Implementacion

- La solucion prioriza trazabilidad: no borra pagos/liquidaciones; registra anulaciones o movimientos inversos cuando corresponda.
- `Activo/Inactivo` es el control operativo de contrato vigente/vencido. Un contrato inactivo queda historico y fuera de procesos automaticos.
- La descarga automatica desde portales publicos con captcha o verificacion anti-robot no se fuerza; se dejan URLs y referencias para descarga asistida.
- Los reportes nuevos se basan en pagos confirmados, liquidaciones, movimientos de caja y porcentajes de propietarios ya registrados.
