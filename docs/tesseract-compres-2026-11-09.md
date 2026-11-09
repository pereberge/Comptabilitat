# Lectura de factures amb Tesseract

La càrrega de Compres inclou «Llegir també amb Tesseract OCR», activat per defecte. Renderitza totes les pàgines del PDF i les llegeix amb els models locals de català, castellà i anglès. Si es desmarca, continua la lectura automàtica anterior: text digital quan existeix i OCR per a escanejos.

Quan hi ha text digital, es comparen les dues extraccions i es prioritza la que verifica els totals i reconeix més camps. No es barregen bases i quotes de lectures diferents. Una discrepància en la referència genera un avís. L'editor indica que s'ha executat Tesseract i si els camps provenen del text contrastat.

La petició envia `X-Ocr-Mode: tesseract` o `auto`. El treball pendent desa el mode al camp `engine` existent, de manera que sobreviu a reintents i reinicis. No cal cap migració.

Tornar a pujar el mateix original reutilitza el treball i la proposta. El reconeixement només actualitza l'extracció d'un esborrany; conserva les línies i les correccions desades. No reprocessa propostes confirmades o cancel·lades, ni comptabilitza factures.

## Comprovacions

- Proves de lector: text digital, Tesseract explícit sobre PDF digital, imatge PNG i PDF escanejat.
- Regressions O2 i altres proveïdors; validació del mode i permisos de l'endpoint.
- Interfície amb API simulada: casella activada, mode conservat en reintentar, opció automàtica i fluxos existents.
- Compilació de Vue correcta; avís preexistent de mida del paquet principal.
- MySQL nou i aïllat: 8 proves superades, inclosa la relectura amb Tesseract després d'una correcció manual, sense duplicar originals ni propostes. Registre a `.local-backups/purchase-mysql-1794220762660-79fe79d9/tests.log`.
- PDF O2 aportat: Tesseract executat sobre les dues pàgines, confiança 86, totals verificats amb el text digital. Mateix esborrany i correccions conservades; còpia prèvia a `.local-backups/tesseract-read-1794220956954`.

## Fitxers modificats

- `backend/src/services/purchase-document-reader.js`
- `backend/src/services/purchase-document-worker.js`
- `backend/src/services/purchase-ocr.js`
- `backend/src/routes/purchases.js`
- `frontend/src/services/purchases.js`
- `frontend/src/components/PurchaseUpload.vue`
- `frontend/src/components/PurchaseDocumentEditor.vue`
- `backend/test/purchase-ocr.test.js`
- `backend/test/purchase-ocr-db.test.js`
- `backend/test/purchase-permissions.test.js`
- `scripts/verify-purchase-interface.mjs`
- Aquest informe.

Cal revisar les dades reconegudes abans de confirmar; l'OCR pot confondre caràcters i no garanteix la identificació de tots els formats de factura.

## Correcció del mode de desenvolupament de Node

S'ha reproduït una fallada específica de `node --watch`: Node envia notificacions internes de dependències pel canal de missatges del worker. El lector les interpretava com el resultat final i retornava `undefined` abans d'acabar la lectura, fet que provocava `PURCHASE_OCR_FAILED` al servei.

Els missatges de resultat i d'error ara porten el discriminador `type: purchase-document-result`. El lector ignora qualsevol altra notificació i conserva el timeout i el tractament d'errors. Els errors inesperats del worker queden registrats al servidor; la resposta pública continua sense exposar detalls interns.

La regressió de `backend/test/purchase-watch.test.js`, amb `backend/test-support/purchase-watch-reader.mjs`, executa el mateix `node --watch` del servidor tant amb text digital com amb Tesseract forçat. També s'ha comprovat el PDF de tres pàgines aportat: lectura Tesseract correcta amb totals verificats. S'ha recuperat el treball fallit existent sense comptabilitzar la factura.

Fitxers d'aquesta correcció: el lector, el worker, la nova prova, el seu suport i aquest informe.
