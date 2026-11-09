# Validació MySQL de compres — 09/11/2026

## Resultat final

**8 proves d’integració superades, sense errors ni proves omeses.** S’han aplicat les 53 migracions del repositori, incloses 043–048, en un MySQL 8.0.46 inicialitzat des de zero amb dades sintètiques.

L’execució final ha utilitzat exclusivament `127.0.0.1:50293`, esquema `purchase_validation`. La carpeta de dades era `.local-backups/purchase-mysql-1794209765173-03df3bfd/data`. El port i la carpeta efectiva es van comprovar abans de migrar. No s’ha accedit a cap instància existent ni a dades reals.

L’informe final confirma `tests_passed: true`, `stopped: true`, `port_closed: true` i `production_access: false`. El servidor sintètic està aturat.

## Comprovacions superades

- Els esborranys no generen factures comptables ni assentaments.
- Recepcions parcials d’una comanda i bloqueig de quantitats rebudes de més.
- Facturació parcial i factures amb diversos albarans, sense duplicar quantitats.
- Assentaments, rebuts de cartera i historial de preus coherents amb la confirmació.
- Aïllament entre empreses, permisos i bloqueig de versions d’esborrany obsoletes.
- Còpia i restauració d’empreses sintètiques conservant línies, vincles parcials i auditoria.
- Extracció d’un PDF, original conservat, creació només d’un esborrany i detecció de pujades repetides.
- Concurrència: dos albarans intentant consumir la mateixa unitat pendent només permeten una confirmació. La mateixa comprovació amb dues factures sobre un albarà també permet una única confirmació i una única factura comptabilitzada.

## Fitxers i reproducció

- `scripts/verify-purchase-mysql.mjs`: crea la instància, comprova l’aïllament, aplica migracions, executa les proves i atura el servidor propi.
- `backend/test/purchases-db.test.js`: ampliat amb la prova de recepció i facturació concurrents.
- `docs/proves-mysql-compres.md`: procediment de reproducció.
- Registres i informe: `.local-backups/purchase-mysql-1794209765173-03df3bfd/`.

Comanda executada: `node scripts/verify-purchase-mysql.mjs`. Una primera execució havia superat les set proves inicials; la segona afegeix i supera la prova de concurrència. Els resultats no se sumen com si fossin proves diferents.

## Abast pendent

La implementació i la validació local i d’integració del mòdul queden completades dins aquest abast. Això **no activa el mòdul a la base de dades real**: l’estat de les migracions d’aquella instància no s’ha consultat ni alterat.

L’entrada d’adjunts de correu està preparada, però no hi ha cap bústia connectada ni tasca periòdica activa. Els diàlegs reals de descàrrega i impressió del sistema continuen sense validar; sí que s’ha comprovat el contingut generat. La qualitat OCR per formats particulars de proveïdor requereix documents representatius d’aquests formats.
