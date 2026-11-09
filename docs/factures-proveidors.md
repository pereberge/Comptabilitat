# Factures de proveïdors

La pantalla és a `/facturas-proveedores`, accessible des de les pestanyes de Factures. Comparteix empreses, exercicis, permisos, subcomptes, proveïdors i originals amb la resta de Comptabilitat.

## Flux

1. Importar un PDF manualment o prémer **Importar correus** en una bústia Gmail connectada. L’exercici seleccionat serveix per arxivar el document pendent; en validar es busca l’exercici corresponent a la data de factura.
2. Revisar el PDF al costat dels camps. Els documents pendents es presenten com a factures. **No és una factura** classifica directament, tant a la llista com al document, sense validar camps fiscals. Es pot revertir des de **No factures**.
3. **Guardar dades** conserva un esborrany incomplet. No crea proveïdors, recepcions, rebuts ni assentaments. Els números de factura són text; no es converteixen a números ni s’eliminen guions o barres.
4. **Validar i rebre** comprova el contracte fiscal existent, les dates i la igualtat exacta `total = bases + impostos − retencions`. Si el concepte és buit, la recepció utilitza el número de factura; si està informat, el conserva. Registra qui ha validat i quan, i deixa la recepció pendent de comptabilitzar.
5. **Preparar comptabilització** obre el formulari comptable existent. Reutilitza proveïdors i preferències de comptes de despesa. Un assentament coincident exigeix seleccionar-lo i es vincula després de comprovar-ne els apunts exactes. Un duplicat fiscal bloqueja una nova comptabilització.

La validació i la recepció interna són una sola transacció; no hi ha un enviament HTTP de Comptabilitat a ella mateixa. Els reintents conserven la mateixa recepció. Un document validat queda protegit contra canvis de dades i reclassificacions. Les recepcions es poden consultar també a la safata d’integracions existent.

## Lectura local i formats

El lector PDF s’executa en un worker amb límits de memòria i temps. Extreu text natiu amb PDF.js i aplica les regles adaptades d’App Cooperativa. No utilitza IA ni OCR. No dedueix camps absents, imports, divises o identitats ambigus. Els PDFs sense text es conserven per introduir les dades manualment; els documents corruptes, protegits o de més de 40 pàgines poden donar un error d’importació. El límit per PDF és de 10 MiB.

**Recordar aquest format del proveïdor** desa la identitat estable i les regles que es poden associar al text revisat. La configuració s’identifica per empresa i NIF. Cada document posterior aporta els seus números, dates, bases i quotes; aquests valors no es copien de l’exemple. Si no es pot recordar un format, l’esborrany igualment es desa i mostra un avís.

El codi d’extracció amb IA d’origen es conserva, sense executar, a `docs/reference/supplier-invoices-ai.source.txt`. Reactivar-lo requereix una decisió explícita i adaptar el seu adaptador de persistència a aquest model. Cap variable activa automàticament trucades a IA.

## Configurar Gmail

Variables del backend:

| Variable | Ús |
| --- | --- |
| `GMAIL_CLIENT_ID` | Client OAuth web de Google |
| `GMAIL_CLIENT_SECRET` | Secret OAuth, només al servidor |
| `GMAIL_ENCRYPTION_KEY` | Clau persistent de 32 bytes, en hexadecimal o Base64 |
| `GMAIL_REDIRECT_URI` | URL pública exacta de la pantalla nova |

En desenvolupament, l’URL habitual d’aquest projecte és `http://127.0.0.1:5180/facturas-proveedores`. En producció, utilitza `https://<domini>/facturas-proveedores`. Registra exactament aquesta URL com a URI de redirecció autoritzada del client OAuth i habilita l’API Gmail. Configura la pantalla de consentiment i els usuaris autoritzats del projecte de Google segons el seu estat de publicació.

Les tres variables de credencials ja existien al `.env` local en aquesta integració; no s’han mostrat ni s’han traslladat autoritzacions, bústies o documents reals de l’altre projecte. Falta definir `GMAIL_REDIRECT_URI` a l’entorn local i reiniciar el backend.

Després:

1. Seleccionar l’empresa correcta.
2. Afegir el correu i la data inicial. Tornar a guardar el mateix correu permet canviar aquesta data.
3. Prémer **Connectar Gmail** i autoritzar el compte indicat. L’abast és `gmail.readonly`.
4. Prémer **Importar correus**. La sincronització és manual; no hi ha un servei periòdic activat.

OAuth utilitza estat temporal d’un sol ús vinculat a empresa i usuari, i PKCE. Els refresh tokens es xifren amb AES-GCM i es vinculen a empresa i bústia. No es retornen a la interfície. Cal conservar la clau; si es perd, cal tornar a autoritzar les bústies. L’estat OAuth caduca als 10 minuts i també es perd en reiniciar el procés.

Cada bústia té una exclusió temporal de sincronització i una espera després dels errors de Google. El registre `gmail_imports` existent evita tornar a processar el mateix adjunt; la petjada SHA-256 evita duplicar el PDF encara que arribi per una altra via. Els errors es consulten a la pantalla i els adjunts fallits es poden reintentar en sincronitzacions posteriors. No es marca ni es modifica cap correu.

## Dades, permisos i límits comptables

- La migració `038_supplier_invoice_inbox.sql` afegeix camps i taules; conserva els originals i els registres previs. S’ha aplicat a la base central i a les bases d’empresa registrades de l’entorn local.
- Es reutilitza `invoice_documents` per conservar els PDFs i `integration_received_invoices` per a la recepció fiscal. Els originals s’enllacen a `trade_invoices` en comptabilitzar i continuen disponibles al circuit de PDF habitual.
- Les consultes passen pel context d’empresa existent, inclosa la selecció de base física. Les modificacions requereixen `accounting_write`; les consultes segueixen el permís de lectura vigent de Comptabilitat.
- `supplier_invoice_revisions` conserva accions, usuari, versions desades i dades validades. Les còpies comptables inclouen esborranys, originals, recepcions, historial i formats, amb remapatge dels enllaços en restaurar. Les credencials i les autoritzacions Gmail no formen part d’aquestes còpies comptables.
- Els abonaments i les rectificatives es poden introduir, desar, validar i rebre amb imports signats i referència a la factura original. El motor comptable existent encara bloqueja la seva comptabilització automàtica, igual que les divises diferents d’EUR, la inversió del subjecte passiu i determinats desglossaments de retencions o arrodoniments. Es conserven com a recepcions amb incidències; no es converteixen en factures ordinàries.
- Els PDFs amb diverses factures o textos ambigus requereixen separar o revisar manualment les dades; no s’ha afegit separació automàtica de documents ni OCR.

## Verificació

S’han adaptat les proves d’extracció local i formats del projecte d’origen i afegit proves del servei, Gmail simulat i MySQL: desament incomplet, classificació, aïllament per empresa, original exacte, concurrència i reintents, duplicats fiscals, vinculació d’un assentament existent i restauració de còpies. `frontend/test/supplier-invoices-ui.mjs` comprova el desament, la classificació reversible, el visor i l’amplada mòbil en un navegador amb dades sintètiques.

La suite completa amb MySQL ha executat 549 proves: 538 correctes, 7 omeses i dues fallades de casos de prova (4 errors comptant els seus pares): `account-parties.test.js` i `reconciliation-proposals-db.test.js`. Les mateixes fallades s’han reproduït amb una còpia del codi anterior (`HEAD`); no s’han canviat aquests comportaments dins d’aquesta integració. Les proves afegides després d’aquesta execució s’han executat separadament.

La verificació focalitzada final inclou 40 proves correctes, la compilació del frontend i les dues proves de navegador (safata nova i integracions existents). També s’ha corregit al formulari compartit una pèrdua prèvia del NIF validat en seleccionar un subcompte que no tenia identitat fiscal desada.
