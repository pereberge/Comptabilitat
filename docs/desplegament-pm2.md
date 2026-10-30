# VPS Arsys: PM2 i Nginx

Codi a `/var/www/comptabilitat`. Ordres per Debian/Ubuntu amb Node.js 24 i MySQL ja configurats. Executar PM2 sempre amb el mateix usuari de desplegament, preferiblement sense privilegis root; ha de poder llegir el codi i `backend/.env` i escriure als directoris de còpies i temporals PDF.

## Arrencar l'aplicació

Si abans s'havia activat el servei `comptabilitat.service`, aturar-lo i desactivar-lo amb `sudo systemctl disable --now comptabilitat`. No executar-lo alhora que PM2.

```bash
cd /var/www/comptabilitat
npm ci
npm run build
npm run db:migrate
# Només si PM2 encara no està instal·lat:
npm install -g pm2
```

Conservar les credencials MySQL i `INTEGRATION_CLIENTS_JSON` reals de `backend/.env`. Assegurar aquests valors:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
INTEGRATION_TRUSTED_PROXIES=127.0.0.1/32
BACKUP_DIRECTORY=/var/lib/comptabilitat/backups
INVOICE_PDF_TEMP_DIR=/var/lib/comptabilitat/pdf
```

Preparar els directoris com l'usuari que executarà PM2:

```bash
sudo install -d -m 700 -o "$(id -un)" -g "$(id -gn)" /var/lib/comptabilitat/backups /var/lib/comptabilitat/pdf
chmod 600 backend/.env
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

Executar l'ordre amb sudo que imprimeix `pm2 startup` per habilitar l'arrencada després d'un reinici. El backend carrega `backend/.env` i serveix `frontend/dist`; només cal un procés. Es manté una instància per no duplicar la programació de còpies automàtiques.

```bash
pm2 status
pm2 logs comptabilitat --lines 30 --nostream
curl --fail http://127.0.0.1:3000/api/health
```

## Activar Nginx i HTTPS

El DNS ha d'apuntar al VPS. Obrir 80 i 443 al tallafoc i mantenir 3000 i MySQL sense accés públic. Si hi ha registre AAAA, configurar també els listeners IPv6 a tots dos fitxers Nginx o corregir el DNS.

```bash
sudo apt update
sudo apt install nginx certbot apache2-utils
sudo mkdir -p /var/www/letsencrypt
cd /var/www/comptabilitat
sudo cp deploy/nginx-bootstrap.conf /etc/nginx/sites-available/comptabilitat
sudo ln -s /etc/nginx/sites-available/comptabilitat /etc/nginx/sites-enabled/comptabilitat
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d comptabilitat.coopbellcaire.com
```

Ometre `ln -s` si l'enllaç ja existeix. No modificar altres webs del VPS. Aquest primer fitxer només serveix el repte del certificat; l'aplicació encara no és pública.

L'aplicació permet entrar com a usuari ordinari sense contrasenya. Nginx protegeix la interfície i l'API ordinària amb una contrasenya addicional. La integració Gestió conserva l'autenticació Bearer pròpia.

```bash
sudo htpasswd -c /etc/nginx/comptabilitat.htpasswd comptabilitat
sudo chown root:www-data /etc/nginx/comptabilitat.htpasswd
sudo chmod 640 /etc/nginx/comptabilitat.htpasswd
sudo cp deploy/nginx.conf /etc/nginx/sites-available/comptabilitat
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

`htpasswd` demana la contrasenya. Si el fitxer ja conté usuaris, ometre `-c` per conservar-los. El grup `www-data` ha de correspondre al procés Nginx.

Crear `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` amb aquest contingut i fer-lo executable amb `sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx`:

```sh
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
```

Comprovar que existeix el temporitzador de renovació amb `systemctl list-timers`.

## Comprovacions i actualitzacions

```bash
curl -I http://comptabilitat.coopbellcaire.com
curl -I https://comptabilitat.coopbellcaire.com
curl -u comptabilitat --fail https://comptabilitat.coopbellcaire.com/api/health
```

Esperat: redirecció a HTTPS, 401 sense contrasenya i 200 al health autenticat. Entrar des del navegador i comprovar les empreses, una ruta interna, una còpia i la generació PDF (requereix Chrome/Chromium instal·lat i la ruta configurada si cal). Comprovar que la cookie de sessió és Secure. Nginx fa proxy a `127.0.0.1:3000`; no exposa el directori del codi.

Per actualitzar, fer còpia de la base i fitxers persistents, executar `pm2 stop comptabilitat`, pujar el codi preservant `.env`, executar `npm ci`, `npm run build`, `npm run db:migrate` i `pm2 restart comptabilitat`. Verificar health. Guardar còpies també fora del VPS.

Referències: [PM2 ecosystem](https://pm2.keymetrics.io/docs/usage/application-declaration/), [arrencada persistent](https://pm2.keymetrics.io/docs/usage/startup/).
