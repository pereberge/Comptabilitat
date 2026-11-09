# Validació local del mòdul de compres — 09/11/2026

Actualització posterior: la validació amb MySQL aïllat ja s’ha completat; vegeu [l’informe d’integració](validacio-mysql-compres-2026-11-09.md). Els pendents MySQL descrits aquí corresponen a l’estat anterior a aquella execució.

## Resultat

S’han superat 30 proves específiques de backend i càlcul compartit, la verificació de pantalla amb totes les APIs simulades i la compilació del frontend. El recompte correspon a proves diferents executades durant aquesta validació, no als reintents.

No s’ha consultat ni modificat MySQL, no s’han executat migracions i no s’ha connectat cap bústia. Aquest resultat no equival a una validació de producció.

## Cobertura

| Àmbit | Comprovació local |
| --- | --- |
| Comandes, albarans i factures | Circuit complet amb recepció i facturació parcials, vincles per línia, pendents i navegació, amb APIs simulades. |
| Imports | Base, IVA, descomptes, retencions, diferències d’un cèntim i acceptació explícita al servidor i a la pantalla. |
| OCR | PDF digital llegit directament; PNG i PDF escanejat reconeguts amb Tesseract i models instal·lats localment. Originals de prova sense modificar. |
| Correu | Entrada d’adjunts amb validació de fitxers, identitat estable, separació per empresa i permisos. OCR simulat en aquestes proves. |
| Permisos | Escriptura i confirmació separades; comptabilitzar una factura requereix també `accounting_write`. |
| Cancel·lació | Dependències actives bloquejades; cancel·lades no bloquegen; reintents i auditoria amb connexió simulada. |
| Interfície | Filtres, preferències locals, seleccions, resums, CSV generat i document imprimible. Diàlegs reals del sistema sense verificar. |

## Correcció feta durant la validació

El límit de les propostes de compra no coincidia amb el límit existent de la factura comptable. Ara la validació compartida, el servidor i la pantalla admeten **40 línies per factura** i **100 per comanda o albarà**. La selecció d’albarans avisa quan la proposta supera 40 línies. No s’ha ampliat el límit del mòdul comptable existent.

Fitxers ajustats: `shared/purchases.js`, `backend/src/services/purchases.js`, `frontend/src/components/PurchaseDocumentEditor.vue`, `frontend/src/views/PurchasesView.vue` i `frontend/src/services/purchases.js`. S’han ampliat `backend/test/purchases.test.js`, `scripts/verify-purchase-interface.mjs` i afegit `backend/test/purchase-permissions.test.js`.

## Proves executades

- `backend/test/purchases.test.js`: 4 proves, inclosos els límits exactes de línies.
- `backend/test/purchase-order-progress.test.js`: 3 proves.
- `backend/test/purchase-cancellation.test.js`: 9 proves.
- `backend/test/purchase-filters.test.js`: 2 proves.
- `backend/test/purchase-mail-intake.test.js`: 3 proves.
- `backend/test/purchase-amount-differences.test.js`: 5 proves.
- `backend/test/purchase-ocr.test.js`: 2 proves amb extracció i OCR locals.
- `backend/test/purchase-permissions.test.js`: 2 proves de permisos de rutes.
- `node scripts/verify-purchase-interface.mjs`: correcte, totes les APIs simulades; repetit després de la correcció del límit de línies.
- `npm.cmd run build`: correcte, amb l’avís existent de mida d’un paquet JavaScript.
- `git diff --check` dels fitxers canviats: correcte.

## Pendent abans de donar el mòdul per validat en un entorn real

1. Comprovar l’estat de les migracions 043–048 i executar les que pertoquin en un entorn de proves autoritzat. No s’ha comprovat el seu estat a MySQL durant aquesta fase.
2. Executar les proves MySQL de compres i OCR en una base de dades de proves: concurrència, no duplicació de quantitats, aïllament entre empreses, assentaments, cartera i còpies. Les proves amb connexions simulades no substitueixen aquestes comprovacions.
3. Provar documents reals representatius per comprovar la qualitat del reconeixement de cada format de proveïdor.
4. Si s’ha d’activar la recepció de correu, configurar el connector i comprovar l’encaminament a l’empresa correcta. L’entrada està preparada, però no hi ha cap bústia connectada ni lectura periòdica activa.
5. Comprovar la descàrrega i la impressió/PDF amb els diàlegs del navegador i del sistema de l’usuari.

Les proves amb MySQL no s’han executat perquè continua vigent la instrucció de no consultar les dades de la base de dades.
