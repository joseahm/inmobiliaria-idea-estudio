# Requerimientos Estefania - Deudas, Facturas Y Copropietarios - 2026-06-16

## Objetivo

Ajustar el flujo de carga de deudas para que sea mas claro para la operativa diaria: una deuda de inquilino siempre queda a cargo del inquilino, `Liquidacion` solo se pide cuando realmente aplica, y los gastos de una finca con varios propietarios se reparten automaticamente por porcentaje.

## Requerimientos Recibidos

| Punto | Pedido | Estado | Decision aplicada |
| --- | --- | --- | --- |
| 1 | En `Nueva deuda inquilino`, sacar el selector `Responsable` porque siempre corresponde al inquilino. | Hecho | La deuda se guarda siempre con responsable `tenant` y la pantalla muestra una aclaracion operativa. |
| 2 | En deudas de inquilino, `Liquidacion` confunde cuando se cargan tributos/impuestos. | Hecho | `Liquidacion` solo aparece para `GASTOS_COMUNES`. |
| 3 | Para UTE/OSE/tributos/saneamiento, usar una logica mas simple de periodo y consumo. | Hecho | Se mantienen `Mes/año deuda`, `Devengado` y `Consumo desde/hasta`; si no es gasto comun, la liquidacion se iguala automaticamente al devengado. |
| 4 | Si una finca tiene varios propietarios, al cargar un debito propietario debe repartirse entre todos por porcentaje. | Hecho | Si se marca `Repartir entre propietarios segun porcentaje`, se crean debitos separados para cada copropietario. |
| 5 | Poder ver antes como se reparte el gasto. | Hecho | El formulario muestra una vista previa con propietario, porcentaje e importe calculado. |
| 6 | Confirmar si se pueden cargar facturas que no sean UTE. | Hecho/parcial | Se pueden adjuntar UTE, OSE, saneamiento, tributos u otros; UTE/OSE tienen deteccion mas especifica y siempre se recomienda revisar los datos antes de guardar. |

## Como Probar

### Nueva deuda de inquilino sin responsable

1. Entrar a `Deudas`.
2. Tocar `Nueva deuda inquilino`.
3. Elegir un contrato.
4. Elegir un concepto como `TRIBUTOS`, `UTE`, `OSE` o `SANEAMIENTO`.
5. Confirmar que no aparece el selector `Responsable`.
6. Completar monto, vencimiento y periodo.
7. Guardar.
8. Verificar en `Historial inquilinos` que la deuda quedo para el inquilino del contrato.

### Liquidacion solo en gastos comunes

1. Entrar a `Deudas > Nueva deuda inquilino`.
2. Elegir `TRIBUTOS`.
3. Confirmar que no aparece el campo `Liquidacion`.
4. Cambiar el concepto a `GASTOS_COMUNES`.
5. Confirmar que ahora aparece `Liquidacion`.
6. Guardar una prueba si corresponde.

### Reparto de debito entre copropietarios

1. Entrar a `Propiedades`.
2. Editar o revisar una finca con mas de un propietario.
3. Confirmar que los porcentajes suman 100%.
4. Entrar a `Deudas`.
5. Tocar `Nueva deuda propietario`.
6. Elegir uno de los propietarios y la finca compartida.
7. Completar concepto, monto y periodo.
8. Marcar `Repartir entre propietarios segun porcentaje`.
9. Revisar la vista previa: debe listar todos los propietarios de esa finca y el importe de cada uno.
10. Guardar.
11. Entrar a `Historial propietarios`.
12. Buscar la finca o concepto y confirmar que aparece un debito separado para cada propietario.

### Facturas de otros proveedores

1. Entrar a `Facturas` o a `Deudas > Nueva deuda inquilino`.
2. Tocar `Adjuntar factura`.
3. Subir PDF o foto de UTE, OSE, saneamiento, tributos u otro servicio.
4. Revisar proveedor, cuenta, importe, vencimiento y periodo detectado.
5. Si algo no queda correcto, corregirlo manualmente antes de guardar.
6. Guardar como deuda de inquilino o como debito de propietario segun corresponda.

## Notas Operativas

- `Liquidacion` queda separado solo para gastos comunes porque puede venir de administraciones con un mes de liquidacion distinto al consumo/devengado.
- Para impuestos y consumos, si no se muestra `Liquidacion`, el sistema guarda internamente el mismo periodo que `Devengado`.
- Si la finca no tiene copropietarios cargados, el reparto usa el propietario seleccionado al 100%.
- Si la inmobiliaria marca `La inmobiliaria pago este gasto`, el debito propietario genera salida real de caja.
- Si no se marca, queda solo como descuento para la liquidacion del propietario.
