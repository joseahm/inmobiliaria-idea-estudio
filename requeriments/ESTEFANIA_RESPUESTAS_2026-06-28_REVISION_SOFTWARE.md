# Respuestas a la revisión de Estefanía - 2026-06-28

Este documento resume cada observación de la revisión y cómo validarla en el sistema.

## 1. Recibos de pagos de inquilinos

**Pedido:** poder ver, imprimir, descargar y compartir recibos de pagos de inquilinos.

**Respuesta:** listo para descargar en PDF desde pagos recientes, ficha del inquilino y movimientos vinculados. El formato se ajustó al modelo de Tower/Salgueiro incluido en `revision/SOFTWARE .docx`: dos copias en la misma hoja, una para empresa y otra para cliente. El envío por correo/WhatsApp queda operativo como descarga del PDF para adjuntar o compartir manualmente, sin automatizar credenciales personales.

**Dónde probar:** `Inquilinos` -> abrir ficha -> sección `Pagos` -> `Descargar recibo PDF`. También en `Dashboard` -> `Pagos recientes`. Debe verse con el encabezado Salgueiro, tabla de recibo, finca, concepto, total y copias `EMPRESA` / `CLIENTE`.

## 2. Retiros / liquidaciones de propietarios

**Pedido:** descargar comprobante de retiro y controlar si el retiro no coincide con lo que corresponde pagar.

**Respuesta:** listo. La liquidación muestra `A girar`, `Retirado` y `Saldo`. Si se retira menos queda saldo a favor del propietario; si se retira más queda saldo deudor. Además, cada retiro puede anularse y genera una reversa en caja, sin borrar historial. La liquidación PDF usa encabezado/formato Salgueiro y el comprobante de retiro se ajustó al modelo de Tower/Salgueiro incluido en `revision/SOFTWARE .docx`: dos copias en la misma hoja, importe arriba, texto de recepción, firma y saldo final.

**Dónde probar:** `Liquidaciones` -> generar periodo -> editar monto de retiro -> `Registrar retiro` -> revisar `Retirado` y `Saldo`. Para corregir: desplegar la liquidación -> `Retiros registrados` -> `Anular`. Para ver el formato, usar `Descargar retiro PDF` o el botón `PDF` de un retiro registrado.

## 3. Cobranza realizada de inquilinos

**Pedido:** reporte de lo cobrado por inquilino.

**Respuesta:** listo.

**Dónde probar:** `Inquilinos` -> pestaña `Cobranza realizada` -> filtrar por fecha o texto.

## 4. Comisión e IVA generados

**Pedido:** reporte de comisión inmobiliaria e IVA.

**Respuesta:** listo, con filtro por periodo y PDF.

**Dónde probar:** `Caja` -> `Comisión e IVA` o `Liquidaciones` -> `Comisión/IVA PDF`.

## 5. Inquilinos deudores

**Pedido:** listado claro de inquilinos con deuda.

**Respuesta:** listo.

**Dónde probar:** `Inquilinos` -> pestaña `Inquilinos deudores`.

## 6. Datos visibles en deudas

**Pedido:** mostrar número, nombre, finca, dirección, concepto, importe, saldo y periodo.

**Respuesta:** listo en listados de deudas, históricos y reportes.

**Dónde probar:** `Deudas` -> historial de inquilinos o propietarios -> buscar una persona/finca/concepto.

## 7. Deudores por propietario

**Pedido:** ver qué inquilinos adeudan agrupado por propietario antes de transferir.

**Respuesta:** listo.

**Dónde probar:** `Inquilinos` -> pestaña `Deudores por propietario`.

## 8. Saldos de propietarios

**Pedido:** ver saldo de cada propietario.

**Respuesta:** listo.

**Dónde probar:** `Propietarios` -> pestaña `Saldos propietarios`.

## 9. Historial de facturación

**Pedido:** ver historial de facturación en caja.

**Respuesta:** listo.

**Dónde probar:** `Caja` -> pestaña `Historial facturación`.

## 10. Contratos vigentes por garantía

**Pedido:** ver contratos vigentes separados por ANDA, Contaduría, aseguradoras, etc.

**Respuesta:** listo.

**Dónde probar:** `Contratos` -> pestaña `Vigentes por garantía`.

## 11. Contratos vencidos / históricos

**Pedido:** mantener histórico de contratos vencidos.

**Respuesta:** listo.

**Dónde probar:** `Contratos` -> pestaña `Vencidos / histórico`.

## 12. Marcar contrato activo o vencido

**Pedido:** poder indicar si un contrato está activo o vencido.

**Respuesta:** listo. Se puede marcar/desmarcar `Contrato activo`.

**Dónde probar:** `Contratos` -> editar contrato -> campo `Contrato activo`.

## 13. Control al vencer contrato con saldo pendiente

**Pedido:** si un contrato vencido tiene saldos pendientes, el sistema debe controlarlo y no seguir generando cálculos futuros.

**Respuesta:** listo. Si se intenta desactivar un contrato con deudas pendientes, el sistema bloquea la acción e informa qué deudas hay que resolver. Los contratos inactivos no entran en generación de liquidaciones ni cálculos futuros.

**Dónde probar:** crear una deuda pendiente a un contrato -> `Contratos` -> editar -> desmarcar `Contrato activo`. Debe aparecer alerta de deudas pendientes.

## 14. Deudas por padrón matriz y varias unidades

**Pedido:** si una deuda corresponde a un padrón matriz con varias unidades, dividirla entre las fincas asociadas.

**Respuesta:** listo como acción explícita para evitar errores. La factura se puede fraccionar por padrón y el sistema crea una deuda/débito por cada finca con el mismo padrón.

**Dónde probar:** `Facturas` -> cargar/seleccionar factura con finca que tenga padrón compartido -> botón `Fraccionar padrón`.

## 15. Pantalla principal de deudas sin sobrecargar

**Pedido:** no llenar la pantalla principal de deudas con demasiada información.

**Respuesta:** listo. Se mantienen acciones rápidas y los datos extendidos quedan en históricos, filtros y modales.

**Dónde probar:** `Deudas` -> verificar tarjetas y pestañas.

## 16. Inquilinos y propietarios ordenables

**Pedido:** pantallas principales ordenables y no sobrecargadas.

**Respuesta:** listo.

**Dónde probar:** `Inquilinos` y `Propietarios` -> usar el selector de orden.

## 17. Servicios externos y facturas automáticas

**Pedido:** acceder a portales de servicios y cargar facturas automáticamente.

**Respuesta:** listo en forma segura: el sistema permite guardar referencias, cuentas y URL de portal por finca, importar PDF/foto manualmente y capturar facturas desde correo. No se automatiza la descarga desde portales con captcha o “no soy robot”, porque eso es frágil y puede fallar por seguridad del proveedor.

**Dónde probar:** `Propiedades` -> ficha -> servicios/cuentas. Para facturas: `Facturas` -> cargar archivo o `Revisar correo`.

## 18. Propiedades con número de finca, dirección y barrio

**Pedido:** ordenar fincas por número, dirección y barrio.

**Respuesta:** listo. Se agregó `Barrio` a la propiedad y orden por barrio.

**Dónde probar:** `Propiedades` -> crear/editar finca -> completar `Barrio`; luego usar orden `Barrio A-Z`.

## 19. Contratos más ordenados

**Pedido:** pantalla de contratos ordenada por botones/filtros.

**Respuesta:** listo con pestañas y filtros.

**Dónde probar:** `Contratos` -> pestañas `Todos`, `Vigentes por garantía`, `Vencidos / histórico`.

## 20. Pagos a propietarios, liquidación y comprobantes

**Pedido:** ver/eliminar pagos a propietarios y descargar liquidación con detalle.

**Respuesta:** listo. Los retiros quedan listados dentro de cada liquidación, se puede descargar PDF y anular el retiro con reversa de caja. No se borra dinero ya registrado: se anula para mantener trazabilidad.

**Dónde probar:** `Liquidaciones` -> desplegar una liquidación -> `Retiros registrados` -> `PDF` o `Anular`.

## 21. Botón DGI / IRPF

**Pedido:** explicar qué hace el reporte para DGI/IRPF.

**Respuesta:** listo. El reporte exporta la base para controlar IRPF por propietario, cédula y periodo. Para Beta/Sigma se deja como CSV interno verificable; si DGI exige un formato exacto, se ajusta contra el archivo oficial que usen.

**Dónde probar:** `Liquidaciones` -> `DGI IRPF` o `Propietarios` -> `Alquileres cobrados por cédula`.

## 22. Datos visuales superpuestos

**Pedido:** corregir ventanas/tablas apretadas.

**Respuesta:** listo en los módulos ajustados: conciliación ANDA/Contaduría, liquidaciones, deudas, caja y modales principales usan tablas más anchas/paginadas o secciones desplegables.

**Dónde probar:** `Pagos` -> conciliación ANDA/Contaduría; `Caja`; `Liquidaciones`.

## 23. Alquileres cobrados por cédula

**Pedido:** reporte por cédula con periodo, porcentaje, IRPF y propietario.

**Respuesta:** listo.

**Dónde probar:** `Propietarios` -> pestaña `Alquileres cobrados por cédula` -> filtrar fechas.

## 24. Copropietarios y porcentajes

**Pedido:** si una finca tiene varios propietarios, repartir importes según porcentaje.

**Respuesta:** listo. La propiedad permite cargar múltiples propietarios y sus porcentajes. La liquidación reparte alquileres, gastos e impuestos por esos porcentajes.

**Dónde probar:** `Propiedades` -> editar finca -> `Propietarios y porcentajes`; luego cobrar un alquiler o cargar un débito compartido y generar `Liquidaciones`.

## 25. Primer alquiler / primera cuota

**Pedido:** al crear contrato, poder cargar un primer pago manual por periodo, y si corresponde generar comisión, IVA e IRPF.

**Respuesta:** listo. El contrato permite cargar `Primer alquiler`, periodo y vencimiento. Se crea una deuda real de alquiler con origen de primer alquiler, y entra al flujo normal de pagos/liquidación.

**Dónde probar:** `Contratos` -> nuevo/editar -> completar primer alquiler -> guardar -> `Pagos` o `Deudas` para ver la deuda generada.

## 26. Corrección de errores de caja

**Pedido:** si se cargó un pago/retiro mal, poder corregir sin romper caja.

**Respuesta:** listo bajo criterio conservador: pagos y retiros no se borran cuando ya impactan caja; se anulan y se genera movimiento inverso. Así queda historial completo.

**Dónde probar:** en `Deudas` anular/reimputar pago; en `Liquidaciones` anular retiro; en `Caja` verificar movimiento original anulado y reversa.
