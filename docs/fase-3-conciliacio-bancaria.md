# Ampliació de conciliació bancària

## Pla per fases

1. Identificació dels moviments importats: referències separades del CSV, codi bancari i propostes per referència. Implementat en aquesta fase.
2. Pagaments i cobraments parcials des de la conciliació: un moviment pot deixar saldo pendent i diversos moviments poden liquidar el mateix rebut. Implementat; verificació específica descrita més avall.
3. Repartiment explícit d'un moviment entre rebuts de factures diferents, amb quantitats per destinatari i suma exacta. Actualment només s'agrupen diversos rebuts de la mateixa factura amb el total exacte.
4. Importació Excel i selecció dels formats bancaris addicionals, reutilitzant la normalització de dates, imports i saldos, amb límits de mida i contingut.
5. Verificació dels solapaments entre extractes, historial de correccions i regressions de tot el flux amb empreses sintètiques.

## Funcions existents reutilitzades

- Subcomptes bancaris 572 per empresa, amb vinculació IBAN i comprovació d'empresa en cada petició.
- Importació PDF amb text i CSV, còpia de l'original i validació de la cadena de saldos.
- Reutilització del mateix fitxer dins de l'empresa i exercici; identificador idempotent per a les liquidacions.
- Propostes per import, data, referència dins del concepte i nom del tercer; elecció manual quan hi ha ambigüitat.
- Cobrament/pagament validat de rebuts de factures emeses o rebudes, amb assentament i vinculació al moviment en la mateixa transacció.
- Agrupació de diversos rebuts d'una mateixa factura quan la suma coincideix exactament amb el moviment.
- Comissions i altres moviments mitjançant subcompte i desglossament de contrapartides, amb validació abans de registrar.
- Arxiu d'extractes i conservació dels assentaments i vincles en les còpies de seguretat.

Aquest inventari es basa en el codi i la documentació existents. No implica que tots els requisits de l'ampliació estiguin acabats ni que s'hagin comprovat dades reals.

## Fase 1 implementada

El lector CSV admet columnes `Referencia`, `Ref.`, `Reference`, `Referencia operación`, `Referencia factura` i `Número factura`, així com codis de moviment bancaris. Conserva els zeros inicials i manté el concepte independent. Rebutja identificadors de més de 200 caràcters o amb controls.

La referència apareix al llistat i al diàleg de coincidències. Una referència explícita coincideix amb la de factura quan és igual després de normalitzar separadors, espais i majúscules; no s'accepta una referència més llarga només perquè contingui la curta. Es mantenen els filtres d'import exacte, sentit del moviment i moneda EUR. Les coincidències múltiples continuen marcades com ambigües. Buscar o suggerir no crea liquidacions ni marca factures com pagades.

Els extractes ja arxivats conserven el seu contingut; la millora s'aplica a les noves lectures. No s'ha modificat l'estructura de MySQL ni s'han consultat o modificat dades reals en aquesta fase.

## Fitxers modificats

- `backend/src/services/bank-statement.js`
- `backend/src/services/bank-invoice-matches.js`
- `frontend/src/components/ReconciliationMovementRow.vue`
- `frontend/src/components/ReconciliationMatches.vue`
- `backend/test/bank-statement.test.js`
- `backend/test/bank-analysis.test.js`
- Aquest informe.

## Verificació

30 proves específiques de lectura d'extractes i anàlisi superades: referències, zeros inicials, codis, ordre invers, dates, saldos, IBAN, imports exactes, sentit, divisa, ambigüitat i conservació dels moviments com a propostes. Compilació Vue correcta, amb l'avís preexistent de mida del paquet principal. La fase següent són les liquidacions parcials validades, amb proves en MySQL aïllat.

## Fase 2: liquidacions parcials validades

La cerca mostra també possibles rebuts amb pendent superior al moviment quan coincideix la referència o el nom del tercer. No es proposen parcials només per import, ni rebuts de sentit contrari, factures futures o rebuts inclosos en remeses. Les coincidències exactes mantenen prioritat. Triar un candidat obre la revisió; no el liquida automàticament.

El diàleg indica l'import del moviment i la resta pendent. En confirmar envia `partial_payment: true` i `expected_remaining_amount`. El servidor revalida el pendent dins de la transacció i pren l'import, el banc i la data de l'extracte. Rebutja canvis en el pendent, imports superiors, agrupacions parcials de diversos rebuts i reintents que alteren la confirmació. Les peticions antigues, sense confirmació parcial, continuen exigint coincidència exacta.

Exemple: rebut de 100 €, moviment de 40 € → rebut parcial amb 60 € pendents; un altre moviment de 60 € → rebut liquidat. Cada moviment manté el seu assentament i vincle. Un error desfà conjuntament liquidació, assentament i actualització de la conciliació. No s'han aplicat migracions ni s'han consultat o modificat dades reals en aquesta fase.

### Fitxers de la fase 2

- `backend/src/services/reconciliation-partials.js`
- `backend/src/services/reconciliation-matches.js`
- `backend/src/services/bank-reconciliations.js`
- `frontend/src/components/PortfolioActionDialog.vue`
- `frontend/src/components/ReconciliationMatches.vue`
- `frontend/src/components/ReconciliationMovementRow.vue` (accents de les referències)
- `frontend/src/locales/reconciliation-matches.js`
- `backend/test/reconciliation-partials.test.js`
- `backend/test/reconciliation-matches-db.test.js`
- `scripts/verify-reconciliation-partials.mjs`
- `scripts/verify-purchase-mysql.mjs` (opció `--bank-reconciliation` per reutilitzar l'entorn aïllat)
- Aquest informe.

### Verificació de la fase 2

- 32 proves de càlcul parcial, referències, importació i anàlisi superades.
- Navegador amb API simulada: pagaments i cobraments amb confirmació explícita, saldo pendent visible, banc i import protegits i empresa enviada a la petició.
- Compilació Vue correcta després de les correccions de textos.
- 17 proves MySQL aïllades superades: moviments 40 + 60 tant per a pagaments com per a cobraments, idempotència concurrent, pendent desactualitzat, reversió transaccional, controls d'empresa i compatibilitat amb el flux de diversos rebuts de la mateixa factura. Registre: `.local-backups/purchase-mysql-1794224543214-3eba52af/tests.log`.

La fase següent és repartir un moviment entre rebuts de factures diferents amb assignacions explícites.
