# Actualitzar conservant els canvis

Les millores de factures automàtiques i bases per empresa es combinen amb els models 200 i 202 en un commit de fusió. El resultat conserva tots dos historials i les rutes, serveis i taules de còpia de les dues versions.

## Preparar i pujar el codi

Abans d'actualitzar una branca, comprovar `git status`, desar els canvis locals amb un commit i consultar `git fetch origin`. Si les branques han divergit, combinar-les i revisar els conflictes abans de publicar. Un `push` ordinari rebutja una actualització que es deixi commits remots enrere.

Per revisar la integració sense modificar la branca principal del remot, publicar-la com una branca nova i obrir una sol·licitud d'integració cap a `main`. El commit de fusió inclou els commits locals i els remots previs.

## Dades i configuració

El `.env`, `.local-backups/` i `backend/.runtime/` estan exclosos de Git. Les dades MySQL es conserven fora del codi versionat. Una actualització del repositori no transporta ni substitueix aquestes dades.

Conservar el `.env` de cada entorn i la configuració de les integracions. El mode de bases separades manté la configuració que ja tingui l'entorn; la fusió de codi no l'activa automàticament.

Abans de desplegar, fer una còpia de la base de dades i dels originals. Amb l'aplicació aturada, aplicar les migracions pendents amb `npm run db:migrate` o, si s'utilitzen bases per empresa, `npm run db:migrate-companies`. El registre de migracions utilitza el nom complet del fitxer: `037_company_databases.sql` i `037_corporate_tax_drafts.sql` són migracions diferents. No carregar dades inicials sobre una instal·lació amb dades reals.

## Rebre una versió publicada

Al servidor, comprovar primer que `git status` no contingui canvis locals pendents. `git pull --ff-only` només avança quan la versió publicada inclou l'historial local; si falla perquè hi ha divergència, cal revisar i combinar els canvis abans de continuar. Després s'instal·len les dependències necessàries, es compila la interfície i es reinicia el servei.

La integració s'ha comprovat amb compilació, proves del projecte i MySQL temporal: convivència de factures i models fiscals, encaminament per empresa i actualització d'una base amb factures, assentaments, rebuts i borradors previs.
