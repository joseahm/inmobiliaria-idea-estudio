# Inmobiliaria Salgueiro

Sistema operativo para administracion inmobiliaria: fincas, contratos, deudas, pagos, caja, gastos a propietario, servicios, comprobantes, auditoria, liquidaciones y exportes contables.

## Credenciales iniciales

- Email: `admin@salgueiro.test`
- Password: `admin123`

## Backend

```bash
cd backend
uv venv .venv --python python3
uv pip install -r requirements.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000
```

API: `http://localhost:8000`  
Docs: `http://localhost:8000/docs`

### Credencial para correo de facturas

Para probar la captura automatica por Gmail/IMAP, guardar la app-password en `backend/.env`:

```bash
INVOICES_EMAIL_ADDRESS="facturas@tu-dominio.com"
INVOICES_EMAIL_HOST="imap.gmail.com"
INVOICES_EMAIL_USERNAME="facturas@tu-dominio.com"
INVOICES_EMAIL_SECRET_ENV_VAR="FACTURAS_EMAIL_PASSWORD"
INVOICES_EMAIL_FOLDER="INBOX"
FACTURAS_EMAIL_PASSWORD="pegar-aca-la-app-password-de-google"
```

En la app, en `Facturas`, el correo ya queda preparado con esos valores al reiniciar datos. El campo `Variable de clave` debe quedar como `FACTURAS_EMAIL_PASSWORD`. No pegar ahi la clave real.

Despues de cambiar `backend/.env`, reiniciar el backend.

### OCR de facturas y PDFs

La carga rapida por factura acepta imagenes y PDFs. Para PDFs con texto seleccionable usa PyMuPDF; para fotos o PDFs escaneados usa OCR local con Tesseract cuando esta instalado:

```bash
brew install tesseract tesseract-lang
```

Si Tesseract no esta disponible, el endpoint puede leer PDFs con texto seleccionable, pero no podra leer fotos o PDFs escaneados con buena precision.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`

## Guia Rapida De Prueba

Usar estas credenciales:

- Email: `admin@salgueiro.test`
- Password: `admin123`

### Contratos, Garantias Y Titulares

1. Entrar a `Contratos`.
2. Crear o editar un contrato.
3. En `Garantia`, elegir `ANDA` para cargar 2% automatico o `Contaduria` para cargar 3% automatico.
4. Elegir `Regimen legal` o `Libre contratacion`.
5. Marcar `Titulares adicionales` si el contrato tiene mas de un responsable.
6. Usar `Fin contractual` para la fecha real del contrato firmado.
7. Si el contrato vencio pero sigue correspondiendo cobrar, completar `Cobrar/generar hasta`; si queda vacio, el sistema usa `Fin contractual`.
8. Si hay una primera cuota/prorrateo de alquiler, marcar `Generar primer alquiler / cuota inicial`, indicar `Mes/año`, importe manual y vencimiento.
9. Si el contrato es `Adelantado`, la primera cuota queda para abonar enseguida; si es `Vencido`, usar vencimiento 10 del mes siguiente.
10. Guardar y expandir la tarjeta del contrato con la flecha para ver nombre, cedula, email y celular de todos los titulares.
11. Para empresas/agentes de retencion, marcar `Tipo fiscal inquilino` como `CEDE / agente de retencion`; el sistema activa control de resguardos.

### Reajustes Y Avisos De Aumento

1. Entrar a `Contratos`.
2. Tocar la campana del contrato.
3. Para probar una alerta, elegir una fecha dentro de los proximos 30 dias y tocar `Guardar alerta`.
4. Volver al `Dashboard`: la alerta debe aparecer en `Reajustes proximos`.
5. Para calcular un aumento, volver a la campana y tocar `Calcular reajuste`.
6. Si el contrato esta en `Regimen legal`, el sistema usa Caja Notarial y muestra `Mes indice`: alquiler adelantado usa el mes de la fecha; alquiler vencido usa el mes anterior.
7. Si el contrato esta en `Libre contratacion`, ingresar un factor manual, por ejemplo `1.0316`.
8. Usar `Copiar aviso`, `WhatsApp` o `Email` para preparar el mensaje al inquilino.
9. Tocar `Aplicar reajuste` solo cuando corresponda actualizar el alquiler del contrato; esta accion guarda el nuevo monto y mueve la proxima fecha de reajuste al año siguiente.

Referencia del indice legal: `https://www.cajanotarial.org.uy/innovaportal/v/3481/1/innova.front/indice-de-reajuste-de-alquileres.html`

### Ingreso Pago Inquilino

1. Entrar a `Pagos`.
2. Buscar el inquilino por numero, nombre, cedula, celular o finca.
3. Tocar `Ingreso pago`.
4. Verificar la cabecera: recibo automatico, fecha, inquilino, finca, propietario, reajuste, vencimiento, moneda y total.
5. En `Titular que paga`, elegir quien hizo el pago si el contrato tiene varios titulares.
6. Tildar las deudas que paga: alquiler, UTE, OSE, gastos comunes, tributos, saneamiento u otros.
7. Si corresponde cobrar un alquiler aun no cargado, tildar la fila `Alquiler esperado`; el sistema crea esa deuda real solo al confirmar.
8. Si no aparecen alquileres esperados, revisar que el contrato este activo y que `Cobrar/generar hasta` cubra el mes a cobrar.
9. En contratos `Vencido`, el sistema muestra el mes anterior como `Mes/año` y el vencimiento del mes actual; ejemplo: `Mes/año 05/2026`, `Vence 10/06/2026`.
10. Si hay otro debito o comision en el momento del cobro, tocar `Ing. debitos / Otras Com.`, completar descripcion e importe.
11. Revisar el bloque `Creditos`: muestra saldos a favor para controlar antes de cobrar, pero no los descuenta solo de caja.
12. Ajustar el importe en `Saldo a pagar` si es pago parcial.
13. Completar metodo, referencia y observaciones.
14. Confirmar y revisar `Caja`: debe quedar registrada una entrada por el total cobrado.
15. Revisar `Deudas`: lo pagado queda como `Pagado` o `Pago parcial` si quedo saldo.

### Pago Sin Imputar

1. Usar `Pago sin imputar` solo cuando entro dinero pero todavia no se sabe a que deuda aplicarlo.
2. El sistema registra la entrada en `Caja` y deja saldo a favor del inquilino.

### Correccion De Imputaciones

1. Usar esto cuando la plata entro bien, pero se cargo mal el importe o se aplico a la deuda equivocada.
2. Entrar a `Inquilinos` y abrir la ficha del inquilino.
3. En `Pagos`, tocar el icono de corregir imputacion del pago.
4. Revisar la imputacion actual.
5. Si el monto registrado no era el real, corregir `Monto real cobrado`.
6. Si queres cerrar una deuda completa, tocar `Pagar saldo` en la deuda real; eso completa el monto cobrado y la imputacion.
7. Si solo queres mover el monto real ya cargado, tocar `Mover monto` o poner `0` en la deuda incorrecta y el importe correcto en la deuda real.
8. Guardar la correccion.
9. Si el monto real cambio, `Caja` crea un ajuste solo por la diferencia.
10. Verificar que la deuda incorrecta vuelve a quedar abierta y la deuda correcta queda pagada o parcial.
11. Usar `Anular pago` solo si el dinero no debio entrar o el pago fue duplicado; esa accion si revierte caja completa.

### Deudas E Historiales

1. Entrar a `Deudas`.
2. Usar `Nueva deuda inquilino` para cargar UTE, OSE, alquileres, gastos comunes u otros cargos al inquilino.
3. Usar `Nueva deuda propietario` para cargar primaria, tributos, saneamiento, arreglos u otros gastos que se descuentan al propietario.
4. Usar `Historial inquilinos` para filtrar deudas por inquilino, finca, concepto, estado y fechas.
5. Usar `Historial propietarios` para filtrar debitos por propietario, finca, concepto, estado y fechas.
6. Usar `Historial cronologico` para ver por dia que vencio, quien pago y que debitos se cargaron.
7. Para probar el caso de Estefania, en `Historial cronologico` cargar `Desde` dia 1 y `Hasta` dia 10; el sistema muestra pagos registrados, vencimientos y alquileres pendientes del rango.

### Servicios, Facturas Y Correos

1. Entrar a `Propiedades`.
2. Abrir la ficha de la propiedad con el icono de ojo.
3. En `Cuentas de servicios`, cargar UTE, OSE, gastos comunes, saneamiento, tributos o primaria con su cuenta o referencia.
4. Completar `URL para descargar factura` y `Datos necesarios` si corresponde; el sistema propone links de UTE, OSE, tributos, saneamiento, primaria y contribucion.
5. Entrar a `Facturas`.
6. Cargar un archivo o configurar una bandeja IMAP y reglas por remitente/asunto.
7. Para OSE, el sistema intenta detectar cuenta, referencia/cobro, vencimiento, periodo de consumo, medidor, consumo y monto.
8. Cuando el texto detectado contiene una referencia cargada en la propiedad, el sistema asocia la factura a esa finca.
9. Convertir la factura en deuda si corresponde cobrarla al inquilino, o en debito a propietario si corresponde descontarla en liquidacion.
10. Si la factura tiene periodo de consumo y el contrato no ocupa todo el rango, la deuda se prorratea por dias.
11. Si la deuda se carga manualmente, usar `Calcular prorrateo por dias de ocupacion`, completar `Monto total de la factura` y revisar `Dias a cobrar`.
12. El sistema muestra cuanto queda como deuda del inquilino y cuanto queda como diferencia no cobrada.
13. Si la diferencia la absorbe el propietario, marcar `Descontar la diferencia al propietario en la liquidacion`.
14. Si la inmobiliaria pago esa diferencia, marcar tambien `La inmobiliaria pago esa diferencia y debe salir de caja`.
15. Crear la deuda no crea una entrada de caja: la entrada aparece recien al registrar el pago del inquilino.
16. Si el inquilino ya pago al cargar la deuda, marcar `Registrar pago del inquilino ahora y mandarlo a caja`.
17. Si `Dias a cobrar` muestra todos los dias del periodo, el sistema no descuenta nada porque el contrato cubre todo el consumo.

Para recrear datos locales de prueba de prorrateo:

```bash
cd backend
.venv/bin/python create_proration_test_data.py
```

Si el correo da `[AUTHENTICATIONFAILED] Invalid credentials`, revisar:

- En `Facturas > Configuracion`, el campo `Nombre de variable en backend/.env` debe decir `FACTURAS_EMAIL_PASSWORD`.
- No pegar la app-password real en ese campo de la web.
- En `backend/.env`, `FACTURAS_EMAIL_PASSWORD` debe contener la app-password del correo.
- Para Gmail no sirve la contraseña normal: tiene que ser una app-password con IMAP habilitado.
- Reiniciar el backend despues de cambiar `backend/.env`.

### Gastos Y Pagos A Propietarios

1. Entrar a `Caja`.
2. En `Debitos a propietario`, tocar `Nuevo debito`.
3. Buscar la finca por direccion, apto/unidad, referencia o padron.
4. Registrar conceptos como UTE, OSE, gastos comunes, tributos, saneamiento, primaria, contribucion, fondo reserva, arreglos, ANTEL, Securitas u otros servicios.
5. Si `Caja automatica` esta activo, el sistema crea la salida de dinero.
6. Al generar liquidaciones, esos debitos se descuentan del propietario.

### Deudas Con Avisos Y Descuento A Propietario

1. Entrar a `Deudas` y tocar `Nueva deuda inquilino`.
2. Usar `Notificar al inquilino` o `Notificar siempre` para dejar marcada la preferencia del cargo.
3. Si esa deuda tambien debe impactar al propietario, marcar `Tambien asociar/descontar al propietario`.
4. Elegir concepto, si la inmobiliaria lo pago y si se reparte por porcentaje de propietarios.
5. Guardar y verificar que se cree el debito vinculado para la liquidacion.

### Comision Bancaria A Propietarios

1. Entrar a `Propietarios`.
2. Crear o editar un propietario.
3. En `Transferencia al propietario`, cargar banco y cuenta.
4. Si el banco no es BROU, el sistema tilda `Descontar comision bancaria`.
5. Revisar o cambiar el importe, por ejemplo `$65`.
6. Guardar y generar la liquidacion del periodo.
7. En `Liquidaciones`, revisar las columnas `Ingresos`, `Gastos`, `Comision`, `IVA`, `IRPF`, `Banco` y `A girar`.

### PDFs De Recibos, Liquidaciones Y Retiros

1. Para recibos de inquilinos, entrar al `Dashboard` o a la ficha del inquilino y tocar `Descargar recibo PDF`.
2. Para liquidaciones, entrar a `Liquidaciones`, generar el periodo y tocar `Descargar liquidacion PDF`.
3. Para retiros de propietarios, tocar `Descargar retiro PDF` en la liquidacion.
4. Para registrar la salida real de caja al pagar al propietario, tocar `Registrar pago/retiro`.
5. Descargar `Deudores PDF` para el reporte agrupado de inquilinos deudores.
6. Descargar `Comision/IVA PDF` para el reporte de comision e IVA generados.
7. Para salidas de caja, entrar a `Caja` y usar el icono de descarga en los movimientos de tipo `salida`.
8. El PDF evita el flujo manual de buscar referencia, descargar Word, abrir Word y convertir a PDF.

### Exoneracion De IRPF

1. Entrar a `Propiedades`.
2. Abrir la ficha de la propiedad.
3. En el panel `Propietarios`, tocar `Editar IRPF`.
4. Destildar `IRPF aplica` para propietarios exonerados.
5. Guardar y verificar que la ficha muestre `IRPF no`.

### Resguardos CEDE / ANDA / Contaduria

1. Editar un contrato y marcar `CEDE / agente de retencion` o una garantia ANDA/Contaduria.
2. Generar la liquidacion del periodo.
3. Verificar en `Dashboard` el bloque `Resguardos pendientes`.
4. El sistema genera seguimiento mensual por contrato, propietario, periodo, fuente e importe.

### Conciliacion ANDA / Contaduria

1. Entrar a `Pagos`.
2. Tocar `Conciliar ANDA` o `Conciliar Contaduria`.
3. Elegir el periodo.
4. Verificar que solo aparezcan contratos con esa garantia/origen.
5. Revisar columnas: bruto, comision institucional, IVA institucional, comision administracion, IVA administracion, IRPF/exonerado y esperado neto.
6. Para probar con archivo, crear un CSV con columnas como `Contrato,Inquilino,Finca,Liquidado`.
7. Tocar `Subir archivo` y cargar el CSV, TXT, PDF o XLSX de liquidacion.
8. Revisar el resumen: `Filas detectadas`, `Matcheadas`, `Diferencias`, `Sin importe` y `No matcheadas`.
9. Si el importe liquidado no coincide con el esperado, la columna `Dif.` queda marcada para revisar antes de tocar caja o deudas.

## Documentacion Operativa

- Acceso al servidor DigitalOcean: `SERVER_ACCESS.md`
- Plan de requerimientos de Estefania: `requeriments/ESTEFANIA_REQUIREMENTS_PLAN.md`
- Ajustes de Estefania del 2026-06-09: `requeriments/ESTEFANIA_REQUIREMENTS_2026-06-09.md`
- Plan de pagos/deudas/dashboard/ANDA del 2026-06-09: `requeriments/ESTEFANIA_REQUIREMENTS_2026-06-09_PAGOS_DEUDAS_DASHBOARD.md`
- Contratos y primeros alquileres del 2026-06-16: `requeriments/ESTEFANIA_REQUIREMENTS_2026-06-16_CONTRATOS_ALQUILERES.md`
- Deudas, facturas y copropietarios del 2026-06-16: `requeriments/ESTEFANIA_REQUIREMENTS_2026-06-16_DEUDAS_FACTURAS_PROPIETARIOS.md`
- Revision de software del 2026-06-27: `ESTEFANIA_REQUIREMENTS_2026-06-27_REVISION_SOFTWARE.md`

## Verificacion

```bash
cd backend && .venv/bin/pytest -q
cd frontend && npm run build
```

## Docker / VPS

Para levantar todo con Docker Compose:

```bash
cp .env.production.example .env.production
docker compose up -d --build
```

La app queda disponible en `http://localhost` y el frontend reenvia `/api` al backend.

Guia completa para Hetzner CX22: [DEPLOYMENT.md](DEPLOYMENT.md).

## Datos Iniciales

Para reiniciar la base local con datos de prueba operativos:

```bash
cd backend
.venv/bin/python reset_demo_data.py
```

El dataset incluye propietarios con varias fincas, una finca 50/50, pagos de varios meses, saldo a favor, gastos repartidos, servicios por finca y liquidaciones detalladas.

## Notas de repositorio

Los archivos con contexto privado de discovery, audios, capturas, bases locales y comprobantes subidos no se incluyen en Git. El repositorio debe contener el codigo fuente, scripts y documentacion tecnica necesaria para levantar el sistema.
