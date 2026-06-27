# Requerimientos Estefania - Pagos, Deudas, Dashboard Y ANDA/Contaduria - 2026-06-09

Documento creado el 2026-06-09 a partir de la nueva tanda de mensajes y capturas enviadas por Estefania.

## Fuentes

- `Screenshot from 2026-06-09 12-16-34.png`: dashboard, prioridad de cobranza, forma de mostrar finca/persona.
- `Screenshot from 2026-06-09 12-16-55.png`: ubicacion de resumenes de caja/deudas y columnas vencidas/proximas.
- `Screenshot from 2026-06-09 12-17-10.png`: reajustes en contratos, icono de caja, botones de dashboard y nuevos creditos.
- `Screenshot from 2026-06-09 12-17-40.png`: pago parcial que no queda claro en deudas, alerta de duplicado y periodo en pagos.
- `Screenshot from 2026-06-09 12-17-57.png`: eliminacion/replanteo de pago adelantado y uso de mes/ano segun contrato.
- `Screenshot from 2026-06-09 12-18-09.png`: reestructura total de `Pagos` y ejemplo visual Tower.
- `Screenshot from 2026-06-09 12-18-25.png`: pantalla Tower de deudas de inquilino.
- `Screenshot from 2026-06-09 12-18-33.png`: pantalla Tower de ingreso de pagos de inquilinos.
- `Screenshot from 2026-06-09 12-18-53.png`: flujo ANDA/Contaduria, comisiones, IVA, IRPF y conciliacion.

No se copian imagenes al repo por privacidad; se usan como referencia local.

## Lectura Corregida Foto Por Foto

Esta seccion corrige la lectura anterior: no agrupa por tema general, sino que respeta lo que Estefania escribio en cada captura.

| Captura | Texto/pedido de Estefania | Estado real en el sistema | Falta o decision |
| --- | --- | --- | --- |
| `12-16-34` | En prioridad de cobranza pregunta que significa `Parcial`. Pide que la finca se muestre como `Fin (numero de finca) - direccion completa`, sacando textos tipo barrio/apartamento suelto. Pide prefijos `Inq.` y `Prop.` delante de nombres. | Listo operativo. `Parcial` queda como `Pago parcial` y se reforzo el formato `Inq`, `Prop` y `Fin` en dashboard, pagos, deudas, caja, historiales y comprobantes principales. | Decision conservadora: mantener el texto completo aunque ocupe mas, porque evita abrir fichas para identificar. |
| `12-16-55` | Pide mover/resolver tarjetas del dashboard como `Caja neta` y `Deudas abiertas`. Propone que el dashboard tenga dos columnas: `Vencidas` y `Proximas a vencer`. | Listo. El dashboard queda orientado a accion diaria: `Vencidas`, `Proximas a vencer`, `Reajustes 30 dias` y `Pagos recientes`. Las entradas/salidas/saldo quedan en `Caja`. | Decision conservadora: no borrar informacion, sino ubicar lo financiero en `Caja` y dejar dashboard como alertas operativas. |
| `12-17-10` | Pide que `Reajustes proximos` sea un boton/filtro en `Contratos`. Pide icono de caja con signo de pesos. Pide sacar botones de carga de deudas del dashboard. Pide agregar `Nuevo credito propietario` y `Nuevo credito inquilino`. | Listo. Existe filtro `Reajustes proximos` en contratos, Caja usa icono de dinero, Deudas tiene botones de credito y se quito el acceso global `Nueva deuda` fuera de Deudas. | Decision conservadora: las deudas nacen desde `Deudas`; dashboard solo resume y alerta. |
| `12-17-40` | En `Pagos`, hizo pago parcial de 10.000 y en `Deudas` no entendia que mostraba el panel. Tambien cargo una UTE repetida y no salto alerta. En pago de Antonio, con dos UTE, no veia el periodo de cada una. | Listo. Deudas parciales se ven como `Pago parcial`, hay validacion de duplicados y en pagos se muestra periodo/vencimiento para distinguir conceptos repetidos. | Decision conservadora: el duplicado se bloquea y obliga a confirmar en lugar de crear silenciosamente otra deuda. |
| `12-17-57` | Pregunta si se puede sacar el apartado `Pago de alquileres adelantados`, porque el contrato ya deberia saber si el alquiler es adelantado o vencido. Pide que se seleccione solamente periodo/mes/ano. | Listo. Se saco el boton visible separado y el cobro de alquileres esperados queda integrado en `Pagos > Ingreso pago inquilino`. | Decision conservadora: no preguntar adelantado/vencido al cobrar; lo toma del contrato. |
| `12-18-09` | Pide reestructurar `Pagos`: boton `Ingreso pago inquilino`, buscador de inquilino, deudas con checks, cuotas de alquiler calculadas de proximos 12 meses y consumos/impuestos/gastos en la misma grilla. | Listo. `Ingreso pago inquilino` tiene buscador por Inq/nombre/cedula/celular/finca, checks, deudas abiertas y alquileres esperados virtuales. | Decision conservadora: los alquileres futuros se muestran virtuales y se crean como deuda real solo cuando se cobran. |
| `12-18-25` | Muestra pantalla Tower `Deudas del Inquilino` con columnas `Fecha`, `Descripcion`, `Mes`, `Pasa`, `Importe`, `Saldo`. | Listo. Esa grilla aparece en `Ingreso pago inquilino` y tambien en la ficha del inquilino como `Deudas del inquilino`. | Decision conservadora: no duplicar otro modulo; se ve en pago y en ficha. |
| `12-18-33` | Muestra pantalla Tower `Ingreso Pagos de Inquilinos`: nro recibo, fecha, inquilino, finca, propietario, reajuste, vencimiento, moneda, juicio, otras comisiones, creditos y botones de debitos. | Listo operativo. El modal tiene cabecera tipo Tower, checks de deuda, juicio, `Ing. debitos / Otras Com.` y bloque informativo de creditos/saldos a favor. | Decision conservadora: los creditos se muestran para control, pero no se descuentan solos de caja para evitar movimientos automaticos incorrectos. |
| `12-18-53` | Explica ANDA/Contaduria: el contrato define garantia; en Pagos debe existir ingreso ANDA/Contaduria que traiga contratos segun garantia, calcule comisiones, IVA, administracion, IRPF/exonerado y compare con liquidaciones externas. Pide automatizar liquidaciones por correo ANDA y portal Contaduria/SIGGA. | Parcial alto. Contratos ya tienen garantias, hay conciliacion ANDA/Contaduria, comisiones y comparacion por archivo importado. | Falta automatizacion real por correo/portal SIGGA y confirmar reglas fiscales exactas con liquidaciones reales. |

## Pendientes Reales Segun Estas Capturas

1. Automatizar ANDA por correo y Contaduria/SIGGA cuando tengamos credenciales, remitentes, ejemplos y formato estable.
2. Confirmar con liquidaciones reales las reglas finales de IVA/IRPF para ANDA y Contaduria.

## Validacion Foto Por Foto En La Web

1. `12-16-34`: entrar a `Dashboard` y confirmar que las deudas parciales dicen `Pago parcial`; revisar una fila y verificar formato `Inq ...` y `Fin ... - direccion`.
2. `12-16-55`: entrar a `Dashboard` y confirmar que las tarjetas son operativas (`Vencidas`, `Proximas a vencer`, `Reajustes 30 dias`, `Pagos recientes`) y que `Caja` concentra entradas/salidas/saldo.
3. `12-17-10`: entrar a `Contratos` y tocar `Reajustes proximos`; entrar a `Deudas` y confirmar botones `Nuevo credito inquilino` y `Nuevo credito propietario`; verificar que no hay boton global `Nueva deuda` arriba.
4. `12-17-40`: crear una UTE para un inquilino/finca/periodo, intentar repetirla y confirmar alerta; registrar pago parcial y verificar en `Deudas` que queda `Pago parcial` con saldo.
5. `12-17-57`: entrar a `Pagos`; confirmar que no aparece `Cobrar alquileres` como boton separado; usar `Ingreso pago` y tildar una fila `Alquiler esperado`.
6. `12-18-09`: en `Pagos`, buscar por nombre, numero, cedula, celular o finca; abrir `Ingreso pago` y confirmar grilla con checks para deudas y alquileres esperados.
7. `12-18-25`: abrir ficha de un inquilino desde `Inquilinos`; en `Deudas del inquilino` confirmar columnas `Fecha`, `Descripcion`, `Mes`, `Pasa/estado`, `Importe`, `Saldo`.
8. `12-18-33`: en `Pagos > Ingreso pago`, revisar cabecera tipo Tower y probar `Ing. debitos / Otras Com.` con un importe chico; confirmar que entra a caja y queda deuda pagada.
9. `12-18-53`: editar un contrato con garantia `ANDA` o `Contaduria`; ir a `Pagos > Conciliar ANDA/Contaduria`, elegir periodo y revisar comisiones, IVA, IRPF/exonerado, esperado, liquidado y diferencia.

## Principio De Diseno

La idea no debe ser copiar el sistema viejo pantalla por pantalla. La mejor solucion es tomar lo bueno del modelo Tower (datos completos, columnas claras, control de comisiones) y llevarlo a un flujo mas moderno:

- Una sola forma clara de cobrar a un inquilino.
- Una sola forma clara de cargar deudas/creditos.
- Menos botones duplicados.
- Mas contexto en cada fila: `Inq`, `Prop`, finca, direccion, periodo y saldo.
- Conciliacion automatica para ANDA/Contaduria en lugar de controles manuales uno por uno.

## Estado Implementado - 2026-06-09

Quedaron implementados los cambios de base para operar estos pedidos:

1. Dashboard operativo con columnas separadas de `Vencidas` y `Proximas a vencer`, sin mezclar caja neta como tarjeta principal.
2. Etiquetas mas claras para personas y fincas: `Inq`, `Prop` y `Fin` en listados principales.
3. Deudas parciales visibles como `Pago parcial`, con importe pagado y saldo pendiente.
4. Botones en `Deudas` para `Nuevo credito inquilino` y `Nuevo credito propietario`.
5. Validacion fuerte de duplicados en backend y frontend para deudas de inquilinos y debitos de propietarios.
6. Pagos con seleccion de deudas mediante checkbox y filas con periodo/vencimiento para distinguir conceptos repetidos.
7. `Pago adelantado` queda integrado dentro de `Ingreso pago inquilino`; el contrato define adelantado/vencido.
8. Contratos con catalogo ampliado de garantias: ANDA, Contaduria, aseguradora, LUC, fianza personal, otra o sin garantia.
9. Contratos con reglas de comision: comision por alquiler, comision por otros debitos e IVA sobre comision.
10. Liquidaciones con comision administrativa e IVA calculados segun reglas del contrato.
11. Pantalla de conciliacion ANDA/Contaduria que filtra contratos por garantia, calcula comision institucional, IVA cuando aplica, IRPF/exoneracion y diferencias contra importe liquidado.
12. Importador de liquidaciones externas ANDA/Contaduria desde CSV, TXT, PDF o XLSX simple, con comparacion automatica contra esperado, filas sin match y diferencias.
13. Filtro fuerte `Reajustes proximos` dentro de `Contratos`.
14. `Ingreso pago inquilino` reestructurado como flujo principal: buscador de inquilino, cabecera tipo Tower, deudas con checkbox, alquileres esperados virtuales, debitos/otras comisiones, creditos informativos, metodo, referencia, observaciones y confirmacion a caja.
15. En el ingreso de pago cada fila muestra fecha, descripcion, mes/ano, estado, importe y saldo a pagar.
16. Los alquileres esperados no se crean como deuda real hasta que el usuario los tilda y confirma el cobro.
17. Actualizacion 2026-06-16: contratos con `Fin contractual` y `Cobrar/generar hasta` separados para casos donde el contrato vencio formalmente pero sigue correspondiendo cobrar.
18. Actualizacion 2026-06-16: contratos `Vencido` muestran el mes anterior y vencimiento del mes actual; ejemplo `Mes/año 05/2026`, `Vence 10/06/2026`.
19. Actualizacion 2026-06-16: `Contratos` permite generar `Primer alquiler / cuota inicial` con periodo, importe manual y vencimiento; queda como deuda real `ALQUILER`.

Queda pendiente para cerrar la automatizacion total:

1. Automatizar lectura directa desde correo/portal cuando tengamos credenciales, remitentes y formatos reales estables.
2. Confirmar con liquidaciones reales si el IVA de ANDA siempre aplica y si Contaduria no lleva IVA sobre su 3%.
3. Definir si una diferencia institucional se corrige con ajuste automatico, nota manual o aprobacion previa. Por seguridad, hoy el sistema muestra diferencias y no mueve caja/deudas automaticamente.

## Convencion Visual Recomendada

Cada vez que aparezca una persona o finca en listados, tarjetas, pagos, deudas o caja:

- Inquilino: `Inq 101 - Lucia Fernandez`.
- Propietario: `Prop 015 - Mauro Martinez`.
- Finca: `Fin 001 - Av Brasil 2450 Apto 101`.
- Si es local: `Fin 001 - Av Brasil 2450 Local 2`.

Esto es mejor que mostrar solo barrio o tipo de unidad, porque permite identificar rapidamente a la persona y la finca sin abrir detalles.

## Requerimientos Extraidos Y Solucion Propuesta

| # | Pedido de Estefania | Problema real | Solucion recomendada | Prioridad |
| --- | --- | --- | --- | --- |
| 1 | Aclarar que significa `Parcial` en prioridad de cobranza. | El estado no se entiende sin contexto. | Cambiar etiqueta a `Pago parcial` y mostrar `pagado X / saldo Y`. | Alta |
| 2 | Mostrar finca con numero y direccion completa. | Hoy algunas tarjetas priorizan barrio/tipo de unidad. | Estandarizar `Fin XXX - direccion completa apto/local`. | Alta |
| 3 | Anteponer `Inq` o `Prop` en nombres. | No siempre se sabe si la persona es inquilino o propietario. | Aplicar prefijo en dashboard, deudas, pagos, caja, liquidaciones y busquedas. | Alta |
| 4 | Mover tarjetas como caja neta/deudas abiertas fuera del dashboard o explicarlas mejor. | Dashboard mezcla operacion diaria con contabilidad. | Dejar dashboard para alertas operativas y mover resumen financiero a `Caja`. Mantener `Deudas abiertas` como resumen de cobranza en `Deudas/Dashboard`. | Media |
| 5 | Reemplazar prioridad de cobranza por columnas `Vencidas` y `Proximas a vencer`. | La lista actual mezcla urgencias. | Crear dos columnas: vencidas y proximas 7/15/30 dias, incluyendo alquileres, consumos, tributos, OSE, UTE, gastos comunes, saneamiento. | Alta |
| 6 | `Reajustes proximos` podria estar en `Contratos`. | Es una accion propia del contrato, no necesariamente del dashboard. | Mantener alerta resumida en dashboard y agregar boton/filtro fuerte en `Contratos`: `Reajustes proximos`. | Media |
| 7 | Cambiar icono de Caja a signo de pesos. | Icono actual se confunde con liquidaciones. | Cambiar icono del menu Caja a `$` o moneda. | Baja |
| 8 | Quitar botones de carga de deudas del dashboard. | Las deudas deberian cargarse siempre desde `Deudas`. | Mover accesos de `Nueva deuda` definitivamente a `Deudas`; dashboard solo alerta/resume. | Media |
| 9 | Agregar `Nuevo credito propietario` y `Nuevo credito inquilino`. | No hay flujo claro para saldo a favor o ajustes positivos. | Agregar botones en `Deudas` y modelo de credito separado de deuda. | Alta |
| 10 | Pago parcial hecho en `Pagos` no se entiende en `Deudas`. | El estado parcial no queda visible con suficiente claridad. | En `Deudas` mostrar estado `Pago parcial`, monto original, pagado y saldo; titulo del panel debe explicar que muestra deudas abiertas y parciales. | Alta |
| 11 | Alerta de duplicado no salto en una deuda UTE repetida. | La validacion actual puede ser demasiado exacta o solo frontend. | Agregar validacion fuerte backend+frontend por persona, finca, concepto y periodo/rango; mostrar deuda existente antes de confirmar. | Alta |
| 12 | En pagos, si hay dos UTE, no se ve a que periodo corresponde. | Conceptos repetidos son indistinguibles. | En cada deuda seleccionable mostrar concepto, periodo mes/ano, vencimiento, finca, importe, saldo y descripcion. | Alta |
| 13 | Sacar/replantear `Pago adelantado`. | Si el contrato ya sabe si cobra adelantado o vencido, no deberia preguntarse aparte. | Integrarlo dentro de `Ingreso pago inquilino`: el sistema detecta si el contrato es adelantado/vencido y el usuario solo tilda el periodo a cobrar. | Alta |
| 14 | Reestructurar `Pagos` completo. | Hay demasiados caminos y algunos no explican que hacen. | Crear boton principal `Ingreso pago inquilino`: buscar inquilino, mostrar sus deudas y alquileres esperados con checkbox, elegir que paga y confirmar. | Alta |
| 15 | En ingreso de pago mostrar datos como el sistema Tower. | Falta una cabecera completa para confirmar que se esta cobrando a la persona correcta. | Cabecera de pago con recibo, fecha, Inq, finca, Prop, reajuste, vencimiento, moneda, juicio, metodo, referencia y observaciones. | Alta |
| 16 | Mostrar cuotas de alquiler proximas ya calculadas. | Quieren ver los meses a pagar aunque no se hayan creado manualmente. | Mejor que crear 12 deudas reales por adelantado: mostrar `alquileres esperados` virtuales y crear la deuda solo cuando se selecciona/cobra. | Alta |
| 17 | Mostrar porcentaje de comision al propietario y checks de comision. | Algunos propietarios tienen comision solo por alquiler y otros tambien por otros debitos/gastos administrativos. | Agregar reglas por propietario/contrato: `comision alquiler %`, `cobra comision alquiler`, `cobra comision otros debitos`, `IVA sobre comision`. | Alta |
| 18 | Comisiones generan IVA. | La liquidacion debe distinguir comision e IVA para control fiscal. | Calcular lineas separadas: comision administracion, IVA comision administracion, comision institucional si aplica. | Alta |
| 19 | Contratos deben tener garantia ANDA, Contaduria, aseguradoras, LUC, fianza personal o sin garantia. | ANDA/Contaduria no son solo metodo de pago; nacen del tipo de garantia del contrato. | Completar catalogo de garantias y usarlo para filtrar ingresos institucionales. | Alta |
| 20 | Boton `Ingreso ANDA` debe traer contratos con garantia ANDA. | No sirve como pago suelto si no filtra por garantia. | Convertirlo en conciliacion ANDA: listar contratos ANDA, importes esperados, comision ANDA 2%, IVA de esa comision si corresponde, administracion, IVA administracion, IRPF/exonerado. | Alta |
| 21 | Boton `Ingreso Contaduria` debe traer contratos con garantia Contaduria. | Misma logica que ANDA pero con reglas distintas. | Conciliacion Contaduria: contratos CGN/Contaduria, comision 3%, sin IVA sobre comision Contaduria, administracion, IVA administracion, IRPF/exonerado. | Alta |
| 22 | Controlar retencion IRPF y exonerados. | ANDA/Contaduria pueden retener dinero que no entra, pero igual debe controlarse. | Mostrar columna `IRPF retenido` o `Exonerado`; descontar/controlar en liquidacion segun propietario. | Alta |
| 23 | Comparar contra liquidaciones externas de ANDA/Contaduria. | El control manual consume tiempo y genera errores. | Importar liquidacion ANDA desde correo y Contaduria/SIGGA desde archivo/portal; comparar contra esperado y mostrar diferencias. | Alta |
| 24 | Mostrar diferencias automaticamente. | La inmobiliaria necesita saber que ajustar. | Panel `Diferencias`: contrato, inquilino, esperado, liquidado, diferencia, motivo y accion para ajustar. | Alta |

## Soluciones Donde Conviene Mejorar Lo Pedido

### 1. No Crear 12 Deudas Reales De Alquiler Por Adelantado

Estefania pide que figuren las cuotas ya calculadas de los proximos 12 meses. Es entendible, pero crear 12 deudas reales apenas se firma el contrato puede ensuciar historiales, duplicar vencimientos y complicar anulaciones.

Mejor solucion:

1. El sistema muestra una grilla de `alquileres esperados`.
2. Esos meses salen del contrato, importe, fecha de inicio, cobro adelantado/vencido y reajustes.
3. Cuando se selecciona un mes para cobrar, recien ahi se crea la deuda real si no existia.

Ventaja:

- Se ve todo lo que se puede cobrar.
- No se llena la base con deudas futuras innecesarias.
- Se reducen duplicados y errores.

### 2. No Mantener `Pago Adelantado` Como Flujo Separado

Si el contrato ya define si el alquiler es adelantado o vencido, el usuario no deberia decidirlo en cada pago.

Mejor solucion:

- Integrar `Pago adelantado` dentro de `Ingreso pago inquilino`.
- El usuario elige inquilino y tilda el mes/ano en la grilla.
- El sistema calcula si corresponde mes actual, anterior o siguiente segun el contrato.

### 3. ANDA/Contaduria No Deben Ser Solo Metodo De Pago

Hoy pueden funcionar como metodo de pago, pero lo que Estefania esta pidiendo es mas grande: una conciliacion institucional.

Mejor solucion:

- Mantener `ANDA` y `Contaduria` como metodo visible en pagos individuales.
- Agregar flujo institucional:
  - `Ingreso ANDA`.
  - `Ingreso Contaduria`.
  - Traen contratos por garantia.
  - Calculan comisiones, IVA, IRPF y diferencias contra la liquidacion externa.

## Diseno Propuesto Por Modulo

### Dashboard

Objetivo: que sea un resumen de accion diaria, no una pantalla contable completa.

Debe mostrar:

1. `Vencidas`: deudas vencidas con saldo abierto, incluyendo alquileres, UTE, OSE, gastos comunes, tributos y saneamiento.
2. `Proximas a vencer`: proximos vencimientos en 7/15/30 dias.
3. `Reajustes proximos`: resumen pequeno con link a `Contratos`.
4. `Pagos recientes`: ultimos pagos con metodo y recibo.

Debe evitar:

- Botones para cargar deudas.
- Tarjetas financieras sin explicacion como `Caja neta`, si no estan dentro de `Caja`.

### Deudas

Objetivo: todo lo que aumenta o disminuye saldo debe nacer o consultarse aca.

Botones principales:

1. `Nueva deuda inquilino`.
2. `Nueva deuda propietario`.
3. `Nuevo credito inquilino`.
4. `Nuevo credito propietario`.
5. `Historial inquilinos`.
6. `Historial propietarios`.
7. `Historial cronologico`.

Reglas:

- Cada deuda debe mostrar persona, finca, direccion, concepto, periodo, importe, pagado y saldo.
- Las deudas parciales no desaparecen; quedan como `Pago parcial`.
- Si se carga una deuda parecida, se muestra alerta con la deuda existente.

### Pagos

Objetivo: un unico flujo para cobrar al inquilino sin confundirse.

Botones recomendados:

1. `Ingreso pago inquilino`.
2. `Ingreso ANDA`.
3. `Ingreso Contaduria`.

Flujo `Ingreso pago inquilino`:

1. Buscar inquilino por numero, nombre, cedula, celular o finca.
2. Mostrar cabecera:
   - Nro recibo.
   - Fecha.
   - Inq y nombre.
   - Finca y direccion.
   - Propietario.
   - Reajuste.
   - Vencimiento.
   - Moneda.
   - Juicio si aplica.
3. Mostrar deudas abiertas con checkbox:
   - Alquileres vencidos.
   - Alquileres esperados segun contrato.
   - UTE.
   - OSE.
   - Gastos comunes.
   - Tributos.
   - Saneamiento.
   - Otros.
4. Cada fila debe mostrar:
   - Fecha.
   - Descripcion.
   - Mes/ano.
   - Pasa/estado.
   - Importe.
   - Saldo.
5. El usuario tilda que paga y confirma.

### Caja

Objetivo: entender plata real que entro y salio.

Debe mostrar:

- Entradas reales.
- Salidas reales.
- Caja neta = entradas confirmadas menos salidas confirmadas del periodo.
- Filtros por fecha, persona, finca, origen y metodo.

No conviene poner aca `Deudas abiertas` como concepto principal, porque deuda abierta no es plata en caja. Puede haber un enlace/resumen, pero la gestion principal debe quedar en `Deudas`.

### Contratos

Objetivo: que el contrato sea la fuente de verdad de reglas.

Debe manejar:

- Tipo de garantia: ANDA, Contaduria, aseguradora privada, LUC, fianza personal, sin garantia.
- Cobro de alquiler: adelantado o vencido.
- Comision de administracion por alquiler.
- Si cobra comision por otros debitos/gastos.
- IRPF aplica o exonerado por propietario.
- Reajustes proximos como filtro/boton dentro de contratos.

### ANDA / Contaduria

Objetivo: conciliar ingresos institucionales.

Ingreso ANDA debe:

1. Listar contratos con garantia ANDA.
2. Mostrar alquiler esperado por contrato.
3. Calcular comision ANDA 2%.
4. Calcular IVA sobre comision ANDA si corresponde segun liquidacion real.
5. Calcular comision administracion propia.
6. Calcular IVA sobre comision administracion.
7. Mostrar IRPF retenido o exonerado.
8. Comparar contra liquidacion recibida por correo.
9. Mostrar diferencias y permitir ajustar.

Ingreso Contaduria debe:

1. Listar contratos con garantia Contaduria.
2. Calcular comision Contaduria 3%.
3. No calcular IVA sobre comision Contaduria si esa es la regla confirmada.
4. Mantener comision administracion e IVA administracion.
5. Mostrar IRPF retenido/exonerado.
6. Importar o cargar archivo de SIGGA.
7. Comparar y mostrar diferencias.

## Plan De Implementacion

### Fase 1 - Etiquetas, dashboard y navegacion

1. Crear helper unico para mostrar `Inq`, `Prop` y `Fin`.
2. Aplicarlo en dashboard, deudas, pagos, caja, facturas y liquidaciones.
3. Cambiar prioridad de cobranza a dos columnas: `Vencidas` y `Proximas a vencer`.
4. Mover botones de deudas fuera del dashboard.
5. Agregar boton/filtro `Reajustes proximos` en `Contratos`.
6. Cambiar icono de `Caja` a signo de pesos.

Pruebas:

- Ver dashboard y confirmar dos columnas.
- Confirmar que finca aparece como `Fin XXX - direccion`.
- Confirmar que deudas se cargan desde `Deudas`, no desde dashboard.

### Fase 2 - Deudas y creditos

1. Agregar `Nuevo credito inquilino`.
2. Agregar `Nuevo credito propietario`.
3. Mostrar en deudas estado parcial con pagado/saldo.
4. Mejorar titulo/ayuda del panel de deudas abiertas.
5. Fortalecer validacion de duplicados en frontend y backend.
6. En cada deuda mostrar periodo, vencimiento y descripcion.

Pruebas:

- Cargar credito de inquilino y verlo como saldo a favor.
- Cargar credito de propietario y verlo en liquidacion/cuenta corriente.
- Repetir UTE misma persona/finca/periodo y verificar alerta.
- Registrar pago parcial y confirmar que sigue visible en deudas con saldo.

### Fase 3 - Pagos V2

1. Reemplazar estructura actual por `Ingreso pago inquilino`.
2. Buscador unico de inquilino.
3. Cabecera completa tipo Tower pero con UI moderna.
4. Grilla de deudas con checkbox.
5. Agregar alquileres esperados virtuales.
6. Integrar `Pago adelantado` dentro de `Ingreso pago inquilino`.
7. Mostrar siempre mes/ano y vencimiento cuando hay conceptos repetidos.

Estado 2026-06-09:

- Implementado.
- `Ingreso pago inquilino` queda como camino principal de cobro.
- `Pago sin imputar` queda como caso secundario para dinero recibido sin deuda definida.
- El boton separado `Cobrar alquileres` deja de mostrarse en `Pagos`; el flujo principal crea/cobra alquiler esperado al confirmar.

Pruebas:

- Inquilino con dos UTE: verificar periodo distinto en cada fila.
- Seleccionar solo una deuda y pagar parcial.
- Cobrar alquiler segun contrato adelantado/vencido indicando solo mes/ano.
- Descargar recibo y confirmar datos completos.

### Fase 4 - Comisiones, IVA y reglas de propietario

1. Agregar campos de reglas de comision por propietario/contrato.
2. Distinguir comision por alquiler y comision por otros debitos.
3. Calcular IVA de comision administracion.
4. Reflejar lineas separadas en liquidacion.
5. Agregar reporte de comisiones/IVA actualizado con estas reglas.

Pruebas:

- Propietario con comision solo alquiler.
- Propietario con comision alquiler + otros debitos.
- Ver liquidacion con comision e IVA separados.

### Fase 5 - ANDA / Contaduria institucional

1. Completar catalogo de garantias.
2. Convertir `Ingreso ANDA` en pantalla de conciliacion.
3. Convertir `Ingreso Contaduria` en pantalla de conciliacion.
4. Calcular columnas institucionales: comision, IVA si aplica, administracion, IVA administracion, IRPF/exonerado.
5. Importar liquidacion ANDA desde correo.
6. Permitir cargar/importar liquidacion Contaduria/SIGGA.
7. Comparar esperado vs liquidado.
8. Mostrar diferencias y permitir ajustes controlados.

Estado 2026-06-09:

- Implementado hasta comparacion automatica por archivo.
- Los ajustes quedan controlados/manuales hasta validar liquidaciones reales para no tocar caja por error.

Pruebas:

- Contratos ANDA aparecen solo en `Ingreso ANDA`.
- Contratos Contaduria aparecen solo en `Ingreso Contaduria`.
- Propietario exonerado muestra `Exonerado`.
- Diferencia entre esperado y liquidado aparece en panel de diferencias.
- Subir CSV/TXT/PDF/XLSX de liquidacion y verificar resumen: filas detectadas, matcheadas, diferencias, sin importe y no matcheadas.

### Fase 6 - Documentacion y validacion con inmobiliaria

1. Actualizar ayuda interna con los nuevos flujos.
2. Crear juego de datos de prueba con:
   - Inquilino con alquiler, UTE repetido, OSE y gastos comunes.
   - Propietario con comision solo alquiler.
   - Propietario con comision alquiler + otros debitos.
   - Contrato ANDA.
   - Contrato Contaduria.
3. Preparar pasos de validacion para Estefania.
4. Validar con liquidaciones reales de ANDA/Contaduria antes de cerrar al 100%.

## Preguntas A Confirmar Antes De Implementar Fase 5

1. ANDA: confirmar si el IVA sobre la comision ANDA siempre aplica o depende de como venga la liquidacion.
2. Contaduria: confirmar que la comision 3% no lleva IVA.
3. SIGGA: confirmar formato de descarga disponible: PDF, Excel, CSV o solo portal.
4. ANDA por correo: confirmar remitente/asunto y si adjunta PDF/Excel.
5. Comision por otros debitos: confirmar si aplica a todos los conceptos o solo a algunos.
6. IRPF: confirmar si la exoneracion se define solo por propietario o puede variar por finca/contrato.

## Criterio De Cierre

Se considera terminado cuando:

1. Estefania pueda cobrar un inquilino desde un unico flujo, viendo todas las deudas y periodos.
2. Un pago parcial quede visible en `Deudas` como parcial, con saldo claro.
3. Las cargas duplicadas avisen antes de guardar.
4. Dashboard muestre vencidas/proximas y no mezcle caja con carga de deudas.
5. Caja explique entradas, salidas y caja neta.
6. ANDA y Contaduria funcionen como conciliaciones institucionales, no solo como metodo de pago.
7. Liquidaciones reflejen comision, IVA, IRPF/exonerado y diferencias contra liquidaciones externas.
