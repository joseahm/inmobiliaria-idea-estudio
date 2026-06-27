# Requerimientos Estefania - Contratos Y Primeros Alquileres - 2026-06-16

## Objetivo

Separar correctamente las fechas legales/contractuales de las fechas operativas de cobro, y permitir cargar una primera cuota de alquiler manual o prorrateada al momento de ingresar un contrato.

## Requerimientos Recibidos

| Punto | Pedido | Estado | Decision aplicada |
| --- | --- | --- | --- |
| 1 | Si un contrato vencio contractualmente pero sigue habilitado para cobrar, no perder la fecha real del contrato. | Hecho | Se separo `Fin contractual` de `Cobrar/generar hasta`. |
| 2 | En contratos de local comercial puede existir plazo contractual inicial y permanencia/cobro posterior. | Hecho | `Fin contractual` guarda el vencimiento firmado; `Cobrar/generar hasta` define hasta cuando el sistema muestra/genera alquileres. |
| 3 | En contratos a mes vencido, el pago de junio debe corresponder al mes 05/2026 y vencer 10/06/2026. | Hecho | En `Pagos > Ingreso pago`, contratos `Vencido` muestran mes anterior y vencimiento del mes actual. |
| 4 | Al ingresar contrato, permitir cargar un primer pago/cuota inicial si existe. | Hecho | Se agrego `Generar primer alquiler / cuota inicial` en contrato. |
| 5 | El primer pago debe indicar mes/año, importe manual y fecha. | Hecho | El formulario pide `Mes/año que corresponde`, `Importe primer alquiler` y `Fecha de vencimiento`. |
| 6 | Si es mes adelantado, esa primera cuota queda para pagar enseguida. | Hecho | El sistema sugiere como vencimiento la fecha de inicio/cobro. |
| 7 | Si es mes vencido, se debe dar tiempo hasta el 10 del mes siguiente. | Hecho | El sistema sugiere vencimiento el dia 10 del mes siguiente. |
| 8 | Usar la misma logica de alquileres normales: IRPF, comision, IVA, etc. | Hecho | La primera cuota se crea como deuda real `ALQUILER`; entra luego al flujo normal de pagos, caja y liquidaciones. |

## Como Probar

### Contrato con fecha contractual vencida pero cobro vigente

1. Entrar a `Contratos`.
2. Editar un contrato.
3. Poner `Fin contractual`, por ejemplo `28/02/2026`.
4. Poner `Cobrar/generar hasta`, por ejemplo `28/02/2029`.
5. Guardar.
6. Entrar a `Pagos`.
7. Buscar el inquilino.
8. Entrar a `Ingreso pago`.
9. Confirmar que aparecen alquileres esperados posteriores a la fecha contractual, hasta la fecha operativa.

### Contrato a mes vencido

1. Entrar a `Contratos`.
2. Editar el contrato.
3. En `Momento alquiler`, elegir `Vencido`.
4. Guardar.
5. Entrar a `Pagos > Ingreso pago`.
6. Confirmar que una cuota cobrada en junio muestra `Mes/año 05/2026` y `Vence 10/06/2026`.

### Primer alquiler / cuota inicial

1. Entrar a `Contratos`.
2. Crear o editar un contrato.
3. Marcar `Generar primer alquiler / cuota inicial`.
4. Completar `Mes/año que corresponde`.
5. Completar `Importe primer alquiler`.
6. Completar o revisar `Fecha de vencimiento`.
7. Guardar.
8. Entrar a `Deudas`.
9. Buscar el inquilino o concepto `ALQUILER`.
10. Confirmar que aparece una deuda con descripcion `Primer alquiler / cuota inicial`.

## Notas Operativas

- Si ya existe una deuda `ALQUILER` para el mismo contrato y periodo, el sistema no duplica la deuda.
- El campo `Cobrar/generar hasta` no reemplaza el vencimiento contractual; solo controla la generacion/cobro operativo.
- La primera cuota queda como deuda de alquiler normal, por eso se liquida con las mismas reglas de comision, IVA e IRPF que el resto de los alquileres.
