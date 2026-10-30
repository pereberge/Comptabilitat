# Una base de dades per empresa

El mode separat és opcional i es configura amb `COMPANY_DATABASES_ENABLED=true`. Per defecte continua desactivat: actualitzar el codi no trasllada dades ni canvia les connexions.

`DB_NAME` identifica la base central (per exemple, `contabilidad`). Manté usuaris, hashes de contrasenyes, sessions, permisos, IDs del catàleg d'empreses, autoritzacions de Gestió i el registre `company_databases`. Les dades de cada empresa van a `contabilidad_company_<id>`: perfil, logotip, exercicis, comptes, assentaments, factures, cartera, documents, granges, VeriFactu i configuració de còpies. Els IDs es conserven.

El backend comprova els permisos abans de buscar la connexió de l'empresa. El client no pot passar un nom de base de dades. Si falta una connexió, es retorna `COMPANY_DATABASE_NOT_CONFIGURED`; no es consulten les dades antigues de la central com a alternativa.

Les bases són esquemes separats en el mateix servidor MySQL/MariaDB. Utilitzen el compte SQL del backend. No són servidors independents ni credencials SQL diferents per empresa: això permet conservar els trasllats atòmics de documents entre esquemes. Els usuaris de l'aplicació continuen autenticant-se a la base central.

## Preparació al VPS

Fer una còpia completa de MySQL, de les còpies automàtiques i dels originals externs. Conservar el `.env` del servidor. Pujar el backend, `shared`, `database`, els scripts i el `package.json` actualitzats; el frontend es pot mantenir compilat a `/var/www/comptabilitat/frontend`.

Amb l'aplicació aturada i sense altres serveis escrivint a les mateixes taules:

```bash
cd /var/www/comptabilitat
pm2 stop comptabilitat
npm run db:migrate
npm run db:split-companies
```

L'última ordre només mostra el pla amb els IDs i els noms de les bases. No utilitzar `db:seed` sobre una base amb dades.

El compte SQL necessita permisos a la central i a les noves bases, inclosos CREATE, ALTER, INDEX, REFERENCES i TRIGGER. A MariaDB es pot autoritzar el patró de noms des d'un compte administrador (adaptar el nom de la central i l'usuari; no canvia la contrasenya):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, TRIGGER
ON `contabilidad\_company\_%`.* TO 'comptabilitat'@'localhost';
```

Els caràcters `_` literals del prefix estan escapats; `%` permet les bases d'empreses noves. Alternativament, concedir permisos a cadascun dels noms exactes que mostra el pla. Per MySQL amb `partial_revokes` activat, utilitzar permisos sobre noms exactes. La creació d'empreses des de la web també requereix permisos per crear el seu esquema.

## Copiar i activar

Mantenir aturades totes les escriptures fins a completar el canvi:

```bash
npm run db:split-companies -- --apply --writes-stopped > company-databases-manifest.jsonl
```

El procés crea les estructures a partir de la base actual, copia només les files de cada empresa i conserva els IDs, els binaris i els triggers. Compara recomptes i hashes SHA-256, verifica les claus foranes i només registra una base després de completar totes les verificacions. Els usuaris i les sessions no es dupliquen. Les claus foranes documentals que necessiten un usuari apunten a la identitat central.

Conservar el manifest fora de l'arrel pública de Nginx. Les còpies automàtiques i els originals externs mantenen els seus directoris i identificadors; aquesta eina copia dades SQL, no fitxers del sistema.

Si tot acaba correctament, afegir al `backend/.env` del VPS:

```dotenv
COMPANY_DATABASES_ENABLED=true
```

Mantenir `DB_NAME`, les credencials, `COMPANY_ID`, el port i les configuracions de Gestió. Iniciar i comprovar:

```bash
pm2 restart comptabilitat --update-env
curl --fail http://127.0.0.1:3010/api/health
```

Adaptar el port al `.env`. Entrar al programa, canviar entre empreses i comprovar comptes, exercicis, factures, documents, còpies i la integració Gestió. Nginx no necessita canvis.

## Errors i recuperació

La font no s'esborra. Les empreses ja verificades queden registrades i s'ometen en repetir l'ordre. Una base de destinació que existeix però no està registrada provoca `TARGET_DATABASE_ALREADY_EXISTS`: no s'esborra ni se sobreescriu automàticament. Cal revisar el manifest i l'error, i decidir què fer amb aquest esquema incomplet abans de repetir.

No modificar manualment `company_databases` per saltar les verificacions. Si falla l'alta d'una empresa nova durant el provisionament, el seu ID queda reservat a la central; recuperar-lo amb `db:split-companies` abans de tornar a donar-la d'alta.

Abans de reprendre l'activitat es pot tornar a `COMPANY_DATABASES_ENABLED=false` i reiniciar per seguir amb les dades originals. **Després de començar a escriure a les bases separades, desactivar el mode mostraria dades antigues:** qualsevol retorn exigeix reconciliar o restaurar les dades noves. No hi ha una sincronització inversa automàtica.

La central conserva les dades comptables originals com a còpia del moment del canvi. Ja no són la font operativa en mode separat. No s'eliminen automàticament; qualsevol depuració posterior requereix una còpia verificada i una operació específica.

## Funcionament posterior

Les altes d'empresa reserven l'ID central i provisionen la base pròpia abans de retornar l'empresa. Els canvis de perfil i logotip van a la seva base. La llista i els permisos continuen funcionant en una sola interfície.

Gestió resol la correspondència externa a la central i escriu la factura a la base de l'empresa autoritzada. Els registres d'accés de l'API queden a la central; els esdeveniments de la factura a la base de l'empresa.

Les còpies automàtiques recorren les bases registrades. Les exportacions i restauracions de dades es fan dins de la base seleccionada. Cal conservar també una còpia completa de la central, perquè les còpies per empresa no inclouen contrasenyes ni sessions. Els informes de patrimoni consulten les bases de les empreses incloses al mateix informe de sempre; cada empresa té la seva instantània, sense una instantània global entre connexions.

Els trasllats de documents es fan en una transacció entre esquemes del mateix servidor. Si el document conserva un ID que ja està ocupat a la destinació, l'operació falla i es reverteix, conservant l'original. Cal resoldre aquesta col·lisió abans de repetir el trasllat.

Per aplicar futures migracions a la central i a totes les bases registrades, aturar l'aplicació i executar:

```bash
npm run db:migrate-companies
```

Les migracions exclusives d'usuaris i del registre central s'ometen a les bases d'empresa. Quan s'afegeixin migracions d'aquest tipus, cal actualitzar la classificació de `backend/scripts/database.js`. Les dades de demostració no es carreguen a les bases separades.

## Verificació automatitzada

Les proves d'integració utilitzen exclusivament una base temporal anomenada `company_split_test`, amb l'esquema complet ja migrat i sense empreses. Activar amb `TEST_COMPANY_DATABASES=1` i configurar les variables DB_* cap al servidor de proves. Executar `node --test backend/test/company-databases-db.test.js`. Comproven còpia, hashes, IDs, binaris, triggers, permisos HTTP, escriptures aïllades, Gestió, documents, configuració de còpies i alta d'empreses. Requereixen una base temporal nova en cada execució.
