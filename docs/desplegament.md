# Desplegament al VPS Arsys

**Configuració escollida: PM2 amb el codi a `/var/www/comptabilitat`. Seguir [la guia PM2 i Nginx](desplegament-pm2.md).** La resta d'aquest document descriu l'alternativa amb servei systemd directe.

Domini: https://comptabilitat.coopbellcaire.com. Configuració per Debian/Ubuntu amb Nginx i systemd; executar les ordres administratives amb sudo. El codi ha d'estar a `/opt/comptabilitat`, incloses les modificacions locals que es volen publicar. No pujar `node_modules`, `backend/.env`, `.git`, còpies ni certificats locals. No publicar el directori del projecte com a arrel de Nginx.

## 1. Aplicació i dades

Instal·lar Node.js 24, npm i MySQL 8.4. Comprovar `node --version` i `command -v node`: el servei assumeix `/usr/bin/node`; ajustar `ExecStart` si cal. Un allotjament estàtic no és suficient.

```bash
sudo useradd --system --home-dir /opt/comptabilitat --shell /usr/sbin/nologin comptabilitat
cd /opt/comptabilitat
npm ci
npm run build
sudo cp deploy/production.env.example backend/.env
sudo chown comptabilitat:comptabilitat backend/.env
sudo chmod 600 backend/.env
sudo nano backend/.env
```

Configurar la contrasenya i la connexió de MySQL. El compte del servei ha de poder llegir el codi i travessar `/opt/comptabilitat`; no necessita poder modificar-lo. `backend/.env` conté secrets i no s'ha de versionar. `INTEGRATION_TRUSTED_PROXIES=127.0.0.1/32` permet que Express reconegui HTTPS i emeti la cookie Secure darrere del Nginx local. Mantenir `HOST=127.0.0.1`.

Si es traslladen les dades locals, exportar la base completa amb `mysqldump --single-transaction --routines --triggers --hex-blob` i importar-la al MySQL del VPS abans de les migracions. El dump inclou dades sensibles: transferir-lo per SSH i guardar-lo fora de l'arrel web. Fer l'exportació final sense escriptures concurrents. No executar la llavor demo sobre una base restaurada. Per a una base nova, seguir la creació de base i permisos del README i executar també `npm run db:seed`.

```bash
sudo -u comptabilitat npm run db:migrate
sudo cp deploy/comptabilitat.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now comptabilitat
curl --fail http://127.0.0.1:3000/api/health
```

Per generar PDF de factures cal instal·lar Chrome o Chromium amb les seves dependències al VPS i configurar `INVOICE_PDF_BROWSER_PATH` si escau. Comprovar la generació des de la web amb el servei en execució. Les còpies automàtiques s'emmagatzemen a `/var/lib/comptabilitat/backups`; fer-ne també còpies fora del VPS. Els certificats VeriFactu s'han de transferir separadament amb permisos restringits si es fan servir.

## 2. Nginx i certificat

El DNS A ha d'apuntar a la IPv4 del VPS; si hi ha AAAA, també ha d'arribar al mateix servei per IPv6 (aquest exemple escolta IPv4; afegir `listen [::]:80` i `listen [::]:443 ssl` si es fa servir IPv6). Permetre els ports 80 i 443 al tallafoc d'Arsys i al sistema. Mantenir accessibles SSH i tancats externament 3000 i 3306.

```bash
sudo apt update
sudo apt install nginx certbot apache2-utils
sudo mkdir -p /var/www/letsencrypt
cd /opt/comptabilitat
sudo cp deploy/nginx-bootstrap.conf /etc/nginx/sites-available/comptabilitat
sudo ln -s /etc/nginx/sites-available/comptabilitat /etc/nginx/sites-enabled/comptabilitat
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d comptabilitat.coopbellcaire.com
```

Si l'enllaç ja existeix, ometre `ln -s`. No eliminar la configuració d'altres webs. Primer s'activa una configuració HTTP que només serveix el repte del certificat; la web encara retorna 503.

L'usuari ordinari de l'aplicació té accés sense contrasenya. La protecció HTTP següent és necessària per restringir l'accés públic tant a la interfície com a les dades. És independent de la contrasenya de màster de l'aplicació.

```bash
sudo htpasswd -c /etc/nginx/comptabilitat.htpasswd comptabilitat
sudo chown root:www-data /etc/nginx/comptabilitat.htpasswd
sudo chmod 640 /etc/nginx/comptabilitat.htpasswd
sudo cp deploy/nginx.conf /etc/nginx/sites-available/comptabilitat
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

`htpasswd` demana la contrasenya interactivament. Per afegir usuaris, repetir sense `-c` perquè no sobreescrigui el fitxer. Comprovar que el procés Nginx utilitza el grup `www-data`; adaptar-lo si la distribució en fa servir un altre.

Assegurar que Nginx recarrega els certificats renovats: crear `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx` amb el contingut següent i donar-li permís d'execució (`sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx`). Comprovar també el temporitzador de renovació amb `systemctl list-timers`.

```sh
#!/bin/sh
set -eu
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx
```

La ruta `/api/v1/integrations/` utilitza el seu propi Bearer token i no demana la contrasenya HTTP. Amb `INTEGRATION_CLIENTS_JSON=[]` queda desactivada. Si s'activa, configurar només hashes de tokens segons `docs/integracio-gestio.md`.

## 3. Verificació i actualitzacions

```bash
curl -I http://comptabilitat.coopbellcaire.com
curl -I https://comptabilitat.coopbellcaire.com
curl -u comptabilitat --fail https://comptabilitat.coopbellcaire.com/api/health
sudo systemctl status comptabilitat --no-pager
sudo journalctl -u comptabilitat -n 50 --no-pager
```

Esperat: HTTP redirigeix a HTTPS, HTTPS sense credencials retorna 401, i health autenticat retorna 200 amb MySQL disponible. Entrar amb el navegador, configurar el màster si encara no té contrasenya, comprovar les empreses i exercicis, carregar una ruta interna directament, generar un PDF i descarregar una còpia. Comprovar que la cookie `accounting_session` té `Secure` i `HttpOnly`.

Per actualitzar: fer una còpia completa de MySQL i dels fitxers persistents, aturar `comptabilitat`, pujar el codi preservant `backend/.env`, executar `npm ci`, `npm run build` i les migracions com l'usuari del servei, iniciar-lo i repetir health. No restaurar només el codi després d'una migració incompatible: cal una restauració coherent de base i fitxers.

Referències Nginx: [proxy HTTP](https://nginx.org/en/docs/http/ngx_http_proxy_module.html) i [autenticació HTTP](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html).
