# Plan De Requerimientos Estefania

Este documento consolida lo extraido de las capturas de `/home/jose/Pictures` y lo cruza contra lo que ya tiene el sistema.

## Fuentes Revisadas

- `Screenshot from 2026-06-02 18-45-10.png`: lista inicial de pendientes.
- `Screenshot from 2026-06-02 18-45-39.png`: rutas para facturas/tributos y comentario sobre debitos a propietarios.
- `Screenshot from 2026-06-02 18-46-00.png`: debitos propietario vs inquilino y liquidacion esperada.
- `Screenshot from 2026-06-02 18-46-28.png`: contratos CEDE, resguardos, notificaciones y campos de propiedad.
- `Screenshot from 2026-06-02 18-46-59.png`: comision del contrato y generacion de alquiler.
- `Screenshot from 2026-06-02 18-47-35.png`: modelo de reporte `Inquilinos Deudores`.
- `Screenshot from 2026-06-02 18-48-13.png` y `18-48-54.png`: regla de mes para reajustes y reporte de comision/IVA.
- `Screenshot from 2026-06-02 18-49-09.png` y `18-49-31.png`: modelos de liquidacion de propietario y problema OCR OSE.
- `Screenshot from 2026-06-02 18-50-00.png`, `18-50-58.png`, `18-51-18.png`: caja, neteo, prorrateos y recibos.
- `Screenshot from 2026-06-02 18-51-39.png`: modelo de recibo de alquiler.
- `Screenshot from 2026-06-07 18-22-52.png`: botones grandes en Deudas, historiales por inquilino/propietario, historial cronologico y facturas por correo.
- `Screenshot from 2026-06-07 18-24-05.png`: regla operativa de prorrateo por dias y pedido de visualizar/descargar recibos.
- `Screenshot from 2026-06-09 12-16-34.png` a `12-18-53.png`: nueva tanda sobre dashboard, pagos, deudas, creditos, comisiones, ANDA/Contaduria y conciliacion institucional.

No se copiaron las imagenes al repo por privacidad; se usan como referencia local.

## Requerimientos Extraidos

### 1. Rutas externas para facturas e impuestos

Estefania pide tener a mano rutas para consultar/descargar:

- Tributos domiciliarios: `https://www.montevideo.gub.uy/fwtc/pages/tributosDomiciliarios.xhtml`
- Saneamiento: `https://www.montevideo.gub.uy/fwtc/pages/saneamiento.xhtml`
- UTE: `https://www.ute.com.uy/imprima-su-factura`
- OSE: `https://facturas.ose.com.uy/SGCv10WebClient/inicio.faces`
- Primaria: `https://dgi-anep.organismos.uy/paso2?1`
- Contribucion: `https://www.montevideo.gub.uy/fwtc/pages/contribucion.xhtml`

Estado actual: parcial. Tenemos cuentas de servicio por finca y deteccion de facturas, pero no una agenda clara de enlaces por proveedor/cuenta.

### 2. Finca/propiedad con direccion estructurada

Pide que una finca tenga campos separados para:

- Direccion completa/calle.
- Numero de puerta.
- Numero de apartamento, unidad o local.
- Padron/referencia.

Estado actual: parcial. Hoy hay `reference`, `address` y `padron`, pero no campos separados para puerta/apto/local.

### 3. Debitos a propietarios asociados a finca, no a contrato

Pide que al cargar un debito de propietario se relacione con la finca y que sea facil buscarla, especialmente si un propietario tiene muchas propiedades.

Estado actual: parcial. Ya se cargan debitos a propietario con finca, pero el selector debe mejorar con busqueda/filtro por propietario y mejor visualizacion.

Conceptos faltantes o a reforzar:

- Fondo reserva.
- Primaria.
- Contribucion inmobiliaria.

Estado actual: parcial. `Primaria` y `Contribucion` existen; falta `Fondo reserva` como concepto directo.

### 4. Deudas de inquilinos con impacto opcional en propietario

Pide que cuando se carga una deuda a un inquilino tambien se pueda indicar si se asigna al propietario, porque a veces la inmobiliaria paga o cubre consumos/facturas y luego debe descontarlo en la liquidacion del propietario.

Estado actual: parcial. Desde facturas se puede convertir a deuda de inquilino o debito de propietario, pero falta una opcion clara en deuda manual de inquilino para generar/relacionar el debito de propietario.

### 5. Liquidacion de propietario con formato mas contable

Modelo enviado incluye:

- Propietario, moneda, fecha.
- Saldo anterior.
- Bloques por inquilino/finca.
- Columnas tipo `Debe` y `Haber`.
- Alquiler como credito/haber.
- IRPF, comision e IVA como debitos/debe.
- Seccion `Creditos`.
- Seccion `Debitos`.
- Seccion `Retiros`.
- Saldo final.

Estado actual: parcial. Ya generamos liquidaciones, lineas y PDF, pero el formato no esta alineado del todo al modelo que usan.

### 6. Reporte de inquilinos deudores

Modelo enviado `Inquilinos Deudores` con columnas:

- Direccion.
- Nro.
- Apt.
- Nro debito.
- Fecha.
- Descripcion.
- Mes/Año.
- Saldo.
- Totales por inquilino.

Estado actual: falta como reporte PDF especifico. Tenemos listado de deudas y CSV, pero no ese reporte agrupado en PDF.

### 7. Reporte de comision e IVA generados

Modelo enviado `Comision e I.V.A. generados` con columnas:

- Fecha.
- Comision.
- Imp. Com.
- IVA.
- Total.

Estado actual: parcial. Tenemos exportes contables CSV y liquidaciones, pero falta reporte visual/PDF con ese formato.

### 8. Reajustes segun mes de cobro

Regla indicada:

- Si el alquiler se cobra a mes vencido y reajusta el `01/06/2026`, se usa el porcentaje del mes anterior: mayo.
- Si el alquiler se cobra adelantado y reajusta el `01/06/2026`, se usa junio.

Estado actual: parcial. Ya consultamos Caja Notarial para regimen legal, pero hoy se toma el mes de la fecha elegida. Falta aplicar la regla segun `rent_payment_timing` y mostrar claramente el mes usado.

### 9. Contratos CEDE / agentes de retencion / resguardos

Pide una logica especial para inquilinos tipo CEDE:

- Son empresas grandes/agentes de retencion.
- Pagan alquiler y retienen IRPF.
- Deben mandar resguardos de IRPF.
- Se ingresa el alquiler completo para calcular comision e IVA.
- Se descuenta a propietarios el importe retenido por resguardos.
- En esos contratos se deberia poder poner retencion IRPF 0% o manejarla como resguardo/debito.
- Control mensual de resguardos ANDA y CGN/Contaduria.

Estado actual: falta como flujo especifico. Tenemos IRPF por contrato/propietario y exoneraciones, pero no tipos CEDE ni seguimiento mensual de resguardos.

### 10. Notificaciones de deudas

Pide que al cargar deudas a inquilinos existan checks:

- Notificar al inquilino.
- Notificar siempre.

Estado actual: parcial. Tenemos recordatorios y enlaces de pago, pero falta guardar la preferencia por deuda/contrato y automatizar el criterio.

### 11. Generacion automatica de deuda de alquiler

Consulta si al ingresar contrato debe cargar manualmente el alquiler. Se espera que exista boton/proceso para generar alquileres automaticamente.

Estado actual: parcial. Existe generacion mensual de alquileres, pero conviene hacerla mas visible, explicita y con feedback por contrato/periodo.

### 12. OCR y carga rapida de facturas OSE

Problema observado:

- En OSE la confianza fue 70%.
- La cuenta detectada no coincide.
- El monto no se reconoce bien.
- UTE funciona mejor porque fue la factura usada para entrenar/desarrollar.

Estado actual: parcial. Parser especifico existe para UTE; falta parser especifico OSE y correccion manual guiada.

### 13. Caja y neteo real

Duda de Estefania: en caja ve muchas entradas y pocas salidas. Necesita entender/ver cuando queda neteado.

Necesidad funcional:

- Al pagar liquidacion/retiro a propietario, registrar salida real de caja.
- Mostrar entradas, salidas y saldo por periodo.
- Poder distinguir juego de datos vs operaciones reales.

Estado actual: parcial. Hay caja, entradas por pagos, salidas por debitos pagados por inmobiliaria y PDFs de retiro; falta accion clara `Pagar liquidacion / registrar retiro` que genere salida de caja desde liquidacion.

### 14. Prorrateo por dias de consumo/ocupacion

Pide contemplar consumos/impuestos que corresponden al inquilino segun dias:

- Ejemplo UTE: periodo de consumo 03/05 al 03/06; si la persona entra 13/05, cobrar solo 20 dias.
- Tributos y saneamiento son bimestrales, dividir por 60 dias y asignar segun corresponda.
- Cuando cambia el inquilino, prorratear entre viejo, nuevo y/o propietario.
- Aplicar tanto a inquilinos como propietarios segun quien corresponda.

Estado actual: falta. Tenemos periodo devengado/liquidacion, pero no prorrateo por rango de consumo y ocupacion.

### 15. Recibos de pago de inquilinos

Pide visualizar/descargar recibos de pagos realizados por inquilinos. Modelo enviado muestra recibo de alquiler con:

- Logo/datos inmobiliaria.
- RUT.
- Numero de recibo.
- Fecha.
- Propietario.
- Codigo y nombre inquilino.
- Finca.
- Concepto, periodo e importe.
- Total.

Estado actual: parcial. Ya existe descarga PDF de recibos, pero conviene adaptar formato al modelo Salgueiro y hacerlo mas visible.

## Mapa Resumen

| Tema | Estado | Proxima accion |
| --- | --- | --- |
| Garantias ANDA/Contaduria | Hecho | Mantener |
| Regimen legal + Caja Notarial | Hecho | Mantener validacion con datos reales |
| Alertas reajuste | Hecho | Mantener |
| Titulares y pagos | Hecho | Mantener |
| Servicios por finca | Hecho/parcial | Validar URLs y datos requeridos por proveedor |
| Facturas/OCR | Hecho/parcial | Validar mas ejemplos OSE y administraciones |
| Debitos propietario | Hecho | Mantener |
| Liquidacion propietario | Hecho/parcial | Ajustar estetica PDF si piden pixel-perfect |
| Banco/comision bancaria | Hecho | Mantener |
| Reporte inquilinos deudores | Hecho | Validar formato final con Estefania |
| Reporte comision/IVA | Hecho | Validar formato final con Estefania |
| CEDE/resguardos | Hecho/parcial | Agregar pantalla avanzada si necesitan editar masivamente |
| Notificaciones deuda | Hecho/parcial | Envio automatico real requiere proveedor externo |
| Prorrateo consumos | Hecho/parcial | Falta reparto automatico entre inquilino anterior/nuevo/propietario |
| Recibos inquilino | Hecho/parcial | Validar diseno final con modelo Salgueiro |
| Botonera e historiales en Deudas | Hecho | Mantener y validar con Estefania |

## Auditoria 2026-06-07

Esta auditoria separa lo que esta cerrado como funcionalidad del sistema de lo que requiere validacion externa, credenciales reales o definicion operativa de la inmobiliaria.

| Requerimiento | Estado real | Como se prueba |
| --- | --- | --- |
| Rutas externas para facturas e impuestos | Hecho | `Propiedades` > ficha > `Cuentas de servicios`, cargar proveedor y revisar URL/datos |
| Finca con direccion, puerta, apto/unidad y padron | Hecho | `Propiedades` > crear/editar finca |
| Debitos a propietarios por finca con busqueda | Hecho | `Caja` > `Nuevo debito`, buscar por finca/propietario/direccion |
| Conceptos Fondo reserva, Primaria y Contribucion | Hecho | `Caja` > `Nuevo debito` o `Deudas` > concepto |
| Deuda inquilino con impacto opcional en propietario | Hecho | `Deudas` > `Nueva deuda` > marcar impacto/descuento a propietario |
| Liquidacion propietario y PDF tipo contable | Hecho funcional | `Liquidaciones` > generar periodo > descargar PDF; ajuste visual final depende de aprobacion |
| Reporte PDF inquilinos deudores | Hecho | `Liquidaciones` > `Deudores PDF` |
| Reporte PDF comision/IVA | Hecho | `Liquidaciones` > `Comision/IVA PDF` |
| Reajustes por mes de cobro adelantado/vencido | Hecho | `Contratos` > campana > calcular reajuste y revisar `Mes indice` |
| CEDE/agentes de retencion/resguardos | Hecho funcional | Contrato con `CEDE` o resguardo > generar liquidacion > Dashboard |
| Checks notificar inquilino / notificar siempre | Hecho funcional | `Deudas` > `Nueva deuda`; envio automatico real requiere proveedor externo |
| Generacion mensual de alquileres | Hecho | `Deudas` > `Generar alquileres` para periodo |
| OCR/carga OSE | Hecho funcional | `Facturas` > subir PDF OSE; requiere mas PDFs reales para asegurar 100% de casos |
| Caja y neteo real con retiro a propietario | Hecho | `Liquidaciones` > `Registrar pago/retiro`; luego revisar `Caja` |
| Prorrateo por dias de consumo/ocupacion | Hecho funcional | `Deudas` > `Calcular prorrateo`; cubre inquilino actual + diferencia a propietario |
| Recibos PDF de pagos de inquilinos | Hecho funcional | Ficha inquilino/Dashboard > `Descargar recibo PDF`; diseno final depende de aprobacion |
| Botones grandes de Deudas | Hecho | `Deudas`: `Nueva deuda inquilino`, `Nueva deuda propietario`, `Historial propietarios`, `Historial inquilinos`, `Historial cronologico` |
| Historial filtrable por propietario/inquilino | Hecho | `Deudas` > elegir historial y filtrar por persona, finca, concepto, estado o fecha |
| Historial cronologico diario | Hecho | `Deudas` > `Historial cronologico`; usar rango `Desde/Hasta` para ver pagos, vencimientos y debitos por dia |

### Lo Que No Se Puede Declarar 100% Sin Datos Externos

- OCR de OSE/UTE/administraciones: funcional con ejemplos disponibles, pero necesita mas facturas reales para asegurar todos los formatos.
- Correos de administraciones: existe IMAP/reglas, pero requiere credenciales reales y remitentes/asuntos reales para validacion final.
- Envio automatico real por WhatsApp/email: hoy genera mensaje/enlace; el envio automatico necesita proveedor externo contratado/configurado.
- PDFs pixel-perfect: los PDFs existen y son descargables; el cierre 100% visual requiere aprobacion de Estefania contra el modelo final.
- Prorrateo automatico multi-inquilino: hoy calcula el inquilino actual y permite pasar diferencia al propietario; si quieren repartir automaticamente entre inquilino anterior/nuevo, falta definir esa regla exacta.

## Avance Implementado 2026-06-07

- En `Deudas` se agregaron botones grandes para cargar deuda de inquilino, cargar deuda de propietario, ver historial de propietarios, ver historial de inquilinos y abrir historial cronologico.
- El historial de propietarios permite buscar y filtrar debitos por propietario, finca, concepto, estado y fecha.
- El historial de inquilinos mantiene filtros de estado, fecha, inquilino, finca, concepto y descripcion.
- El historial cronologico combina vencimientos de deudas, pagos registrados y debitos a propietarios para revisar lo ocurrido por dia.
- El historial cronologico permite probar el caso indicado por Estefania: seleccionar del dia 1 al 10 y revisar al dia 11 que alquileres siguen vencidos o pendientes.

## Avance Implementado 2026-06-09

- Se creo el documento `ESTEFANIA_REQUIREMENTS_2026-06-09.md` con los 18 ajustes nuevos pedidos por Estefania.
- Se agregaron codigos/numeros y direccion de finca en deudas, historiales, facturas, pagos agrupados y movimientos de caja.
- Se separaron conceptos de inquilino y propietario: contribucion, primaria y fondo de reserva quedan para debitos de propietario.
- Se agrego alerta de posible duplicado al cargar deuda de inquilino o debito de propietario con mismo concepto/finca/periodo.
- Se agrego rango `Periodo desde` / `Periodo hasta` para debitos de propietario.
- Se aclaro el check de salida de caja: solo se marca cuando la inmobiliaria pago el gasto.
- Se agrego checkbox por deuda en pago agrupado para elegir que se paga y que no.
- Se agregaron botones de ingreso ANDA y Contaduria en pagos.
- Se agrego direccion de finca en recibos/retiros PDF generados.
- Pendiente de confirmar: formato exacto de liquidacion tipo Tower.

## Plan Nuevo 2026-06-09 - Pagos, Deudas, Dashboard Y ANDA/Contaduria

- Se creo el documento `ESTEFANIA_REQUIREMENTS_2026-06-09_PAGOS_DEUDAS_DASHBOARD.md`.
- El plan propone reestructurar `Pagos` en un flujo unico de `Ingreso pago inquilino`, con buscador, cabecera completa, deudas seleccionables con checkbox y periodos claros.
- El plan propone separar dashboard operativo de caja contable: dashboard con vencidas/proximas/reajustes y caja con entradas, salidas y caja neta.
- El plan propone agregar `Nuevo credito inquilino` y `Nuevo credito propietario` en `Deudas`.
- El plan propone convertir `Ingreso ANDA` y `Ingreso Contaduria` en conciliaciones institucionales, filtradas por garantia de contrato y con calculo de comisiones, IVA, IRPF/exoneraciones y diferencias contra liquidaciones externas.
- Decision de diseno: no crear 12 deudas reales de alquiler por adelantado; mostrar alquileres esperados y crear la deuda real al cobrar/seleccionar.

## Avance Implementado 2026-06-16 - Contratos Y Primeros Alquileres

- Se creo el documento `ESTEFANIA_REQUIREMENTS_2026-06-16_CONTRATOS_ALQUILERES.md`.
- Se separo `Fin contractual` de `Cobrar/generar hasta` para no perder la fecha real del contrato firmado y aun asi permitir cobros posteriores cuando corresponda.
- En `Pagos > Ingreso pago`, los contratos a mes vencido muestran el mes anterior como periodo y el vencimiento del mes actual; ejemplo: `Mes/año 05/2026`, `Vence 10/06/2026`.
- En `Contratos` se agrego `Generar primer alquiler / cuota inicial`, con `Mes/año que corresponde`, `Importe primer alquiler` y `Fecha de vencimiento`.
- La primera cuota se crea como deuda real `ALQUILER`, con descripcion `Primer alquiler / cuota inicial`, y entra al flujo normal de pagos, caja, comision, IVA, IRPF y liquidaciones.
- Decision de diseno: si ya existe una deuda `ALQUILER` para el mismo contrato y periodo, el sistema no duplica la deuda.

## Avance Implementado 2026-06-02

- Fincas con puerta y unidad/apto/local, manteniendo `address` para compatibilidad.
- Cuentas de servicio con URL de descarga y datos/referencias necesarios por proveedor.
- Parser OSE especifico con cuenta, referencia/cobro, vencimiento, fecha, periodo de consumo, medidor, consumo y monto.
- Prorrateo inicial por dias de ocupacion cuando la factura trae periodo de consumo.
- Debitos a propietario con buscador de finca y concepto `FONDO_RESERVA`.
- Deuda manual con checks de notificacion y opcion de crear debito vinculado a propietario.
- Reajuste legal con mes indice segun cobro adelantado/vencido.
- Contratos CEDE/agente de retencion y resguardos pendientes en Dashboard.
- Pago/retiro real de liquidacion con salida de caja.
- Reportes PDF de `Inquilinos deudores` y `Comision e IVA generados`.

## Plan De Implementacion Propuesto

### Fase 1 - Datos base y usabilidad operativa

1. Separar direccion de finca en campos: calle/direccion, numero puerta, apartamento/unidad/local.
2. Mantener compatibilidad con el campo `address` actual para no romper datos existentes.
3. Mejorar selector de finca en debitos a propietario con busqueda por propietario, direccion, referencia, padron y unidad.
4. Agregar concepto `FONDO_RESERVA` en debitos a propietario.
5. Agregar panel `Rutas de descarga` en ficha de propiedad/servicios con links por proveedor.

Pruebas:

- Crear finca con direccion + puerta + apto.
- Crear debito a propietario buscando por direccion/apto.
- Ver que liquidacion descuenta el debito.

### Fase 2 - Liquidaciones, caja y reportes

1. Agregar accion `Registrar retiro/pago de liquidacion` en liquidaciones.
2. Esa accion debe crear una salida de caja por `total_to_transfer` y marcar la liquidacion como pagada/emitida.
3. Rediseñar PDF de liquidacion propietario con formato Debe/Haber, creditos, debitos, retiros y saldo.
4. Agregar reporte PDF `Inquilinos deudores` agrupado por inquilino/finca.
5. Agregar reporte PDF/CSV `Comision e IVA generados`.
6. Ajustar recibo PDF de inquilino al formato Salgueiro.

Pruebas:

- Generar liquidacion, pagarla y verificar salida de caja.
- Descargar liquidacion y comparar contra modelo.
- Descargar reporte de deudores y recibo de alquiler.

### Fase 3 - Reajustes, CEDE y resguardos

1. Ajustar calculo de reajuste legal segun `rent_payment_timing`:
   - Adelantado: mes de la fecha de reajuste.
   - Vencido: mes anterior.
2. Mostrar en pantalla `Mes usado para indice` y fuente Caja Notarial.
3. Agregar tipo de contrato/inquilino `CEDE / agente de retencion`.
4. Agregar seguimiento mensual de resguardos por contrato/propietario.
5. Permitir generar debito a propietario por IRPF retenido/resguardo.
6. Dashboard de resguardos pendientes ANDA/CGN/CEDE.

Pruebas:

- Contrato vencido con reajuste 01/06 usa mayo.
- Contrato adelantado con reajuste 01/06 usa junio.
- Marcar resguardo pendiente/recibido y verlo en dashboard.

### Fase 4 - Facturas y prorrateos

1. Agregar parser especifico OSE: cuenta, vencimiento, importe, periodo.
2. Agregar campos de periodo de consumo: desde/hasta.
3. Crear motor de prorrateo por dias y ocupacion.
4. Al convertir factura, sugerir distribucion entre inquilino actual, inquilino anterior/nuevo y propietario.
5. Permitir correccion manual antes de guardar.

Pruebas:

- Cargar factura OSE y validar cuenta/monto.
- Factura con consumo 03/05-03/06 y contrato desde 13/05 genera cargo por 20 dias.
- Cambio de inquilino reparte correctamente.

### Fase 5 - Notificaciones y control diario

1. Agregar checks en deuda: `Notificar al inquilino` y `Notificar siempre`.
2. Guardar preferencia por contrato/inquilino.
3. Mostrar pendientes de notificacion y resguardos en Dashboard.
4. Mejorar ayuda interna con estos flujos.

Pruebas:

- Crear deuda con notificacion activa.
- Ver mensaje sugerido y estado de notificacion.
- Ver dashboard con pendientes.

## Orden Recomendado

1. Fase 2 primero si la prioridad es que la caja/liquidacion cierre mejor para pruebas reales.
2. Fase 3 despues, porque el tema reajustes/CEDE afecta calculos sensibles.
3. Fase 4 cuando tengan al menos una factura OSE real para entrenar bien el parser.
4. Fase 1 puede ir en paralelo si se quiere mejorar carga de datos.
5. Fase 5 al final para automatizar comunicaciones.

## Riesgos / Decisiones A Confirmar

- Si `Fondo reserva` siempre es debito al propietario o puede trasladarse al inquilino.
- Si el pago de liquidacion debe crear salida de caja por defecto o requerir confirmacion manual.
- Como registrar resguardos CEDE/ANDA/CGN: por contrato, por propietario o ambos.
- Si el prorrateo se hace sobre importe total de factura o por conceptos internos de la factura.
- Si el recibo Salgueiro debe replicar exactamente el diseño viejo o solo mantener campos equivalentes.

## Avance Implementado 2026-06-16 - Deudas, Facturas Y Copropietarios

- `Nueva deuda inquilino` ya no pide `Responsable`: toda deuda de ese formulario queda a cargo del inquilino del contrato.
- El campo `Liquidacion` solo aparece para `GASTOS_COMUNES`; en los demas conceptos se iguala automaticamente al periodo devengado.
- Para UTE/OSE/tributos/saneamiento se mantiene una carga mas clara: `Mes/año deuda`, `Devengado` y `Consumo desde/hasta`.
- `Nueva deuda propietario` muestra vista previa de reparto cuando se marca `Repartir entre propietarios segun porcentaje`.
- Si la finca tiene copropietarios, el sistema crea un debito separado para cada propietario con su porcentaje.
- Se agrego documentacion operativa en `ESTEFANIA_REQUIREMENTS_2026-06-16_DEUDAS_FACTURAS_PROPIETARIOS.md` y temas nuevos en la ayuda interna.
