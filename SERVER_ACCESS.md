# Acceso Al Servidor DigitalOcean

Este documento resume como conectarse al Droplet/servidor donde esta corriendo la aplicacion de la inmobiliaria.

## Datos Del Servidor

- Proveedor: DigitalOcean
- Tipo: Droplet Ubuntu
- Nombre: `inmobiliaria-prod-01`
- Region: `NYC1`
- Sistema operativo: `Ubuntu 24.04 LTS x64`
- IP publica IPv4: `64.227.8.5`
- IP privada: `10.116.0.2`
- Ruta del proyecto en el servidor: `/root/inmobiliaria-idea-estudio`

## Acceso Web

Para entrar desde el navegador:

```text
http://64.227.8.5
```

API de salud:

```text
http://64.227.8.5/api/health
```

Respuesta esperada:

```json
{"status":"ok","app":"Inmobiliaria Salgueiro"}
```

## Usuario De La Aplicacion

El email admin configurado es:

```text
admin@salgueiro.test
```

La contraseña no se guarda en este repositorio. Para verla en el servidor:

```bash
ssh root@64.227.8.5 'cat /root/inmobiliaria-admin-credentials.txt'
```

No compartir este archivo ni la contraseña por canales publicos.

## Conexion SSH

Para entrar al servidor:

```bash
ssh root@64.227.8.5
```

Una vez dentro, ir al proyecto:

```bash
cd /root/inmobiliaria-idea-estudio
```

## Servicios Docker

Ver servicios corriendo:

```bash
cd /root/inmobiliaria-idea-estudio
docker compose ps
```

Servicios esperados:

- `db`: PostgreSQL
- `backend`: FastAPI
- `frontend`: Nginx sirviendo React

Ver logs:

```bash
cd /root/inmobiliaria-idea-estudio
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

Reiniciar todo:

```bash
cd /root/inmobiliaria-idea-estudio
docker compose restart
```

Apagar todo:

```bash
cd /root/inmobiliaria-idea-estudio
docker compose down
```

Levantar todo:

```bash
cd /root/inmobiliaria-idea-estudio
docker compose --env-file .env.production up -d
```

Reconstruir luego de cambios:

```bash
cd /root/inmobiliaria-idea-estudio
docker compose --env-file .env.production up -d --build
```

## Variables De Produccion

Archivo principal:

```text
/root/inmobiliaria-idea-estudio/.env.production
```

Alias usado por Docker Compose:

```text
/root/inmobiliaria-idea-estudio/.env -> .env.production
```

Editar variables:

```bash
ssh root@64.227.8.5
cd /root/inmobiliaria-idea-estudio
nano .env.production
docker compose --env-file .env.production up -d --build
```

Importante:

- No subir `.env.production` a GitHub.
- No pegar secretos en la documentacion.
- Si se cambia `DEMO_ADMIN_PASSWORD`, hay que reiniciar el backend.
- Para facturas por correo, configurar `FACTURAS_EMAIL_PASSWORD` en `.env.production`.

## Firewall

Ver reglas:

```bash
ssh root@64.227.8.5 'ufw status'
```

Reglas esperadas:

- `OpenSSH`: permitido
- `80/tcp`: permitido

Cuando se agregue HTTPS, tambien permitir:

```bash
ssh root@64.227.8.5 'ufw allow 443/tcp'
```

## Compartir Con Otras Personas

Para que otras personas usen el sistema, compartir solo:

```text
http://64.227.8.5
```

Y el usuario/contraseña de la aplicacion.

No compartir:

- Acceso a DigitalOcean
- SSH del servidor
- Archivo `.env.production`
- Archivo `/root/inmobiliaria-admin-credentials.txt`

## Dominio Opcional

Ahora se accede por IP publica. Para usar un nombre mas lindo, por ejemplo:

```text
https://app.tudominio.com
```

Pasos generales:

1. Comprar o usar un dominio propio.
2. Crear un registro DNS tipo `A`:
   - Nombre: `app`
   - Valor: `64.227.8.5`
3. Esperar propagacion DNS.
4. Configurar HTTPS en el servidor.
5. Actualizar `ALLOWED_ORIGINS` en `.env.production`.

DigitalOcean puede administrar DNS, pero no registra dominios. El dominio se compra en un registrador externo.

## Backup Basico

Crear carpeta de backups:

```bash
ssh root@64.227.8.5 'mkdir -p /opt/backups/inmobiliaria'
```

Backup de base PostgreSQL:

```bash
ssh root@64.227.8.5 'cd /root/inmobiliaria-idea-estudio && docker compose exec -T db pg_dump -U inmobiliaria inmobiliaria > /opt/backups/inmobiliaria/db-$(date +%F).sql'
```

Backup de archivos subidos:

```bash
ssh root@64.227.8.5 'docker run --rm -v inmobiliaria-idea-estudio_backend_uploads:/data -v /opt/backups/inmobiliaria:/backup alpine tar czf /backup/uploads-$(date +%F).tar.gz -C /data .'
```

## Checks Rapidos

Desde tu computadora:

```bash
curl http://64.227.8.5/api/health
```

Desde el servidor:

```bash
ssh root@64.227.8.5 'cd /root/inmobiliaria-idea-estudio && docker compose ps'
```

Si la web no carga:

1. Revisar `docker compose ps`.
2. Revisar logs de `frontend` y `backend`.
3. Revisar firewall con `ufw status`.
4. Probar `curl http://127.0.0.1/api/health` desde el servidor.
