# Tresoreria: pla i primera fase

## Pla

1. Previsió de lectura a 30, 60 i 90 dies a partir de saldos comptables bancaris, moviments futurs registrats i pendents de Cartera. Implementada en aquesta fase.
2. Assignació dels venciments a comptes bancaris i registre de cobraments/pagaments previstos sense factura, amb vincles per substituir-los quan es rebi la factura. Implementada i activada. Els saldos inicials continuen provenint dels assentaments d'obertura existents.
3. Dates previstes independents dels venciments, escenaris i necessitat de liquiditat per compte.
4. Conservar versions de les previsions i comparar-les amb cobraments/pagaments reals, mantenint la traçabilitat dels canvis.
5. Validació integrada amb empreses sintètiques, casos de substitució de previsions per factures i moviments conciliats.

## Primera fase

A **Cartera**, el botó **Previsió de tresoreria · 30 / 60 / 90 dies** obre una previsió de l'empresa seleccionada. Cal seleccionar l'exercici que conté la data d'avui. És una previsió de l'estat actual; no és una reconstrucció històrica d'un exercici anterior.

La pantalla mostra:

- Saldo comptable inicial dels subcomptes bancaris 572: assentaments publicats de l'exercici fins avui, incloses obertures i exclosos tancaments.
- Cobraments i pagaments pendents de Cartera, només per l'import que queda per liquidar.
- Moviments futurs ja registrats al diari fins a 90 dies, inclosos els d'altres exercicis quan el termini travessa el canvi d'any, sense sumar noves obertures ni tancaments.
- Saldo previst de l'empresa i màxim dèficit al tancament de cada dia, amb la primera data negativa. Un saldo final positiu no amaga una necessitat intermèdia de liquiditat.
- Saldos per compte incorporant només els moviments futurs que ja tenen banc conegut.

Els venciments d'avui o anteriors es projecten per demà i la pantalla demana revisar-los. Aquesta fase encara no assigna un banc arbitrari als rebuts: els inclou en el total de l'empresa i indica clarament que no estan inclosos en el detall per compte. Les dates són estimacions segons venciment, no una confirmació que el tercer pagarà.

## Evitar duplicats

No es crea cap assentament ni liquidació: només es consulta una instantània consistent de MySQL amb transacció de lectura. Els moviments conciliats s'utilitzen a través del seu assentament, sense afegir de nou les files de l'extracte.

Els pendents resten les liquidacions existents. Si un pagament està registrat amb data futura, el seu efecte s'inclou com a moviment futur del banc i només el pendent restant apareix com a venciment. Cada rebut s'identifica pel seu ID i cada línia comptable per assentament i posició. Els traspassos entre bancs canvien cada compte però no el total de l'empresa.

Un moviment manual sense vincle amb un rebut no permet deduir automàticament si és el pagament d'una factura. La pantalla adverteix quan hi ha moviments futurs d'aquest tipus: cal validar-ne la relació abans de donar per definitiva la previsió. No es marca cap factura com pagada basant-se només en semblances d'import.

## Fitxers modificats

- `shared/treasury-forecast.js`
- `backend/src/services/treasury-forecast.js`
- `backend/src/services/portfolio.js`
- `backend/src/routes/api.js`
- `frontend/src/components/TreasuryForecast.vue`
- `frontend/src/views/PortfolioView.vue`
- `backend/test/treasury-forecast.test.js`
- `scripts/verify-treasury-forecast.mjs`
- Aquest informe.

## Verificació

- 6 proves de càlcul i accés: pendent parcial, pagament futur comptat una vegada, dèficit intermedi, límits 30/60/90, traspassos, imports negatius i control de sessió/empresa/exercici.
- Prova de navegador amb API simulada: horitzons, liquiditat, avisos de banc no assignat i moviments sense vincle, empresa enviada a la petició i error d'exercici incorrecte.
- Compilació Vue correcta, amb l'avís preexistent de mida del paquet principal.

Les consultes SQL i els controls HTTP s'han verificat amb dobles de prova; no s'han executat contra MySQL real ni s'ha fet una validació d'integració amb MySQL en aquesta fase. No s'han modificat dades reals ni estructures de base de dades.

La fase següent són les assignacions de banc i les previsions sense factura, amb migracions controlades i proves en MySQL aïllat.

## Segona fase: bancs i previsions sense factura

### Funcionament

La mateixa pantalla incorpora **Banc previst dels venciments**, **Nova previsió sense factura** i el llistat de previsions. Els permisos d'escriptura són els mateixos d'edició comptable; els usuaris de només lectura conserven la consulta dels saldos.

- **Guardar banc** desa una assignació per rebut i empresa. No modifica el venciment, el saldo pendent ni els assentaments. Es pot deixar sense assignar. Els rebuts de remeses preparades es revisen des de Remeses i no admeten aquesta assignació mentre hi estiguin inclosos; la previsió no els atribueix un banc arbitràriament.
- Una previsió manual conté sentit (cobrament/pagament), concepte, data, import positiu i banc opcional. **Editar previsió** només canvia aquestes dades de planificació.
- **Substituir pel rebut** requereix un rebut de la mateixa empresa, sentit i import original. Si està parcialment liquidat, només es projecta el pendent restant. Cada rebut pot substituir una sola previsió; si una factura té diversos rebuts, s'enllaça l'import corresponent a cadascun.
- Substituir una previsió no modifica l'assignació bancària ni les dates del rebut. La previsió queda fora del càlcul i conserva el vincle i l'historial.
- **Retirar previsió** o **Retirar vincle de la previsió** conserva el registre amb estat retirat, sense tornar-lo a sumar. No anul·la cap factura, rebut ni pagament. Si un moviment sense factura ja s'ha registrat al diari, cal retirar la previsió per no preveure'l de nou.
- **Mostrar previsions retirades** permet consultar aquests registres. L'auditoria desa l'abans i el després de les operacions.

Els saldos per compte inclouen ara els moviments futurs registrats, els venciments assignats i les previsions manuals assignades. Els imports sense banc continuen figurant només en el total de l'empresa, amb un avís explícit.

### Integritat i compatibilitat

Les escriptures utilitzen transacció, bloqueig d'empresa, control de versió i identificador idempotent de petició. Els reintents no creen una altra previsió; si falla el registre de l'auditoria es desfà tota l'operació. Un error en refrescar les dades després de guardar bloqueja noves escriptures fins a actualitzar-les.

La migració `049_treasury_planning.sql` crea només `treasury_receipt_accounts` i `treasury_plans`, amb claus d'empresa i referències controlades a bancs i rebuts. Les còpies de seguretat inclouen ambdues taules i remapen els IDs de banc, rebut, previsió i auditoria en restaurar-les. Es mantenen compatibles els arxius antics sense aquestes taules.

Es bloqueja l'eliminació d'una factura o la substitució d'un exercici que encara té vincles de previsió o rebuts amb banc previst. Cal retirar el vincle i deixar els rebuts sense banc abans de continuar, per no perdre silenciosament informació de planificació.

### Verificació i activació

- 13 proves de càlcul, accés i format de còpia superades.
- 8 proves amb un MySQL nou i aïllat superades: assignació, versions, idempotència, parcial de 40 € + pendent de 60 €, substitució de previsió, import/sentit/empresa, reversió per error d'auditoria, permisos, restauració i dependències de supressió. La restauració utilitza una empresa de prova amb identitat coincident, respectant el control existent de còpies.
- Proves de navegador amb totes les API simulades: alta i edició, assignació, resposta perduda i reintent amb el mateix identificador, error de refresc, substitució per rebut, retirada i consulta sense permisos d'edició. També s'ha verificat la pantalla de previsió anterior.
- Compilació Vue correcta, amb l'avís preexistent de mida del paquet principal.
- Informe MySQL aïllat: `.local-backups/purchase-mysql-1794227270933-1c801c9a/report.json`; servidor de proves aturat i port tancat.
- Migració aplicada a la base real després de les proves, amb verificació de les dues taules. Còpia d'estructura anterior i informe a `.local-backups/treasury-activation-1794227521104/`. No s'han creat previsions d'exemple ni alterat factures, assentaments o rebuts reals.

### Fitxers de la segona fase

- `database/migrations/049_treasury_planning.sql`
- `shared/treasury-forecast.js`
- `backend/src/services/treasury-planning.js`
- `backend/src/services/treasury-backup.js`
- `backend/src/services/treasury-forecast.js`
- `backend/src/services/backup-format.js`
- `backend/src/services/data-backup.js`
- `backend/src/services/invoice-deletion.js`
- `backend/src/services/exercise-clear.js`
- `backend/src/middleware/company-scope.js`
- `backend/src/routes/api.js`
- `frontend/src/components/TreasuryPlanning.vue`
- `frontend/src/components/TreasuryForecast.vue`
- `frontend/src/locales/treasury.js`
- `backend/test/treasury-forecast.test.js`
- `backend/test/treasury-planning-db.test.js`
- `backend/test/backup-format.test.js`
- `scripts/verify-treasury-planning.mjs`
- `scripts/verify-purchase-mysql.mjs`
- `scripts/activate-treasury.mjs`
- Aquest informe.

La fase següent són les dates previstes dels rebuts independents del venciment i els escenaris; la comparació entre previsió i realitat queda per a la fase posterior.
