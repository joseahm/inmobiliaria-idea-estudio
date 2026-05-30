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
6. Guardar y expandir la tarjeta del contrato con la flecha para ver nombre, cedula, email y celular de todos los titulares.

### Reajustes Y Avisos De Aumento

1. Entrar a `Contratos`.
2. Tocar la campana del contrato.
3. Para probar una alerta, elegir una fecha dentro de los proximos 30 dias y tocar `Guardar alerta`.
4. Volver al `Dashboard`: la alerta debe aparecer en `Reajustes proximos`.
5. Para calcular un aumento, volver a la campana y tocar `Calcular reajuste`.
6. Si el contrato esta en `Regimen legal`, el sistema usa el indice de reajuste de alquileres publicado por Caja Notarial para el mes y año elegidos.
7. Si el contrato esta en `Libre contratacion`, ingresar un factor manual, por ejemplo `1.0316`.
8. Usar `Copiar aviso`, `WhatsApp` o `Email` para preparar el mensaje al inquilino.
9. Tocar `Aplicar reajuste` solo cuando corresponda actualizar el alquiler del contrato; esta accion guarda el nuevo monto y mueve la proxima fecha de reajuste al año siguiente.

Referencia del indice legal: `https://www.cajanotarial.org.uy/innovaportal/v/3481/1/innova.front/indice-de-reajuste-de-alquileres.html`

### Pagos Con Varios Titulares

1. Entrar a `Deudas` o `Pagos`.
2. Abrir `Registrar pago` sobre una deuda.
3. En `Titular que paga`, elegir la persona que realizo el pago.
4. Confirmar el pago.
5. Revisar `Caja`: debe quedar registrada la entrada de dinero.

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

### Servicios, Facturas Y Correos

1. Entrar a `Propiedades`.
2. Abrir la ficha de la propiedad con el icono de ojo.
3. En `Cuentas de servicios`, cargar UTE, OSE, gastos comunes, saneamiento, tributos o primaria con su cuenta o referencia.
4. Entrar a `Facturas`.
5. Cargar un archivo o configurar una bandeja IMAP y reglas por remitente/asunto.
6. Cuando el texto detectado contiene una referencia cargada en la propiedad, el sistema asocia la factura a esa finca.
7. Convertir la factura en deuda si corresponde cobrarla al inquilino, o en debito a propietario si corresponde descontarla en liquidacion.

Si el correo da `[AUTHENTICATIONFAILED] Invalid credentials`, revisar:

- En `Facturas > Configuracion`, el campo `Nombre de variable en backend/.env` debe decir `FACTURAS_EMAIL_PASSWORD`.
- No pegar la app-password real en ese campo de la web.
- En `backend/.env`, `FACTURAS_EMAIL_PASSWORD` debe contener la app-password del correo.
- Para Gmail no sirve la contraseña normal: tiene que ser una app-password con IMAP habilitado.
- Reiniciar el backend despues de cambiar `backend/.env`.

### Gastos Y Pagos A Propietarios

1. Entrar a `Caja`.
2. En `Debitos a propietario`, tocar `Nuevo debito`.
3. Registrar conceptos como UTE, OSE, gastos comunes, tributos, saneamiento, primaria, contribucion, arreglos, ANTEL, Securitas u otros servicios.
4. Si `Caja automatica` esta activo, el sistema crea la salida de dinero.
5. Al generar liquidaciones, esos debitos se descuentan del propietario.

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
4. Para salidas de caja, entrar a `Caja` y usar el icono de descarga en los movimientos de tipo `salida`.
5. El PDF evita el flujo manual de buscar referencia, descargar Word, abrir Word y convertir a PDF.

### Exoneracion De IRPF

1. Entrar a `Propiedades`.
2. Abrir la ficha de la propiedad.
3. En el panel `Propietarios`, tocar `Editar IRPF`.
4. Destildar `IRPF aplica` para propietarios exonerados.
5. Guardar y verificar que la ficha muestre `IRPF no`.

## Documentacion Operativa

- Acceso al servidor DigitalOcean: `SERVER_ACCESS.md`

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
