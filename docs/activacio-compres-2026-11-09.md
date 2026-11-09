# Activació de Compres a la base real — 09/11/2026

Amb autorització explícita de l’usuari s’han aplicat les sis migracions pendents, 043–048, a la base configurada `contabilidad`. No hi havia altres migracions pendents.

Abans de l’actualització s’ha desat una còpia de l’estructura, sense dades de documents, a `.local-backups/purchase-activation-1794213176680/schema-before.sql`. L’informe, amb la llista aplicada i el hash de la còpia, és a `report.json` dins el mateix directori.

La verificació posterior confirma les sis marques de migració i les 14 taules de Compres. L’actualització crea les taules del mòdul i afegeix l’índex únic `(company_id,id)` de `company_documents`. No s’han eliminat ni creat factures, assentaments o moviments bancaris.

La fallada de pujada comunicada per l’usuari es produïa abans de l’OCR, perquè aquestes migracions no estaven aplicades. El PDF aportat s’ha llegit localment amb `pdf-text`: dues pàgines, referència `LM1VAKJ0003933`, total reconegut `14.00`. El reconeixement d’aquest fitxer és parcial i la proposta s’ha de revisar abans de confirmar.

S’ha substituït l’error genèric per un avís específic quan Compres no està inicialitzat. Les proves de pantalla simulades i la compilació d’aquest canvi són correctes. La factura no s’ha pujat automàticament a l’empresa: l’usuari pot tornar-la a enviar des de Compres mantenint l’empresa i la sessió seleccionades.

El procediment està a `scripts/activate-purchases.mjs`: per defecte només consulta l’estat; `--apply` requereix autorització per actualitzar. Comprova que només hi hagi les migracions aprovades, desa l’estructura i comprova el resultat.
