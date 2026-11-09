# Fase 2 aprovada: compres i OCR local

L'aprovació de la Fase 1 autoritza aquesta implementació. No s'implementen encara fabricació, previsió de tresoreria, quadre de comandament ni recepció automàtica de correu.

## Migracions

La validació local i les comprovacions reals pendents estan recollides a [l’informe del 09/11/2026](validacio-compres-2026-11-09.md).

La validació posterior en un MySQL nou i aïllat ha superat les vuit proves d’integració, inclosa la concurrència: [resultat final](validacio-mysql-compres-2026-11-09.md). No s’han aplicat migracions a la base real.

Actualització posterior: amb autorització explícita, les migracions 043–048 ja s’han aplicat a la base real; vegeu [l’informe d’activació](activacio-compres-2026-11-09.md).

- 043: auditoria immutable de gestió i identificadors idempotents de les peticions.
- 044: unitats, articles per empresa i referències d'article de proveïdor.
- 045: comandes i línies; terminis, confirmació i estat de recepció calculat.
- 046: albarans i línies, amb repartiment de quantitats entre línies de comanda.
- 047: propostes comercials de factura i línies, vincles parcials amb albarans/comandes i connexió amb la factura comptable existent.
- 048: treballs d'extracció, original, motor, idioma, confiança, resultat i errors.

Les migracions creen taules noves: no transformen factures anteriors. Totes les relacions comercials utilitzen claus compostes per empresa. Els clients i proveïdors continuen sent subcomptes amb perfil fiscal. Es mantenen l'assentament, la cartera i els models fiscals actuals.

## Fitxers

Serveis nous de compres, càlculs compartits, rutes i pantalla de compres amb editor de documents. Lector local Tesseract (WASM), idiomes instal·lats localment i renderització dels PDF escanejats. S'amplien permisos, menú, còpies i proves. La confirmació comptable reutilitza `createInvoiceService` dins la mateixa transacció; un esborrany no és una factura definitiva.

## Seguretat i reversió

### Comparació amb els imports del document

Les propostes OCR comparen la base imposable, la quota d’IVA i el total reconeguts amb els imports de les línies comercials. La comparació utilitza aritmètica decimal exacta, els descomptes de cada línia i la retenció seleccionada; una diferència d’un cèntim també es mostra. La diferència indicada és «calculat menys reconegut».

Els imports absents, invàlids, en una moneda diferent d’EUR o impossibles de calcular amb les dades disponibles queden pendents de revisió. Les factures manuals sense extracció no generen avisos d’imports originals inexistents.

La confirmació torna a calcular les diferències al servidor amb la retenció enviada i exigeix `accept_differences: true` quan n’hi ha. Canviar la retenció a la pantalla anul·la l’acceptació anterior. Aquesta validació no confirma cap factura automàticament i no requereix cap migració.

### Entrada preparada per a adjunts de correu

`POST /api/purchases/email/attachments` accepta un únic adjunt binari PDF, JPG o PNG de fins a 10 MB. Requereix sessió autenticada, accés a l’empresa seleccionada i permisos `purchases_read` i `purchases_write`, igual que la càrrega manual. El cos no pot seleccionar una altra empresa.

El connector futur haurà d’enviar `X-Mailbox-Id`, `X-Message-Id`, `X-Attachment-Id` i `X-File-Name` (codificats amb percent-encoding quan calgui), i un `Content-Type` admès. Els tres identificadors han de ser estables entre reintents; canviar només el nom del fitxer no crea una entrada nova. El servei genera l’identificador de petició per empresa, bústia, missatge i adjunt. El circuit OCR existent controla els duplicats de contingut i rebutja canvis de contingut sota la mateixa identitat.

La resposta `202` identifica el treball OCR i inclou `intake_channel: "email"`. La proposta resultant continua pendent de revisió: aquest endpoint no confirma ni comptabilitza factures. La identificació de l’empresa prové exclusivament del middleware autenticat, no del remitent del correu.

Aquesta preparació no connecta a cap bústia, no llegeix missatges ni activa cap tasca periòdica. El connector de correu i l’arxiu de metadades del missatge es tractaran en una fase posterior. No cal cap migració per aquesta entrada.

Originals a `company_documents`, amb hash; sense enviar-los a cap servei extern. Les accions registren l'usuari del servidor. L'assignació de quantitats es valida amb bloqueig d'empresa. Els errors o reintents no dupliquen documents ni factures.

La còpia SQL i el codi previs són a `.local-backups/phase1-verified-dump-2026-11-08T11-08-34-396Z`. La restauració es prova en un servidor separat al port 3308. Desactivar la nova pantalla no elimina documents ni taules. Qualsevol restauració real exigeix aturar escriptures i revisar les operacions posteriors a la còpia.
